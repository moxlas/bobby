import React, { useState, useEffect, useRef } from 'react';
import { Button } from '../components/ui/button';
import { Card as CardType, GameOptions, PlayerMove } from '../types/game';
import { PlayerHand } from './PlayerHand';
import { GamePile } from './GamePile';
import { ConfirmPopup } from './ConfirmPopup';
import { validatePlay, getTakeOptions, getValidMoves } from '../utils/gameLogic';
import { getAIMove, getAIDelay } from '../utils/aiLogic';
import { ArrowRight, Users, RotateCcw, Home, AlertCircle, Clock, CheckCircle, Pause, Play, Eye, EyeOff, Zap, History, ChevronDown, ChevronUp } from 'lucide-react';

interface GameBoardProps {
  gameState: any;
  onPlayCards: (playerId: number, cards: CardType[], continueTurn: boolean) => void;
  onTakeCards: (playerId: number, count: number) => void;
  onEndTurn: () => void;
  onPauseGame: () => void;
  onResumeGame: () => void;
  onRestartGame: () => void;
  onNewGame: () => void;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function getCardDisplayName(card: CardType): string {
  const valueStr = card.value === 11 ? 'J' : card.value === 12 ? 'Q' : card.value === 13 ? 'K' : card.value === 14 ? 'A' : card.value.toString();
  const suitEmoji = card.suit === 'hearts' ? '♥' : card.suit === 'diamonds' ? '♦' : card.suit === 'clubs' ? '♣' : '♠';
  return `${valueStr}${suitEmoji}`;
}

function getCardColor(suit: string): string {
  return suit === 'hearts' || suit === 'diamonds' ? 'text-red-400' : 'text-gray-200';
}

export function GameBoard({ 
  gameState, 
  onPlayCards, 
  onTakeCards, 
  onEndTurn, 
  onPauseGame, 
  onResumeGame, 
  onRestartGame, 
  onNewGame 
}: GameBoardProps) {
  const [selectedCards, setSelectedCards] = useState<CardType[]>([]);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingAction, setPendingAction] = useState<'play' | 'take3' | 'takeAll' | 'endTurn' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAIThinking, setIsAIThinking] = useState(false);
  const [showTakeOptions, setShowTakeOptions] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const historyEndRef = useRef<HTMLDivElement>(null);

  const onPlayCardsRef = useRef(onPlayCards);
  const onTakeCardsRef = useRef(onTakeCards);
  const onEndTurnRef = useRef(onEndTurn);
  const gameStateRef = useRef(gameState);

  useEffect(() => {
    onPlayCardsRef.current = onPlayCards;
    onTakeCardsRef.current = onTakeCards;
    onEndTurnRef.current = onEndTurn;
    gameStateRef.current = gameState;
  });

  // Auto-scroll to bottom of history when new moves are added
  useEffect(() => {
    if (showHistory && historyEndRef.current) {
      historyEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [gameState.moveHistory, showHistory]);

  // Timer effect
  useEffect(() => {
    if (gameState.phase === 'playing') {
      const interval = setInterval(() => {
        if (gameStateRef.current.gameStartTime) {
          const elapsed = (Date.now() - gameStateRef.current.gameStartTime) / 1000 - gameStateRef.current.totalPausedTime;
          setElapsedTime(elapsed);
        }
      }, 100);
      return () => clearInterval(interval);
    }
  }, [gameState.phase]);

  // Calculate elapsed time when paused
  useEffect(() => {
    if (gameState.phase === 'paused' && gameState.gameStartTime) {
      const elapsed = (gameState.pausedTime! - gameState.gameStartTime) / 1000 - gameState.totalPausedTime;
      setElapsedTime(elapsed);
    }
  }, [gameState.phase, gameState.gameStartTime, gameState.pausedTime, gameState.totalPausedTime]);

  // Reset state when turn changes (but NOT when canContinueTurn changes to true)
  useEffect(() => {
    // Only reset when the player index actually changes
    const shouldReset = !gameState.canContinueTurn;
    if (shouldReset) {
      setSelectedCards([]);
      setShowConfirm(false);
      setPendingAction(null);
      setError(null);
      setShowTakeOptions(false);
    }
  }, [gameState.currentPlayerIndex]);

  // Clear selection when canContinueTurn becomes true (after playing 4 of a kind)
  useEffect(() => {
    if (gameState.canContinueTurn) {
      setSelectedCards([]);
      setError(null);
    }
  }, [gameState.canContinueTurn]);

  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  const humanPlayer = gameState.players.find((p: any) => !p.isAI);
  const humanHasFinished = humanPlayer?.hasFinished || false;
  
  const isHumanTurn = currentPlayer && !currentPlayer.isAI && !currentPlayer.hasFinished && gameState.phase === 'playing';
  const isPlayerTurn = currentPlayer && !currentPlayer.hasFinished;
  const pile = gameState.pile;
  const options: GameOptions = gameState.options;

  const isFirstMove = pile.length === 1 && pile[0].suit === 'diamonds' && pile[0].value === 9;
  const takeOptions = getTakeOptions(pile, options);
  const validMoves = isPlayerTurn ? getValidMoves(currentPlayer.hand, pile) : { canPlay: false, canTake: false };

  // AI turn logic
  useEffect(() => {
    if (gameState.phase !== 'playing') {
      return;
    }

    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    
    if (!currentPlayer || !currentPlayer.isAI || currentPlayer.id === 'human') {
      return;
    }

    if (currentPlayer.hasFinished) {
      const timeout = setTimeout(() => {
        const state = gameStateRef.current;
        if (state.phase !== 'playing') return;
        
        let nextIndex = (state.currentPlayerIndex + 1) % state.players.length;
        let attempts = 0;
        while (state.players[nextIndex].hasFinished && attempts < state.players.length) {
          nextIndex = (nextIndex + 1) % state.players.length;
          attempts++;
        }
        
        const activePlayers = state.players.filter((p: any) => !p.hasFinished);
        if (activePlayers.length <= 1) {
          return;
        }
        
        onPlayCardsRef.current(currentPlayer.id, [], false);
      }, 300);
      return () => clearTimeout(timeout);
    }

    setIsAIThinking(true);

    const executeAITurn = () => {
      const state = gameStateRef.current;
      if (state.phase !== 'playing') {
        setIsAIThinking(false);
        return;
      }

      const player = state.players[state.currentPlayerIndex];
      
      if (!player || !player.isAI || player.hasFinished) {
        setIsAIThinking(false);
        return;
      }

      const aiMove = getAIMove(state, player.id);
      
      if (aiMove.type === 'endTurn') {
        onEndTurnRef.current();
      } else if (aiMove.type === 'play' && aiMove.cards.length > 0) {
        const pile = state.pile;
        const isFirstMove = pile.length === 1 && pile[0].suit === 'diamonds' && pile[0].value === 9;
        const validation = validatePlay(aiMove.cards, pile, isFirstMove, state.options);
        
        if (validation.valid) {
          onPlayCardsRef.current(player.id, aiMove.cards, validation.continueTurn || false);
        } else {
          const takeOpts = getTakeOptions(pile, state.options);
          const count = takeOpts.canTake3 ? takeOpts.take3Count : takeOpts.takeAllCount;
          if (count > 0) {
            onTakeCardsRef.current(player.id, count);
          } else {
            onPlayCardsRef.current(player.id, [], false);
          }
        }
      } else if (aiMove.type === 'take') {
        const takeOpts = getTakeOptions(state.pile, state.options);
        const count = aiMove.takeType === 'takeAll' 
          ? takeOpts.takeAllCount 
          : takeOpts.take3Count;
        
        if (count > 0) {
          onTakeCardsRef.current(player.id, count);
        } else {
          onPlayCardsRef.current(player.id, [], false);
        }
      } else {
        onPlayCardsRef.current(player.id, [], false);
      }
      
      setIsAIThinking(false);
    };

    const delay = getAIDelay();
    const timeout = setTimeout(executeAITurn, delay);
    
    return () => {
      clearTimeout(timeout);
      setIsAIThinking(false);
    };
  }, [gameState.currentPlayerIndex, gameState.phase, gameState.players, gameState.canContinueTurn]);

  const handleCardSelect = (card: CardType) => {
    if (!isHumanTurn) return;
    
    const isSelected = selectedCards.find(c => c.id === card.id);
    if (isSelected) {
      setSelectedCards(selectedCards.filter(c => c.id !== card.id));
    } else {
      setSelectedCards([...selectedCards, card]);
    }
    setError(null);
  };

  const handlePlayClick = () => {
    if (selectedCards.length === 0) {
      setError('Select cards to play');
      return;
    }
    
    const validation = validatePlay(selectedCards, pile, isFirstMove, options);
    if (!validation.valid) {
      setError(validation.error || 'Invalid move');
      return;
    }
    
    setPendingAction('play');
    setShowConfirm(true);
  };

  const handleTakeClick = () => {
    if (takeOptions.canTake3 && takeOptions.canTakeAll) {
      setShowTakeOptions(true);
    } else if (takeOptions.canTakeAll) {
      setPendingAction('takeAll');
      setShowConfirm(true);
    } else {
      setPendingAction('take3');
      setShowConfirm(true);
    }
  };

  const handleTake3 = () => {
    setPendingAction('take3');
    setShowConfirm(true);
    setShowTakeOptions(false);
  };

  const handleTakeAll = () => {
    setPendingAction('takeAll');
    setShowConfirm(true);
    setShowTakeOptions(false);
  };

  const handleEndTurnClick = () => {
    setPendingAction('endTurn');
    setShowConfirm(true);
  };

  const handleConfirm = () => {
    if (pendingAction === 'play') {
      const validation = validatePlay(selectedCards, pile, isFirstMove, options);
      onPlayCards(currentPlayer.id, selectedCards, validation.continueTurn || false);
    } else if (pendingAction === 'take3') {
      onTakeCards(currentPlayer.id, takeOptions.take3Count);
    } else if (pendingAction === 'takeAll') {
      onTakeCards(currentPlayer.id, takeOptions.takeAllCount);
    } else if (pendingAction === 'endTurn') {
      onEndTurn();
    }
    
    setShowConfirm(false);
    setPendingAction(null);
    setSelectedCards([]);
  };

  const handleCancel = () => {
    setShowConfirm(false);
    setPendingAction(null);
    setShowTakeOptions(false);
  };

  const getConfirmMessage = () => {
    if (pendingAction === 'play') {
      const cardNames = selectedCards.map(c => 
        `${c.value === 11 ? 'J' : c.value === 12 ? 'Q' : c.value === 13 ? 'K' : c.value === 14 ? 'A' : c.value} of ${c.suit}`
      ).join(', ');
      return `Play ${cardNames}?`;
    } else if (pendingAction === 'take3') {
      return `Take ${takeOptions.take3Count} card${takeOptions.take3Count !== 1 ? 's' : ''} from pile?`;
    } else if (pendingAction === 'takeAll') {
      return `Take all ${takeOptions.takeAllCount} cards from pile?`;
    } else if (pendingAction === 'endTurn') {
      return 'End your turn?';
    }
    return '';
  };

  // Render game finished screen
  if (gameState.phase === 'finished') {
    return (
      <div className="min-h-screen bg-emerald-900 flex items-center justify-center p-4">
        <div className="bg-emerald-800 rounded-2xl p-8 max-w-md w-full text-center shadow-2xl border border-emerald-600">
          <h2 className="text-3xl font-bold text-amber-300 mb-2">🎉 Game Over!</h2>
          
          {/* Total game time */}
          <div className="flex items-center justify-center gap-2 mb-6">
            <Clock className="w-5 h-5 text-emerald-300" />
            <span className="text-emerald-200 text-lg">Total Time: {formatTime(elapsedTime)}</span>
          </div>
          
          <div className="space-y-4 mb-8">
            <h3 className="text-lg text-emerald-200 font-semibold">Final Rankings:</h3>
            {gameState.finishOrder.map((player: any, index: number) => (
              <div 
                key={player.id}
                className={`flex items-center justify-between p-3 rounded-lg ${
                  index === 0 ? 'bg-amber-500 text-emerald-900' :
                  index === gameState.finishOrder.length - 1 ? 'bg-red-500 text-white' :
                  'bg-emerald-600 text-white'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="font-medium">
                    {index + 1}. {player.name}
                  </span>
                  {index === gameState.finishOrder.length - 1 && (
                    <span className="text-sm font-bold">💀 LOSER</span>
                  )}
                  {index === 0 && (
                    <span className="text-sm font-bold">👑 WINNER</span>
                  )}
                </div>
                <div className="flex items-center gap-1 text-sm">
                  <Clock className="w-4 h-4" />
                  <span>{formatTime(player.finishTime || 0)}</span>
                </div>
              </div>
            ))}
          </div>
          
          <div className="flex gap-4">
            <Button
              onClick={onRestartGame}
              className="flex-1 bg-amber-500 hover:bg-amber-600 text-emerald-900 font-bold"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Play Again
            </Button>
            <Button
              onClick={onNewGame}
              variant="outline"
              className="flex-1 bg-emerald-600 border-emerald-400 text-white hover:bg-emerald-500"
            >
              <Home className="w-4 h-4 mr-2" />
              New Game
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Render paused screen
  if (gameState.phase === 'paused') {
    return (
      <div className="min-h-screen bg-emerald-900 flex items-center justify-center p-4">
        <div className="bg-emerald-800 rounded-2xl p-8 max-w-md w-full text-center shadow-2xl border border-emerald-600">
          <div className="flex items-center justify-center gap-3 mb-6">
            <Pause className="w-8 h-8 text-amber-300" />
            <h2 className="text-3xl font-bold text-amber-300">Game Paused</h2>
          </div>
          
          {/* Timer display during pause */}
          <div className="flex items-center justify-center gap-2 mb-8">
            <Clock className="w-6 h-6 text-emerald-300" />
            <span className="text-emerald-200 text-2xl font-mono">{formatTime(elapsedTime)}</span>
          </div>
          
          <div className="space-y-4">
            <Button
              onClick={onResumeGame}
              className="w-full bg-amber-500 hover:bg-amber-600 text-emerald-900 font-bold text-lg py-6"
            >
              <Play className="w-5 h-5 mr-2" />
              Resume Game
            </Button>
            
            <Button
              onClick={onRestartGame}
              variant="outline"
              className="w-full bg-emerald-600 border-emerald-400 text-white hover:bg-emerald-500"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Restart Game
            </Button>
            
            <Button
              onClick={onNewGame}
              variant="outline"
              className="w-full bg-emerald-600 border-emerald-400 text-white hover:bg-emerald-500"
            >
              <Home className="w-4 h-4 mr-2" />
              New Game
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Determine if we should show the current player's hand
  // Hide AI cards during their turn unless human has finished
  const shouldShowHand = currentPlayer && !currentPlayer.hasFinished && 
    (!currentPlayer.isAI || humanHasFinished);

  // When in continue turn mode, taking cards is disabled
  const canTakeCards = validMoves.canTake && !gameState.canContinueTurn;

  return (
    <div className="min-h-screen bg-emerald-900 flex flex-col">
      {/* Top bar */}
      <div className="bg-emerald-800 border-b border-emerald-600 px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold text-amber-300">🃏 Card Game</h1>
            <span className="text-emerald-300 text-sm">
              Turn {gameState.turnNumber}
            </span>
          </div>
          
          {/* Timer display */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-emerald-700 px-4 py-2 rounded-lg">
              <Clock className="w-5 h-5 text-amber-300" />
              <span className="text-white font-mono text-lg">{formatTime(elapsedTime)}</span>
            </div>
            
            <Button
              onClick={onPauseGame}
              variant="outline"
              size="sm"
              className="bg-emerald-700 border-emerald-500 text-emerald-100 hover:bg-emerald-600"
            >
              <Pause className="w-4 h-4 mr-1" />
              Pause
            </Button>
            
            <Button
              onClick={onNewGame}
              variant="outline"
              size="sm"
              className="bg-emerald-700 border-emerald-500 text-emerald-100 hover:bg-emerald-600"
            >
              <Home className="w-4 h-4 mr-1" />
              New Game
            </Button>
          </div>
        </div>
      </div>

      {/* Main game area */}
      <div className="flex-1 flex flex-col lg:flex-row gap-4 p-4 max-w-6xl mx-auto w-full">
        {/* Left sidebar - Other players */}
        <div className="lg:w-48 flex lg:flex-col gap-2 overflow-x-auto lg:overflow-y-auto">
          {gameState.players
            .filter((p: any) => p.id !== currentPlayer?.id)
            .map((player: any) => (
              <div 
                key={player.id}
                className={`flex-shrink-0 bg-emerald-800 rounded-lg p-3 border ${
                  player.isCurrentTurn ? 'border-amber-400' : 'border-emerald-600'
                } ${player.hasFinished ? 'opacity-50' : ''}`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className={`w-2 h-2 rounded-full ${player.isCurrentTurn ? 'bg-amber-400' : 'bg-emerald-500'}`} />
                  <span className="text-white font-medium text-sm truncate">{player.name}</span>
                  {player.isAI && <span className="text-xs text-emerald-400">(AI)</span>}
                </div>
                <div className="text-emerald-300 text-xs">
                  {player.hasFinished ? (
                    <span className="text-amber-400">Finished #{player.finishPosition}</span>
                  ) : (
                    `${player.hand.length} cards`
                  )}
                </div>
              </div>
            ))}
        </div>

        {/* Center - Pile and actions */}
        <div className="flex-1 flex flex-col items-center justify-center gap-6">
          {/* Current player indicator */}
          <div className="text-center">
            <div className="flex items-center gap-2 justify-center mb-2">
              <span className="text-emerald-300 text-sm">Current Turn:</span>
              <span className="text-amber-300 font-bold text-lg">{currentPlayer?.name}</span>
              {currentPlayer?.isAI && <span className="text-xs text-emerald-400">(AI)</span>}
              {isAIThinking && <span className="text-amber-400 animate-pulse">Thinking...</span>}
            </div>
          </div>

          {/* Pile */}
          <GamePile pile={pile} />

          {/* Error message */}
          {error && (
            <div className="flex items-center gap-2 bg-red-500 text-white px-4 py-2 rounded-lg">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}

          {/* Continue turn banner - shown after playing 4 of a kind */}
          {gameState.canContinueTurn && isHumanTurn && (
            <div className="bg-gradient-to-r from-amber-600 to-amber-500 rounded-lg p-4 border-2 border-amber-400 shadow-lg animate-pulse">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-5 h-5 text-emerald-900" />
                <span className="text-emerald-900 font-bold text-lg">Continue Your Turn!</span>
              </div>
              <p className="text-emerald-900 text-sm mb-3">
                You played 4 of a kind! Select cards to play or end your turn.
              </p>
              <div className="flex gap-3">
                <Button
                  onClick={handlePlayClick}
                  disabled={selectedCards.length === 0}
                  className="bg-emerald-800 hover:bg-emerald-700 text-white font-bold"
                >
                  Play Selected ({selectedCards.length})
                </Button>
                <Button
                  onClick={handleEndTurnClick}
                  variant="outline"
                  className="bg-emerald-800 border-emerald-600 text-white hover:bg-emerald-700"
                >
                  End Turn
                </Button>
              </div>
            </div>
          )}

          {/* Take options popup */}
          {showTakeOptions && (
            <div className="bg-emerald-700 rounded-lg p-4 border border-emerald-500 shadow-lg">
              <p className="text-emerald-100 mb-3 text-center font-medium">How many cards to take?</p>
              <div className="flex gap-3">
                <Button
                  onClick={handleTake3}
                  className="bg-amber-500 hover:bg-amber-600 text-emerald-900 font-bold"
                >
                  Take 3 Cards
                </Button>
                <Button
                  onClick={handleTakeAll}
                  className="bg-amber-500 hover:bg-amber-600 text-emerald-900 font-bold"
                >
                  Take All ({takeOptions.takeAllCount})
                </Button>
              </div>
              <Button
                onClick={handleCancel}
                variant="outline"
                className="w-full mt-2 bg-emerald-600 border-emerald-400 text-white hover:bg-emerald-500"
              >
                Cancel
              </Button>
            </div>
          )}

          {/* Action buttons - only show if not in continue turn mode */}
          {isHumanTurn && !showTakeOptions && !gameState.canContinueTurn && (
            <div className="flex gap-4">
              <Button
                onClick={handlePlayClick}
                disabled={selectedCards.length === 0 || !validMoves.canPlay}
                className="bg-amber-500 hover:bg-amber-600 text-emerald-900 font-bold px-8"
              >
                Play Selected ({selectedCards.length})
              </Button>
              <Button
                onClick={handleTakeClick}
                disabled={!canTakeCards}
                variant="outline"
                className="bg-emerald-600 border-emerald-400 text-white hover:bg-emerald-500 px-8"
              >
                Take Cards
              </Button>
            </div>
          )}

          {/* Instructions for human player */}
          {isHumanTurn && !validMoves.canPlay && validMoves.canTake && !showTakeOptions && !gameState.canContinueTurn && (
            <p className="text-amber-300 text-sm">No playable cards. You must take cards!</p>
          )}
          
          {/* AI turn indicator when human has finished */}
          {currentPlayer?.isAI && !humanHasFinished && !currentPlayer.hasFinished && (
            <div className="flex items-center gap-2 text-emerald-300">
              <EyeOff className="w-4 h-4" />
              <span className="text-sm">AI cards are hidden until you finish</span>
            </div>
          )}
        </div>

        {/* Right sidebar - Game info and History */}
        <div className="lg:w-64 flex flex-col gap-4">
          {/* Game Info */}
          <div className="bg-emerald-800 rounded-lg p-4 border border-emerald-600">
            <h3 className="text-amber-300 font-bold mb-3">Game Info</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-emerald-300">Pile:</span>
                <span className="text-white font-medium">{pile.length} cards</span>
              </div>
              <div className="flex justify-between">
                <span className="text-emerald-300">Players:</span>
                <span className="text-white font-medium">{gameState.players.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-emerald-300">Finished:</span>
                <span className="text-white font-medium">{gameState.finishOrder.length}</span>
              </div>
            </div>
            
            {/* Human player status */}
            {humanPlayer && (
              <div className="mt-4 pt-4 border-t border-emerald-600">
                <h4 className="text-amber-300 font-bold mb-2 text-sm">Your Status</h4>
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-emerald-300">Cards:</span>
                    <span className="text-white font-medium">{humanPlayer.hand.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-emerald-300">Status:</span>
                    <span className={`font-medium ${humanPlayer.hasFinished ? 'text-amber-400' : 'text-emerald-400'}`}>
                      {humanPlayer.hasFinished ? 'Finished' : 'Playing'}
                    </span>
                  </div>
                </div>
              </div>
            )}
            
            <div className="mt-4 pt-4 border-t border-emerald-600">
              <h4 className="text-amber-300 font-bold mb-2 text-sm">Options</h4>
              <div className="space-y-1 text-xs">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${options.allowFourNinesStart ? 'bg-amber-400' : 'bg-gray-500'}`} />
                  <span className="text-emerald-300">4 Nines Start</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${options.allowTakeAllCards ? 'bg-amber-400' : 'bg-gray-500'}`} />
                  <span className="text-emerald-300">Take All Cards</span>
                </div>
              </div>
            </div>
          </div>

          {/* Move History */}
          <div className="bg-emerald-800 rounded-lg border border-emerald-600 overflow-hidden">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="w-full flex items-center justify-between p-3 hover:bg-emerald-700 transition-colors"
            >
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-amber-300" />
                <span className="text-amber-300 font-bold">Move History</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-emerald-400 text-xs">{gameState.moveHistory.length} moves</span>
                {showHistory ? (
                  <ChevronUp className="w-4 h-4 text-emerald-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-emerald-400" />
                )}
              </div>
            </button>
            
            {showHistory && (
              <div className="max-h-64 overflow-y-auto border-t border-emerald-600">
                {gameState.moveHistory.length === 0 ? (
                  <div className="p-4 text-center text-emerald-400 text-sm">
                    No moves yet
                  </div>
                ) : (
                  <div className="divide-y divide-emerald-600">
                    {gameState.moveHistory.map((move: PlayerMove, index: number) => (
                      <div key={move.id} className="p-2 hover:bg-emerald-700 transition-colors">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-emerald-200 text-xs font-medium">
                            {move.playerName}
                          </span>
                          <span className="text-emerald-400 text-xs">
                            Turn {move.turnNumber}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 flex-wrap">
                          {move.type === 'play' ? (
                            <>
                              <ArrowRight className="w-3 h-3 text-amber-400" />
                              <span className="text-xs">
                                {move.cards.map((card, i) => (
                                  <span key={i} className={`${getCardColor(card.suit)} mr-1`}>
                                    {getCardDisplayName(card)}
                                  </span>
                                ))}
                              </span>
                            </>
                          ) : (
                            <>
              <span className="text-red-400 text-xs">↑</span>
                              <span className="text-red-300 text-xs">
                                Took {move.cards.length} card{move.cards.length !== 1 ? 's' : ''}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div ref={historyEndRef} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom - Current player's hand (only show if shouldShowHand is true) */}
      {shouldShowHand && (
        <div className="bg-emerald-800 border-t border-emerald-600 p-4">
          <div className="max-w-6xl mx-auto">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-emerald-300 text-sm">
                {currentPlayer.isAI ? `${currentPlayer.name}'s Hand:` : 'Your Hand:'}
              </span>
              <span className="text-white font-medium">{currentPlayer.hand.length} cards</span>
              {currentPlayer.isAI && humanHasFinished && (
                <div className="flex items-center gap-1 text-emerald-400 text-xs ml-2">
                  <Eye className="w-3 h-3" />
                  <span>(Visible - you finished)</span>
                </div>
              )}
            </div>
            <PlayerHand
              hand={currentPlayer.hand}
              selectedCards={selectedCards}
              onCardSelect={handleCardSelect}
              disabled={!isHumanTurn}
            />
          </div>
        </div>
      )}

      {/* Confirm popup */}
      {showConfirm && (
        <ConfirmPopup
          message={getConfirmMessage()}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}
    </div>
  );
}
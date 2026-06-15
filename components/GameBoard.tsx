import React, { useState, useEffect, useRef } from 'react';
import { Button } from '../components/ui/button';
import { Card as CardType, GameOptions, PlayerMove } from '../types/game';
import { PlayerHand } from './PlayerHand';
import { GamePile } from './GamePile';
import { ConfirmPopup } from './ConfirmPopup';
import { validatePlay, getTakeOptions, getValidMoves } from '../utils/gameLogic';
import { getAIMove, getAIDelay } from '../utils/aiLogic';
import { ArrowRight, Users, RotateCcw, Home, AlertCircle, Clock, CheckCircle, Pause, Play, Eye, EyeOff, Zap, History, ChevronDown, ChevronUp, Settings, Crown, Skull } from 'lucide-react';

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
  return suit === 'hearts' || suit.suit === 'diamonds' ? 'text-red-400' : 'text-gray-200';
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
  const [showHistory, setShowHistory] = useState(true);
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

  // Reset state when turn changes
  useEffect(() => {
    const shouldReset = !gameState.canContinueTurn;
    if (shouldReset) {
      setSelectedCards([]);
      setShowConfirm(false);
      setPendingAction(null);
      setError(null);
      setShowTakeOptions(false);
    }
  }, [gameState.currentPlayerIndex]);

  // Clear selection when canContinueTurn becomes true
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

  // Check if this is the special 4 nines start scenario
  const isFourNinesStart = gameState.canContinueTurn && 
    isFirstMove && 
    currentPlayer.hand.filter((c: CardType) => c.value === 9).length === 3;

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
          nextIndex = (nextPlayerIndex + 1) % state.players.length;
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
        <div className="bg-emerald-800 rounded-2xl p-6 sm:p-8 max-w-md w-full text-center shadow-2xl border border-emerald-600">
          <h2 className="text-2xl sm:text-3xl font-bold text-amber-300 mb-2">🎉 Game Over!</h2>
          
          {/* Total game time */}
          <div className="flex items-center justify-center gap-2 mb-4 sm:mb-6">
            <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-300" />
            <span className="text-emerald-200 text-base sm:text-lg">Total Time: {formatTime(elapsedTime)}</span>
          </div>
          
          <div className="space-y-2 sm:space-y-3 mb-6 sm:mb-8">
            <h3 className="text-sm sm:text-base text-emerald-200 font-semibold">Final Rankings:</h3>
            {gameState.finishOrder.map((player: any, index: number) => (
              <div 
                key={player.id}
                className={`flex items-center justify-between p-2 sm:p-3 rounded-lg text-sm ${
                  index === 0 ? 'bg-amber-500 text-emerald-900' :
                  index === gameState.finishOrder.length - 1 ? 'bg-red-500 text-white' :
                  'bg-emerald-600 text-white'
                }`}
              >
                <div className="flex items-center gap-2 sm:gap-3">
                  <span className="font-medium">
                    {index + 1}. {player.name}
                  </span>
                  {index === gameState.finishOrder.length - 1 && (
                    <span className="text-xs font-bold">💀 LOSER</span>
                  )}
                  {index === 0 && (
                    <span className="text-xs font-bold">👑 WINNER</span>
                  )}
                </div>
                <div className="flex items-center gap-1 text-xs sm:text-sm">
                  <Clock className="w-3 h-3 sm:w-4 sm:h-4" />
                  <span>{formatTime(player.finishTime || 0)}</span>
                </div>
              </div>
            ))}
          </div>
          
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              onClick={onRestartGame}
              className="flex-1 bg-amber-500 hover:bg-amber-600 text-emerald-900 font-bold text-sm sm:text-base"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Play Again
            </Button>
            <Button
              onClick={onNewGame}
              variant="outline"
              className="flex-1 bg-emerald-600 border-emerald-400 text-white hover:bg-emerald-500 text-sm sm:text-base"
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
        <div className="bg-emerald-800 rounded-2xl p-6 sm:p-8 max-w-md w-full text-center shadow-2xl border border-emerald-600">
          <div className="flex items-center justify-center gap-2 sm:gap-3 mb-4 sm:mb-6">
            <Pause className="w-6 h-6 sm:w-8 sm:h-8 text-amber-300" />
            <h2 className="text-2xl sm:text-3xl font-bold text-amber-300">Game Paused</h2>
          </div>
          
          {/* Timer display during pause */}
          <div className="flex items-center justify-center gap-2 mb-6 sm:mb-8">
            <Clock className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-300" />
            <span className="text-emerald-200 text-xl sm:text-2xl font-mono">{formatTime(elapsedTime)}</span>
          </div>
          
          <div className="space-y-3 sm:space-y-4">
            <Button
              onClick={onResumeGame}
              className="w-full bg-amber-500 hover:bg-amber-600 text-emerald-900 font-bold text-base sm:text-lg py-4 sm:py-6"
            >
              <Play className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
              Resume Game
            </Button>
            
            <Button
              onClick={onRestartGame}
              variant="outline"
              className="w-full bg-emerald-600 border-emerald-400 text-white hover:bg-emerald-500 text-sm sm:text-base"
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Restart Game
            </Button>
            
            <Button
              onClick={onNewGame}
              variant="outline"
              className="w-full bg-emerald-600 border-emerald-400 text-white hover:bg-emerald-500 text-sm sm:text-base"
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
  const shouldShowHand = currentPlayer && !currentPlayer.hasFinished && 
    (!currentPlayer.isAI || humanHasFinished);

  // When in continue turn mode, taking cards is disabled
  const canTakeCards = validMoves.canTake && !gameState.canContinueTurn;

  return (
    <div className="min-h-screen bg-emerald-900 flex flex-col">
      {/* Top bar */}
      <div className="bg-emerald-800 border-b border-emerald-600 px-2 sm:px-4 py-2 sm:py-3 flex-shrink-0">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-1 sm:gap-4">
            <h1 className="text-base sm:text-xl font-bold text-amber-300">🃏 The Bobby</h1>
            <span className="text-emerald-300 text-xs hidden sm:inline">
              Turn {gameState.turnNumber}
            </span>
          </div>
          
          {/* Timer display */}
          <div className="flex items-center gap-1 sm:gap-4">
            <div className="flex items-center gap-1 sm:gap-2 bg-emerald-700 px-2 sm:px-4 py-1 sm:py-2 rounded-lg">
              <Clock className="w-3 h-3 sm:w-5 sm:h-5 text-amber-300" />
              <span className="text-white font-mono text-xs sm:text-lg">{formatTime(elapsedTime)}</span>
            </div>
            
            <Button
              onClick={onPauseGame}
              variant="outline"
              size="sm"
              className="bg-emerald-700 border-emerald-500 text-emerald-100 hover:bg-emerald-600 hidden sm:flex"
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
              <Home className="w-4 h-4 sm:mr-1" />
              <span className="hidden sm:inline">New Game</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Mobile: Player Hand (Fixed at top below header) */}
      {shouldShowHand && (
        <div className="lg:hidden bg-emerald-800 border-b border-emerald-600 p-2 sm:p-3 flex-shrink-0">
          <div className="text-center mb-1 sm:mb-2">
            <span className="text-emerald-300 text-xs sm:text-sm">Your Hand ({currentPlayer.hand.length} cards)</span>
          </div>
          <div className="overflow-x-auto pb-1 sm:pb-2 -mx-2 px-2">
            <div className="flex gap-1 justify-center flex-nowrap min-w-max">
              {currentPlayer.hand.map((card: CardType) => {
                const isSelected = selectedCards.some(c => c.id === card.id);
                return (
                  <button
                    key={card.id}
                    onClick={() => handleCardSelect(card)}
                    disabled={!isHumanTurn}
                    className={`flex-shrink-0 w-10 h-14 sm:w-12 sm:h-16 rounded-lg border-2 flex items-center justify-center text-sm sm:text-base font-bold transition-all ${
                      isSelected
                        ? 'border-amber-400 bg-amber-500/20 scale-105'
                        : 'border-emerald-500 bg-emerald-700 hover:bg-emerald-600'
                    } ${!isHumanTurn ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <span className={getCardColor(card.suit)}>
                      {card.value === 11 ? 'J' : card.value === 12 ? 'Q' : card.value === 13 ? 'K' : card.value === 14 ? 'A' : card.value}
                    </span>
                    <span className={`text-[10px] sm:text-xs ml-0.5 ${getCardColor(card.suit)}`}>
                      {card.suit === 'hearts' ? '♥' : card.suit === 'diamonds' ? '♦' : card.suit === 'clubs' ? '♣' : '♠'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          
          {/* Mobile: Action buttons integrated into hand area */}
          {isHumanTurn && !showTakeOptions && !gameState.canContinueTurn && (
            <div className="flex gap-2 justify-center mt-2 pt-2 border-t border-emerald-600">
              <Button
                onClick={handlePlayClick}
                disabled={selectedCards.length === 0}
                className="bg-amber-500 hover:bg-amber-600 text-emerald-900 font-bold px-3 py-1.5 text-xs"
              >
                Play ({selectedCards.length})
              </Button>
              
              {canTakeCards && (
                <Button
                  onClick={handleTakeClick}
                  variant="outline"
                  className="bg-emerald-600 border-emerald-400 text-white hover:bg-emerald-500 px-3 py-1.5 text-xs"
                >
                  Take
                </Button>
              )}
              
              <Button
                onClick={onPauseGame}
                variant="outline"
                className="bg-emerald-700 border-emerald-500 text-emerald-100 hover:bg-emerald-600 px-2 py-1.5"
              >
                <Pause className="w-3 h-3" />
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Main game area - Desktop layout */}
      <div className="flex-1 flex flex-col lg:flex-row gap-2 sm:gap-4 p-2 sm:p-4 max-w-6xl mx-auto w-full overflow-hidden">
        {/* Left sidebar - All Players (Desktop) */}
        <div className="hidden lg:flex lg:w-44 flex-col gap-2 overflow-y-auto flex-shrink-0">
          <div className="text-emerald-300 text-xs font-medium uppercase tracking-wide mb-1 px-1">Players</div>
          {gameState.players.map((player: any) => {
            const isCurrent = player.id === currentPlayer?.id;
            const isHuman = !player.isAI;
            
            return (
              <div 
                key={player.id}
                className={`flex-shrink-0 rounded-lg p-2 border transition-all ${
                  isCurrent 
                    ? 'border-amber-400 bg-amber-500/10' 
                    : 'border-emerald-600 bg-emerald-800/50'
                } ${player.hasFinished ? 'opacity-60' : ''}`}
              >
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    player.hasFinished ? 'bg-gray-500' : isCurrent ? 'bg-amber-400 animate-pulse' : 'bg-emerald-500'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <span className={`text-sm font-medium truncate ${isCurrent ? 'text-amber-300' : 'text-white'}`}>
                        {player.name}
                      </span>
                      {player.isAI && <span className="text-[10px] text-emerald-400">AI</span>}
                    </div>
                    <div className="text-xs text-emerald-400">
                      {player.hasFinished ? (
                        <span className="text-amber-400 flex items-center gap-1">
                          {player.finishPosition === 1 ? <Crown className="w-3 h-3" /> : 
                           player.finishPosition === gameState.players.length ? <Skull className="w-3 h-3" /> : null}
                          #{player.finishPosition}
                        </span>
                      ) : (
                        `${player.hand.length} cards`
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Center - Pile and actions */}
        <div className="flex-1 flex flex-col items-center justify-start gap-2 sm:gap-4 overflow-y-auto">
          {/* Current player indicator */}
          <div className="text-center flex-shrink-0">
            <div className="flex items-center gap-1 sm:gap-2 justify-center mb-1 sm:mb-2">
              <span className="text-emerald-300 text-xs sm:text-sm">Current Turn:</span>
              <span className="text-amber-300 font-bold text-sm sm:text-lg">{currentPlayer?.name}</span>
              {currentPlayer?.isAI && <span className="text-[10px] sm:text-xs text-emerald-400">(AI)</span>}
              {isAIThinking && <span className="text-amber-400 text-xs sm:text-sm animate-pulse">Thinking...</span>}
            </div>
          </div>

          {/* Pile */}
          <GamePile pile={pile} />

          {/* Error message */}
          {error && (
            <div className="flex items-center gap-2 bg-red-500 text-white px-3 sm:px-4 py-2 rounded-lg flex-shrink-0 text-sm">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}

          {/* Continue turn banner - 4 Nines Start */}
          {gameState.canContinueTurn && isHumanTurn && isFourNinesStart && (
            <div className="bg-gradient-to-r from-purple-600 to-purple-500 rounded-lg p-3 sm:p-4 border-2 border-purple-400 shadow-lg flex-shrink-0 w-full max-w-sm">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">🃏</span>
                <span className="text-white font-bold text-base sm:text-lg">Lucky Start!</span>
              </div>
              <p className="text-purple-100 text-xs sm:text-sm mb-3">
                You have all 4 nines! Play them now or save them for later.
              </p>
              <div className="flex gap-2 sm:gap-3">
                <Button
                  onClick={handlePlayClick}
                  disabled={selectedCards.length === 0}
                  className="bg-white hover:bg-gray-100 text-purple-700 font-bold text-xs sm:text-sm"
                >
                  Play Selected ({selectedCards.length})
                </Button>
                <Button
                  onClick={handleEndTurnClick}
                  variant="outline"
                  className="bg-purple-700 border-purple-500 text-white hover:bg-purple-600 text-xs sm:text-sm"
                >
                  Save for Later
                </Button>
              </div>
            </div>
          )}

          {/* Continue turn banner - Regular 4 of a kind */}
          {gameState.canContinueTurn && isHumanTurn && !isFourNinesStart && (
            <div className="bg-gradient-to-r from-amber-600 to-amber-500 rounded-lg p-3 sm:p-4 border-2 border-amber-400 shadow-lg flex-shrink-0 w-full max-w-sm">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-900" />
                <span className="text-emerald-900 font-bold text-base sm:text-lg">Combo!</span>
              </div>
              <p className="text-emerald-900 text-xs sm:text-sm mb-3">
                You played 4 of a kind! Play another card or end your turn.
              </p>
              <div className="flex gap-2 sm:gap-3">
                <Button
                  onClick={handlePlayClick}
                  disabled={selectedCards.length === 0}
                  className="bg-emerald-800 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm"
                >
                  Play Selected ({selectedCards.length})
                </Button>
                <Button
                  onClick={handleEndTurnClick}
                  variant="outline"
                  className="bg-emerald-800 border-emerald-600 text-white hover:bg-emerald-700 text-xs sm:text-sm"
                >
                  End Turn
                </Button>
              </div>
            </div>
          )}

          {/* Take options popup */}
          {showTakeOptions && (
            <div className="bg-emerald-700 rounded-lg p-3 sm:p-4 border border-emerald-500 shadow-lg flex-shrink-0">
              <p className="text-emerald-100 mb-2 sm:mb-3 text-center font-medium text-sm sm:text-base">How many cards to take?</p>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button
                  onClick={handleTake3}
                  className="bg-amber-500 hover:bg-amber-600 text-emerald-900 font-bold text-sm"
                >
                  Take 3 Cards
                </Button>
                <Button
                  onClick={handleTakeAll}
                  className="bg-amber-500 hover:bg-amber-600 text-emerald-900 font-bold text-sm"
                >
                  Take All ({takeOptions.takeAllCount})
                </Button>
              </div>
              <Button
                onClick={handleCancel}
                variant="outline"
                className="w-full mt-2 bg-emerald-600 border-emerald-400 text-white hover:bg-emerald-500 text-sm"
              >
                Cancel
              </Button>
            </div>
          )}

          {/* Action buttons - Desktop only */}
          {isHumanTurn && !showTakeOptions && !gameState.canContinueTurn && (
            <div className="hidden lg:flex flex-wrap gap-2 sm:gap-3 justify-center flex-shrink-0">
              <Button
                onClick={handlePlayClick}
                disabled={selectedCards.length === 0}
                className="bg-amber-500 hover:bg-amber-600 text-emerald-900 font-bold px-4 sm:px-6 text-sm"
              >
                Play ({selectedCards.length})
              </Button>
              
              {canTakeCards && (
                <Button
                  onClick={handleTakeClick}
                  variant="outline"
                  className="bg-emerald-600 border-emerald-400 text-white hover:bg-emerald-500 text-sm"
                >
                  Take Cards
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Right sidebar - Game Info & History (Desktop) */}
        <div className="hidden lg:flex lg:w-56 flex-col gap-3 flex-shrink-0">
          {/* Move History */}
          <div className="bg-emerald-800 rounded-lg border border-emerald-600 flex flex-col" style={{ maxHeight: '400px' }}>
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="flex items-center justify-between p-3 border-b border-emerald-600 flex-shrink-0"
            >
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-amber-400" />
                <span className="text-white font-medium text-sm">Move History</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-emerald-400 text-xs">{gameState.moveHistory.length}</span>
                {showHistory ? (
                  <ChevronUp className="w-4 h-4 text-emerald-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-emerald-400" />
                )}
              </div>
            </button>
            
            {showHistory && (
              <div className="flex-1 overflow-y-auto p-2 space-y-1 min-h-0">
                {gameState.moveHistory.length === 0 ? (
                  <p className="text-emerald-400 text-xs italic text-center py-4">No moves yet</p>
                ) : (
                  gameState.moveHistory.slice().reverse().map((move: PlayerMove) => (
                    <div 
                      key={move.id} 
                      className={`text-xs p-2 rounded ${
                        move.type === 'play' 
                          ? 'bg-emerald-700/50' 
                          : 'bg-amber-900/30'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-0.5">
                        <span className={`font-medium ${move.type === 'play' ? 'text-amber-300' : 'text-emerald-300'}`}>
                          {move.playerName}
                        </span>
                        <span className="text-emerald-500 text-[10px]">T{move.turnNumber}</span>
                      </div>
                      <div className="text-emerald-200 truncate">
                        {move.type === 'play' ? (
                          <span className="flex items-center gap-1">
                            <span className="text-emerald-400">→</span>
                            {move.cards.map(c => getCardDisplayName(c)).join(' ')}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1">
                            <span className="text-amber-400">↑</span>
                            Took {move.cards.length}
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
                <div ref={historyEndRef} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile: Game Info & History */}
      <div className="lg:hidden bg-emerald-800 border-t border-emerald-600 p-2 sm:p-4 flex-shrink-0">
        {/* Players List - Compact */}
        <div className="mb-3 sm:mb-4">
          <div className="text-emerald-300 text-[10px] sm:text-xs font-medium uppercase tracking-wide mb-1 sm:mb-2">Players</div>
          <div className="flex flex-wrap gap-1 sm:gap-2">
            {gameState.players.map((player: any) => {
              const isCurrent = player.id === currentPlayer?.id;
              return (
                <div
                  key={player.id}
                  className={`px-2 py-1 rounded text-[10px] sm:text-xs border ${
                    isCurrent
                      ? 'border-amber-400 bg-amber-500/20 text-amber-300'
                      : 'border-emerald-600 bg-emerald-700/50 text-emerald-200'
                  } ${player.hasFinished ? 'opacity-60' : ''}`}
                >
                  <span className="font-medium">{player.name}</span>
                  {player.isAI && <span className="text-emerald-400 ml-0.5">AI</span>}
                  <span className="text-emerald-400 ml-1">
                    {player.hasFinished ? `#${player.finishPosition}` : `(${player.hand.length})`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Move History Toggle */}
        <button
          onClick={() => setShowHistory(!showHistory)}
          className="flex items-center justify-between w-full"
        >
          <div className="flex items-center gap-1 sm:gap-2">
            <History className="w-3 h-3 sm:w-4 sm:h-4 text-amber-400" />
            <span className="text-white font-medium text-xs sm:text-sm">Move History</span>
            <span className="text-emerald-400 text-[10px] sm:text-xs">({gameState.moveHistory.length})</span>
          </div>
          {showHistory ? (
            <ChevronUp className="w-3 h-3 sm:w-4 sm:h-4 text-emerald-400" />
          ) : (
            <ChevronDown className="w-3 h-3 sm:w-4 sm:h-4 text-emerald-400" />
          )}
        </button>
        
        {showHistory && (
          <div className="mt-2 sm:mt-3 space-y-1 max-h-24 sm:max-h-32 overflow-y-auto">
            {gameState.moveHistory.length === 0 ? (
              <p className="text-emerald-400 text-[10px] sm:text-xs italic">No moves yet</p>
            ) : (
              gameState.moveHistory.slice().reverse().map((move: PlayerMove) => (
                <div 
                  key={move.id} 
                  className={`text-[10px] sm:text-xs p-1.5 sm:p-2 rounded ${
                    move.type === 'play' 
                      ? 'bg-emerald-700/50' 
                      : 'bg-amber-900/30'
                  }`}
                >
                  <div className="flex items-center justify-between mb-0.5">
                    <span className={`font-medium ${move.type === 'play' ? 'text-amber-300' : 'text-emerald-300'}`}>
                      {move.playerName}
                    </span>
                    <span className="text-emerald-500 text-[8px] sm:text-[10px]">T{move.turnNumber}</span>
                  </div>
                  <div className="text-emerald-200 truncate">
                    {move.type === 'play' ? (
                      <span className="flex items-center gap-1">
                        <span className="text-emerald-400">→</span>
                        {move.cards.map(c => getCardDisplayName(c)).join(' ')}
                      </span>
                    ) : (
                      <span className="flex items-center gap-1">
                        <span className="text-amber-400">↑</span>
                        Took {move.cards.length}
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
            <div ref={historyEndRef} />
          </div>
        )}
      </div>

      {/* Desktop: Player Hand at bottom */}
      {shouldShowHand && (
        <div className="hidden lg:block bg-emerald-800 border-t border-emerald-600 p-4 flex-shrink-0">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-3">
              <span className="text-emerald-300 text-sm">Your Hand ({currentPlayer.hand.length} cards)</span>
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

      {/* Confirm Popup */}
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

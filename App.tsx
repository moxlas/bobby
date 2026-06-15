import React, { useState, useCallback } from 'react';
import { SetupScreen } from './components/SetupScreen';
import { GameBoard } from './components/GameBoard';
import { Card, Player, GameState, GameOptions, PlayerMove } from './types/game';
import { createDeck, shuffleDeck, cutDeck, dealCards } from './utils/deckUtils';
import { validatePlay, getTakeOptions, canContinueAfterPlay } from './utils/gameLogic';

interface PlayerSetup {
  name: string;
  isAI: boolean;
}

function App() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [initialPlayers, setInitialPlayers] = useState<PlayerSetup[]>([]);

  const handleStartGame = useCallback((players: PlayerSetup[], options: GameOptions) => {
    setInitialPlayers(players);
    
    // Create and shuffle deck
    let deck = createDeck();
    deck = shuffleDeck(deck);
    deck = cutDeck(deck);
    
    // Create player objects
    const gamePlayers: Player[] = players.map((p, index) => ({
      id: index.toString(),
      name: p.name,
      hand: [],
      isAI: p.isAI,
      hasFinished: false,
      finishPosition: 0,
      finishTime: 0
    }));
    
    // Deal cards
    const hands = dealCards(deck, players.length);
    hands.forEach((hand, index) => {
      gamePlayers[index].hand = hand;
    });
    
    // Find who has 9 of diamonds - they start
    let startingPlayerIndex = 0;
    for (let i = 0; i < gamePlayers.length; i++) {
      if (gamePlayers[i].hand.some(c => c.value === 9 && c.suit === 'diamonds')) {
        startingPlayerIndex = i;
        break;
      }
    }
    
    // Create initial pile with 9 of diamonds
    const nineOfDiamonds = { value: 9, suit: 'diamonds' as const, id: '9-diamonds', faceUp: true };
    
    // Remove 9 of diamonds from starting player's hand
    const nineIndex = gamePlayers[startingPlayerIndex].hand.findIndex(
      c => c.value === 9 && c.suit === 'diamonds'
    );
    if (nineIndex !== -1) {
      gamePlayers[startingPlayerIndex].hand.splice(nineIndex, 1);
    }
    
    // Check if player has all 4 nines and Special 9's Rule is enabled
    const startingPlayerHand = gamePlayers[startingPlayerIndex].hand;
    const nineCount = startingPlayerHand.filter(c => c.value === 9).length + 1; // +1 for 9 of diamonds already removed
    const hasAllFourNines = nineCount === 4;
    const canContinueWithFourNines = options.specialNineRule && hasAllFourNines;
    
    // If player doesn't have 4 nines or Special 9's Rule is disabled, move to next player
    let currentPlayerIndex = startingPlayerIndex;
    if (!canContinueWithFourNines) {
      // Find next active player
      do {
        currentPlayerIndex = (currentPlayerIndex + 1) % gamePlayers.length;
      } while (gamePlayers[currentPlayerIndex].hasFinished);
    }
    
    gamePlayers.forEach((p, i) => {
      p.isCurrentTurn = i === currentPlayerIndex;
    });
    
    const newGameState: GameState = {
      players: gamePlayers,
      pile: [nineOfDiamonds],
      currentPlayerIndex,
      phase: 'playing',
      turnNumber: 1,
      moveHistory: [{
        id: '0',
        type: 'play',
        playerId: startingPlayerIndex,
        playerName: gamePlayers[startingPlayerIndex].name,
        cards: [nineOfDiamonds],
        timestamp: Date.now(),
        turnNumber: 0
      }],
      finishOrder: [],
      gameStartTime: Date.now(),
      pausedTime: null,
      totalPausedTime: 0,
      canContinueTurn: canContinueWithFourNines,
      options
    };
    
    setGameState(newGameState);
  }, []);

  const handlePlayCards = useCallback((playerId: string, cards: Card[], continueTurn: boolean) => {
    setGameState(prev => {
      if (!prev) return prev;
      
      const playerIndex = prev.players.findIndex(p => p.id === playerId);
      if (playerIndex === -1) return prev;
      
      const player = prev.players[playerIndex];
      const newPlayers = [...prev.players];
      const newPile = [...prev.pile];
      const newHand = [...player.hand];
      
      // Remove played cards from hand
      for (const card of cards) {
        const cardIndex = newHand.findIndex(c => c.id === card.id);
        if (cardIndex !== -1) {
          newHand.splice(cardIndex, 1);
        }
      }
      
      // Add cards to pile
      newPile.push(...cards);
      
      // Update player
      newPlayers[playerIndex] = {
        ...player,
        hand: newHand,
        hasFinished: newHand.length === 0
      };
      
      // Add to move history
      const newMove: PlayerMove = {
        id: Date.now().toString(),
        type: 'play',
        playerId,
        playerName: player.name,
        cards,
        timestamp: Date.now(),
        turnNumber: prev.turnNumber
      };
      
      const newHistory = [...prev.moveHistory, newMove];
      
      // Check if player finished
      let newFinishOrder = [...prev.finishOrder];
      let finishTime = 0;
      
      if (newHand.length === 0) {
        newFinishOrder.push({
          ...newPlayers[playerIndex],
          finishPosition: newFinishOrder.length + 1,
          finishTime: (Date.now() - prev.gameStartTime) / 1000 - prev.totalPausedTime
        });
        finishTime = (Date.now() - prev.gameStartTime) / 1000 - prev.totalPausedTime;
        
        newPlayers[playerIndex] = {
          ...newPlayers[playerIndex],
          finishPosition: newFinishOrder.length,
          finishTime
        };
      }
      
      // Check if game is over (only one player left with cards)
      const activePlayers = newPlayers.filter(p => !p.hasFinished);
      if (activePlayers.length <= 1 && activePlayers[0]) {
        // Last player is the loser
        newFinishOrder.push({
          ...activePlayers[0],
          finishPosition: newFinishOrder.length + 1,
          finishTime: (Date.now() - prev.gameStartTime) / 1000 - prev.totalPausedTime
        });
        newPlayers[newPlayers.findIndex(p => p.id === activePlayers[0].id)] = {
          ...activePlayers[0],
          hasFinished: true,
          finishPosition: newFinishOrder.length,
          finishTime: (Date.now() - prev.gameStartTime) / 1000 - prev.totalPausedTime
        };
        
        return {
          ...prev,
          players: newPlayers,
          pile: newPile,
          phase: 'finished',
          moveHistory: newHistory,
          finishOrder: newFinishOrder
        };
      }
      
      // Determine next player
      let nextPlayerIndex = prev.currentPlayerIndex;
      let newTurnNumber = prev.turnNumber;
      
      // If player finished or can't continue, move to next player
      if (newHand.length === 0 || !continueTurn) {
        // Find next active player
        do {
          nextPlayerIndex = (nextPlayerIndex + 1) % newPlayers.length;
        } while (newPlayers[nextPlayerIndex].hasFinished);
        
        newTurnNumber = prev.turnNumber + 1;
      }
      
      // Check if player can continue (has valid moves after playing 4 of a kind)
      const canContinue = continueTurn && newHand.length > 0 && canContinueAfterPlay(newHand, newPile);
      
      return {
        ...prev,
        players: newPlayers,
        pile: newPile,
        currentPlayerIndex: nextPlayerIndex,
        turnNumber: newTurnNumber,
        moveHistory: newHistory,
        finishOrder: newFinishOrder,
        canContinueTurn: canContinue
      };
    });
  }, []);

  const handleTakeCards = useCallback((playerId: string, count: number) => {
    setGameState(prev => {
      if (!prev) return prev;
      
      const playerIndex = prev.players.findIndex(p => p.id === playerId);
      if (playerIndex === -1) return prev;
      
      const player = prev.players[playerIndex];
      const newPlayers = [...prev.players];
      const newPile = [...prev.pile];
      const newHand = [...player.hand];
      
      // ============================================================
      // FIX: Take cards from the TOP of the pile (end of array)
      // ============================================================
      // Pile structure: [9d, 9s, 10d, 10s, 10h, Jd]
      // - pile[0] = 9d (bottom, always stays)
      // - pile[pile.length-1] = Jd (top, most recently played)
      // 
      // When taking 3 cards, we want: [10s, 10h, Jd]
      // These are at indices: 3, 4, 5 (the last 3 cards)
      // 
      // Using splice(-count, count):
      // - Negative index starts from the END of the array
      // - splice(-3, 3) removes and returns the last 3 elements
      // ============================================================
      
      // Calculate how many cards we can actually take
      // (don't take the 9 of diamonds at index 0)
      const availableCards = newPile.length - 1;
      const actualCount = Math.min(count, availableCards);
      
      // Take from the TOP of pile (end of array)
      // This correctly takes the most recently played cards
      const cardsToTake = newPile.splice(-actualCount, actualCount);
      
      // Add taken cards to player's hand and sort
      newHand.push(...cardsToTake);
      newHand.sort((a, b) => a.value - b.value);
      
      // Update player
      newPlayers[playerIndex] = {
        ...player,
        hand: newHand
      };
      
      // Add to move history
      const newMove: PlayerMove = {
        id: Date.now().toString(),
        type: 'take',
        playerId,
        playerName: player.name,
        cards: cardsToTake,
        timestamp: Date.now(),
        turnNumber: prev.turnNumber
      };
      
      const newHistory = [...prev.moveHistory, newMove];
      
      // Move to next player
      let nextPlayerIndex = prev.currentPlayerIndex;
      do {
        nextPlayerIndex = (nextPlayerIndex + 1) % newPlayers.length;
      } while (newPlayers[nextPlayerIndex].hasFinished);
      
      return {
        ...prev,
        players: newPlayers,
        pile: newPile,
        currentPlayerIndex: nextPlayerIndex,
        turnNumber: prev.turnNumber + 1,
        moveHistory: newHistory,
        canContinueTurn: false
      };
    });
  }, []);

  const handleEndTurn = useCallback(() => {
    setGameState(prev => {
      if (!prev) return prev;
      
      // Move to next player
      let nextPlayerIndex = prev.currentPlayerIndex;
      do {
        nextPlayerIndex = (nextPlayerIndex + 1) % prev.players.length;
      } while (prev.players[nextPlayerIndex].hasFinished);
      
      return {
        ...prev,
        currentPlayerIndex: nextPlayerIndex,
        turnNumber: prev.turnNumber + 1,
        canContinueTurn: false
      };
    });
  }, []);

  const handlePauseGame = useCallback(() => {
    setGameState(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        phase: 'paused',
        pausedTime: Date.now()
      };
    });
  }, []);

  const handleResumeGame = useCallback(() => {
    setGameState(prev => {
      if (!prev) return prev;
      const pauseDuration = Date.now() - (prev.pausedTime || Date.now());
      return {
        ...prev,
        phase: 'playing',
        pausedTime: null,
        totalPausedTime: prev.totalPausedTime + pauseDuration
      };
    });
  }, []);

  const handleRestartGame = useCallback(() => {
    if (initialPlayers.length === 0) return;
    
    // Create new game with same players and options
    let deck = createDeck();
    deck = shuffleDeck(deck);
    deck = cutDeck(deck);
    
    const gamePlayers: Player[] = initialPlayers.map((p, index) => ({
      id: index.toString(),
      name: p.name,
      hand: [],
      isAI: p.isAI,
      hasFinished: false,
      finishPosition: 0,
      finishTime: 0
    }));
    
    const hands = dealCards(deck, initialPlayers.length);
    hands.forEach((hand, index) => {
      gamePlayers[index].hand = hand;
    });
    
    let startingPlayerIndex = 0;
    for (let i = 0; i < gamePlayers.length; i++) {
      if (gamePlayers[i].hand.some(c => c.value === 9 && c.suit === 'diamonds')) {
        startingPlayerIndex = i;
        break;
      }
    }
    
    const nineOfDiamonds = { value: 9, suit: 'diamonds' as const, id: '9-diamonds', faceUp: true };
    const nineIndex = gamePlayers[startingPlayerIndex].hand.findIndex(
      c => c.value === 9 && c.suit === 'diamonds'
    );
    if (nineIndex !== -1) {
      gamePlayers[startingPlayerIndex].hand.splice(nineIndex, 1);
    }
    
    // Check if player has all 4 nines and Special 9's Rule is enabled
    const startingPlayerHand = gamePlayers[startingPlayerIndex].hand;
    const nineCount = startingPlayerHand.filter(c => c.value === 9).length + 1;
    const hasAllFourNines = nineCount === 4;
    const canContinueWithFourNines = gameState?.options.specialNineRule && hasAllFourNines;
    
    let currentPlayerIndex = startingPlayerIndex;
    if (!canContinueWithFourNines) {
      do {
        currentPlayerIndex = (currentPlayerIndex + 1) % gamePlayers.length;
      } while (gamePlayers[currentPlayerIndex].hasFinished);
    }
    
    gamePlayers.forEach((p, i) => {
      p.isCurrentTurn = i === currentPlayerIndex;
    });
    
    setGameState({
      players: gamePlayers,
      pile: [nineOfDiamonds],
      currentPlayerIndex,
      phase: 'playing',
      turnNumber: 1,
      moveHistory: [{
        id: '0',
        type: 'play',
        playerId: startingPlayerIndex,
        playerName: gamePlayers[startingPlayerIndex].name,
        cards: [nineOfDiamonds],
        timestamp: Date.now(),
        turnNumber: 0
      }],
      finishOrder: [],
      gameStartTime: Date.now(),
      pausedTime: null,
      totalPausedTime: 0,
      canContinueTurn: canContinueWithFourNines,
      options: gameState?.options || {}
    });
  }, [initialPlayers, gameState?.options]);

  const handleNewGame = useCallback(() => {
    setGameState(null);
    setInitialPlayers([]);
  }, []);

  if (!gameState) {
    return <SetupScreen onStartGame={handleStartGame} />;
  }

  return (
    <GameBoard
      gameState={gameState}
      onPlayCards={handlePlayCards}
      onTakeCards={handleTakeCards}
      onEndTurn={handleEndTurn}
      onPauseGame={handlePauseGame}
      onResumeGame={handleResumeGame}
      onRestartGame={handleRestartGame}
      onNewGame={handleNewGame}
    />
  );
}

export default App;

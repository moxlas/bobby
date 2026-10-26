import { useState, useCallback, useRef, useEffect } from 'react';
import { SetupScreen } from './components/SetupScreen';
import { GameBoard } from './components/GameBoard';
import { DealingAnimation } from './components/DealingAnimation';
import { Card, Player, GameState, GameOptions } from './types/game';
import { createDeck, shuffleDeck, cutDeck, dealCards } from './utils/deckUtils';
import { saveGameResults } from './utils/leaderboard';

interface PlayerSetup {
  name: string;
  isAI: boolean;
}

function createGameState(players: PlayerSetup[], options: GameOptions): { gameState: GameState; initialPlayers: PlayerSetup[] } {
  let deck = createDeck();
  deck = shuffleDeck(deck);
  deck = cutDeck(deck);

  const gamePlayers: Player[] = players.map((p, index) => ({
    id: index,
    name: p.name,
    hand: [],
    isCurrentTurn: false,
    isConnected: true,
    isAI: p.isAI,
    hasFinished: false,
    finishPosition: null,
    finishTime: null,
  }));

  const hands = dealCards(deck, players.length);
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

  const nineOfDiamonds: Card = { value: 9, suit: 'diamonds', id: 'diamonds-9', faceUp: true };
  const nineIndex = gamePlayers[startingPlayerIndex].hand.findIndex(
    c => c.value === 9 && c.suit === 'diamonds'
  );
  if (nineIndex !== -1) {
    gamePlayers[startingPlayerIndex].hand.splice(nineIndex, 1);
  }

  const startingPlayerHand = gamePlayers[startingPlayerIndex].hand;
  const nineCount = startingPlayerHand.filter(c => c.value === 9).length + 1;
  const hasAllFourNines = nineCount === 4;
  const canContinueWithFourNines = options.specialNinesRule && hasAllFourNines;

  let currentPlayerIndex = startingPlayerIndex;
  if (!canContinueWithFourNines) {
    do {
      currentPlayerIndex = (currentPlayerIndex + 1) % gamePlayers.length;
    } while (gamePlayers[currentPlayerIndex].hasFinished);
  }

  gamePlayers.forEach((p, i) => {
    p.isCurrentTurn = i === currentPlayerIndex;
  });

  const gameState: GameState = {
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
    options,
    deck: [],
    direction: 'clockwise',
    loser: null,
  };

  return { gameState, initialPlayers: players };
}

function App() {
  const [appPhase, setAppPhase] = useState<'setup' | 'dealing' | 'playing'>('setup');
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [initialPlayers, setInitialPlayers] = useState<PlayerSetup[]>([]);
  const gameOptionsRef = useRef<GameOptions | null>(null);
  const leaderboardSavedRef = useRef(false);

  useEffect(() => {
    if (gameState?.phase === 'finished' && !leaderboardSavedRef.current) {
      leaderboardSavedRef.current = true;
      const totalPlayers = gameState.players.length;
      const results = gameState.finishOrder.map(p => ({
        playerName: p.name,
        isAI: p.isAI,
        finishPosition: p.finishPosition ?? totalPlayers,
        totalPlayers,
      }));
      saveGameResults(results);
    }
  }, [gameState?.phase]);

  const handleStartGame = useCallback((players: PlayerSetup[], options: GameOptions) => {
    gameOptionsRef.current = options;
    leaderboardSavedRef.current = false;
    const { gameState: newState, initialPlayers: ip } = createGameState(players, options);
    setInitialPlayers(ip);
    setGameState(newState);
    setAppPhase('dealing');
  }, []);

  const handleDealingComplete = useCallback(() => {
    setAppPhase('playing');
  }, []);

  const handlePlayCards = useCallback((playerId: number, cards: Card[], continueTurn: boolean) => {
    setGameState(prev => {
      if (!prev) return prev;

      const playerIndex = prev.players.findIndex(p => p.id === playerId);
      if (playerIndex === -1) return prev;

      const player = prev.players[playerIndex];
      const newPlayers = prev.players.map(p => ({ ...p, hand: [...p.hand] }));
      const newPile = [...prev.pile];
      const newHand = [...newPlayers[playerIndex].hand];

      for (const card of cards) {
        const cardIndex = newHand.findIndex(c => c.id === card.id);
        if (cardIndex !== -1) {
          newHand.splice(cardIndex, 1);
        }
      }

      newPile.push(...cards);
      newPlayers[playerIndex] = { ...newPlayers[playerIndex], hand: newHand, hasFinished: newHand.length === 0 };

      const elapsedTime = prev.gameStartTime
        ? (Date.now() - prev.gameStartTime) / 1000 - prev.totalPausedTime
        : 0;

      let newFinishOrder = [...prev.finishOrder];

      if (newHand.length === 0) {
        newPlayers[playerIndex] = {
          ...newPlayers[playerIndex],
          finishPosition: newFinishOrder.length + 1,
          finishTime: elapsedTime,
        };
        newFinishOrder.push({ ...newPlayers[playerIndex] });
      }

      const activePlayers = newPlayers.filter(p => !p.hasFinished);
      if (activePlayers.length <= 1 && activePlayers[0]) {
        const loserIdx = newPlayers.findIndex(p => p.id === activePlayers[0].id);
        const loserFinishPos = newFinishOrder.length + 1;
        newFinishOrder.push({
          ...activePlayers[0],
          finishPosition: loserFinishPos,
          finishTime: elapsedTime,
        });
        newPlayers[loserIdx] = {
          ...newPlayers[loserIdx],
          hasFinished: true,
          finishPosition: loserFinishPos,
          finishTime: elapsedTime,
        };

        return {
          ...prev,
          players: newPlayers,
          pile: newPile,
          phase: 'finished',
          moveHistory: [...prev.moveHistory, {
            id: Date.now().toString(),
            type: 'play',
            playerId,
            playerName: player.name,
            cards,
            timestamp: Date.now(),
            turnNumber: prev.turnNumber,
          }],
          finishOrder: newFinishOrder,
          loser: newPlayers[loserIdx],
        };
      }

      let nextPlayerIndex = prev.currentPlayerIndex;
      let newTurnNumber = prev.turnNumber;

      if (newHand.length === 0 || !continueTurn) {
        do {
          nextPlayerIndex = (nextPlayerIndex + 1) % newPlayers.length;
        } while (newPlayers[nextPlayerIndex].hasFinished);
        newTurnNumber = prev.turnNumber + 1;
      }

      newPlayers.forEach((p, i) => {
        p.isCurrentTurn = i === nextPlayerIndex;
      });

      return {
        ...prev,
        players: newPlayers,
        pile: newPile,
        currentPlayerIndex: nextPlayerIndex,
        turnNumber: newTurnNumber,
        moveHistory: [...prev.moveHistory, {
          id: Date.now().toString(),
          type: 'play',
          playerId,
          playerName: player.name,
          cards,
          timestamp: Date.now(),
          turnNumber: prev.turnNumber,
        }],
        finishOrder: newFinishOrder,
        canContinueTurn: continueTurn && newHand.length > 0,
      };
    });
  }, []);

  const handleTakeCards = useCallback((playerId: number, count: number) => {
    setGameState(prev => {
      if (!prev) return prev;

      const playerIndex = prev.players.findIndex(p => p.id === playerId);
      if (playerIndex === -1) return prev;

      const player = prev.players[playerIndex];
      const newPlayers = prev.players.map(p => ({ ...p, hand: [...p.hand] }));
      const newPile = [...prev.pile];

      const availableCards = newPile.length - 1;
      const actualCount = Math.min(count, availableCards);
      const cardsToTake = newPile.splice(-actualCount, actualCount);

      newPlayers[playerIndex] = {
        ...newPlayers[playerIndex],
        hand: [...newPlayers[playerIndex].hand, ...cardsToTake].sort((a, b) => a.value - b.value),
      };

      let nextPlayerIndex = prev.currentPlayerIndex;
      do {
        nextPlayerIndex = (nextPlayerIndex + 1) % newPlayers.length;
      } while (newPlayers[nextPlayerIndex].hasFinished);

      newPlayers.forEach((p, i) => {
        p.isCurrentTurn = i === nextPlayerIndex;
      });

      return {
        ...prev,
        players: newPlayers,
        pile: newPile,
        currentPlayerIndex: nextPlayerIndex,
        turnNumber: prev.turnNumber + 1,
        moveHistory: [...prev.moveHistory, {
          id: Date.now().toString(),
          type: 'take',
          playerId,
          playerName: player.name,
          cards: cardsToTake,
          timestamp: Date.now(),
          turnNumber: prev.turnNumber,
        }],
        canContinueTurn: false,
      };
    });
  }, []);

  const handleEndTurn = useCallback(() => {
    setGameState(prev => {
      if (!prev) return prev;

      const newPlayers = prev.players.map(p => ({ ...p }));
      let nextPlayerIndex = prev.currentPlayerIndex;
      do {
        nextPlayerIndex = (nextPlayerIndex + 1) % newPlayers.length;
      } while (newPlayers[nextPlayerIndex].hasFinished);

      newPlayers.forEach((p, i) => {
        p.isCurrentTurn = i === nextPlayerIndex;
      });

      return {
        ...prev,
        players: newPlayers,
        currentPlayerIndex: nextPlayerIndex,
        turnNumber: prev.turnNumber + 1,
        canContinueTurn: false,
      };
    });
  }, []);

  const handlePauseGame = useCallback(() => {
    setGameState(prev => {
      if (!prev) return prev;
      return { ...prev, phase: 'paused', pausedTime: Date.now() };
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
        totalPausedTime: prev.totalPausedTime + pauseDuration / 1000,
      };
    });
  }, []);

  const handleRestartGame = useCallback(() => {
    if (initialPlayers.length === 0 || !gameOptionsRef.current) return;
    leaderboardSavedRef.current = false;
    const { gameState: newState } = createGameState(initialPlayers, gameOptionsRef.current);
    setGameState(newState);
    setAppPhase('dealing');
  }, [initialPlayers]);

  const handleNewGame = useCallback(() => {
    setGameState(null);
    setInitialPlayers([]);
    leaderboardSavedRef.current = false;
    setAppPhase('setup');
  }, []);

  if (appPhase === 'setup' || !gameState) {
    return <SetupScreen onStartGame={handleStartGame} />;
  }

  if (appPhase === 'dealing') {
    const openingPlayerId = gameState.moveHistory[0]?.playerId;
    const playerInfos = gameState.players.map(p => ({
      name: p.name,
      isAI: p.isAI,
      cardCount: p.hand.length + (p.id === openingPlayerId ? 1 : 0),
    }));
    return <DealingAnimation players={playerInfos} onComplete={handleDealingComplete} />;
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

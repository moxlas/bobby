import React, { useState, useCallback } from 'react';
import { SetupScreen } from './components/SetupScreen';
import { GameBoard } from './components/GameBoard';
import { initializeGame, playCards, takeCards, endTurn, pauseGame, resumeGame } from './utils/gameLogic';
import { GameState, Card, GameOptions, DEFAULT_OPTIONS } from './types/game';

interface PlayerSetup {
  name: string;
  isAI: boolean;
}

export default function App() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [playerSetups, setPlayerSetups] = useState<PlayerSetup[]>([]);

  const handleStartGame = useCallback((players: PlayerSetup[], options: GameOptions) => {
    setPlayerSetups(players);
    const state = initializeGame(players, options);
    setGameState(state);
  }, []);

  const handlePlayCards = useCallback((playerId: number, cards: Card[], continueTurn: boolean) => {
    if (!gameState) return;
    const newState = playCards(gameState, playerId, cards, continueTurn);
    setGameState(newState);
  }, [gameState]);

  const handleTakeCards = useCallback((playerId: number, count: number) => {
    if (!gameState) return;
    const newState = takeCards(gameState, playerId, count);
    setGameState(newState);
  }, [gameState]);

  const handleEndTurn = useCallback(() => {
    if (!gameState) return;
    const newState = endTurn(gameState);
    setGameState(newState);
  }, [gameState]);

  const handlePauseGame = useCallback(() => {
    if (!gameState) return;
    const newState = pauseGame(gameState);
    setGameState(newState);
  }, [gameState]);

  const handleResumeGame = useCallback(() => {
    if (!gameState) return;
    const newState = resumeGame(gameState);
    setGameState(newState);
  }, [gameState]);

  const handleRestartGame = useCallback(() => {
    if (playerSetups.length > 0) {
      const state = initializeGame(playerSetups, gameState?.options || DEFAULT_OPTIONS);
      setGameState(state);
    }
  }, [playerSetups, gameState?.options]);

  const handleNewGame = useCallback(() => {
    setGameState(null);
    setPlayerSetups([]);
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
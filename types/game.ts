export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Value = 9 | 10 | 11 | 12 | 13 | 14;

export interface Card {
  id: string;
  suit: Suit;
  value: Value;
  faceUp: boolean;
}

export interface Player {
  id: number;
  name: string;
  hand: Card[];
  isCurrentTurn: boolean;
  isConnected: boolean;
  isAI: boolean;
  hasFinished: boolean;
  finishPosition: number | null;
  finishTime: number | null;
}

export interface PlayerMove {
  id: string;
  playerId: number;
  playerName: string;
  type: 'play' | 'take';
  cards: Card[];
  timestamp: number;
  turnNumber: number;
}

export type GamePhase = 'setup' | 'playing' | 'paused' | 'finished';

export type AIDifficulty = 'easy' | 'medium' | 'hard';

export interface GameOptions {
  allowFourNinesStart: boolean;
  allowTakeAllCards: boolean;
  specialNineRule: boolean;
  aiDifficulty: AIDifficulty;
}

export interface GameState {
  phase: GamePhase;
  players: Player[];
  currentPlayerIndex: number;
  pile: Card[];
  deck: Card[];
  direction: 'clockwise' | 'counterclockwise';
  finishOrder: Player[];
  loser: Player | null;
  moveHistory: PlayerMove[];
  gameStartTime: number | null;
  pausedTime: number | null;
  totalPausedTime: number;
  turnNumber: number;
  options: GameOptions;
  canContinueTurn: boolean;
}

export const DEFAULT_OPTIONS: GameOptions = {
  allowFourNinesStart: true,
  allowTakeAllCards: true,
  specialNineRule: true,
  aiDifficulty: 'easy',
};

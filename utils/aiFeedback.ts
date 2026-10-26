import type { AIDifficulty, Card, GameOptions, GameState } from '../types/game';

export type AIFeedbackMove = {
  type: 'play' | 'take' | 'endTurn';
  cards: Card[];
  takeType?: 'take3' | 'takeAll';
};

export interface AIFeedbackRecord {
  id: string;
  createdAt: string;
  gameStartTime: number | null;
  turnNumber: number;
  difficulty: AIDifficulty;
  rules: Pick<GameOptions, 'specialNinesRule' | 'allowTakeAllCards' | 'fourOfAKindRule'>;
  playerCount: number;
  aiPlayerId: number;
  observation: {
    hand: Card[];
    pile: Card[];
    canContinueTurn: boolean;
    opponents: Array<{ playerId: number; cardCount: number; hasFinished: boolean }>;
    publicHistory: Array<{
      playerId: number;
      type: 'play' | 'take';
      cards: Card[];
      turnNumber: number;
    }>;
  };
  chosenMove: AIFeedbackMove;
  availableMoves: AIFeedbackMove[];
  preferredMove?: AIFeedbackMove;
  rating: 'good' | 'bad';
}

const STORAGE_KEY = 'bobby-ai-feedback-v1';
const MAX_RECORDS = 2000;

export function getAIFeedbackRecords(): AIFeedbackRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const records: unknown = JSON.parse(stored);
    return Array.isArray(records) ? records as AIFeedbackRecord[] : [];
  } catch {
    return [];
  }
}

export function saveAIFeedback(record: AIFeedbackRecord): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const records = [...getAIFeedbackRecords(), record].slice(-MAX_RECORDS);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    return true;
  } catch {
    return false;
  }
}

export function createAIFeedbackRecord(
  state: GameState,
  aiPlayerId: number,
  chosenMove: AIFeedbackMove,
  rating: 'good' | 'bad',
  preferredMove?: AIFeedbackMove,
  availableMoves: AIFeedbackMove[] = [],
): AIFeedbackRecord {
  const player = state.players.find(candidate => candidate.id === aiPlayerId);
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    createdAt: new Date().toISOString(),
    gameStartTime: state.gameStartTime,
    turnNumber: state.turnNumber,
    difficulty: state.options.aiDifficulty,
    rules: {
      specialNinesRule: state.options.specialNinesRule,
      allowTakeAllCards: state.options.allowTakeAllCards,
      fourOfAKindRule: state.options.fourOfAKindRule,
    },
    playerCount: state.players.length,
    aiPlayerId,
    observation: {
      hand: (player?.hand ?? []).map(card => ({ ...card })),
      pile: state.pile.map(card => ({ ...card })),
      canContinueTurn: state.canContinueTurn,
      opponents: state.players
        .filter(candidate => candidate.id !== aiPlayerId)
        .map(opponent => ({
          playerId: opponent.id,
          cardCount: opponent.hand.length,
          hasFinished: opponent.hasFinished,
        })),
      publicHistory: state.moveHistory.map(move => ({
        playerId: move.playerId,
        type: move.type,
        cards: move.cards.map(card => ({ ...card })),
        turnNumber: move.turnNumber,
      })),
    },
    chosenMove: {
      ...chosenMove,
      cards: chosenMove.cards.map(card => ({ ...card })),
    },
    availableMoves: availableMoves.map(move => ({ ...move, cards: move.cards.map(card => ({ ...card })) })),
    preferredMove: preferredMove ? {
      ...preferredMove,
      cards: preferredMove.cards.map(card => ({ ...card })),
    } : undefined,
    rating,
  };
}

export function exportAIFeedback(): string {
  return JSON.stringify({ format: 'bobby-ai-feedback-v1', records: getAIFeedbackRecords() }, null, 2);
}

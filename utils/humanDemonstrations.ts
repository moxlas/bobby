import type { AIDifficulty, Card, GameOptions, GameState } from '../types/game';
import type { AIFeedbackMove } from './aiFeedback';

export interface HumanMoveDemonstration {
  id: string;
  createdAt: string;
  gameStartTime: number | null;
  turnNumber: number;
  difficulty: AIDifficulty;
  rules: Pick<GameOptions, 'specialNinesRule' | 'allowTakeAllCards' | 'fourOfAKindRule'>;
  playerCount: number;
  humanPlayerId: number;
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
}

const STORAGE_KEY = 'bobby-human-demonstrations-v1';
const MAX_RECORDS = 500;

export function getHumanMoveDemonstrations(): HumanMoveDemonstration[] {
  if (typeof window === 'undefined') return [];
  try {
    const saved: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(saved) ? saved as HumanMoveDemonstration[] : [];
  } catch {
    return [];
  }
}

export function saveHumanMoveDemonstration(record: HumanMoveDemonstration): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const records = [...getHumanMoveDemonstrations(), record].slice(-MAX_RECORDS);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    return true;
  } catch {
    return false;
  }
}

export function createHumanMoveDemonstration(
  state: GameState,
  humanPlayerId: number,
  chosenMove: AIFeedbackMove,
  availableMoves: AIFeedbackMove[],
): HumanMoveDemonstration {
  const player = state.players.find(candidate => candidate.id === humanPlayerId);
  const copyMove = (move: AIFeedbackMove): AIFeedbackMove => ({
    ...move,
    cards: move.cards.map(card => ({ ...card })),
  });
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
    humanPlayerId,
    observation: {
      hand: (player?.hand ?? []).map(card => ({ ...card })),
      pile: state.pile.map(card => ({ ...card })),
      canContinueTurn: state.canContinueTurn,
      opponents: state.players
        .filter(opponent => opponent.id !== humanPlayerId)
        .map(opponent => ({
          playerId: opponent.id,
          cardCount: opponent.hand.length,
          hasFinished: opponent.hasFinished,
        })),
      publicHistory: state.moveHistory.slice(-30).map(move => ({
        playerId: move.playerId,
        type: move.type,
        cards: move.cards.map(card => ({ ...card })),
        turnNumber: move.turnNumber,
      })),
    },
    chosenMove: copyMove(chosenMove),
    availableMoves: availableMoves.map(copyMove),
  };
}

export function exportHumanMoveDemonstrations(): string {
  return JSON.stringify({
    format: 'bobby-human-demonstrations-v1',
    records: getHumanMoveDemonstrations(),
  }, null, 2);
}

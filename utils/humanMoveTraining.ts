/**
 * Compiled move statistics from all three supplied demonstration files:
 * 342 unique decisions across 17 two-player games. Per-state examples,
 * including the opponent's last public action, live in humanMoveTrainingData.ts.
 */
export const HUMAN_MOVE_TRAINING = {
  records: 342,
  games: 17,
  pileTopChoices: {
    9: { states: 96, takes: 0 },
    10: { states: 50, takes: 0 },
    11: { states: 46, takes: 0 },
    12: { states: 53, takes: 3 },
    13: { states: 59, takes: 31 },
    14: { states: 38, takes: 28 },
  },
  highPileChoices: {
    13: { states: 59, takes: 31 },
    14: { states: 38, takes: 28 },
  },
  quadBreaks: {
    quadInHandStates: 207,
    singleBreaks: 35,
    breaksByRank: { 12: 4, 13: 22, 14: 9 },
    breaksByPileTop: { 9: 1, 10: 7, 11: 12, 12: 15 },
    breaksOnNine: 1,
  },
} as const;

export function getDemonstratedHighPileTakeRate(value: 13 | 14): number {
  const observations = HUMAN_MOVE_TRAINING.highPileChoices[value];
  // A small neutral prior keeps the rates from treating this sample as certain.
  return (observations.takes + 5) / (observations.states + 10);
}

export function getDemonstratedPickupAdjustment(topValue: number): number {
  const observations = HUMAN_MOVE_TRAINING.pileTopChoices[topValue as keyof typeof HUMAN_MOVE_TRAINING.pileTopChoices];
  if (!observations) return 0;

  // Compare the smoothed observed take rate with a 25% neutral baseline.
  // This lowers medium's tendency to pick up on low piles and preserves the
  // expert's frequent pickup choices on Kings and Aces.
  const smoothedRate = (observations.takes + 2) / (observations.states + 8);
  return Math.round((smoothedRate - 0.25) * 140);
}

export function getDemonstratedQuadBreakShare(value: number): number {
  if (value !== 12 && value !== 13 && value !== 14) return 0;
  return HUMAN_MOVE_TRAINING.quadBreaks.breaksByRank[value] /
    HUMAN_MOVE_TRAINING.quadBreaks.singleBreaks;
}

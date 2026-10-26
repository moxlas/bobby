/**
 * Compiled move statistics from all three supplied demonstration files:
 * 455 unique decisions across 22 two-player games. Per-state examples,
 * including the opponent's last public action, live in humanMoveTrainingData.ts.
 */
export const HUMAN_MOVE_TRAINING = {
  records: 455,
  games: 22,
  pileTopChoices: {
    9: { states: 129, takes: 0 },
    10: { states: 66, takes: 0 },
    11: { states: 60, takes: 0 },
    12: { states: 74, takes: 5 },
    13: { states: 76, takes: 39 },
    14: { states: 50, takes: 38 },
  },
  highPileChoices: {
    13: { states: 76, takes: 39 },
    14: { states: 50, takes: 38 },
  },
  highCardControl: {
    highSinglePlays: 139,
    highSinglesWithLowerAlternative: 69,
    highSinglesWithLowerAlternativeAndAnotherHighKept: 69,
    highSinglesLeavingOneCardAndKeepingAnotherHigh: 9,
  },
  quadBreaks: {
    quadInHandStates: 279,
    singleBreaks: 44,
    breaksByRank: { 11: 1, 12: 7, 13: 25, 14: 11 },
    breaksByPileTop: { 9: 1, 10: 10, 11: 16, 12: 17 },
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

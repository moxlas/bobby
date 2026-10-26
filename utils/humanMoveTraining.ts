/**
 * Compiled expert move statistics from the two supplied
 * bobby-human-demonstrations-v1 files. The files contained 217 unique
 * decisions across 11 two-player games; these counts are the training signal
 * used by the AI without bundling the raw observation logs into the game.
 */
export const HUMAN_MOVE_TRAINING = {
  records: 217,
  games: 11,
  pileTopChoices: {
    9: { states: 53, takes: 0 },
    10: { states: 32, takes: 0 },
    11: { states: 34, takes: 0 },
    12: { states: 33, takes: 2 },
    13: { states: 41, takes: 23 },
    14: { states: 24, takes: 20 },
  },
  highPileChoices: {
    13: { states: 41, takes: 23 },
    14: { states: 24, takes: 20 },
  },
  quadBreaks: {
    quadInHandStates: 145,
    singleBreaks: 20,
    breaksByRank: { 12: 1, 13: 13, 14: 6 },
    breaksByPileTop: { 10: 3, 11: 7, 12: 10 },
    breaksOnNine: 0,
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

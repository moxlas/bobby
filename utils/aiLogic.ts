import { Card, GameState, GameOptions, AIDifficulty, Player } from '../types/game';
import { getCardsOfSameValue, hasFourOfSameValue } from './deckUtils';
import { getValidMoves, getTakeOptions, validatePlay } from './gameLogic';

const SCORE_WEIGHTS = {
  THREE_OF_A_KIND_PENALTY: -30,
  TWO_OF_A_KIND_BONUS: 5,
  FOUR_OF_A_KIND_BONUS: 80,
  NINE_TRIPLE_BONUS: 40,
  NINE_QUAD_BONUS: 90,
  TAKING_CARDS_BASE_PENALTY: -50,
  TAKING_COMPLETES_QUAD_BONUS: 120,
  TAKING_HIGH_CARDS_BONUS: 15,
  TAKING_USEFUL_CARDS_BONUS: 25,
  TAKING_WHEN_LEADING_PENALTY: -40,
  WINNING_MOVE_BONUS: 2000,
  CARDS_REMAINING_PENALTY: -15,
  CAN_FINISH_SOON_BONUS: 200,
  FORCE_OPPONENT_TAKE_BONUS: 45,
  PLAYING_HIGH_TO_BLOCK: 35,
  PRESERVE_HIGH_CARDS: 8,
  PLAY_LOW_CARDS_BONUS: 5,
  OPPONENT_CLOSE_TO_WIN_PENALTY: -100,
  BLOCKING_OPPONENT_BONUS: 30,
  LEADING_POSITION_BONUS: 20,
  UNCOVER_LOW_CARDS_BONUS: 20,
  OPPONENT_TAKES_BAD_PENALTY: -25,
};

function analyzePile(pile: Card[]): {
  topValue: number;
  hasLowCards: boolean;
  lowestCard: number;
  averageValue: number;
  cardValues: number[];
} {
  if (pile.length <= 1) {
    return {
      topValue: pile[0]?.value || 0,
      hasLowCards: false,
      lowestCard: 14,
      averageValue: 0,
      cardValues: []
    };
  }

  const values = pile.slice(1).map(c => c.value);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;

  return {
    topValue: pile[pile.length - 1].value,
    hasLowCards: values.some(v => v <= 10),
    lowestCard: Math.min(...values),
    averageValue: avg,
    cardValues: values
  };
}

function wouldCompleteQuad(hand: Card[], cardsToTake: Card[]): { wouldComplete: boolean; value: number | null } {
  const combined = [...hand, ...cardsToTake];
  const valueCounts = new Map<number, number>();

  for (const card of combined) {
    valueCounts.set(card.value, (valueCounts.get(card.value) || 0) + 1);
  }

  for (const [value, count] of valueCounts) {
    if (count === 4) {
      const hadThreeBefore = hand.filter(c => c.value === value).length === 3;
      if (hadThreeBefore) {
        return { wouldComplete: true, value };
      }
    }
  }

  return { wouldComplete: false, value: null };
}

function wouldGetHighCards(cardsToTake: Card[]): boolean {
  return cardsToTake.some(c => c.value >= 13);
}

function wouldFixTriple(hand: Card[], cardsToTake: Card[]): boolean {
  const valueCounts = new Map<number, number>();

  for (const card of hand) {
    valueCounts.set(card.value, (valueCounts.get(card.value) || 0) + 1);
  }

  for (const [value, count] of valueCounts) {
    if (count === 3) {
      const takingThisValue = cardsToTake.filter(c => c.value === value).length;
      if (takingThisValue === 1) {
        return true;
      }
    }
  }

  return false;
}

function evaluateHandComposition(hand: Card[]): number {
  let score = 0;
  const valueCounts = new Map<number, number>();

  for (const card of hand) {
    valueCounts.set(card.value, (valueCounts.get(card.value) || 0) + 1);
  }

  for (const [value, count] of valueCounts) {
    if (count === 4) {
      score += SCORE_WEIGHTS.FOUR_OF_A_KIND_BONUS;
      if (value === 9) {
        score += SCORE_WEIGHTS.NINE_QUAD_BONUS;
      }
    } else if (count === 3) {
      if (value === 9) {
        score += SCORE_WEIGHTS.NINE_TRIPLE_BONUS;
      } else {
        score += SCORE_WEIGHTS.THREE_OF_A_KIND_PENALTY;
      }
    } else if (count === 2) {
      score += SCORE_WEIGHTS.TWO_OF_A_KIND_BONUS;
    }
  }

  score += hand.length * SCORE_WEIGHTS.CARDS_REMAINING_PENALTY;

  return score;
}

function estimateOpponentStrength(state: GameState, playerId: number): {
  strongestOpponent: Player | null;
  weakestOpponent: Player | null;
  avgOpponentCards: number;
  opponentCloseToWin: boolean;
} {
  const opponents = state.players.filter(p => p.id !== playerId && !p.hasFinished);

  if (opponents.length === 0) {
    return {
      strongestOpponent: null,
      weakestOpponent: null,
      avgOpponentCards: 0,
      opponentCloseToWin: false
    };
  }

  const sorted = [...opponents].sort((a, b) => a.hand.length - b.hand.length);

  return {
    strongestOpponent: sorted[0],
    weakestOpponent: sorted[sorted.length - 1],
    avgOpponentCards: opponents.reduce((sum, p) => sum + p.hand.length, 0) / opponents.length,
    opponentCloseToWin: opponents.some(p => p.hand.length <= 2)
  };
}

function evaluateForceOpponentTake(
  cardToPlay: Card,
  hand: Card[],
  pile: Card[],
  state: GameState,
  playerId: number
): number {
  let bonus = 0;

  const pileAnalysis = analyzePile(pile);
  const opponentInfo = estimateOpponentStrength(state, playerId);

  if (cardToPlay.value >= 13) {
    if (opponentInfo.strongestOpponent && opponentInfo.strongestOpponent.hand.length <= 4) {
      bonus += SCORE_WEIGHTS.FORCE_OPPONENT_TAKE_BONUS;
    }

    if (pileAnalysis.hasLowCards) {
      bonus += SCORE_WEIGHTS.UNCOVER_LOW_CARDS_BONUS;
    }
  }

  if (cardToPlay.value >= 11 && cardToPlay.value <= 12) {
    if (opponentInfo.opponentCloseToWin) {
      bonus += SCORE_WEIGHTS.PLAYING_HIGH_TO_BLOCK;
    }
  }

  return bonus;
}

function evaluatePlayMove(
  cardsToPlay: Card[],
  hand: Card[],
  pile: Card[],
  state: GameState,
  playerId: number
): number {
  let score = 0;

  const remainingHand = hand.filter(c => !cardsToPlay.find(pc => pc.id === c.id));
  const opponentInfo = estimateOpponentStrength(state, playerId);

  if (remainingHand.length === 0) {
    return SCORE_WEIGHTS.WINNING_MOVE_BONUS;
  }

  if (remainingHand.length <= 3) {
    score += SCORE_WEIGHTS.CAN_FINISH_SOON_BONUS * (4 - remainingHand.length) / 3;
  }

  score += evaluateHandComposition(remainingHand);

  const playValue = cardsToPlay[0].value;

  if (playValue <= 10) {
    score += SCORE_WEIGHTS.PLAY_LOW_CARDS_BONUS;
  }

  if (cardsToPlay.length === 1 && playValue >= 11) {
    score += evaluateForceOpponentTake(cardsToPlay[0], hand, pile, state, playerId);
  }

  if (cardsToPlay.length === 4) {
    score += SCORE_WEIGHTS.FOUR_OF_A_KIND_BONUS;

    const fourOfKindValue = hasFourOfSameValue(remainingHand);
    if (fourOfKindValue !== null) {
      score += SCORE_WEIGHTS.FOUR_OF_A_KIND_BONUS * 0.4;
    }
  }

  if (cardsToPlay.length === 3 && cardsToPlay.every(c => c.value === 9)) {
    score += SCORE_WEIGHTS.NINE_TRIPLE_BONUS;
  }

  const myCardCount = remainingHand.length;

  if (myCardCount < opponentInfo.avgOpponentCards) {
    score += SCORE_WEIGHTS.LEADING_POSITION_BONUS;
  }

  if (opponentInfo.opponentCloseToWin) {
    score += SCORE_WEIGHTS.OPPONENT_CLOSE_TO_WIN_PENALTY;

    if (playValue >= 12) {
      score += SCORE_WEIGHTS.BLOCKING_OPPONENT_BONUS;
    }
  }

  return score;
}

function evaluateTakeMove(
  takeCount: number,
  hand: Card[],
  pile: Card[],
  state: GameState,
  playerId: number
): number {
  let score = SCORE_WEIGHTS.TAKING_CARDS_BASE_PENALTY;

  const cardsToTake = pile.slice(-takeCount);
  const opponentInfo = estimateOpponentStrength(state, playerId);

  const quadCheck = wouldCompleteQuad(hand, cardsToTake);
  if (quadCheck.wouldComplete) {
    score += SCORE_WEIGHTS.TAKING_COMPLETES_QUAD_BONUS;
  }

  if (wouldFixTriple(hand, cardsToTake)) {
    score += SCORE_WEIGHTS.TAKING_USEFUL_CARDS_BONUS;
  }

  if (wouldGetHighCards(cardsToTake)) {
    score += SCORE_WEIGHTS.TAKING_HIGH_CARDS_BONUS;
  }

  const myCardCount = hand.length;
  if (myCardCount < opponentInfo.avgOpponentCards - 2) {
    score += SCORE_WEIGHTS.TAKING_WHEN_LEADING_PENALTY;
  }

  if (opponentInfo.opponentCloseToWin) {
    if (quadCheck.wouldComplete) {
      score += 30;
    }
  }

  const currentHandScore = evaluateHandComposition(hand);
  const newHandScore = evaluateHandComposition([...hand, ...cardsToTake]);
  const handChange = newHandScore - currentHandScore;

  if (handChange > 20) {
    score += handChange * 0.5;
  }

  return score;
}

function getPossiblePlays(hand: Card[], pile: Card[], options: GameOptions): Card[][] {
  const plays: Card[][] = [];
  const topCard = pile[pile.length - 1];
  const isFirstMove = pile.length === 1 && topCard.suit === 'diamonds' && topCard.value === 9;

  const cardsByValue = new Map<number, Card[]>();
  for (const card of hand) {
    if (!cardsByValue.has(card.value)) {
      cardsByValue.set(card.value, []);
    }
    cardsByValue.get(card.value)!.push(card);
  }

  if (isFirstMove) {
    const nines = cardsByValue.get(9) || [];

    if (nines.length >= 1) {
      plays.push([nines[0]]);
    }

    if (options.specialNinesRule && nines.length >= 3) {
      plays.push(nines.slice(0, 3));
    }

    if (options.specialNinesRule && nines.length === 4) {
      plays.push(nines);
    }

    return plays;
  }

  for (const [value, cards] of cardsByValue) {
    const canPlayOnTop = value >= topCard.value;

    if (canPlayOnTop) {
      plays.push([cards[0]]);

      if (cards.length === 4) {
        plays.push(cards);
      }
    }
  }

  return plays;
}

export function getAIMove(state: GameState, playerId: number): {
  type: 'play' | 'take' | 'endTurn';
  cards: Card[];
  takeType?: 'take3' | 'takeAll';
} {
  const player = state.players.find(p => p.id === playerId);
  if (!player) {
    return { type: 'endTurn', cards: [] };
  }

  const hand = player.hand;
  const pile = state.pile;
  const options = state.options;
  const difficulty = options.aiDifficulty;

  if (difficulty === 'easy') {
    return getEasyAIMove(hand, pile, options);
  }

  if (difficulty === 'medium') {
    return getMediumAIMove(hand, pile, options, state, playerId);
  }

  return getHardAIMove(state, playerId);
}

function getEasyAIMove(
  hand: Card[],
  pile: Card[],
  options: GameOptions
): { type: 'play' | 'take' | 'endTurn'; cards: Card[]; takeType?: 'take3' | 'takeAll' } {
  const topCard = pile[pile.length - 1];
  const isFirstMove = pile.length === 1 && pile[0].suit === 'diamonds' && pile[0].value === 9;

  if (isFirstMove) {
    const nines = hand.filter(c => c.value === 9);
    if (options.specialNinesRule && nines.length >= 3) {
      return { type: 'play', cards: nines.slice(0, 3) };
    }
    if (nines.length >= 1) {
      return { type: 'play', cards: [nines[0]] };
    }
  }

  if (options.fourOfAKindRule) {
    const fourValue = hasFourOfSameValue(hand);
    if (fourValue !== null && fourValue >= topCard.value) {
      const fourCards = getCardsOfSameValue(hand, fourValue);
      return { type: 'play', cards: fourCards };
    }
  }

  const validCards = hand.filter(c => c.value >= topCard.value);
  if (validCards.length > 0) {
    validCards.sort((a, b) => a.value - b.value);
    return { type: 'play', cards: [validCards[0]] };
  }

  const takeOpts = getTakeOptions(pile, options);
  return { type: 'take', cards: [], takeType: 'take3' };
}

function getMediumAIMove(
  hand: Card[],
  pile: Card[],
  options: GameOptions,
  state: GameState,
  playerId: number
): { type: 'play' | 'take' | 'endTurn'; cards: Card[]; takeType?: 'take3' | 'takeAll' } {
  const topCard = pile[pile.length - 1];
  const isFirstMove = pile.length === 1 && pile[0].suit === 'diamonds' && pile[0].value === 9;

  if (isFirstMove) {
    const nines = hand.filter(c => c.value === 9);
    if (options.specialNinesRule && nines.length === 4) {
      return { type: 'play', cards: nines };
    }
    if (options.specialNinesRule && nines.length >= 3) {
      return { type: 'play', cards: nines.slice(0, 3) };
    }
    if (nines.length >= 1) {
      return { type: 'play', cards: [nines[0]] };
    }
  }

  if (options.fourOfAKindRule) {
    const fourValue = hasFourOfSameValue(hand);
    if (fourValue !== null && fourValue >= topCard.value) {
      const fourCards = getCardsOfSameValue(hand, fourValue);
      return { type: 'play', cards: fourCards };
    }
  }

  const validCards = hand.filter(c => c.value >= topCard.value);
  if (validCards.length > 0) {
    validCards.sort((a, b) => a.value - b.value);
    return { type: 'play', cards: [validCards[0]] };
  }

  return { type: 'take', cards: [], takeType: 'take3' };
}

function getHardAIMove(
  state: GameState,
  playerId: number
): { type: 'play' | 'take' | 'endTurn'; cards: Card[]; takeType?: 'take3' | 'takeAll' } {
  const player = state.players.find(p => p.id === playerId)!;
  const hand = player.hand;
  const pile = state.pile;
  const options = state.options;
  const isFirstMove = pile.length === 1 && pile[0].suit === 'diamonds' && pile[0].value === 9;

  const possiblePlays = getPossiblePlays(hand, pile, options);
  const takeOpts = getTakeOptions(pile, options);

  let bestMove: { type: 'play' | 'take' | 'endTurn'; cards: Card[]; takeType?: 'take3' | 'takeAll' } | null = null;
  let bestScore = -Infinity;

  for (const playCards of possiblePlays) {
    const validation = validatePlay(playCards, pile, isFirstMove, options);
    if (validation.valid) {
      const score = evaluatePlayMove(playCards, hand, pile, state, playerId);

      if (validation.continueTurn && playCards.length === 4) {
        const remainingHand = hand.filter(c => !playCards.find(pc => pc.id === c.id));
        if (remainingHand.length > 0) {
          const nextPlays = getPossiblePlays(remainingHand, [...pile, ...playCards], options);
          if (nextPlays.length > 0) {
            const nextScore = evaluatePlayMove(nextPlays[0], remainingHand, pile, state, playerId);
            if (nextScore > 0) {
              const combinedScore = score + nextScore * 0.25;
              if (combinedScore > bestScore) {
                bestScore = combinedScore;
                bestMove = { type: 'play', cards: playCards };
              }
              continue;
            }
          }
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestMove = { type: 'play', cards: playCards };
      }
    }
  }

  const hasValidPlays = possiblePlays.length > 0;

  if (!hasValidPlays || takeOpts.canTakeAll) {
    const cardsToTake = pile.slice(-takeOpts.takeAllCount);
    const quadCheck = wouldCompleteQuad(hand, cardsToTake);

    if (quadCheck.wouldComplete) {
      const takeScore = evaluateTakeMove(takeOpts.takeAllCount, hand, pile, state, playerId);
      if (takeScore > bestScore) {
        bestScore = takeScore;
        bestMove = { type: 'take', cards: [], takeType: 'takeAll' };
      }
    }
  }

  if (!hasValidPlays && !bestMove) {
    if (takeOpts.canTakeAll) {
      const takeAllScore = evaluateTakeMove(takeOpts.takeAllCount, hand, pile, state, playerId);
      const take3Score = evaluateTakeMove(takeOpts.take3Count, hand, pile, state, playerId);

      if (takeAllScore > take3Score) {
        bestMove = { type: 'take', cards: [], takeType: 'takeAll' };
      } else {
        bestMove = { type: 'take', cards: [], takeType: 'take3' };
      }
    } else if (takeOpts.canTake3) {
      bestMove = { type: 'take', cards: [], takeType: 'take3' };
    }
  }

  if (!bestMove) {
    if (takeOpts.canTake3) {
      bestMove = { type: 'take', cards: [], takeType: 'take3' };
    } else {
      bestMove = { type: 'endTurn', cards: [] };
    }
  }

  return bestMove;
}

export function getContinueTurnMove(
  hand: Card[],
  pile: Card[],
  difficulty: AIDifficulty,
  options: GameOptions,
  state: GameState,
  playerId: number
): { type: 'play' | 'endTurn'; cards: Card[] } {
  if (difficulty === 'easy') {
    return { type: 'endTurn', cards: [] };
  }

  if (difficulty === 'hard') {
    const possiblePlays = getPossiblePlays(hand, pile, options);

    let bestPlay: Card[] | null = null;
    let bestScore = -Infinity;

    for (const playCards of possiblePlays) {
      const validation = validatePlay(playCards, pile, false, options);
      if (validation.valid) {
        const score = evaluatePlayMove(playCards, hand, pile, state, playerId);
        if (score > bestScore) {
          bestScore = score;
          bestPlay = playCards;
        }
      }
    }

    if (bestPlay && bestScore > 0) {
      return { type: 'play', cards: bestPlay };
    }
    return { type: 'endTurn', cards: [] };
  }

  const topCard = pile[pile.length - 1];
  const validCards = hand.filter(c => c.value >= topCard.value);
  if (validCards.length > 0) {
    validCards.sort((a, b) => a.value - b.value);
    return { type: 'play', cards: [validCards[0]] };
  }

  return { type: 'endTurn', cards: [] };
}

export function getAIDelay(): number {
  return 800 + Math.random() * 600;
}

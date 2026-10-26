import { Card, GameState, GameOptions, AIDifficulty, Player } from '../types/game';
import { getCardsOfSameValue, hasFourOfSameValue, sortHand } from './deckUtils';
import { getNextPlayerIndex, getTakeOptions, validatePlay, playCards, takeCards, endTurn } from './gameLogic';

export type AIMove = { type: 'play' | 'take' | 'endTurn'; cards: Card[]; takeType?: 'take3' | 'takeAll' };

// ============================================================
// AI logic — updated to guarantee AI never skips a turn.
// - AI must either PLAY or TAKE when an action is available.
// - If pile contains only 9♦ (no take possible), AI is forced to play.
// - Taking ends the turn immediately; once AI plays, taking is illegal.
// - Continuation phase only returns PLAY or END TURN when truly no options.
// ============================================================

// -----------------------------
// Score weights (tunable)
// -----------------------------
const SCORE_WEIGHTS = {
  THREE_OF_A_KIND_PENALTY: -30,
  TWO_OF_A_KIND_BONUS: 5,
  FOUR_OF_A_KIND_BONUS: 80,
  NINE_TRIPLE_BONUS: 40,
  NINE_QUAD_BONUS: 90,

  HIGH_CARD_PENALTY: -29,
  ACE_PENALTY: -36,
  FOUR_ACES_PENALTY: -500,
  PRESERVE_HIGH_CARDS_BONUS: 15,

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
  PLAY_LOW_CARDS_BONUS: 5,

  OPPONENT_CLOSE_TO_WIN_PENALTY: -100,
  BLOCKING_OPPONENT_BONUS: 50,
  LEADING_POSITION_BONUS: 30,

  UNCOVER_LOW_CARDS_BONUS: 30,
  OPPONENT_TAKES_BAD_PENALTY: -25,

  NINE_PLUS_ACE_TRAP_BONUS: 150,
  FOUR_OF_KIND_TRAP_BONUS: 100,
};

// -----------------------------
// Utilities & Analysis
// -----------------------------
function analyzePile(pile: Card[]) {
  if (pile.length <= 1) {
    return {
      topValue: pile[0]?.value || 0,
      hasLowCards: false,
      lowestCard: 14,
      averageValue: 0,
      cardValues: [] as number[],
    };
  }
  const values = pile.slice(1).map(c => c.value);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  return {
    topValue: pile[pile.length - 1].value,
    hasLowCards: values.some(v => v <= 10),
    lowestCard: Math.min(...values),
    averageValue: avg,
    cardValues: values,
  };
}

function wouldCompleteQuad(hand: Card[], cardsToTake: Card[]) {
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

function wouldGetHighCards(cardsToTake: Card[]) {
  return cardsToTake.some(c => c.value >= 13);
}

function wouldFixTriple(hand: Card[], cardsToTake: Card[]) {
  const valueCounts = new Map<number, number>();
  for (const card of hand) {
    valueCounts.set(card.value, (valueCounts.get(card.value) || 0) + 1);
  }
  for (const [value, count] of valueCounts) {
    if (count === 3) {
      const takingThisValue = cardsToTake.filter(c => c.value === value).length;
      if (takingThisValue === 1) return true;
    }
  }
  return false;
}

function countHighCards(hand: Card[]) {
  let jacks = 0, queens = 0, kings = 0, aces = 0;
  for (const card of hand) {
    if (card.value === 11) jacks++;
    else if (card.value === 12) queens++;
    else if (card.value === 13) kings++;
    else if (card.value === 14) aces++;
  }
  return { jacks, queens, kings, aces, total: jacks + queens + kings + aces };
}

function estimateOpponentStrength(state: GameState, playerId: number) {
  const opponents = state.players.filter(p => p.id !== playerId && !p.hasFinished);
  if (opponents.length === 0) {
    return {
      strongestOpponent: null,
      weakestOpponent: null,
      avgOpponentCards: 0,
      opponentCloseToWin: false,
      isOneVOne: false,
      humanOpponent: null,
    };
  }
  const sorted = [...opponents].sort((a, b) => a.hand.length - b.hand.length);
  const humanOpponent = opponents.find(p => !p.isAI) || null;
  return {
    strongestOpponent: sorted[0],
    weakestOpponent: sorted[sorted.length - 1],
    avgOpponentCards: opponents.reduce((sum, p) => sum + p.hand.length, 0) / opponents.length,
    opponentCloseToWin: opponents.some(p => p.hand.length <= 2),
    isOneVOne: opponents.length === 1,
    humanOpponent,
  };
}

interface OpponentCardTracker {
  knownHands: Map<number, Card[]>;
  unknownCounts: Map<number, number>;
  unknownValueCeilings: Map<number, number>;
}

function buildOpponentCardTracker(state: GameState, playerId: number): OpponentCardTracker {
  const counts = new Map<number, number>();
  for (let v = 9; v <= 14; v++) counts.set(v, 4);
  for (const card of state.pile) counts.set(card.value, (counts.get(card.value) || 0) - 1);
  const ownHand = state.players.find(p => p.id === playerId)?.hand ?? [];
  for (const card of ownHand) counts.set(card.value, (counts.get(card.value) || 0) - 1);

  // Reconstruct cards that opponents picked up from the public pile and have
  // not played again. Those cards are known to be in that player's hand.
  const knownByPlayer = new Map<number, Map<string, Card>>();
  const unknownValueCeilings = new Map<number, number>();
  const historicalPile: Card[] = [];
  for (const player of state.players) knownByPlayer.set(player.id, new Map());
  for (const move of state.moveHistory) {
    const knownHand = knownByPlayer.get(move.playerId);
    if (!knownHand) continue;
    if (move.type === 'take') {
      const previousTopValue = historicalPile[historicalPile.length - 1]?.value;
      if (move.playerId !== playerId && previousTopValue !== undefined) {
        const oldCeiling = unknownValueCeilings.get(move.playerId);
        unknownValueCeilings.set(move.playerId, oldCeiling === undefined ? previousTopValue : Math.min(oldCeiling, previousTopValue));
      }
      for (const card of move.cards) knownHand.set(card.id, card);
      historicalPile.splice(Math.max(0, historicalPile.length - move.cards.length), move.cards.length);
    } else {
      for (const card of move.cards) {
        const wasKnownFromPickup = knownHand.has(card.id);
        const ceiling = unknownValueCeilings.get(move.playerId);
        if (!wasKnownFromPickup && ceiling !== undefined && card.value >= ceiling) {
          // The observed play contradicts the old failed-response deduction;
          // the player may have picked up voluntarily, so discard that inference.
          unknownValueCeilings.delete(move.playerId);
        }
        knownHand.delete(card.id);
      }
      historicalPile.push(...move.cards);
    }
  }

  const knownHands = new Map<number, Card[]>();
  for (const [opponentId, cardsById] of knownByPlayer) {
    const knownCards = [...cardsById.values()];
    knownHands.set(opponentId, knownCards);
    if (opponentId === playerId) continue;
    for (const card of knownCards) counts.set(card.value, (counts.get(card.value) || 0) - 1);
  }

  return { knownHands, unknownCounts: counts, unknownValueCeilings };
}

function probabilityOpponentCanAnswer(tracker: OpponentCardTracker, state: GameState, opponentId: number, value: number) {
  const opponent = state.players.find(player => player.id === opponentId);
  if (!opponent || opponent.hasFinished) return 0;
  const knownCards = tracker.knownHands.get(opponentId) ?? [];
  if (knownCards.some(card => card.value >= value)) return 1;

  const unknownSlots = Math.max(0, opponent.hand.length - knownCards.length);
  const unknownCeiling = tracker.unknownValueCeilings.get(opponentId);
  // A pickup after a failed response tells us the player's pre-existing
  // hidden cards were below that pile top. Keep a little uncertainty because
  // human players may sometimes choose to pick up voluntarily.
  if (unknownCeiling !== undefined && value >= unknownCeiling) return unknownSlots > 0 ? 0.08 : 0;

  let total = 0, ge = 0;
  for (let v = 9; v <= 14; v++) {
    if (unknownCeiling !== undefined && v >= unknownCeiling) continue;
    const c = Math.max(0, tracker.unknownCounts.get(v) || 0);
    total += c;
    if (v >= value) ge += c;
  }
  if (total <= 0 || unknownSlots <= 0 || ge <= 0) return 0;
  const below = total - ge;
  if (unknownSlots > below) return 1;

  // Cards are sampled without replacement. In a two-player game the unknown
  // pool is exactly the other player's unknown hand, making this deduction exact.
  let probabilityNoAnswer = 1;
  for (let draw = 0; draw < unknownSlots; draw++) {
    probabilityNoAnswer *= (below - draw) / (total - draw);
  }
  return 1 - probabilityNoAnswer;
}

// -----------------------------
// Rule enforcement helpers
// -----------------------------
function returnTakeMove(takeType: 'take3' | 'takeAll') {
  return { type: 'take' as const, cards: [] as Card[], takeType };
}

/**
 * enforceNoSkipDecision
 * - Ensures AI never returns an illegal endTurn when actions exist.
 * - If pile has only 9♦ (pile.length === 1), taking is impossible; force a play from hand.
 * - Accepts optional playerHand to construct forced plays when necessary.
 */
function enforceNoSkipDecision(
  possiblePlays: Card[][],
  bestMove: { type: 'play' | 'take' | 'endTurn'; cards: Card[]; takeType?: 'take3' | 'takeAll' } | null,
  pile: Card[],
  options: GameOptions,
  playerHand?: Card[]
): AIMove {
  // If bestMove is a valid play, return it
  if (bestMove && bestMove.type === 'play' && bestMove.cards && bestMove.cards.length > 0) {
    return bestMove;
  }

  // Preserve the AI's chosen pickup size. Previously this helper silently
  // replaced every take-three decision with take-all whenever that option was on.
  if (bestMove?.type === 'take') return bestMove;

  // If any possible plays exist, return the first one
  if (possiblePlays && possiblePlays.length > 0) {
    return { type: 'play', cards: possiblePlays[0] };
  }

  // Special case: pile only contains 9♦ (pile length === 1)
  // Taking is impossible; AI must play if it has cards.
  if (pile.length === 1 && playerHand && playerHand.length > 0) {
    // 1) opening special nines
    const nines = playerHand.filter(c => c.value === 9);
    if (options.specialNinesRule && nines.length >= 3) return { type: 'play', cards: nines.slice(0, 3) };
    // 2) 4-of-a-kind
    const fourVal = hasFourOfSameValue(playerHand);
    if (fourVal !== null) {
      const fourCards = getCardsOfSameValue(playerHand, fourVal);
      if (fourCards.length === 4) return { type: 'play', cards: fourCards };
    }
    // 3) play lowest single (always legal because top is 9)
    const sorted = [...playerHand].sort((a, b) => a.value - b.value);
    return { type: 'play', cards: [sorted[0]] };
    // If bestMove is 'endTurn', replace with a play move
    // Inside the block
    if (bestMove && bestMove.type === 'endTurn') {
      if (possiblePlays && possiblePlays.length > 0) {
        return { type: 'play', cards: possiblePlays[0] };
      }
      // This fallback is for scenario where no moves available
      // Always play the lowest card in hand
      const sortedHand = [...playerHand].sort((a, b) => a.value - b.value);
      if (sortedHand.length > 0) {
        return { type: 'play', cards: [sortedHand[0]] };
      }
    }
  }
  
  // Prevent ending turn if only 9♦ on pile and no prior combo
  if (
    pile.length === 1 &&
    pile[0].value === 9 &&
    pile[0].suit === 'diamonds' &&
    bestMove?.type === 'endTurn'
  ) {
    // Force a play instead
    if (possiblePlays && possiblePlays.length > 0) {
      return { type: 'play', cards: possiblePlays[0] };
    }
    // fallback: play lowest card
    if (playerHand && playerHand.length > 0) {
      const sortedHand = [...playerHand].sort((a, b) => a.value - b.value);
      return { type: 'play', cards: [sortedHand[0]] };
    }
  }
  
  // Otherwise choose a take if allowed
  const takeOpts = getTakeOptions(pile, options);
  if (takeOpts.canTake3) return { type: 'take' as const, cards: [], takeType: 'take3' };
  if (takeOpts.canTakeAll) return { type: 'take' as const, cards: [], takeType: 'takeAll' };

  // fallback: if no other move, try to force a take
  if (playerHand && playerHand.length > 0) {
    return { type: 'play', cards: [playerHand[0]] };
  }
  return { type: 'play', cards: [] }; // default fallback
}

// -----------------------------
// Play generation & evaluation
// -----------------------------
function evaluateNineAceTrap(hand: Card[], pile: Card[], state: GameState, playerId: number) {
  const opponentInfo = estimateOpponentStrength(state, playerId);
  if (!opponentInfo.isOneVOne) return { canPlay: false, score: 0, cards: [] as Card[] };
  if (!(pile.length === 1 && pile[0].value === 9 && pile[0].suit === 'diamonds')) return { canPlay: false, score: 0, cards: [] as Card[] };
  const nines = hand.filter(c => c.value === 9);
  if (nines.length < 3) return { canPlay: false, score: 0, cards: [] as Card[] };
  const aces = hand.filter(c => c.value === 14);
  if (aces.length === 0) return { canPlay: false, score: 0, cards: [] as Card[] };
  const tens = hand.filter(c => c.value === 10);
  const jacks = hand.filter(c => c.value === 11);
  const queens = hand.filter(c => c.value === 12);
  const hasFourTens = tens.length === 4;
  const hasFourJacks = jacks.length === 4;
  const hasFourQueens = queens.length === 4;
  let trapBonus = SCORE_WEIGHTS.NINE_PLUS_ACE_TRAP_BONUS;
  if (hasFourTens || hasFourJacks || hasFourQueens) trapBonus += SCORE_WEIGHTS.FOUR_OF_KIND_TRAP_BONUS;
  const cards = [...nines.slice(0, 3), aces[0]];
  const remainingHand = hand.filter(c => !cards.some(pc => pc.id === c.id));
  const remainingHighCards = countHighCards(remainingHand);
  if (remainingHighCards.total >= 2) trapBonus += SCORE_WEIGHTS.PRESERVE_HIGH_CARDS_BONUS;
  return { canPlay: true, score: trapBonus, cards };
}

function evaluatePlayMove(cardsToPlay: Card[], hand: Card[], pile: Card[], state: GameState, playerId: number) {
  let score = 0;
  const remainingHand = hand.filter(c => !cardsToPlay.find(pc => pc.id === c.id));
  const pileAnalysis = analyzePile(pile);
  const opponentInfo = estimateOpponentStrength(state, playerId);

  if (remainingHand.length === 0) return SCORE_WEIGHTS.WINNING_MOVE_BONUS;
  if (remainingHand.length <= 3) score += SCORE_WEIGHTS.CAN_FINISH_SOON_BONUS * (4 - remainingHand.length) / 3;
  score += evaluateHandComposition(remainingHand);

  const playValue = cardsToPlay[0].value;

  if (playValue >= 11) {
    const highCardCount = cardsToPlay.length;
    score += SCORE_WEIGHTS.HIGH_CARD_PENALTY * highCardCount;
    if (playValue === 14) score += SCORE_WEIGHTS.ACE_PENALTY * highCardCount;
    if (cardsToPlay.length === 4 && playValue === 14) {
      const aceDecision = shouldPlayFourAces(hand, pile, state, playerId);
      if (!aceDecision.shouldPlay) score += SCORE_WEIGHTS.FOUR_ACES_PENALTY;
    }
  }

  const remainingHighCards = countHighCards(remainingHand);
  if (remainingHighCards.total >= 2) score += SCORE_WEIGHTS.PRESERVE_HIGH_CARDS_BONUS;
  if (playValue <= 10) score += SCORE_WEIGHTS.PLAY_LOW_CARDS_BONUS;

  if (cardsToPlay.length === 1 && playValue >= 11) {
    score += evaluateForceOpponentTake(cardsToPlay[0], hand, pile, state, playerId);
  }

  if (cardsToPlay.length === 4) {
    if (playValue === 14) {
      const aceDecision = shouldPlayFourAces(hand, pile, state, playerId);
      if (aceDecision.shouldPlay) score += SCORE_WEIGHTS.FOUR_OF_A_KIND_BONUS;
    } else {
      score += SCORE_WEIGHTS.FOUR_OF_A_KIND_BONUS;
      const fourOfKindValue = hasFourOfSameValue(remainingHand);
      if (fourOfKindValue !== null && fourOfKindValue !== 14) score += SCORE_WEIGHTS.FOUR_OF_A_KIND_BONUS * 0.4;
    }
  }

  if (cardsToPlay.length === 3 && cardsToPlay.every(c => c.value === 9)) score += SCORE_WEIGHTS.NINE_TRIPLE_BONUS;

  const myCardCount = remainingHand.length;
  if (myCardCount < opponentInfo.avgOpponentCards) score += SCORE_WEIGHTS.LEADING_POSITION_BONUS;

  if (opponentInfo.opponentCloseToWin) {
    score += SCORE_WEIGHTS.OPPONENT_CLOSE_TO_WIN_PENALTY;
    if (playValue >= 12) score += SCORE_WEIGHTS.BLOCKING_OPPONENT_BONUS;
  }

  return score;
}

function evaluateHandComposition(hand: Card[]) {
  let score = 0;
  const valueCounts = new Map<number, number>();
  for (const card of hand) valueCounts.set(card.value, (valueCounts.get(card.value) || 0) + 1);
  for (const [value, count] of valueCounts) {
    if (count === 4) {
      score += SCORE_WEIGHTS.FOUR_OF_A_KIND_BONUS;
      if (value === 9) score += SCORE_WEIGHTS.NINE_QUAD_BONUS;
    } else if (count === 3) {
      if (value === 9) score += SCORE_WEIGHTS.NINE_TRIPLE_BONUS;
      else score += SCORE_WEIGHTS.THREE_OF_A_KIND_PENALTY;
    } else if (count === 2) {
      score += SCORE_WEIGHTS.TWO_OF_A_KIND_BONUS;
    }
  }
  score += hand.length * SCORE_WEIGHTS.CARDS_REMAINING_PENALTY;
  return score;
}

function evaluateForceOpponentTake(cardToPlay: Card, hand: Card[], pile: Card[], state: GameState, playerId: number) {
  let bonus = 0;
  const pileAnalysis = analyzePile(pile);
  const opponentInfo = estimateOpponentStrength(state, playerId);
  if (cardToPlay.value >= 13) {
    if (opponentInfo.strongestOpponent && opponentInfo.strongestOpponent.hand.length <= 4) bonus += SCORE_WEIGHTS.FORCE_OPPONENT_TAKE_BONUS;
    if (pileAnalysis.hasLowCards) bonus += SCORE_WEIGHTS.UNCOVER_LOW_CARDS_BONUS;
  }
  if (cardToPlay.value >= 11 && cardToPlay.value <= 12) {
    if (opponentInfo.opponentCloseToWin) bonus += SCORE_WEIGHTS.PLAYING_HIGH_TO_BLOCK;
  }
  return bonus;
}

function shouldPlayFourAces(hand: Card[], pile: Card[], state: GameState, playerId: number) {
  const aces = hand.filter(c => c.value === 14);
  if (aces.length !== 4) return { shouldPlay: false, reason: "Don't have 4 Aces" };
  const topCard = pile[pile.length - 1];
  if (topCard && topCard.value > 14) return { shouldPlay: false, reason: "Can't play Aces on higher card" };
  const opponentInfo = estimateOpponentStrength(state, playerId);
  if (hand.length === 4) return { shouldPlay: true, reason: "Last 4 cards - winning move!" };
  if (opponentInfo.opponentCloseToWin && hand.length <= 6) return { shouldPlay: true, reason: "Blocking opponent win attempt" };
  if (opponentInfo.isOneVOne) {
    const remainingHand = hand.filter(c => c.value !== 14);
    const fourOfKindValue = hasFourOfSameValue(remainingHand);
    if (fourOfKindValue !== null) return { shouldPlay: true, reason: "Can follow up with another 4-of-a-kind" };
  }
  return { shouldPlay: false, reason: "Preserving Aces for critical moment" };
}

// -----------------------------
// Possible plays generator (limited set)
// -----------------------------
function getPossiblePlays(hand: Card[], pile: Card[], options: GameOptions): Card[][] {
  const plays: Card[][] = [];
  const topCard = pile[pile.length - 1];
  const isFirstMove = pile.length === 1 && topCard.suit === 'diamonds' && topCard.value === 9;
  const cardsByValue = new Map<number, Card[]>();
  for (const card of hand) {
    if (!cardsByValue.has(card.value)) cardsByValue.set(card.value, []);
    cardsByValue.get(card.value)!.push(card);
  }

  if (isFirstMove) {
    // The 9 of diamonds is already on the pile when the first player acts.
    // They may play any legal card, including the optional other nines.
    const nines = cardsByValue.get(9) || [];
    if (nines.length >= 1) plays.push([nines[0]]);
    if (options.specialNinesRule && nines.length >= 3) plays.push(nines.slice(0, 3));
    for (const [value, cards] of cardsByValue) {
      if (value >= topCard.value) plays.push([cards[0]]);
      if (options.fourOfAKindRule && value >= topCard.value && cards.length === 4) plays.push(cards);
    }
    return plays;
  }

  for (const [value, cards] of cardsByValue) {
    const canPlayOnTop = value >= topCard.value;
    if (canPlayOnTop) {
      plays.push([cards[0]]);
      if (cards.length >= 2) plays.push(cards.slice(0, 2));
      if (cards.length >= 3) plays.push(cards.slice(0, 3));
      if (cards.length === 4) plays.push(cards);
    }
  }
  return plays;
}

function isUnnecessaryAceOnOpening(cardsToPlay: Card[], hand: Card[], pile: Card[]) {
  const isOpeningPile = pile.length === 1 && pile[0].value === 9 && pile[0].suit === 'diamonds';
  if (!isOpeningPile || !cardsToPlay.some(card => card.value === 14)) return false;

  const remainingHand = hand.filter(card => !cardsToPlay.some(played => played.id === card.id));
  // Keep a winning play, but save the Ace when any lower card can open instead.
  if (remainingHand.length === 0) return false;
  return remainingHand.some(card => card.value < 14);
}

function shouldUseFourOfAKind(cardsToPlay: Card[], hand: Card[], state: GameState, playerId: number): boolean {
  if (cardsToPlay.length !== 4) return true;
  const value = cardsToPlay[0].value;
  const remainingHand = hand.filter(card => !cardsToPlay.some(played => played.id === card.id));

  // Save the quad if any lower card remains. Spending it is justified when
  // this removes the lowest cards still in hand, including a winning play.
  if (remainingHand.every(card => card.value >= value)) return true;

  const currentIndex = state.players.findIndex(player => player.id === playerId);
  const nextIndex = getNextPlayerIndex(currentIndex, state.players);
  const nextPlayer = state.players[nextIndex];
  if (!nextPlayer || nextPlayer.hasFinished || nextPlayer.hand.length > 2) return false;

  // A higher pile top can strand a near-winning opponent with only low cards.
  const tracker = buildOpponentCardTracker(state, playerId);
  return probabilityOpponentCanAnswer(tracker, state, nextPlayer.id, value) < 0.5;
}

export function getAIMoveCandidates(state: GameState, playerId: number, continuingTurn = state.canContinueTurn): AIMove[] {
  const player = state.players.find(candidate => candidate.id === playerId);
  if (!player || player.hasFinished) return [];

  const isFirstMove = state.pile.length === 1 && state.pile[0].value === 9 && state.pile[0].suit === 'diamonds';
  const possiblePlays = getPossiblePlays(player.hand, state.pile, state.options)
    .filter(cards => (cards.length !== 4 || state.options.fourOfAKindRule) &&
      validatePlay(cards, state.pile, isFirstMove, state.options).valid);
  const candidates: AIMove[] = possiblePlays.map(cards => ({ type: 'play', cards }));

  if (continuingTurn) {
    candidates.push({ type: 'endTurn', cards: [] });
  } else {
    const takeOptions = getTakeOptions(state.pile, state.options);
    if (takeOptions.canTake3) candidates.push({ type: 'take', cards: [], takeType: 'take3' });
    if (takeOptions.canTakeAll) candidates.push({ type: 'take', cards: [], takeType: 'takeAll' });
  }

  const seen = new Set<string>();
  return candidates.filter(candidate => {
    const key = candidate.type === 'play'
      ? `play:${candidate.cards.map(card => card.id).sort().join(',')}`
      : `${candidate.type}:${candidate.takeType ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// -----------------------------
// Candidate generation (small set) for Hard AI
// -----------------------------
function generateCandidates(state: GameState, playerId: number) {
  const player = state.players.find(p => p.id === playerId)!;
  const hand = player.hand;
  const pile = state.pile;
  const options = state.options;
  const topCard = pile[pile.length - 1];
  const isFirstMove = pile.length === 1 && topCard.value === 9 && topCard.suit === 'diamonds';

  const candidates: any[] = [];
  const legalSingles = hand.filter(c => c.value >= topCard.value);
  for (const card of legalSingles) candidates.push({ type: 'play', cards: [card] });

  const byVal = new Map<number, Card[]>();
  for (const c of hand) {
    if (!byVal.has(c.value)) byVal.set(c.value, []);
    byVal.get(c.value)!.push(c);
  }
  for (const [val, cards] of byVal) {
    if (val < topCard.value) continue;
    if (cards.length === 4 && options.fourOfAKindRule) candidates.push({ type: 'play', cards: cards.slice() });
  }

  if (isFirstMove) {
    const nines = (byVal.get(9) || []);
    if (options.specialNinesRule && nines.length >= 3) candidates.push({ type: 'play', cards: nines.slice(0, 3) });
    if (nines.length >= 1) candidates.push({ type: 'play', cards: [nines[0]] });
  }

  // The player may choose a pickup when a legal play exists.
  const takeOpts = getTakeOptions(pile, options);
  if (takeOpts.canTake3) candidates.push({ type: 'take', takeType: 'take3', cards: [] });
  if (takeOpts.canTakeAll) candidates.push({ type: 'take', takeType: 'takeAll', cards: [] });

  // Deduplicate
  const sigs = new Set<string>();
  const uniq: any[] = [];
  for (const c of candidates) {
    const sig = c.type === 'take' ? `take-${c.takeType}` : `play-${c.cards.map((x: Card) => x.id).join(',')}`;
    if (!sigs.has(sig)) { sigs.add(sig); uniq.push(c); }
  }
  return uniq.filter(candidate =>
    candidate.type === 'take' || validatePlay(candidate.cards, pile, isFirstMove, options).valid
  );
}

// -----------------------------
// Candidate evaluation (Hard AI)
// -----------------------------
function evaluateCandidate(state: GameState, playerId: number, candidate: any) {
  const player = state.players.find(p => p.id === playerId)!;
  const hand = player.hand;
  const pile = state.pile;
  const topValue = pile[pile.length - 1].value;
  const tracker = buildOpponentCardTracker(state, playerId);
  const opponentInfo = estimateOpponentStrength(state, playerId);

  const deltaHand = candidate.type === 'play' ? candidate.cards.length : 0;
  let score = 0;

  if (candidate.type === 'take') {
    const takeOptions = getTakeOptions(pile, state.options);
    const takeCount = candidate.takeType === 'takeAll' ? takeOptions.takeAllCount : takeOptions.take3Count;
    const cardsToTake = pile.slice(-takeCount);
    // Taking adds cards, but can be useful when it improves hand structure or
    // creates a four of a kind that can be shed on a later turn.
    score -= takeCount * 18;
    score += (evaluateHandComposition([...hand, ...cardsToTake]) - evaluateHandComposition(hand)) * 1.1;
    const handCounts = new Map<number, number>();
    for (const card of hand) handCounts.set(card.value, (handCounts.get(card.value) ?? 0) + 1);
    for (const card of cardsToTake) {
      if (card.value >= topValue && (handCounts.get(card.value) ?? 0) === 3) {
        score += 120;
        handCounts.set(card.value, 4);
      } else if (card.value >= topValue) {
        score += 4;
      }
    }
    // Human evaluations repeatedly preferred taking cards over spending a
    // King or Ace when those were the only cards that could answer the pile.
    // Preserve those top answers when there is still a multi-card hand to play.
    const legalAnswers = hand.filter(card => card.value >= topValue);
    if (hand.length > 1 && legalAnswers.length > 0 && legalAnswers.every(card => card.value >= 13)) {
      score += 55;
      score += Math.min(15, Math.max(0, legalAnswers.length - 1) * 5);
      if (candidate.takeType === 'takeAll' && takeCount >= 8) score += 20;
    }
    if (opponentInfo.opponentCloseToWin && cardsToTake.some(card => card.value >= topValue)) score += 12;
    return score;
  }

  // Getting rid of cards matters, but keeping flexible high cards matters too.
  score += 18 * deltaHand;

  const myCards = hand.length;
  const endgame = myCards <= 4 || opponentInfo.opponentCloseToWin;
  if (endgame) score += 20;

  if (candidate.type === 'play') {
    if (candidate.cards.length === hand.length) score += SCORE_WEIGHTS.WINNING_MOVE_BONUS;
    for (const c of candidate.cards) {
      // A higher card is more flexible later, so its cost rises with rank.
      const preservationCost = Math.pow(c.value - 9, 1.35) * 4;
      score -= preservationCost + (c.value === 14 ? 12 : c.value === 13 ? 6 : 0);
    }
    // Prefer the lowest card that still makes the next player spend a higher
    // card or pick up. This avoids wasting an Ace when a King does the job.
    const playedValue = candidate.cards[0].value;
    // Human demonstrations often spend one of a triple of tens on a nine,
    // keeping the pair while making the next answer harder than a nine.
    if (candidate.cards.length === 1 && topValue === 9 && playedValue === 10) {
      const tensInHand = hand.filter(card => card.value === 10).length;
      if (tensInHand >= 3) score += 20;
      else if (tensInHand === 2) score += 10;
    }
    const nextIdx = getNextPlayerIndex(state.players.findIndex(p => p.id === playerId), state.players);
    const nextPlayer = state.players[nextIdx];
    if (nextPlayer && !nextPlayer.hasFinished) {
      const nextHandSize = nextPlayer.hand.length;
      const forceProbability = 1 - probabilityOpponentCanAnswer(tracker, state, nextPlayer.id, playedValue);
      if (nextHandSize <= 1) score += 55 * forceProbability;
      else if (nextHandSize <= 2) score += 35 * forceProbability;
      else if (nextHandSize <= 3) score += 25 * forceProbability;
      else score += 18 * forceProbability;
      // Hard leans more strongly on tracked unseen cards when the next player
      // is close to finishing; an unanswered high play can force a pickup.
      if (nextHandSize <= 2) {
        score += (nextHandSize === 1 ? 160 : 100) * forceProbability;
      }
      // Retaining multiple high cards gives options on later turns.
      score += Math.min(3, hand.filter(c => c.value >= 12).length) * (playedValue >= 13 ? 4 : 0);
    }
  }

  if (candidate.type === 'play' && candidate.cards.length === 4) {
    // A quad is valuable only after the shared safety gate allows it: there
    // are no lower cards left, or it can block a near-winning opponent.
    score += 150;
    if (candidate.cards[0].value === 14) score += 10;
  }

  const nextIdx = getNextPlayerIndex(state.players.findIndex(p => p.id === playerId), state.players);
  const nextPlayer = state.players[nextIdx];
  const newTop = candidate.type === 'play' ? candidate.cards[candidate.cards.length - 1].value : pile[pile.length - 1].value;
  const probNextCanPlay = nextPlayer
    ? probabilityOpponentCanAnswer(tracker, state, nextPlayer.id, newTop)
    : 0;
  const forceProb = 1 - probNextCanPlay;
  // Reward plays that public-card tracking predicts will make the next player
  // spend a higher card or pick up, including before their endgame.
  score += 45 * forceProb;

  if (opponentInfo.opponentCloseToWin) {
    if (candidate.type === 'play' && candidate.cards.some((c: Card) => c.value >= 12)) score += 25;
    if (candidate.type === 'take') score += 15;
  }

  const remainingAfter = candidate.type === 'play' ? hand.filter(h => !candidate.cards.find((c: Card) => c.id === h.id)) : hand;
  const remCounts = new Map<number, number>();
  for (const c of remainingAfter) remCounts.set(c.value, (remCounts.get(c.value) || 0) + 1);
  for (const [v, cnt] of remCounts) {
    if (cnt === 3 && v !== 14) score += 20;
    if (cnt >= 2 && v >= 11) score += 6;
  }

  const trap = evaluateNineAceTrap(hand, pile, state, playerId);
  if (trap.canPlay && candidate.type === 'play' && candidate.cards.length === 4 && candidate.cards.every((c: Card) => c.value === 9 || c.value === 14)) {
    score += trap.score;
  }

  const enableProb = nextPlayer
    ? probabilityOpponentCanAnswer(tracker, state, nextPlayer.id, newTop + 1)
    : 0;
  score -= 8 * enableProb;

  return score;
}

// -----------------------------
// Fast simulator helpers for rollouts
// -----------------------------
function sampleHiddenHands(state: GameState, playerId: number): GameState {
  const sampled = JSON.parse(JSON.stringify(state)) as GameState;
  const tracker = buildOpponentCardTracker(state, playerId);
  const unknownCounts = new Map(tracker.unknownCounts);
  const unseenPlayers = sampled.players
    .filter(player => player.id !== playerId && !player.hasFinished)
    .sort(() => Math.random() - 0.5);

  for (const opponent of unseenPlayers) {
    const knownCards = tracker.knownHands.get(opponent.id) ?? [];
    const slotsToSample = Math.max(0, opponent.hand.length - knownCards.length);
    const sampledCards: Card[] = [];
    const ceiling = tracker.unknownValueCeilings.get(opponent.id);
    for (let slot = 0; slot < slotsToSample; slot++) {
      let possibleValues = [...unknownCounts.entries()]
        .filter(([value, count]) => count > 0 && (ceiling === undefined || value < ceiling));
      if (possibleValues.length === 0) {
        possibleValues = [...unknownCounts.entries()].filter(([, count]) => count > 0);
      }
      const total = possibleValues.reduce((sum, [, count]) => sum + count, 0);
      if (total <= 0) break;
      let pick = Math.floor(Math.random() * total);
      let value = possibleValues[0][0];
      for (const [candidateValue, count] of possibleValues) {
        if (pick < count) { value = candidateValue; break; }
        pick -= count;
      }
      unknownCounts.set(value, (unknownCounts.get(value) ?? 0) - 1);
      sampledCards.push({
        id: `rollout-${opponent.id}-${slot}-${Math.random().toString(36).slice(2, 8)}`,
        value: value as Card['value'],
        suit: 'spades',
        faceUp: false,
      });
    }
    opponent.hand = sortHand([...knownCards.map(card => ({ ...card })), ...sampledCards]);
  }
  return sampled;
}

function chooseRolloutMove(state: GameState, playerId: number): AIMove {
  const player = state.players[playerId];
  if (!player || player.hasFinished || player.hand.length === 0) return { type: 'endTurn', cards: [] };
  const isFirstMove = state.pile.length === 1 && state.pile[0].value === 9 && state.pile[0].suit === 'diamonds';
  const plays = getPossiblePlays(player.hand, state.pile, state.options)
    .filter(cards => validatePlay(cards, state.pile, isFirstMove, state.options).valid);

  if (state.canContinueTurn && plays.length === 0) return { type: 'endTurn', cards: [] };
  if (plays.length === 0) {
    const takeOptions = getTakeOptions(state.pile, state.options);
    if (takeOptions.canTake3) return { type: 'take', cards: [], takeType: 'take3' };
    if (takeOptions.canTakeAll) return { type: 'take', cards: [], takeType: 'takeAll' };
    const lowest = [...player.hand].sort((a, b) => a.value - b.value)[0];
    return lowest ? { type: 'play', cards: [lowest] } : { type: 'endTurn', cards: [] };
  }

  const quad = plays.find(cards => cards.length === 4 && shouldUseFourOfAKind(cards, player.hand, state, playerId));
  if (quad) return { type: 'play', cards: quad };
  const specialNines = plays.find(cards => cards.length === 3 && cards.every(card => card.value === 9));
  if (isFirstMove && specialNines) return { type: 'play', cards: specialNines };
  const single = plays.filter(cards => cards.length === 1).sort((a, b) => a[0].value - b[0].value)[0];
  return single ? { type: 'play', cards: single } : { type: 'endTurn', cards: [] };
}

function simulateFastPlayout(sim: GameState, aiPlayerId: number, maxSteps = 80): number | null {
  let steps = 0;
  const visited = new Set<string>();
  while (sim.phase === 'playing' && steps < maxSteps) {
    const position = `${sim.currentPlayerIndex}|${sim.canContinueTurn ? 1 : 0}|${sim.pile.map(card => card.id).join(',')}|${sim.players.map(player => player.hand.map(card => card.id).sort().join(',')).join('|')}`;
    if (visited.has(position)) break;
    visited.add(position);

    const player = sim.players[sim.currentPlayerIndex];
    if (!player || player.hasFinished || player.hand.length === 0) {
      sim = endTurn(sim);
      steps++;
      continue;
    }
    const move = chooseRolloutMove(sim, player.id);
    if (move.type === 'play' && move.cards.length > 0) {
      const isFirstMove = sim.pile.length === 1 && sim.pile[0].value === 9 && sim.pile[0].suit === 'diamonds';
      const validation = validatePlay(move.cards, sim.pile, isFirstMove, sim.options);
      sim = validation.valid ? playCards(sim, player.id, move.cards, Boolean(validation.continueTurn)) : endTurn(sim);
    } else if (move.type === 'take') {
      const takeOptions = getTakeOptions(sim.pile, sim.options);
      const count = move.takeType === 'takeAll' ? takeOptions.takeAllCount : takeOptions.take3Count;
      sim = count > 0 ? takeCards(sim, player.id, count) : endTurn(sim);
    } else {
      sim = endTurn(sim);
    }
    steps++;
  }
  if (sim.phase === 'finished') return sim.finishOrder[0]?.id ?? null;

  const player = sim.players[aiPlayerId];
  const opponents = sim.players.filter(candidate => candidate.id !== aiPlayerId && !candidate.hasFinished);
  if (!player || opponents.length === 0) return aiPlayerId;
  const bestOpponentHand = Math.min(...opponents.map(opponent => opponent.hand.length));
  if (player.hand.length < bestOpponentHand) return aiPlayerId;
  if (player.hand.length > bestOpponentHand) return opponents.find(opponent => opponent.hand.length === bestOpponentHand)?.id ?? null;
  return null;
}

function monteCarloEstimate(state: GameState, playerId: number, candidate: any, playouts = 8): number {
  let result = 0;
  for (let i = 0; i < playouts; i++) {
    let sim = sampleHiddenHands(state, playerId);
    if (candidate.type === 'play') {
      const isFirstMove = sim.pile.length === 1 && sim.pile[0].value === 9 && sim.pile[0].suit === 'diamonds';
      const validation = validatePlay(candidate.cards, sim.pile, isFirstMove, sim.options);
      if (!validation.valid) continue;
      sim = playCards(sim, playerId, candidate.cards, Boolean(validation.continueTurn));
    } else if (candidate.type === 'take') {
      const takeOptions = getTakeOptions(sim.pile, sim.options);
      const count = candidate.takeType === 'takeAll' ? takeOptions.takeAllCount : takeOptions.take3Count;
      if (count <= 0) continue;
      sim = takeCards(sim, playerId, count);
    } else {
      continue;
    }
    const winner = simulateFastPlayout(sim, playerId);
    if (winner === playerId) result += 1;
    else if (winner === null) result += 0.5;
  }
  return result / playouts;
}

// -----------------------------
// Hard AI
// -----------------------------
function isHighImpactCandidate(candidate: any, handSize: number) {
  if (candidate.type === 'play' && candidate.cards.length === 4) return true;
  if (candidate.type === 'play' && candidate.cards.length === handSize) return true;
  return false;
}

function getHardAIMove(state: GameState, playerId: number): AIMove {
  const player = state.players.find(p => p.id === playerId)!;
  const hand = player.hand;
  const pile = state.pile;
  const options = state.options;

  const candidates = generateCandidates(state, playerId);
  if (!candidates || candidates.length === 0) {
    const takeOpts = getTakeOptions(pile, options);
    if (takeOpts.canTake3) return returnTakeMove('take3');
    if (takeOpts.canTakeAll) return returnTakeMove('takeAll');
    // No candidates and no take options -> force a play (pile may be only 9♦)
    const fallback = enforceNoSkipDecision([], null, pile, options, hand);
    if (fallback.type === 'take') return returnTakeMove(fallback.takeType === 'takeAll' ? 'takeAll' : 'take3');
    return fallback;
  }

  const preferredCandidates = candidates.filter(candidate =>
    candidate.type !== 'play' || (
      !isUnnecessaryAceOnOpening(candidate.cards, hand, pile) &&
      shouldUseFourOfAKind(candidate.cards, hand, state, playerId)
    )
  );
  const candidatesToScore = preferredCandidates.length > 0 ? preferredCandidates : candidates;
  const scored = candidatesToScore.map(c => {
    let strategicScore: number;
    if (c.type === 'play') {
      strategicScore = evaluatePlayMove(c.cards, hand, pile, state, playerId);
      const validation = validatePlay(c.cards, pile, pile.length === 1 && pile[0].value === 9 && pile[0].suit === 'diamonds', options);
      if (validation.valid && validation.continueTurn && c.cards.length === 4) {
        const remainingHand = hand.filter(card => !c.cards.some(played => played.id === card.id));
        const nextPile = [...pile, ...c.cards];
        const nextPlays = getPossiblePlays(remainingHand, nextPile, options)
          .filter(play => validatePlay(play, nextPile, false, options).valid);
        if (nextPlays.length > 0) {
          const bestFollowUp = Math.max(...nextPlays.map(play => evaluatePlayMove(play, remainingHand, nextPile, state, playerId)));
          if (bestFollowUp > 0) strategicScore += bestFollowUp * 0.25;
        }
      }
    } else {
      const takeOptions = getTakeOptions(pile, options);
      const takeCount = c.takeType === 'takeAll' ? takeOptions.takeAllCount : takeOptions.take3Count;
      strategicScore = evaluateTakeMove(takeCount, hand, pile, state, playerId);
    }

    // Blend heuristic scoring with imperfect-information rollouts. Each rollout
    // samples opponent hands from public card counts rather than reading them.
    const rolloutAdjustment = (monteCarloEstimate(state, playerId, c, 4) - 0.5) * 90;
    return { c, score: strategicScore + evaluateCandidate(state, playerId, c) + rolloutAdjustment };
  });
  scored.sort((a, b) => b.score - a.score);

  const bestMove = scored[0].c;

  // Keep the decision based on public information. The previous rollout used
  // the real opponent hands, which gave the AI information a human player
  // cannot have and made its estimates unreliable for actual play.

// 
const possiblePlays = getPossiblePlays(player.hand, pile, options);
const safeDecision = enforceNoSkipDecision(possiblePlays, bestMove, pile, options, player.hand);

if (safeDecision.type === 'take') return returnTakeMove(safeDecision.takeType === 'takeAll' ? 'takeAll' : 'take3');
return safeDecision;

}

// -----------------------------
// Medium AI (previous hard logic moved here)
// -----------------------------
function getMediumAIMove(state: GameState, playerId: number): AIMove {
  const player = state.players.find(p => p.id === playerId)!;
  const hand = player.hand;
  const pile = state.pile;
  const options = state.options;
  const topCard = pile[pile.length - 1];
  const isFirstMove = pile.length === 1 && pile[0].suit === 'diamonds' && pile[0].value === 9;

  const opponentInfo = estimateOpponentStrength(state, playerId);

  const possiblePlays = getPossiblePlays(hand, pile, options);
  const takeOpts = getTakeOptions(pile, options);

  let bestMove: any = null;
  let bestScore = -Infinity;

  for (const playCards of possiblePlays) {
    if (isUnnecessaryAceOnOpening(playCards, hand, pile)) continue;
    if (!shouldUseFourOfAKind(playCards, hand, state, playerId)) continue;
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

  // Picking up is a strategic choice even when a legal play exists. Compare
  // both available pickup sizes against the best legal play.
  if (takeOpts.canTake3) {
    const take3Score = evaluateTakeMove(takeOpts.take3Count, hand, pile, state, playerId);
    if (take3Score > bestScore) {
      bestScore = take3Score;
      bestMove = { type: 'take', cards: [], takeType: 'take3' };
    }
  }
  if (takeOpts.canTakeAll) {
    const takeAllScore = evaluateTakeMove(takeOpts.takeAllCount, hand, pile, state, playerId);
    if (takeAllScore > bestScore) {
      bestScore = takeAllScore;
      bestMove = { type: 'take', cards: [], takeType: 'takeAll' };
    }
  }

  if (!bestMove) {
    if (takeOpts.canTake3) bestMove = { type: 'take', cards: [], takeType: 'take3' };
    bestMove = hand.length > 0 ? { type: 'play', cards: [hand[0]] } : { type: 'endTurn', cards: [] };
  }

  const safeDecision = enforceNoSkipDecision(possiblePlays, bestMove, pile, options, hand);
  if (safeDecision.type === 'take') return returnTakeMove(safeDecision.takeType === 'takeAll' ? 'takeAll' : 'take3');
  return safeDecision;
}

function evaluateTakeMove(takeCount: number, hand: Card[], pile: Card[], state: GameState, playerId: number) {
  let score = SCORE_WEIGHTS.TAKING_CARDS_BASE_PENALTY - takeCount * 12;
  const cardsToTake = pile.slice(-takeCount);
  const opponentInfo = estimateOpponentStrength(state, playerId);
  const quadCheck = wouldCompleteQuad(hand, cardsToTake);
  if (quadCheck.wouldComplete) score += SCORE_WEIGHTS.TAKING_COMPLETES_QUAD_BONUS;
  if (wouldFixTriple(hand, cardsToTake)) score += SCORE_WEIGHTS.TAKING_USEFUL_CARDS_BONUS;
  if (wouldGetHighCards(cardsToTake)) score += SCORE_WEIGHTS.TAKING_HIGH_CARDS_BONUS;
  const myCardCount = hand.length;
  if (myCardCount < opponentInfo.avgOpponentCards - 2) score += SCORE_WEIGHTS.TAKING_WHEN_LEADING_PENALTY;
  if (opponentInfo.opponentCloseToWin) {
    if (quadCheck.wouldComplete) score += 30;
  }
  const currentHandScore = evaluateHandComposition(hand);
  const newHandScore = evaluateHandComposition([...hand, ...cardsToTake]);
  const handChange = newHandScore - currentHandScore;
  score += handChange * 0.75;
  return score;
}

// -----------------------------
// Main AI entrypoint
// -----------------------------
export function getAIMove(state: GameState, playerId: number): AIMove {
  const player = state.players.find(p => p.id === playerId);
  if (!player) return { type: 'endTurn', cards: [] };

  const options = state.options;
  const difficulty = options.aiDifficulty;

  const isSpecialNineOpening = state.pile.length === 1 &&
    state.pile[0].value === 9 &&
    state.pile[0].suit === 'diamonds';
  if (options.specialNinesRule && isSpecialNineOpening) {
    const remainingNines = player.hand.filter(card => card.value === 9);
    if (remainingNines.length === 3) {
      return { type: 'play', cards: remainingNines };
    }
  }

  if (difficulty === 'easy') return getEasyAIMove(player.hand, state.pile, options);
  if (difficulty === 'medium') return getMediumAIMove(state, playerId);

  const move = getHardAIMove(state, playerId);

  // Check for the specific scenario with only 9♦ on pile
  if (
    move.type === 'endTurn' &&
    state.pile.length === 1
  ) {
    // Always play lowest card instead of ending turn
    const sortedHand = [...player.hand].sort((a, b) => a.value - b.value);
    return { type: 'play', cards: [sortedHand[0]] };
  }

  // Otherwise, follow the normal move
  if (move.type === 'endTurn') {
    // Already handled above, but just a fallback
    const possiblePlays = getPossiblePlays(player.hand, state.pile, options);
    const fallback = enforceNoSkipDecision(
      possiblePlays,
      null,
      state.pile,
      options,
      player.hand
    );
    if (fallback.type === 'take') return returnTakeMove(fallback.takeType === 'takeAll' ? 'takeAll' : 'take3');
    return fallback;
  } else {
    return move;
  }
}

// -----------------------------
// Easy AI
// -----------------------------
function getEasyAIMove(hand: Card[], pile: Card[], options: GameOptions): AIMove {
  const topCard = pile[pile.length - 1];
  const isFirstMove = pile.length === 1 && pile[0].suit === 'diamonds' && pile[0].value === 9;
  if (isFirstMove) {
    const nines = hand.filter(c => c.value === 9);
    if (options.specialNinesRule && nines.length >= 3) return { type: 'play', cards: nines.slice(0, 3) };
    if (nines.length >= 1) return { type: 'play', cards: [nines[0]] };
  }
  const takeOpts = getTakeOptions(pile, options);
  if (takeOpts.canTake3 && Math.random() < 0.2) {
    return { type: 'take', cards: [], takeType: 'take3' };
  }
  const validCards = hand.filter(c => c.value >= topCard.value);
  if (validCards.length > 0) {
    // Easy chooses a legal card without weighing card value, groups, or future
    // turns. This keeps it unpredictable while leaving strategic play to higher levels.
    const card = validCards[Math.floor(Math.random() * validCards.length)];
    return { type: 'play', cards: [card] };
  }
  // If pile is only 9♦ and hand exists, force a play (cannot take)
  if (pile.length === 1 && hand.length > 0) {
    // The opening special move is the three remaining nines, never a mixed set.
    const nines = hand.filter(c => c.value === 9);
    if (options.specialNinesRule && nines.length >= 3) return { type: 'play', cards: nines.slice(0, 3) };
    const fourVal = hasFourOfSameValue(hand);
    if (fourVal !== null) return { type: 'play', cards: getCardsOfSameValue(hand, fourVal) };
    const sorted = [...hand].sort((a, b) => a.value - b.value);
    return { type: 'play', cards: [sorted[0]] };
  }

  return { type: 'take', cards: [], takeType: takeOpts.canTake3 ? 'take3' : 'takeAll' };

}

// -----------------------------
// Continue-turn logic (only PLAY or END TURN)
// -----------------------------
export function getContinueTurnMove(
  hand: Card[],
  pile: Card[],
  difficulty: AIDifficulty,
  options: GameOptions,
  state: GameState,
  playerId: number
): { type: 'play' | 'endTurn'; cards: Card[] } {
  const topCard = pile[pile.length - 1];
  const isFirstMove = pile.length === 1 && pile[0].value === 9 && pile[0].suit === 'diamonds';
  const possiblePlays = getPossiblePlays(hand, pile, options);

  // If no possible plays but pile is only 9♦, force a play from hand
  if ((!possiblePlays || possiblePlays.length === 0) && pile.length === 1 && hand.length > 0) {
    const nines = hand.filter(c => c.value === 9);
    if (options.specialNinesRule && nines.length >= 3) return { type: 'play', cards: nines.slice(0, 3) };
    const fourVal = hasFourOfSameValue(hand);
    if (fourVal !== null) return { type: 'play', cards: getCardsOfSameValue(hand, fourVal) };
    const sorted = [...hand].sort((a, b) => a.value - b.value);
    return { type: 'play', cards: [sorted[0]] };
  }

  if (!possiblePlays || possiblePlays.length === 0) return { type: 'endTurn', cards: [] };

  let best: Card[] | null = null;
  let bestScore = -Infinity;
  for (const play of possiblePlays) {
    if (isUnnecessaryAceOnOpening(play, hand, pile)) continue;
    if (difficulty !== 'easy' && !shouldUseFourOfAKind(play, hand, state, playerId)) continue;
    const validation = validatePlay(play, pile, isFirstMove, options);
    if (!validation.valid) continue;
    const score = evaluatePlayMove(play, hand, pile, state, playerId);
    if (score > bestScore) {
      bestScore = score;
      best = play;
    }
  }
  // after scoring and before returning endTurn in getContinueTurnMove
if (best && best.length > 0) return { type: 'play', cards: best };

  // If pile is only 9♦ and hand exists, force a play from hand (cannot take)
  if (pile.length === 1 && hand.length > 0) {
    const nines = hand.filter(c => c.value === 9);
    if (options.specialNinesRule && nines.length >= 3) return { type: 'play', cards: nines.slice(0, 3) };
    const fourVal = hasFourOfSameValue(hand);
    if (fourVal !== null) return { type: 'play', cards: getCardsOfSameValue(hand, fourVal) };
    const sorted = [...hand].sort((a, b) => a.value - b.value);
    return { type: 'play', cards: [sorted[0]] };
  }

  // Otherwise end turn (only when truly no options)
  return { type: 'endTurn', cards: [] };

}


// -----------------------------
// Return AI thinking delay in milliseconds for a given difficulty.
// - easy: short delay
// - medium: moderate delay
// - hard: longer delay with small random jitter
//
// Keep delays small enough for UX but large enough to feel natural.
// -----------------------------
export function getAIDelay(difficulty: AIDifficulty): number {
  // base delays (ms)
  const BASE = {
    easy: 500,
    medium: 1000, // previous "hard" behavior moved to medium
    hard: 1500
  } as Record<AIDifficulty, number>;

  const base = BASE[difficulty] ?? 400;

  // Add a small random jitter so AI doesn't feel robotic
  const jitter = Math.floor(Math.random() * 200) - 100; // -100..+99 ms

  // Cap to a sensible range
  const delay = Math.max(100, base + jitter);
  return delay;
}

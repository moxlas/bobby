import { Card, GameState, GameOptions, AIDifficulty, Player } from '../types/game';
import { getCardsOfSameValue, hasFourOfSameValue, sortHand } from './deckUtils';
import { getValidMoves, getTakeOptions, validatePlay } from './gameLogic';

// ============================================================
// HARD AI STRATEGY:
// 
// 1. AVOID taking cards unless highly beneficial
// 2. Take ONLY when:
//    - Would complete a 4-of-a-kind (combo play)
//    - Would get high cards to preserve them
//    - Opponent is about to win and we need to block
// 3. Play HIGH cards strategically to:
//    - Force opponents to take cards
//    - Uncover lower cards in pile for later
// 4. Evaluate pile composition before deciding
// 
// CARD ORDERING RULES:
//    - 9 can ONLY be placed on 9
//    - 10 can be placed on 9 or 10
//    - J can be placed on 9, 10, J
//    - etc. (card must be >= top card value)
//    - 4-of-a-kind MUST ALSO follow this rule!
//      (4 tens on 9, 4 queens on 9/J/Q, etc.)
//    - EXCEPTION: 4 nines can be played on 9 of diamonds
//      at game start (special rule)
// ============================================================

const SCORE_WEIGHTS = {
  // Hand composition
  THREE_OF_A_KIND_PENALTY: -30,
  TWO_OF_A_KIND_BONUS: 5,
  FOUR_OF_A_KIND_BONUS: 80,
  NINE_TRIPLE_BONUS: 40,
  NINE_QUAD_BONUS: 90,
  
  // Taking cards - HEAVY penalties
  TAKING_CARDS_BASE_PENALTY: -50,
  TAKING_COMPLETES_QUAD_BONUS: 120,
  TAKING_HIGH_CARDS_BONUS: 15,
  TAKING_USEFUL_CARDS_BONUS: 25,
  TAKING_WHEN_LEADING_PENALTY: -40,
  
  // Playing cards
  WINNING_MOVE_BONUS: 2000,
  CARDS_REMAINING_PENALTY: -15,
  CAN_FINISH_SOON_BONUS: 200,
  
  // Strategic play
  FORCE_OPPONENT_TAKE_BONUS: 45,
  PLAYING_HIGH_TO_BLOCK: 35,
  PRESERVE_HIGH_CARDS: 8,
  PLAY_LOW_CARDS_BONUS: 5,
  
  // Opponent awareness
  OPPONENT_CLOSE_TO_WIN_PENALTY: -100,
  BLOCKING_OPPONENT_BONUS: 30,
  LEADING_POSITION_BONUS: 20,
  
  // Pile awareness
  UNCOVER_LOW_CARDS_BONUS: 20,
  OPPONENT_TAKES_BAD_PENALTY: -25,
};

// Analyze pile composition
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

// Check if taking cards would complete a 4-of-a-kind
function wouldCompleteQuad(hand: Card[], cardsToTake: Card[]): { wouldComplete: boolean; value: number | null } {
  const combined = [...hand, ...cardsToTake];
  const valueCounts = new Map<number, number>();
  
  for (const card of combined) {
    valueCounts.set(card.value, (valueCounts.get(card.value) || 0) + 1);
  }
  
  for (const [value, count] of valueCounts) {
    if (count === 4) {
      // Check if we already had 3 before taking
      const hadThreeBefore = hand.filter(c => c.value === value).length === 3;
      if (hadThreeBefore) {
        return { wouldComplete: true, value };
      }
    }
  }
  
  return { wouldComplete: false, value: null };
}

// Check if taking cards would give us high cards we can use
function wouldGetHighCards(cardsToTake: Card[]): boolean {
  return cardsToTake.some(c => c.value >= 13); // K or A
}

// Check if taking cards would fix a bad 3-of-a-kind situation
function wouldFixTriple(hand: Card[], cardsToTake: Card[]): boolean {
  const valueCounts = new Map<number, number>();
  
  // Count current triples (bad)
  for (const card of hand) {
    valueCounts.set(card.value, (valueCounts.get(card.value) || 0) + 1);
  }
  
  // Check if any current triple would become a quad
  for (const [value, count] of valueCounts) {
    if (count === 3) {
      const takingThisValue = cardsToTake.filter(c => c.value === value).length;
      if (takingThisValue === 1) {
        return true; // Would fix the triple by making it a quad
      }
    }
  }
  
  return false;
}

// Evaluate hand composition
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

// Estimate opponent hand strength
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

// Evaluate playing a high card to force opponent to take
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
  
  // If we play a high card (K or A), opponent might need to take
  if (cardToPlay.value >= 13) {
    // Check if opponent has low cards
    if (opponentInfo.strongestOpponent && opponentInfo.strongestOpponent.hand.length <= 4) {
      // Opponent with few cards likely has high cards or will struggle
      bonus += SCORE_WEIGHTS.FORCE_OPPONENT_TAKE_BONUS;
    }
    
    // If pile has low cards buried, opponent taking would be good for us
    if (pileAnalysis.hasLowCards) {
      bonus += SCORE_WEIGHTS.UNCOVER_LOW_CARDS_BONUS;
    }
  }
  
  // If we play a medium card (J or Q), still can force takes
  if (cardToPlay.value >= 11 && cardToPlay.value <= 12) {
    if (opponentInfo.opponentCloseToWin) {
      // Block opponent by playing medium-high
      bonus += SCORE_WEIGHTS.PLAYING_HIGH_TO_BLOCK;
    }
  }
  
  return bonus;
}

// Evaluate a play move
function evaluatePlayMove(
  cardsToPlay: Card[],
  hand: Card[],
  pile: Card[],
  state: GameState,
  playerId: number
): number {
  let score = 0;
  
  const remainingHand = hand.filter(c => !cardsToPlay.find(pc => pc.id === c.id));
  const pileAnalysis = analyzePile(pile);
  const opponentInfo = estimateOpponentStrength(state, playerId);
  
  // WINNING MOVE - Highest priority
  if (remainingHand.length === 0) {
    return SCORE_WEIGHTS.WINNING_MOVE_BONUS;
  }
  
  // Close to finishing
  if (remainingHand.length <= 3) {
    score += SCORE_WEIGHTS.CAN_FINISH_SOON_BONUS * (4 - remainingHand.length) / 3;
  }
  
  // Hand composition after play
  score += evaluateHandComposition(remainingHand);
  
  // Card value considerations
  const playValue = cardsToPlay[0].value;
  
  // Prefer playing lower cards to preserve high cards
  // BUT sometimes playing high is strategic
  if (playValue <= 10) {
    score += SCORE_WEIGHTS.PLAY_LOW_CARDS_BONUS;
  }
  
  // Strategic high card play
  if (cardsToPlay.length === 1 && playValue >= 11) {
    score += evaluateForceOpponentTake(cardsToPlay[0], hand, pile, state, playerId);
  }
  
  // 4-of-a-kind combo bonus
  if (cardsToPlay.length === 4) {
    score += SCORE_WEIGHTS.FOUR_OF_A_KIND_BONUS;
    
    // Check if we can continue with another good play
    const fourOfKindValue = hasFourOfSameValue(remainingHand);
    if (fourOfKindValue !== null) {
      score += SCORE_WEIGHTS.FOUR_OF_A_KIND_BONUS * 0.4;
    }
  }
  
  // Special 9's combo
  if (cardsToPlay.length === 3 && cardsToPlay.every(c => c.value === 9)) {
    score += SCORE_WEIGHTS.NINE_TRIPLE_BONUS;
  }
  
  // Position considerations
  const myCardCount = remainingHand.length;
  
  if (myCardCount < opponentInfo.avgOpponentCards) {
    score += SCORE_WEIGHTS.LEADING_POSITION_BONUS;
  }
  
  // Block opponent close to winning
  if (opponentInfo.opponentCloseToWin) {
    score += SCORE_WEIGHTS.OPPONENT_CLOSE_TO_WIN_PENALTY;
    
    // But if we can play high to block, that's good
    if (playValue >= 12) {
      score += SCORE_WEIGHTS.BLOCKING_OPPONENT_BONUS;
    }
  }
  
  return score;
}

// Evaluate taking cards - MUCH MORE CONSERVATIVE
function evaluateTakeMove(
  takeCount: number,
  hand: Card[],
  pile: Card[],
  state: GameState,
  playerId: number
): number {
  // Base penalty for taking cards - we want to AVOID taking
  let score = SCORE_WEIGHTS.TAKING_CARDS_BASE_PENALTY;
  
  const cardsToTake = pile.slice(-takeCount);
  const opponentInfo = estimateOpponentStrength(state, playerId);
  
  // ============================================================
  // ONLY TAKE IF HIGHLY BENEFICIAL
  // ============================================================
  
  // Check 1: Would this complete a 4-of-a-kind?
  const quadCheck = wouldCompleteQuad(hand, cardsToTake);
  if (quadCheck.wouldComplete) {
    score += SCORE_WEIGHTS.TAKING_COMPLETES_QUAD_BONUS;
  }
  
  // Check 2: Would this fix a bad 3-of-a-kind?
  if (wouldFixTriple(hand, cardsToTake)) {
    score += SCORE_WEIGHTS.TAKING_USEFUL_CARDS_BONUS;
  }
  
  // Check 3: Would we get high cards (K, A)?
  if (wouldGetHighCards(cardsToTake)) {
    score += SCORE_WEIGHTS.TAKING_HIGH_CARDS_BONUS;
  }
  
  // Check 4: Are we leading? If so, taking is WORSE
  const myCardCount = hand.length;
  if (myCardCount < opponentInfo.avgOpponentCards - 2) {
    score += SCORE_WEIGHTS.TAKING_WHEN_LEADING_PENALTY;
  }
  
  // Check 5: Is opponent about to win? Maybe take to block
  if (opponentInfo.opponentCloseToWin) {
    // Only consider taking if it would give us combo potential
    if (quadCheck.wouldComplete) {
      score += 30; // Worth taking to try to win
    }
  }
  
  // Check 6: Evaluate hand composition change
  const currentHandScore = evaluateHandComposition(hand);
  const newHandScore = evaluateHandComposition([...hand, ...cardsToTake]);
  const handChange = newHandScore - currentHandScore;
  
  // Only add positive change if it's significant
  if (handChange > 20) {
    score += handChange * 0.5;
  }
  
  return score;
}

// ============================================================
// GET POSSIBLE PLAYS - ENFORCES CARD ORDERING FOR ALL MOVES
// ============================================================
function getPossiblePlays(hand: Card[], pile: Card[], options: GameOptions): Card[][] {
  const plays: Card[][] = [];
  const topCard = pile[pile.length - 1];
  const isFirstMove = pile.length === 1 && topCard.suit === 'diamonds' && topCard.value === 9;
  
  // Group cards by value
  const cardsByValue = new Map<number, Card[]>();
  for (const card of hand) {
    if (!cardsByValue.has(card.value)) {
      cardsByValue.set(card.value, []);
    }
    cardsByValue.get(card.value)!.push(card);
  }
  
  // ============================================================
  // SPECIAL CASE: First move (9 of diamonds is on table)
  // ============================================================
  if (isFirstMove) {
    const nines = cardsByValue.get(9) || [];
    
    // Can play 1 nine on 9 of diamonds
    if (nines.length >= 1) {
      plays.push([nines[0]]);
    }
    
    // Can play 3 nines (special combo) on 9 of diamonds
    if (nines.length >= 3) {
      plays.push(nines.slice(0, 3));
    }
    
    // Can play 4 nines if allowed (special rule for 4 nines)
    if (nines.length === 4 && options.allowFourNinesStart) {
      plays.push(nines);
    }
    
    return plays;
  }
  
  // ============================================================
  // REGULAR PLAYS - ENFORCE CARD ORDERING RULES
  // ============================================================
  
  // Rule: Card must be >= top card value
  // This applies to ALL plays including 4-of-a-kind!
  
  for (const [value, cards] of cardsByValue) {
    // Check if this value can be played on top card
    const canPlayOnTop = value >= topCard.value;
    
    if (canPlayOnTop) {
      // Can play single card
      plays.push([cards[0]]);
      
      // Can also play 2 of same value (if we have them)
      if (cards.length >= 2) {
        plays.push(cards.slice(0, 2));
      }
      
      // Can also play 3 of same value (if we have them)
      if (cards.length >= 3) {
        plays.push(cards.slice(0, 3));
      }
      
      // Can play 4 of a kind - BUT STILL MUST FOLLOW ORDERING!
      // 4 tens can only be played if top card is 9 or 10
      // 4 queens can only be played if top card is 9, 10, J, or Q
      if (cards.length === 4) {
        plays.push(cards);
      }
    }
    // REMOVED: The exception that allowed 4-of-a-kind to be played anytime
    // Now 4-of-a-kind MUST also follow the ordering rule
  }
  
  return plays;
}

// Main AI move selection
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
  
  // Special 9's on first move
  if (isFirstMove) {
    const nines = hand.filter(c => c.value === 9);
    if (nines.length >= 3) {
      return { type: 'play', cards: nines.slice(0, 3) };
    }
    if (nines.length >= 1) {
      return { type: 'play', cards: [nines[0]] };
    }
  }
  
  // Check for 4 of a kind - MUST follow ordering now
  const fourValue = hasFourOfSameValue(hand);
  if (fourValue !== null && fourValue >= topCard.value) {
    const fourCards = getCardsOfSameValue(hand, fourValue);
    return { type: 'play', cards: fourCards };
  }
  
  // Play lowest valid card (must be >= top card value)
  const validCards = hand.filter(c => c.value >= topCard.value);
  if (validCards.length > 0) {
    validCards.sort((a, b) => a.value - b.value);
    return { type: 'play', cards: [validCards[0]] };
  }
  
  // Must take
  const takeOpts = getTakeOptions(pile, options);
  return { type: 'take', cards: [], takeType: takeOpts.canTakeAll ? 'takeAll' : 'take3' };
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
  
  // Special 9's on first move
  if (isFirstMove) {
    const nines = hand.filter(c => c.value === 9);
    if (nines.length === 4 && options.allowFourNinesStart) {
      return { type: 'play', cards: nines };
    }
    if (nines.length >= 3) {
      return { type: 'play', cards: nines.slice(0, 3) };
    }
    if (nines.length >= 1) {
      return { type: 'play', cards: [nines[0]] };
    }
  }
  
  // Check for 4 of a kind - MUST follow ordering now
  const fourValue = hasFourOfSameValue(hand);
  if (fourValue !== null && fourValue >= topCard.value) {
    const fourCards = getCardsOfSameValue(hand, fourValue);
    return { type: 'play', cards: fourCards };
  }
  
  // Play lowest valid card (must be >= top card value)
  const validCards = hand.filter(c => c.value >= topCard.value);
  if (validCards.length > 0) {
    validCards.sort((a, b) => a.value - b.value);
    return { type: 'play', cards: [validCards[0]] };
  }
  
  // Must take
  const takeOpts = getTakeOptions(pile, options);
  return { type: 'take', cards: [], takeType: takeOpts.canTakeAll ? 'takeAll' : 'take3' };
}

function getHardAIMove(
  state: GameState,
  playerId: number
): { type: 'play' | 'take' | 'endTurn'; cards: Card[]; takeType?: 'take3' | 'takeAll' } {
  const player = state.players.find(p => p.id === playerId)!;
  const hand = player.hand;
  const pile = state.pile;
  const options = state.options;
  const topCard = pile[pile.length - 1];
  const isFirstMove = pile.length === 1 && pile[0].suit === 'diamonds' && pile[0].value === 9;
  
  const possiblePlays = getPossiblePlays(hand, pile, options);
  const takeOpts = getTakeOptions(pile, options);
  
  let bestMove: { type: 'play' | 'take' | 'endTurn'; cards: Card[]; takeType?: 'take3' | 'takeAll' } | null = null;
  let bestScore = -Infinity;
  
  // ============================================================
  // EVALUATE ALL PLAY MOVES
  // ============================================================
  
  for (const playCards of possiblePlays) {
    const validation = validatePlay(playCards, pile, isFirstMove, options);
    if (validation.valid) {
      const score = evaluatePlayMove(playCards, hand, pile, state, playerId);
      
      // Bonus for combo continuation
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
  
  // ============================================================
  // EVALUATE TAKE MOVES - ONLY IF NO GOOD PLAY EXISTS
  // ============================================================
  
  // Check if we have any valid plays
  const hasValidPlays = possiblePlays.length > 0;
  
  if (!hasValidPlays || takeOpts.canTakeAll) {
    // Check if taking would complete a quad
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
  
  // If we have no valid plays, we MUST take
  if (!hasValidPlays && !bestMove) {
    if (takeOpts.canTakeAll) {
      // Check if taking all is beneficial
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
  
  // Fallback
  if (!bestMove) {
    if (takeOpts.canTake3) {
      bestMove = { type: 'take', cards: [], takeType: 'take3' };
    } else {
      bestMove = { type: 'endTurn', cards: [] };
    }
  }
  
  return bestMove;
}

// Continue turn logic
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
  
  const topCard = pile[pile.length - 1];
  
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
    
    // Only continue if beneficial
    if (bestPlay && bestScore > 0) {
      return { type: 'play', cards: bestPlay };
    }
    
    return { type: 'endTurn', cards: [] };
  }
  
  // Medium difficulty
  const playableCards = hand.filter(c => c.value >= topCard.value);
  const fourValue = hasFourOfSameValue(hand);
  
  // 4 of a kind must follow ordering
  if (fourValue !== null && fourValue >= topCard.value) {
    return { type: 'play', cards: getCardsOfSameValue(hand, fourValue) };
  }
  
  if (playableCards.length > 0) {
    playableCards.sort((a, b) => a.value - b.value);
    return { type: 'play', cards: [playableCards[0]] };
  }
  
  return { type: 'endTurn', cards: [] };
}

export function getAIDelay(): number {
  return 800 + Math.random() * 700;
}

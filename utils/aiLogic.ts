import { Card, GameState, GameOptions, AIDifficulty } from '../types/game';
import { getCardsOfSameValue, hasFourOfSameValue, sortHand } from './deckUtils';
import { getValidMoves, getTakeOptions, validatePlay } from './gameLogic';

// Constants for AI decision making
const CARD_VALUES = {
  9: 1,
  10: 2,
  11: 3, // J
  12: 4, // Q
  13: 5, // K
  14: 6, // A
};

// Score weights for hard AI
const SCORE_WEIGHTS = {
  CARDS_REMAINING: -10,      // Penalty for each card left in hand
  FOUR_OF_A_KIND: 50,        // Bonus for having 4 of a kind
  THREE_OF_A_KIND: 20,       // Bonus for having 3 of a kind
  HIGH_CARDS_PRESERVED: 5,   // Bonus for each high card preserved
  CAN_FINISH_SOON: 100,      // Bonus for being close to finishing
  OPPONENT_CARDS: 2,         // Consider opponent card counts
  TAKE_PENALTY: -15,         // Penalty for taking cards
  TAKE_ALL_BONUS: 25,        // Bonus for taking all (potential 4 of a kind)
  NINE_COMBO: 30,            // Bonus for having 3 nines combo
};

export function getAIMove(state: GameState, playerId: number): {
  type: 'play' | 'take' | 'endTurn';
  cards: Card[];
  takeType?: 'take3' | 'takeAll';
} {
  const player = state.players[playerId];
  const hand = player.hand;
  const pile = state.pile;
  const options = state.options;
  const difficulty = options.aiDifficulty;

  // Continue turn mode - decide whether to play more or end
  if (state.canContinueTurn) {
    return getContinueTurnMove(hand, pile, difficulty, options);
  }

  // Empty pile - play any card
  if (pile.length === 0) {
    return { type: 'play', cards: [hand[0]] };
  }

  const topCard = pile[pile.length - 1];
  const isFirstMove = pile.length === 1 && pile[0].suit === 'diamonds' && pile[0].value === 9;
  const { canPlay } = getValidMoves(hand, pile);

  // Hard AI: Evaluate all possible moves and pick the best
  if (difficulty === 'hard') {
    return getHardAIMove(state, playerId);
  }

  // Medium AI: Strategic play with 4 of a kind and multi-9
  if (difficulty === 'medium') {
    return getMediumAIMove(hand, pile, options, isFirstMove, topCard, canPlay);
  }

  // Easy AI: Simple logic
  return getEasyAIMove(hand, pile, options, isFirstMove, topCard, canPlay);
}

function getEasyAIMove(
  hand: Card[], 
  pile: Card[], 
  options: GameOptions, 
  isFirstMove: boolean, 
  topCard: Card, 
  canPlay: boolean
): { type: 'play' | 'take' | 'endTurn'; cards: Card[]; takeType?: 'take3' | 'takeAll' } {
  // Can't play - must take
  if (!canPlay) {
    return getTakeMove(pile, options);
  }

  // Special case: playing on 9 of diamonds
  if (isFirstMove) {
    const nineMove = getNineOfDiamondsMove(hand, options, 'easy');
    if (nineMove) return nineMove;
  }

  // Find playable cards and play lowest
  const playableCards = hand.filter(c => c.value >= topCard.value);
  if (playableCards.length > 0) {
    const sortedPlayable = [...playableCards].sort((a, b) => a.value - b.value);
    return { type: 'play', cards: [sortedPlayable[0]] };
  }

  return getTakeMove(pile, options);
}

function getMediumAIMove(
  hand: Card[], 
  pile: Card[], 
  options: GameOptions, 
  isFirstMove: boolean, 
  topCard: Card, 
  canPlay: boolean
): { type: 'play' | 'take' | 'endTurn'; cards: Card[]; takeType?: 'take3' | 'takeAll' } {
  // Can't play - must take
  if (!canPlay) {
    return getTakeMove(pile, options);
  }

  // Special case: playing on 9 of diamonds
  if (isFirstMove) {
    const nineMove = getNineOfDiamondsMove(hand, options, 'medium');
    if (nineMove) return nineMove;
  }

  // Check for 4 of a kind first
  const fourOfKindMove = getFourOfKindMove(hand, pile, topCard);
  if (fourOfKindMove) return fourOfKindMove;

  // Find playable cards
  const playableCards = hand.filter(c => c.value >= topCard.value);

  if (playableCards.length === 0) {
    return getTakeMove(pile, options);
  }

  // Play lowest valid card
  const sortedPlayable = [...playableCards].sort((a, b) => a.value - b.value);
  return { type: 'play', cards: [sortedPlayable[0]] };
}

function getHardAIMove(
  state: GameState, 
  playerId: number
): { type: 'play' | 'take' | 'endTurn'; cards: Card[]; takeType?: 'take3' | 'takeAll' } {
  const player = state.players[playerId];
  const hand = [...player.hand];
  const pile = state.pile;
  const options = state.options;
  const topCard = pile[pile.length - 1];
  const isFirstMove = pile.length === 1 && pile[0].suit === 'diamonds' && pile[0].value === 9;

  // Evaluate all possible moves
  const possibleMoves = evaluateAllMoves(hand, pile, options, isFirstMove, topCard);

  // Find the best move
  let bestMove = possibleMoves[0];
  let bestScore = -Infinity;

  for (const move of possibleMoves) {
    const score = calculateMoveScore(move, hand, pile, state, playerId);
    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }

  return bestMove;
}

function evaluateAllMoves(
  hand: Card[], 
  pile: Card[], 
  options: GameOptions, 
  isFirstMove: boolean, 
  topCard: Card
): Array<{ type: 'play' | 'take' | 'endTurn'; cards: Card[]; takeType?: 'take3' | 'takeAll'; score?: number }> {
  const moves: Array<{ type: 'play' | 'take' | 'endTurn'; cards: Card[]; takeType?: 'take3' | 'takeAll' }> = [];

  // Evaluate single card plays
  const playableCards = hand.filter(c => c.value >= topCard.value);
  for (const card of playableCards) {
    moves.push({ type: 'play', cards: [card] });
  }

  // Evaluate 4 of a kind plays
  const fourOfKindValue = hasFourOfSameValue(hand);
  if (fourOfKindValue !== null) {
    const fourCards = getCardsOfSameValue(hand, fourOfKindValue);
    if (fourOfKindValue >= topCard.value || isFirstMove) {
      moves.push({ type: 'play', cards: fourCards });
    }
  }

  // Evaluate special 9's move
  if (isFirstMove && options.specialNineRule) {
    const nines = hand.filter(c => c.value === 9);
    if (nines.length >= 3) {
      moves.push({ type: 'play', cards: nines.slice(0, 3) });
    }
    if (nines.length === 4 && options.allowFourNinesStart) {
      moves.push({ type: 'play', cards: nines });
    }
  }

  // Evaluate take moves
  const takeOpts = getTakeOptions(pile, options);
  if (takeOpts.canTake3) {
    moves.push({ type: 'take', cards: [], takeType: 'take3' });
  }
  if (takeOpts.canTakeAll) {
    moves.push({ type: 'take', cards: [], takeType: 'takeAll' });
  }

  // End turn as last resort
  moves.push({ type: 'endTurn', cards: [] });

  return moves;
}

function calculateMoveScore(
  move: { type: 'play' | 'take' | 'endTurn'; cards: Card[]; takeType?: 'take3' | 'takeAll' },
  hand: Card[],
  pile: Card[],
  state: GameState,
  playerId: number
): number {
  let score = 0;
  const options = state.options;

  if (move.type === 'play') {
    // Simulate the hand after playing
    const remainingHand = hand.filter(c => !move.cards.find(mc => mc.id === c.id));
    
    // Fewer cards is better
    score += (hand.length - remainingHand.length) * Math.abs(SCORE_WEIGHTS.CARDS_REMAINING);
    
    // Check if we can finish soon
    if (remainingHand.length === 0) {
      score += SCORE_WEIGHTS.CAN_FINISH_SOON;
    } else if (remainingHand.length <= 3) {
      score += SCORE_WEIGHTS.CAN_FINISH_SOON * 0.5;
    }

    // Evaluate remaining hand potential
    score += evaluateHandPotential(remainingHand);
    
    // Preserve high cards if possible
    const playedHighCards = move.cards.filter(c => c.value >= 13).length;
    score -= playedHighCards * SCORE_WEIGHTS.HIGH_CARDS_PRESERVED;

    // Bonus for 4 of a kind play
    if (move.cards.length === 4) {
      score += SCORE_WEIGHTS.FOUR_OF_A_KIND;
      // Check if we can continue with another good play
      const fourOfKindValue = hasFourOfSameValue(remainingHand);
      if (fourOfKindValue !== null) {
        score += SCORE_WEIGHTS.FOUR_OF_A_KIND * 0.5; // Potential for another 4 of a kind
      }
    }

    // Bonus for 3 nines combo
    if (move.cards.length === 3 && move.cards.every(c => c.value === 9)) {
      score += SCORE_WEIGHTS.NINE_COMBO;
    }

    // Prefer playing lower value cards to preserve high cards
    const avgValue = move.cards.reduce((sum, c) => sum + CARD_VALUES[c.value], 0) / move.cards.length;
    score += (6 - avgValue) * 2; // Lower average value is better

  } else if (move.type === 'take') {
    const takeOpts = getTakeOptions(pile, options);
    const cardsToTake = move.takeType === 'takeAll' ? takeOpts.takeAllCount : takeOpts.take3Count;
    
    // Base penalty for taking
    score += SCORE_WEIGHTS.TAKE_PENALTY;
    
    // Simulate hand after taking
    const newHand = [...hand];
    for (let i = 0; i < cardsToTake; i++) {
      if (pile.length > 1 + i) {
        newHand.push(pile[pile.length - 1 - i]);
      }
    }
    
    // Evaluate potential from new cards
    const potentialScore = evaluateHandPotential(newHand);
    
    // Check if taking could give us 4 of a kind
    const valueCounts = new Map<number, number>();
    for (const card of newHand) {
      valueCounts.set(card.value, (valueCounts.get(card.value) || 0) + 1);
    }
    
    for (const [value, count] of valueCounts) {
      if (count === 4) {
        score += SCORE_WEIGHTS.FOUR_OF_A_KIND;
      } else if (count === 3) {
        score += SCORE_WEIGHTS.THREE_OF_A_KIND;
      }
    }

    // Bonus for taking all if it leads to good combinations
    if (move.takeType === 'takeAll') {
      score += SCORE_WEIGHTS.TAKE_ALL_BONUS;
      
      // Extra bonus if taking all gives us 4 of a kind potential
      for (const [value, count] of valueCounts) {
        if (count >= 3) {
          score += SCORE_WEIGHTS.FOUR_OF_A_KIND * 0.3;
        }
      }
    }

    // Consider opponent positions - if we're winning, taking is worse
    const player = state.players[playerId];
    const opponentsWithMoreCards = state.players.filter(
      (p, idx) => idx !== playerId && !p.hasFinished && p.hand.length > player.hand.length
    ).length;
    
    if (opponentsWithMoreCards > 0) {
      // Taking cards when opponents have more is less risky
      score += 5;
    }

    score += potentialScore * 0.3; // Weight potential less than immediate plays

  } else if (move.type === 'endTurn') {
    // End turn is usually the worst option
    score -= 50;
  }

  return score;
}

function evaluateHandPotential(hand: Card[]): number {
  let potential = 0;

  // Count cards by value
  const valueCounts = new Map<number, number>();
  for (const card of hand) {
    valueCounts.set(card.value, (valueCounts.get(card.value) || 0) + 1);
  }

  // Bonus for 4 of a kind potential
  for (const [value, count] of valueCounts) {
    if (count === 4) {
      potential += SCORE_WEIGHTS.FOUR_OF_A_KIND;
    } else if (count === 3) {
      potential += SCORE_WEIGHTS.THREE_OF_A_KIND;
      // Check if we're close to 4 of a kind
      potential += SCORE_WEIGHTS.FOUR_OF_A_KIND * 0.25;
    } else if (count === 2) {
      potential += SCORE_WEIGHTS.THREE_OF_A_KIND * 0.3;
    }
  }

  // Bonus for having nines (special combo potential)
  const nineCount = valueCounts.get(9) || 0;
  if (nineCount >= 3) {
    potential += SCORE_WEIGHTS.NINE_COMBO;
  }

  // Fewer cards is generally better
  potential += (24 - hand.length) * Math.abs(SCORE_WEIGHTS.CARDS_REMAINING) * 0.1;

  return potential;
}

function getContinueTurnMove(
  hand: Card[], 
  pile: Card[], 
  difficulty: AIDifficulty,
  options: GameOptions
): { type: 'play' | 'take' | 'endTurn'; cards: Card[] } {
  // Easy: Always end turn
  if (difficulty === 'easy') {
    return { type: 'endTurn', cards: [] };
  }

  const topCard = pile[pile.length - 1];
  const playableCards = hand.filter(c => c.value >= topCard.value);

  if (playableCards.length > 0) {
    // Check for 4 of a kind first
    const fourOfKindValue = hasFourOfSameValue(hand);
    if (fourOfKindValue !== null && fourOfKindValue >= topCard.value) {
      const fourCards = getCardsOfSameValue(hand, fourOfKindValue);
      
      // Hard AI: Check if playing 4 of a kind is worth it
      if (difficulty === 'hard') {
        const remainingAfterPlay = hand.filter(c => !fourCards.find(fc => fc.id === c.id));
        if (remainingAfterPlay.length === 0) {
          // We'd win!
          return { type: 'play', cards: fourCards };
        }
        // Check if we have another good play after
        const nextTopValue = fourOfKindValue;
        const nextPlays = remainingAfterPlay.filter(c => c.value >= nextTopValue);
        if (nextPlays.length > 0) {
          return { type: 'play', cards: fourCards };
        }
      } else {
        return { type: 'play', cards: fourCards };
      }
    }

    // Play lowest card
    const sortedPlayable = [...playableCards].sort((a, b) => a.value - b.value);
    return { type: 'play', cards: [sortedPlayable[0]] };
  }

  return { type: 'endTurn', cards: [] };
}

function getNineOfDiamondsMove(
  hand: Card[], 
  options: GameOptions, 
  difficulty: AIDifficulty
): { type: 'play'; cards: Card[] } | null {
  const nines = hand.filter(c => c.value === 9);
  const otherNines = nines.filter(c => c.suit !== 'diamonds');

  if (otherNines.length === 0) return null;

  // Easy: Just play one nine
  if (difficulty === 'easy') {
    return { type: 'play', cards: [otherNines[0]] };
  }

  // Medium/Hard: Play all available nines (3 or 4)
  if (options.allowFourNinesStart && otherNines.length === 3) {
    return { type: 'play', cards: otherNines };
  }

  if (otherNines.length >= 3) {
    return { type: 'play', cards: otherNines.slice(0, 3) };
  }

  return { type: 'play', cards: [otherNines[0]] };
}

function getFourOfKindMove(
  hand: Card[], 
  pile: Card[], 
  topCard: Card
): { type: 'play'; cards: Card[] } | null {
  const fourOfKindValue = hasFourOfSameValue(hand);
  if (fourOfKindValue !== null && fourOfKindValue >= topCard.value) {
    const fourCards = getCardsOfSameValue(hand, fourOfKindValue);
    return { type: 'play', cards: fourCards };
  }
  return null;
}

function getTakeMove(pile: Card[], options: GameOptions): { type: 'take'; cards: Card[]; takeType: 'take3' | 'takeAll' } {
  const takeOptions = getTakeOptions(pile, options);
  
  // Prefer taking all if it's a small number or if it could help form combinations
  if (takeOptions.canTakeAll && takeOptions.takeAllCount <= 3) {
    return { type: 'take', cards: [], takeType: 'takeAll' };
  }
  
  return { type: 'take', cards: [], takeType: 'take3' };
}

export function getAIDelay(): number {
  return Math.floor(Math.random() * 700) + 800; // 800-1500ms
}

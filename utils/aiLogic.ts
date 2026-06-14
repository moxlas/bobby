import { Card, GameState, GameOptions } from '../types/game';
import { getCardsOfSameValue, hasFourOfSameValue } from './deckUtils';
import { getValidMoves, getTakeOptions } from './gameLogic';

export function getAIMove(state: GameState, playerId: number): {
  type: 'play' | 'take' | 'endTurn';
  cards: Card[];
  takeType?: 'take3' | 'takeAll';
} {
  const player = state.players[playerId];
  const hand = player.hand;
  const pile = state.pile;
  const options = state.options;
  
  if (state.canContinueTurn) {
    const shouldContinue = Math.random() < 0.7;
    
    if (!shouldContinue) {
      return { type: 'endTurn', cards: [] };
    }
    
    const topCard = pile[pile.length - 1];
    const playableCards = hand.filter(c => c.value >= topCard.value);
    
    if (playableCards.length > 0) {
      const sortedPlayable = [...playableCards].sort((a, b) => a.value - b.value);
      return { type: 'play', cards: [sortedPlayable[0]] };
    }
    
    const fourOfKindValue = hasFourOfSameValue(hand);
    if (fourOfKindValue !== null && fourOfKindValue >= topCard.value) {
      const fourCards = getCardsOfSameValue(hand, fourOfKindValue);
      return { type: 'play', cards: fourCards };
    }
    
    return { type: 'endTurn', cards: [] };
  }
  
  if (pile.length === 0) {
    return { type: 'play', cards: [hand[0]] };
  }
  
  const topCard = pile[pile.length - 1];
  const isFirstMove = pile.length === 1 && pile[0].suit === 'diamonds' && pile[0].value === 9;
  const { canPlay } = getValidMoves(hand, pile);
  
  if (!canPlay) {
    const takeOptions = getTakeOptions(pile, options);
    if (takeOptions.canTakeAll && takeOptions.takeAllCount <= 3) {
      return { type: 'take', cards: [], takeType: 'takeAll' };
    }
    return { type: 'take', cards: [], takeType: 'take3' };
  }
  
  if (isFirstMove) {
    const nines = hand.filter(c => c.value === 9);
    const otherNines = nines.filter(c => c.suit !== 'diamonds');
    
    if (options.allowFourNinesStart && otherNines.length === 3) {
      return { type: 'play', cards: otherNines };
    }
    
    if (otherNines.length >= 3) {
      return { type: 'play', cards: otherNines.slice(0, 3) };
    } else if (otherNines.length > 0) {
      return { type: 'play', cards: [otherNines[0]] };
    }
  }
  
  const fourOfKindValue = hasFourOfSameValue(hand);
  if (fourOfKindValue !== null) {
    const fourCards = getCardsOfSameValue(hand, fourOfKindValue);
    if (fourOfKindValue >= topCard.value) {
      return { type: 'play', cards: fourCards };
    }
  }
  
  const playableCards = hand.filter(c => c.value >= topCard.value);
  
  if (playableCards.length === 0) {
    const takeOptions = getTakeOptions(pile, options);
    if (takeOptions.canTakeAll && takeOptions.takeAllCount <= 3) {
      return { type: 'take', cards: [], takeType: 'takeAll' };
    }
    return { type: 'take', cards: [], takeType: 'take3' };
  }
  
  const sortedPlayable = [...playableCards].sort((a, b) => a.value - b.value);
  return { type: 'play', cards: [sortedPlayable[0]] };
}

export function getAIDelay(): number {
  return Math.floor(Math.random() * 700) + 800;
}
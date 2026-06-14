import { Card, Suit } from '../types/game';

export function createDeck(): Card[] {
  const suits: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
  const cards: Card[] = [];
  
  for (const suit of suits) {
    for (let value = 9; value <= 14; value++) {
      cards.push({
        id: `${suit}-${value}`,
        suit,
        value: value as Value,
        faceUp: false,
      });
    }
  }
  
  return cards;
}

export function shuffleDeck(deck: Card[]): Card[] {
  const shuffled = [...deck];
  
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  
  return shuffled;
}

export function cutDeck(deck: Card[]): Card[] {
  const cutPoint = Math.floor(Math.random() * (deck.length - 1)) + 1;
  return [...deck.slice(cutPoint), ...deck.slice(0, cutPoint)];
}

export function dealCards(deck: Card[], playerCount: number): Card[][] {
  const hands: Card[][] = Array.from({ length: playerCount }, () => []);
  
  deck.forEach((card, index) => {
    const playerIndex = index % playerCount;
    hands[playerIndex].push(card);
  });
  
  return hands;
}

export function findNineOfDiamonds(hand: Card[]): Card | undefined {
  return hand.find(c => c.suit === 'diamonds' && c.value === 9);
}

export function hasFourOfSameValue(hand: Card[]): number | null {
  const valueCounts = new Map<number, number>();
  
  for (const card of hand) {
    valueCounts.set(card.value, (valueCounts.get(card.value) || 0) + 1);
  }
  
  for (const [value, count] of valueCounts) {
    if (count === 4) return value;
  }
  
  return null;
}

export function getCardsOfSameValue(hand: Card[], value: number): Card[] {
  return hand.filter(c => c.value === value);
}
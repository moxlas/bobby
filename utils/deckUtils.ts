import { Card, Suit, Value } from '../types/game';

const SUIT_ORDER: Record<Suit, number> = {
  clubs: 0,
  diamonds: 1,
  hearts: 2,
  spades: 3,
};

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

export function sortHand(hand: Card[]): Card[] {
  return [...hand].sort((a, b) => {
    if (a.value !== b.value) {
      return a.value - b.value;
    }
    return SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit];
  });
}

export function dealCards(deck: Card[], playerCount: number): Card[][] {
  const hands: Card[][] = Array.from({ length: playerCount }, () => []);

  deck.forEach((card, index) => {
    const playerIndex = index % playerCount;
    hands[playerIndex].push(card);
  });

  return hands.map(hand => sortHand(hand));
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

export function getCardDisplayName(card: Card): string {
  const valueStr = card.value === 11 ? 'J' : card.value === 12 ? 'Q' : card.value === 13 ? 'K' : card.value === 14 ? 'A' : card.value.toString();
  const suitEmoji = card.suit === 'hearts' ? '♥' : card.suit === 'diamonds' ? '♦' : card.suit === 'clubs' ? '♣' : '♠';
  return `${valueStr}${suitEmoji}`;
}

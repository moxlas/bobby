import React from 'react';
import { Card as CardType } from '../types/game';
import { Card } from './Card';

interface PlayerHandProps {
  hand: CardType[];
  selectedCards: CardType[];
  onCardSelect: (card: CardType) => void;
  disabled?: boolean;
}

export function PlayerHand({ hand, selectedCards, onCardSelect, disabled }: PlayerHandProps) {
  return (
    <div className="flex flex-wrap gap-2 justify-center max-w-5xl mx-auto">
      {hand.map((card) => (
        <Card
          key={card.id}
          card={{ ...card, faceUp: true }}
          onClick={() => onCardSelect(card)}
          isSelected={selectedCards.some(c => c.id === card.id)}
          disabled={disabled}
          size="md"
        />
      ))}
    </div>
  );
}
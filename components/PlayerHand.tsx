import { Card as CardType } from '../types/game';
import { Card } from './Card';
import { sortHand } from '../utils/deckUtils';

interface PlayerHandProps {
  hand: CardType[];
  selectedCards: CardType[];
  onCardSelect: (card: CardType) => void;
  disabled?: boolean;
  faceUp?: boolean;
}

export function PlayerHand({ hand, selectedCards, onCardSelect, disabled, faceUp = true }: PlayerHandProps) {
  const sortedHand = sortHand(hand);

  return (
    <div className="flex flex-wrap gap-2 justify-center max-w-5xl mx-auto">
      {sortedHand.map((card) => (
        <Card
          key={card.id}
          card={{ ...card, faceUp }}
          onClick={() => onCardSelect(card)}
          isSelected={faceUp && selectedCards.some(c => c.id === card.id)}
          disabled={disabled || !faceUp}
          size="md"
        />
      ))}
    </div>
  );
}

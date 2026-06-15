import React from 'react';
import { Card as CardType } from '../types/game';
import { Card } from './Card';

interface GamePileProps {
  pile: CardType[];
}

export function GamePile({ pile }: GamePileProps) {
  const visibleCount = Math.min(3, pile.length);
  const visibleCards = pile.slice(-visibleCount);
  const topCard = pile[pile.length - 1];
  
  const getValueDisplay = (value: number): string => {
    switch (value) {
      case 11: return 'J';
      case 12: return 'Q';
      case 13: return 'K';
      case 14: return 'A';
      default: return String(value);
    }
  };

  if (pile.length === 0) {
    return (
      <div className="relative flex flex-col items-center">
        <div className="w-24 h-32 border-2 border-dashed border-emerald-500 rounded-lg flex items-center justify-center">
          <span className="text-emerald-400 text-sm">Empty</span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex flex-col items-center">
      <div className="my-4 bg-emerald-700 px-3 py-1.5 rounded-full text-emerald-200 text-base whitespace-nowrap">
        {pile.length} card{pile.length !== 1 ? 's' : ''}
      </div>
      
      <div className="relative h-40 flex items-center justify-center" style="
    left: -2em;
    top: 1em;>
        {visibleCards.map((card, index) => {
          const totalWidth = (visibleCount - 1) * 16;
          const offsetX = index * 16 - totalWidth / 2;
          const offsetY = index * -3;
          
          return (
            <div 
              key={card.id}
              className="absolute transition-all duration-200"
              style={{ left: `${offsetX}px`, top: `${offsetY}px`, zIndex: index + 1 }}
            >
              <Card card={{ ...card, faceUp: true }} size="lg" />
            </div>
          );
        })}
      </div>
      
      <div className="my-4 text-center">
        <span className="text-emerald-300 text-xs">Top: </span>
        <span className="text-amber-300 font-bold text-sm">
          {getValueDisplay(topCard.value)} of {topCard.suit}
        </span>
      </div>
    </div>
  );
}

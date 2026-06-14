import React from 'react';
import { Card as CardType } from '../types/game';
import { Card } from './Card';

interface GamePileProps {
  pile: CardType[];
}

export function GamePile({ pile }: GamePileProps) {
  const visibleCount = Math.min(3, pile.length);
  const visibleCards = pile.slice(-visibleCount);
  const bottomCard = pile[0];
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
      <div className="relative">
        <div className="w-20 h-28 border-2 border-dashed border-emerald-500 rounded-lg flex items-center justify-center">
          <span className="text-emerald-400 text-sm">Empty</span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-emerald-700 px-3 py-1 rounded-full text-emerald-200 text-sm whitespace-nowrap">
        {pile.length} card{pile.length !== 1 ? 's' : ''}
      </div>
      
      <div className="relative h-32 w-48 flex items-center justify-center">
        {pile.length > visibleCount && (
          <div className="absolute left-0 top-4 opacity-50">
            <Card card={{ ...bottomCard, faceUp: true }} size="sm" />
          </div>
        )}
        
        {visibleCards.map((card, index) => {
          const offsetX = index * 12;
          const offsetY = index * -2;
          
          return (
            <div 
              key={card.id}
              className="absolute transition-all duration-200"
              style={{ left: `${offsetX}px`, top: `${offsetY}px`, zIndex: index + 1 }}
            >
              <Card card={{ ...card, faceUp: true }} size="sm" />
            </div>
          );
        })}
      </div>
      
      <div className="mt-2 text-center">
        <span className="text-emerald-300 text-xs">Top: </span>
        <span className="text-amber-300 font-bold text-sm">
          {getValueDisplay(topCard.value)} of {topCard.suit}
        </span>
      </div>
    </div>
  );
}
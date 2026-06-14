import React from 'react';
import { Card as CardType } from '../types/game';

interface CardProps {
  card: CardType;
  onClick?: () => void;
  isSelected?: boolean;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const SUIT_SYMBOLS: Record<string, string> = {
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
  spades: '♠',
};

const SUIT_COLORS: Record<string, string> = {
  hearts: 'text-red-500',
  diamonds: 'text-red-500',
  clubs: 'text-gray-900',
  spades: 'text-gray-900',
};

const VALUE_DISPLAY: Record<number, string> = {
  9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A',
};

export function Card({ card, onClick, isSelected, disabled, size = 'md' }: CardProps) {
  const sizeClasses = {
    sm: 'w-16 h-24',
    md: 'w-20 h-28',
    lg: 'w-24 h-32',
  };
  
  const suitSymbol = SUIT_SYMBOLS[card.suit] || '?';
  const suitColor = SUIT_COLORS[card.suit] || 'text-gray-900';
  const valueDisplay = VALUE_DISPLAY[card.value] || String(card.value);

  if (!card.faceUp) {
    return (
      <div 
        className={`${sizeClasses[size]} bg-blue-600 rounded-lg border-2 border-blue-400 flex items-center justify-center cursor-pointer shadow-md ${disabled ? 'opacity-50' : ''}`}
        onClick={onClick}
      >
        <div className="w-10 h-14 bg-blue-500 rounded border border-blue-300" />
      </div>
    );
  }

  return (
    <div 
      className={`${sizeClasses[size]} bg-white rounded-lg border-2 ${isSelected ? 'border-amber-400 ring-2 ring-amber-300' : 'border-gray-300'} flex flex-col items-center justify-between p-1.5 cursor-pointer shadow-md hover:shadow-lg transition-shadow ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      onClick={disabled ? undefined : onClick}
    >
      <div className={`text-sm font-bold ${suitColor} self-start leading-none`}>
        <div>{valueDisplay}</div>
        <div className="text-xs">{suitSymbol}</div>
      </div>
      <div className={`text-lg ${suitColor}`}>{suitSymbol}</div>
      <div className={`text-sm font-bold ${suitColor} self-end rotate-180 leading-none`}>
        <div>{valueDisplay}</div>
        <div className="text-xs">{suitSymbol}</div>
      </div>
    </div>
  );
}
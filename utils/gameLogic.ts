import { Card, GameState, Player, PlayerMove, GameOptions, DEFAULT_OPTIONS } from '../types/game';
import { createDeck, shuffleDeck, cutDeck, dealCards, findNineOfDiamonds, hasFourOfSameValue, sortHand } from './deckUtils';

export interface PlayerSetup {
  name: string;
  isAI: boolean;
}

export function initializeGame(playerSetups: PlayerSetup[], options: GameOptions = DEFAULT_OPTIONS): GameState {
  const deck = cutDeck(shuffleDeck(createDeck()));
  const hands = dealCards(deck, playerSetups.length);
  
  const players: Player[] = playerSetups.map((setup, index) => ({
    id: index,
    name: setup.name,
    hand: hands[index],
    isCurrentTurn: false,
    isConnected: true,
    isAI: setup.isAI,
    hasFinished: false,
    finishPosition: null,
    finishTime: null,
  }));
  
  let startingPlayerIndex = 0;
  for (let i = 0; i < players.length; i++) {
    if (findNineOfDiamonds(players[i].hand)) {
      startingPlayerIndex = i;
      break;
    }
  }
  
  players[startingPlayerIndex].isCurrentTurn = true;
  
  const nineOfDiamonds = findNineOfDiamonds(players[startingPlayerIndex].hand)!;
  players[startingPlayerIndex].hand = players[startingPlayerIndex].hand.filter(c => c.id !== nineOfDiamonds.id);
  
  return {
    phase: 'playing',
    players,
    currentPlayerIndex: startingPlayerIndex,
    pile: [{ ...nineOfDiamonds, faceUp: true }],
    deck: [],
    direction: 'clockwise',
    finishOrder: [],
    loser: null,
    moveHistory: [{
      id: '0',
      type: 'play',
      playerId: startingPlayerIndex,
      playerName: players[startingPlayerIndex].name,
      cards: [{ ...nineOfDiamonds, faceUp: true }],
      timestamp: Date.now(),
      turnNumber: 0
    }],
    gameStartTime: Date.now(),
    pausedTime: null,
    totalPausedTime: 0,
    turnNumber: 1,
    options,
    canContinueTurn: false,
  };
}

export function getNextPlayerIndex(currentIndex: number, players: Player[]): number {
  let nextIndex = (currentIndex + 1) % players.length;
  let attempts = 0;
  
  while (players[nextIndex].hasFinished && attempts < players.length) {
    nextIndex = (nextIndex + 1) % players.length;
    attempts++;
  }
  
  return nextIndex;
}

export function validatePlay(cards: Card[], pile: Card[], isFirstMove: boolean, options: GameOptions): { valid: boolean; error?: string; continueTurn?: boolean } {
  if (cards.length === 0) {
    return { valid: false, error: 'No cards selected' };
  }
  
  const firstValue = cards[0].value;
  const allSameValue = cards.every(c => c.value === firstValue);
  
  if (!allSameValue) {
    return { valid: false, error: 'All cards must have the same value' };
  }
  
  const topCard = pile[pile.length - 1];
  
  // Special case: playing on 9 of diamonds at start
  if (isFirstMove && pile.length === 1 && pile[0].suit === 'diamonds' && pile[0].value === 9) {
    const allNines = cards.every(c => c.value === 9);
    if (allNines) {
      if (options.allowFourNinesStart && cards.length === 4) {
        return { valid: true, continueTurn: true };
      }
      if (cards.length === 2) {
        return { valid: false, error: 'You can only play 1, 3, or 4 nine cards on 9 of diamonds' };
      }
      if (cards.length === 3) {
        return { valid: true, continueTurn: true };
      }
      if (cards.length === 1) {
        // Single 9 on 9 of diamonds - turn ends immediately
        return { valid: true, continueTurn: false };
      }
      return { valid: false, error: 'Invalid number of nine cards' };
    }
  }
  
  // Regular 9 on 9 play
  if (firstValue === 9 && topCard.value === 9) {
    if (cards.length !== 1) {
      return { valid: false, error: 'You can only play a single 9 card on other 9s' };
    }
    return { valid: true, continueTurn: false };
  }
  
  // 2 or 3 cards not allowed (except special cases above)
  if (cards.length === 2 || cards.length === 3) {
    return { valid: false, error: 'You can only play 1 card or 4 cards of the same value' };
  }
  
  if (cards.length > 4) {
    return { valid: false, error: 'Cannot play more than 4 cards at once' };
  }
  
  // Single card validation
  if (cards.length === 1) {
    if (firstValue < topCard.value) {
      return { valid: false, error: 'Card value must be equal or higher than top card' };
    }
  }
  
  // Four of a kind - always valid if same value
  if (cards.length === 4) {
    return { valid: true, continueTurn: true };
  }
  
  return { valid: true, continueTurn: false };
}

export function canContinueAfterPlay(hand: Card[], pile: Card[]): boolean {
  if (hand.length === 0) return false;
  
  const topCard = pile[pile.length - 1];
  const hasValidCard = hand.some(c => c.value >= topCard.value);
  const fourOfKindValue = hasFourOfSameValue(hand);
  
  return hasValidCard || fourOfKindValue !== null;
}

export function playCards(state: GameState, playerId: number, cards: Card[], continueTurn: boolean = false): GameState {
  const newPlayers = [...state.players];
  const player = newPlayers[playerId];
  
  // Empty play = pass turn
  if (cards.length === 0) {
    const nextIndex = getNextPlayerIndex(state.currentPlayerIndex, newPlayers);
    newPlayers[state.currentPlayerIndex].isCurrentTurn = false;
    newPlayers[nextIndex].isCurrentTurn = true;
    
    return {
      ...state,
      players: newPlayers,
      currentPlayerIndex: nextIndex,
      turnNumber: state.turnNumber + 1,
      canContinueTurn: false,
    };
  }
  
  // Remove played cards from hand and sort remaining
  player.hand = sortHand(player.hand.filter(c => !cards.find(pc => pc.id === c.id)));
  const newPile = [...state.pile, ...cards.map(c => ({ ...c, faceUp: true }))];
  
  const elapsedTime = state.gameStartTime 
    ? (Date.now() - state.gameStartTime) / 1000 - state.totalPausedTime 
    : 0;
  
  // Record move
  const move: PlayerMove = {
    id: `move-${Date.now()}-${Math.random()}`,
    playerId,
    playerName: player.name,
    type: 'play',
    cards: cards.map(c => ({ ...c })),
    timestamp: Date.now(),
    turnNumber: state.turnNumber,
  };
  const newMoveHistory = [...state.moveHistory, move];
  
  // Check if player finished
  if (player.hand.length === 0) {
    player.hasFinished = true;
    player.finishPosition = state.finishOrder.length + 1;
    player.finishTime = elapsedTime;
    
    const newFinishOrder = [...state.finishOrder, { ...player }];
    const activePlayers = newPlayers.filter(p => !p.hasFinished);
    
    // Check for game over (last player is loser)
    if (activePlayers.length === 1) {
      const loser = activePlayers[0];
      loser.hasFinished = true;
      loser.finishPosition = newPlayers.length;
      loser.finishTime = elapsedTime;
      
      return {
        ...state,
        phase: 'finished',
        players: newPlayers,
        pile: newPile,
        finishOrder: [...newFinishOrder, { ...loser }],
        loser,
        moveHistory: newMoveHistory,
        canContinueTurn: false,
      };
    }
    
    // Move to next player
    const nextIndex = getNextPlayerIndex(state.currentPlayerIndex, newPlayers);
    newPlayers[state.currentPlayerIndex].isCurrentTurn = false;
    newPlayers[nextIndex].isCurrentTurn = true;
    
    return {
      ...state,
      players: newPlayers,
      pile: newPile,
      finishOrder: newFinishOrder,
      currentPlayerIndex: nextIndex,
      moveHistory: newMoveHistory,
      turnNumber: state.turnNumber + 1,
      canContinueTurn: false,
    };
  }
  
  // Continue turn (after 4 of a kind)
  if (continueTurn) {
    return {
      ...state,
      players: newPlayers,
      pile: newPile,
      moveHistory: newMoveHistory,
      canContinueTurn: true,
    };
  }
  
  // Normal turn end
  const nextIndex = getNextPlayerIndex(state.currentPlayerIndex, newPlayers);
  newPlayers[state.currentPlayerIndex].isCurrentTurn = false;
  newPlayers[nextIndex].isCurrentTurn = true;
  
  return {
    ...state,
    players: newPlayers,
    pile: newPile,
    currentPlayerIndex: nextIndex,
    moveHistory: newMoveHistory,
    turnNumber: state.turnNumber + 1,
    canContinueTurn: false,
  };
}

export function endTurn(state: GameState): GameState {
  const newPlayers = [...state.players];
  const nextIndex = getNextPlayerIndex(state.currentPlayerIndex, newPlayers);
  newPlayers[state.currentPlayerIndex].isCurrentTurn = false;
  newPlayers[nextIndex].isCurrentTurn = true;
  
  return {
    ...state,
    players: newPlayers,
    currentPlayerIndex: nextIndex,
    turnNumber: state.turnNumber + 1,
    canContinueTurn: false,
  };
}

export function takeCards(state: GameState, playerId: number, count: number): GameState {
  const newPlayers = [...state.players];
  const player = newPlayers[playerId];
  const newPile = [...state.pile];
  
  const cardsToTake = newPile.splice(-count, count);
  // Sort hand after adding new cards
  player.hand = sortHand([...player.hand, ...cardsToTake]);
  
  const move: PlayerMove = {
    id: `move-${Date.now()}-${Math.random()}`,
    playerId,
    playerName: player.name,
    type: 'take',
    cards: cardsToTake.map(c => ({ ...c })),
    timestamp: Date.now(),
    turnNumber: state.turnNumber,
  };
  const newMoveHistory = [...state.moveHistory, move];
  
  const nextIndex = getNextPlayerIndex(state.currentPlayerIndex, newPlayers);
  newPlayers[state.currentPlayerIndex].isCurrentTurn = false;
  newPlayers[nextIndex].isCurrentTurn = true;
  
  return {
    ...state,
    players: newPlayers,
    pile: newPile,
    currentPlayerIndex: nextIndex,
    moveHistory: newMoveHistory,
    turnNumber: state.turnNumber + 1,
    canContinueTurn: false,
  };
}

export function getTakeOptions(pile: Card[], options: GameOptions): { canTake3: boolean; canTakeAll: boolean; take3Count: number; takeAllCount: number } {
  const availableCards = pile.length - 1; // Exclude 9 of diamonds at bottom
  
  return {
    canTake3: availableCards >= 1,
    canTakeAll: options.allowTakeAllCards && availableCards > 0,
    take3Count: Math.min(3, availableCards),
    takeAllCount: availableCards,
  };
}

export function pauseGame(state: GameState): GameState {
  if (state.phase !== 'playing') return state;
  return { ...state, phase: 'paused', pausedTime: Date.now() };
}

export function resumeGame(state: GameState): GameState {
  if (state.phase !== 'paused' || state.pausedTime === null) return state;
  const pauseDuration = (Date.now() - state.pausedTime) / 1000;
  return { ...state, phase: 'playing', pausedTime: null, totalPausedTime: state.totalPausedTime + pauseDuration };
}

export function getValidMoves(hand: Card[], pile: Card[]): { canPlay: boolean; canTake: boolean } {
  if (pile.length === 0) return { canPlay: true, canTake: false };
  
  const topCard = pile[pile.length - 1];
  const hasValidCard = hand.some(c => c.value >= topCard.value);
  const fourOfKindValue = hasFourOfSameValue(hand);
  
  return {
    canPlay: hasValidCard || fourOfKindValue !== null,
    canTake: pile.length > 1,
  };
}

import { getAIMove, getContinueTurnMove } from './aiLogic';
import type { GameState } from '../types/game';

interface AIWorkerRequest {
  state: GameState;
  playerId: number;
}

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<AIWorkerRequest>) => void) | null;
  postMessage: (message: unknown) => void;
};

workerScope.onmessage = ({ data }) => {
  const { state, playerId } = data;
  const player = state.players.find(candidate => candidate.id === playerId);
  if (!player) {
    workerScope.postMessage({ type: 'endTurn', cards: [] });
    return;
  }

  const move = state.canContinueTurn
    ? getContinueTurnMove(
        player.hand,
        state.pile,
        state.options.aiDifficulty,
        state.options,
        state,
        playerId,
      )
    : getAIMove(state, playerId);

  workerScope.postMessage(move);
};

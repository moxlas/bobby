import { useState, useEffect, useRef } from 'react';
import { Card as CardType, GameOptions, PlayerMove } from '../types/game';
import { PlayerHand } from './PlayerHand';
import { GamePile } from './GamePile';
import { Card } from './Card';
import { ConfirmPopup } from './ConfirmPopup';
import { validatePlay, getTakeOptions, getValidMoves } from '../utils/gameLogic';
import { getAIMove, getAIMoveCandidates, getAIDelay, getContinueTurnMove } from '../utils/aiLogic';
import {
  AIFeedbackMove,
  createAIFeedbackRecord,
  exportAIFeedback,
  getAIFeedbackRecords,
  saveAIFeedback,
} from '../utils/aiFeedback';
import {
  createHumanMoveDemonstration,
  exportHumanMoveDemonstrations,
  getHumanMoveDemonstrations,
  saveHumanMoveDemonstration,
} from '../utils/humanDemonstrations';
import {
  initAudio, setMuted, isMuted,
  playCardSound, playTakeSound, playComboSound,
  playWinSound, playLoseSound, playYourTurnSound, playClickSound,
} from '../utils/sounds';
import { ArrowRight, Clock, RotateCcw, Home, AlertCircle, Pause, Play, Zap, History, ChevronDown, ChevronUp, Crown, Skull, Volume2, VolumeX, Download, Eye, EyeOff, Minimize2 } from 'lucide-react';

interface GameBoardProps {
  gameState: any;
  onPlayCards: (playerId: number, cards: CardType[], continueTurn: boolean) => void;
  onTakeCards: (playerId: number, count: number) => void;
  onEndTurn: () => void;
  onPauseGame: () => void;
  onResumeGame: () => void;
  onRestartGame: () => void;
  onNewGame: () => void;
}

interface PendingAIFeedback {
  stateBeforeMove: any;
  playerId: number;
  chosenMove: AIFeedbackMove;
  candidates: AIFeedbackMove[];
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function getCardDisplayName(card: CardType): string {
  const valueStr = card.value === 11 ? 'J' : card.value === 12 ? 'Q' : card.value === 13 ? 'K' : card.value === 14 ? 'A' : card.value.toString();
  const suitEmoji = card.suit === 'hearts' ? '♥' : card.suit === 'diamonds' ? '♦' : card.suit === 'clubs' ? '♣' : '♠';
  return `${valueStr}${suitEmoji}`;
}

function describeAIFeedbackMove(move: AIFeedbackMove): string {
  if (move.type === 'play') return `Play ${move.cards.map(getCardDisplayName).join(' ')}`;
  if (move.type === 'take') return move.takeType === 'takeAll' ? 'Take all available cards' : 'Take up to 3 cards';
  return 'End the turn';
}

function getAIFeedbackMoveKey(move: AIFeedbackMove): string {
  if (move.type === 'play') return `play:${move.cards.map(card => card.id).sort().join(',')}`;
  return `${move.type}:${move.takeType ?? ''}`;
}

interface AIFeedbackDialogProps {
  pending: PendingAIFeedback;
  mode: 'rating' | 'chooseMove';
  feedbackCount: number;
  error: string | null;
  onGood: () => void;
  onStartBad: () => void;
  onChoose: (move: AIFeedbackMove) => void;
  onBadWithoutAlternative: () => void;
  onBack: () => void;
  onSkip: () => void;
  onExport: () => void;
  showAICards: boolean;
  onToggleAICards: () => void;
  onHide: () => void;
}

function AIFeedbackDialog({
  pending,
  mode,
  feedbackCount,
  error,
  onGood,
  onStartBad,
  onChoose,
  onBadWithoutAlternative,
  onBack,
  onSkip,
  onExport,
  showAICards,
  onToggleAICards,
  onHide,
}: AIFeedbackDialogProps) {
  const alternativeMoves = pending.candidates.filter(
    candidate => getAIFeedbackMoveKey(candidate) !== getAIFeedbackMoveKey(pending.chosenMove),
  );
  const playerName = pending.stateBeforeMove.players.find((player: any) => player.id === pending.playerId)?.name;
  const aiHand: CardType[] = pending.stateBeforeMove.players.find((player: any) => player.id === pending.playerId)?.hand ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="presentation">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-feedback-title"
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-emerald-500 bg-emerald-900 p-5 shadow-2xl sm:p-6"
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 id="ai-feedback-title" className="text-xl font-bold text-amber-300">
              {mode === 'rating' ? 'How was that AI move?' : 'Which move would you prefer?'}
            </h2>
            <p className="mt-1 text-sm text-emerald-200">{playerName} chose:</p>
            <p className="mt-1 font-semibold text-white">{describeAIFeedbackMove(pending.chosenMove)}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="rounded-full bg-emerald-800 px-2.5 py-1 text-xs text-emerald-200">{feedbackCount} saved</span>
            <button onClick={onHide} aria-label="Hide evaluation prompt" title="Hide prompt to inspect the board" className="rounded-lg p-2 text-emerald-200 hover:bg-emerald-800 hover:text-white">
              <Minimize2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mb-4 rounded-lg border border-emerald-700 bg-emerald-950/40 p-3">
          <button onClick={onToggleAICards} className="flex w-full items-center justify-between gap-3 text-left text-sm font-medium text-emerald-100" aria-pressed={showAICards}>
            <span className="flex items-center gap-2">{showAICards ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />} Show AI cards face up</span>
            <span className={`rounded-full px-2 py-0.5 text-xs ${showAICards ? 'bg-amber-400 text-emerald-950' : 'bg-emerald-800 text-emerald-200'}`}>{showAICards ? 'On' : 'Off'}</span>
          </button>
          {showAICards && (
            <div className="mt-3">
              <p className="mb-2 text-xs text-emerald-300">{playerName}'s hand before the move ({aiHand.length} cards)</p>
              <div className="flex max-h-36 flex-wrap justify-center gap-1 overflow-y-auto">
                {aiHand.map(card => <Card key={card.id} card={{ ...card, faceUp: true }} size="sm" disabled />)}
              </div>
            </div>
          )}
        </div>

        {mode === 'rating' ? (
          <div className="grid grid-cols-2 gap-3">
            <button onClick={onGood} className="rounded-lg bg-emerald-600 px-4 py-3 font-bold text-white transition-colors hover:bg-emerald-500">
              Good move
            </button>
            <button onClick={onStartBad} className="rounded-lg bg-amber-500 px-4 py-3 font-bold text-emerald-950 transition-colors hover:bg-amber-400">
              Bad move
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {alternativeMoves.map(candidate => (
              <button
                key={getAIFeedbackMoveKey(candidate)}
                onClick={() => onChoose(candidate)}
                className="w-full rounded-lg border border-emerald-600 bg-emerald-800 px-4 py-3 text-left text-white transition-colors hover:border-amber-400 hover:bg-emerald-700"
              >
                {describeAIFeedbackMove(candidate)}
              </button>
            ))}
            {alternativeMoves.length === 0 && (
              <p className="rounded-lg bg-emerald-800 p-3 text-sm text-emerald-200">There was no other legal move available to select.</p>
            )}
            <button onClick={onBadWithoutAlternative} className="w-full rounded-lg border border-amber-500 px-4 py-3 text-left font-medium text-amber-200 transition-colors hover:bg-amber-500/10">
              Bad move, no suggested alternative
            </button>
            <button onClick={onBack} className="w-full rounded-lg px-4 py-2 text-sm text-emerald-300 hover:bg-emerald-800">
              Back
            </button>
          </div>
        )}

        {error && <p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-emerald-700 pt-3">
          <p className="text-xs text-emerald-300">Saved on this device. Opponents’ hidden cards are excluded.</p>
          <div className="flex gap-2">
            <button onClick={onExport} className="text-xs font-medium text-amber-300 hover:text-amber-200">Export evaluations</button>
            <button onClick={onSkip} className="text-xs font-medium text-emerald-300 hover:text-white">Skip</button>
          </div>
        </div>
      </section>
    </div>
  );
}

export function GameBoard({
  gameState,
  onPlayCards,
  onTakeCards,
  onEndTurn,
  onPauseGame,
  onResumeGame,
  onRestartGame,
  onNewGame
}: GameBoardProps) {
  const [selectedCards, setSelectedCards] = useState<CardType[]>([]);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingAction, setPendingAction] = useState<'play' | 'take3' | 'takeAll' | 'endTurn' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAIThinking, setIsAIThinking] = useState(false);
  const [showTakeOptions, setShowTakeOptions] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [showHistory, setShowHistory] = useState(true);
  const [mutedState, setMutedState] = useState(false);
  const [pendingAIFeedback, setPendingAIFeedback] = useState<PendingAIFeedback | null>(null);
  const [feedbackMode, setFeedbackMode] = useState<'rating' | 'chooseMove'>('rating');
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [feedbackHidden, setFeedbackHidden] = useState(false);
  const [showAICardsDuringFeedback, setShowAICardsDuringFeedback] = useState(false);
  const [feedbackCount, setFeedbackCount] = useState(() => getAIFeedbackRecords().length);
  const [humanMoveCount, setHumanMoveCount] = useState(() => getHumanMoveDemonstrations().length);
  const historyContainerRef = useRef<HTMLDivElement>(null);
  const prevPlayerIndexRef = useRef<number | null>(null);
  const finishSoundPlayedRef = useRef(false);

  const onPlayCardsRef = useRef(onPlayCards);
  const onTakeCardsRef = useRef(onTakeCards);
  const onEndTurnRef = useRef(onEndTurn);
  const gameStateRef = useRef(gameState);

  useEffect(() => {
    onPlayCardsRef.current = onPlayCards;
    onTakeCardsRef.current = onTakeCards;
    onEndTurnRef.current = onEndTurn;
    gameStateRef.current = gameState;
  });

  // Init audio context on mount
  useEffect(() => { initAudio(); }, []);

  // Your turn sound
  useEffect(() => {
    if (gameState.phase !== 'playing') return;
    const cur = gameState.players[gameState.currentPlayerIndex];
    if (!cur) return;
    if (prevPlayerIndexRef.current === null) {
      prevPlayerIndexRef.current = gameState.currentPlayerIndex;
      return;
    }
    if (prevPlayerIndexRef.current !== gameState.currentPlayerIndex) {
      prevPlayerIndexRef.current = gameState.currentPlayerIndex;
      if (!cur.isAI && !cur.hasFinished) {
        playYourTurnSound();
      }
    }
  }, [gameState.currentPlayerIndex, gameState.phase]);

  // Combo (4-of-a-kind bonus turn) sound
  useEffect(() => {
    if (gameState.canContinueTurn) {
      playComboSound();
    }
  }, [gameState.canContinueTurn]);

  // Win / lose sound on game end
  useEffect(() => {
    if (gameState.phase === 'finished' && !finishSoundPlayedRef.current) {
      finishSoundPlayedRef.current = true;
      const human = gameState.players.find((p: any) => !p.isAI);
      if (!human) return;
      const totalPlayers = gameState.players.length;
      if (human.finishPosition === 1) {
        playWinSound();
      } else if (human.finishPosition === totalPlayers) {
        playLoseSound();
      } else {
        playWinSound();
      }
    }
    if (gameState.phase === 'playing') {
      finishSoundPlayedRef.current = false;
    }
  }, [gameState.phase]);

  useEffect(() => {
    if (showHistory && historyContainerRef.current) {
      historyContainerRef.current.scrollTop = 0;
    }
  }, [gameState.moveHistory, showHistory]);

  useEffect(() => {
    if (gameState.phase === 'playing') {
      const interval = setInterval(() => {
        if (gameStateRef.current.gameStartTime) {
          const elapsed = (Date.now() - gameStateRef.current.gameStartTime) / 1000 - gameStateRef.current.totalPausedTime;
          setElapsedTime(elapsed);
        }
      }, 100);
      return () => clearInterval(interval);
    }
  }, [gameState.phase]);

  useEffect(() => {
    if (gameState.phase === 'paused' && gameState.gameStartTime) {
      const elapsed = (gameState.pausedTime! - gameState.gameStartTime) / 1000 - gameState.totalPausedTime;
      setElapsedTime(elapsed);
    }
  }, [gameState.phase, gameState.gameStartTime, gameState.pausedTime, gameState.totalPausedTime]);

  useEffect(() => {
    const shouldReset = !gameState.canContinueTurn;
    if (shouldReset) {
      setSelectedCards([]);
      setShowConfirm(false);
      setPendingAction(null);
      setError(null);
      setShowTakeOptions(false);
    }
  }, [gameState.currentPlayerIndex]);

  useEffect(() => {
    if (gameState.canContinueTurn) {
      setSelectedCards([]);
      setError(null);
    }
  }, [gameState.canContinueTurn]);

  const currentPlayer = gameState.players[gameState.currentPlayerIndex];
  const humanPlayers = gameState.players.filter((p: any) => !p.isAI);
  const allHumanPlayersFinished = humanPlayers.length > 0 && humanPlayers.every((p: any) => p.hasFinished);

  const isHumanTurn = currentPlayer && !currentPlayer.isAI && !currentPlayer.hasFinished && gameState.phase === 'playing';
  const isPlayerTurn = currentPlayer && !currentPlayer.hasFinished;
  const handCardsFaceUp = currentPlayer && (!currentPlayer.isAI || allHumanPlayersFinished);
  const pile = gameState.pile;
  const options: GameOptions = gameState.options;

  const isFirstMove = pile.length === 1 && pile[0].suit === 'diamonds' && pile[0].value === 9;
  const takeOptions = getTakeOptions(pile, options);
  const validMoves = isPlayerTurn ? getValidMoves(currentPlayer.hand, pile) : { canPlay: false, canTake: false };

  const isFourNinesStart = gameState.canContinueTurn &&
    isFirstMove &&
    currentPlayer.hand.filter((c: CardType) => c.value === 9).length === 3;

  useEffect(() => {
    if (gameState.phase !== 'playing') {
      return;
    }
    if (pendingAIFeedback) return;

    const currentPlayer = gameState.players[gameState.currentPlayerIndex];

    if (!currentPlayer || !currentPlayer.isAI || currentPlayer.id === 'human') {
      return;
    }

    if (currentPlayer.hasFinished) {
      const timeout = setTimeout(() => {
        const state = gameStateRef.current;
        if (state.phase !== 'playing') return;

        const activePlayers = state.players.filter((p: any) => !p.hasFinished);
        if (activePlayers.length <= 1) {
          return;
        }

        onPlayCardsRef.current(currentPlayer.id, [], false);
      }, 300);
      return () => clearTimeout(timeout);
    }

    setIsAIThinking(true);

    let cancelled = false;
    let worker: Worker | null = null;
    let searchTimeout: ReturnType<typeof setTimeout> | null = null;
    let moveResolved = false;

    const commitAITurn = (state: any, player: any, aiMove: any) => {
      if (cancelled) return;
      const latestState = gameStateRef.current;
      const latestPlayer = latestState.players[latestState.currentPlayerIndex];
      if (
        latestState.phase !== 'playing' ||
        latestPlayer?.id !== player.id ||
        latestState.canContinueTurn !== state.canContinueTurn
      ) {
        setIsAIThinking(false);
        return;
      }

      try {
        let executedMove: AIFeedbackMove = { type: 'endTurn', cards: [] };

        if (aiMove.type === 'endTurn') {
          onEndTurnRef.current();
        } else if (aiMove.type === 'play' && aiMove.cards.length > 0) {
          const pile = state.pile;
          const isFirstMove = pile.length === 1 && pile[0].suit === 'diamonds' && pile[0].value === 9;
          const validation = validatePlay(aiMove.cards, pile, isFirstMove, state.options);

          if (validation.valid) {
            executedMove = { type: 'play', cards: aiMove.cards.map((card: CardType) => ({ ...card })) };
            onPlayCardsRef.current(player.id, aiMove.cards, validation.continueTurn || false);
          } else {
            const takeOpts = getTakeOptions(pile, state.options);
            const count = takeOpts.canTake3 ? takeOpts.take3Count : takeOpts.takeAllCount;
            if (count > 0) {
              executedMove = { type: 'take', cards: [], takeType: takeOpts.canTake3 ? 'take3' : 'takeAll' };
              onTakeCardsRef.current(player.id, count);
            } else {
              onPlayCardsRef.current(player.id, [], false);
            }
          }
        } else if (aiMove.type === 'take') {
          const takeOpts = getTakeOptions(state.pile, state.options);
          const count = aiMove.takeType === 'takeAll' ? takeOpts.takeAllCount : takeOpts.take3Count;
          if (count > 0) {
            executedMove = { type: 'take', cards: [], takeType: aiMove.takeType };
            onTakeCardsRef.current(player.id, count);
          } else {
            onPlayCardsRef.current(player.id, [], false);
          }
        } else {
          onPlayCardsRef.current(player.id, [], false);
        }

        if (state.options.aiEvaluationEnabled) {
          const feedbackCandidates = getAIMoveCandidates(state, player.id, state.canContinueTurn);
          if (feedbackCandidates.some(candidate => candidate.type === 'play')) {
            setFeedbackMode('rating');
            setFeedbackError(null);
            setFeedbackHidden(false);
            setShowAICardsDuringFeedback(false);
            setPendingAIFeedback({
              stateBeforeMove: state,
              playerId: player.id,
              chosenMove: executedMove,
              candidates: feedbackCandidates,
            });
          }
        }
      } catch (error) {
        console.error('Could not apply the AI move.', error);
      } finally {
        setIsAIThinking(false);
      }
    };

    const getQuickMove = (state: any, player: any) => {
      try {
        return state.canContinueTurn
          ? getContinueTurnMove(player.hand, state.pile, state.options.aiDifficulty, state.options, state, player.id, false)
          : getAIMove(state, player.id, false);
      } catch (error) {
        console.error('AI move calculation failed; ending this turn safely.', error);
        return { type: 'endTurn', cards: [] };
      }
    };

    const executeAITurn = () => {
      const state = gameStateRef.current;
      if (state.phase !== 'playing') {
        setIsAIThinking(false);
        return;
      }

      const player = state.players[state.currentPlayerIndex];
      if (!player || !player.isAI || player.hasFinished) {
        setIsAIThinking(false);
        return;
      }

      const resolveMove = (aiMove: any) => {
        if (cancelled || moveResolved) return;
        moveResolved = true;
        if (searchTimeout) clearTimeout(searchTimeout);
        worker?.terminate();
        worker = null;
        commitAITurn(state, player, aiMove);
      };

      if (state.options.aiDifficulty !== 'hard') {
        resolveMove(getQuickMove(state, player));
        return;
      }

      try {
        worker = new Worker(new URL('../utils/aiWorker.ts', import.meta.url), { type: 'module' });
        worker.onmessage = event => resolveMove(event.data);
        worker.onerror = event => {
          event.preventDefault();
          resolveMove(getQuickMove(state, player));
        };
        worker.postMessage({ state, playerId: player.id });
        searchTimeout = setTimeout(() => {
          worker?.terminate();
          resolveMove(getQuickMove(state, player));
        }, 3000);
      } catch (error) {
        console.error('Could not start the AI search worker; using a quick move.', error);
        resolveMove(getQuickMove(state, player));
      }
    };

    const delay = getAIDelay(gameState.options.aiDifficulty);
    const timeout = setTimeout(executeAITurn, delay);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      if (searchTimeout) clearTimeout(searchTimeout);
      worker?.terminate();
      setIsAIThinking(false);
    };
  }, [gameState.currentPlayerIndex, gameState.phase, gameState.players, gameState.canContinueTurn, pendingAIFeedback]);

  const handleCardSelect = (card: CardType) => {
    if (!isHumanTurn) return;

    const isSelected = selectedCards.find(c => c.id === card.id);
    if (isSelected) {
      setSelectedCards(selectedCards.filter(c => c.id !== card.id));
    } else {
      setSelectedCards([...selectedCards, card]);
    }
    setError(null);
  };

  const handlePlayClick = () => {
    if (selectedCards.length === 0) {
      setError('Select cards to play');
      return;
    }

    const validation = validatePlay(selectedCards, pile, isFirstMove, options);
    if (!validation.valid) {
      setError(validation.error || 'Invalid move');
      return;
    }

    setPendingAction('play');
    setShowConfirm(true);
  };

  const handleTakeClick = () => {
    if (takeOptions.canTake3 && takeOptions.canTakeAll) {
      setShowTakeOptions(true);
    } else if (takeOptions.canTakeAll) {
      setPendingAction('takeAll');
      setShowConfirm(true);
    } else {
      setPendingAction('take3');
      setShowConfirm(true);
    }
  };

  const handleTake3 = () => {
    setPendingAction('take3');
    setShowConfirm(true);
    setShowTakeOptions(false);
  };

  const handleTakeAll = () => {
    setPendingAction('takeAll');
    setShowConfirm(true);
    setShowTakeOptions(false);
  };

  const handleEndTurnClick = () => {
    setPendingAction('endTurn');
    setShowConfirm(true);
  };

  const handleConfirm = () => {
    let humanMove: AIFeedbackMove | null = null;
    if (pendingAction === 'play') {
      const validation = validatePlay(selectedCards, pile, isFirstMove, options);
      humanMove = { type: 'play', cards: selectedCards.map(card => ({ ...card })) };
      if (validation.continueTurn) {
        playComboSound();
      } else {
        playCardSound();
      }
      onPlayCards(currentPlayer.id, selectedCards, validation.continueTurn || false);
    } else if (pendingAction === 'take3') {
      humanMove = { type: 'take', cards: [], takeType: 'take3' };
      playTakeSound();
      onTakeCards(currentPlayer.id, takeOptions.take3Count);
    } else if (pendingAction === 'takeAll') {
      humanMove = { type: 'take', cards: [], takeType: 'takeAll' };
      playTakeSound();
      onTakeCards(currentPlayer.id, takeOptions.takeAllCount);
    } else if (pendingAction === 'endTurn') {
      humanMove = { type: 'endTurn', cards: [] };
      playClickSound();
      onEndTurn();
    }

    if (humanMove && currentPlayer && !currentPlayer.isAI) {
      const preMoveState = gameState as import('../types/game').GameState;
      const availableMoves = getAIMoveCandidates(preMoveState, currentPlayer.id, gameState.canContinueTurn);
      const record = createHumanMoveDemonstration(preMoveState, currentPlayer.id, humanMove, availableMoves);
      if (saveHumanMoveDemonstration(record)) setHumanMoveCount(getHumanMoveDemonstrations().length);
    }

    setShowConfirm(false);
    setPendingAction(null);
    setSelectedCards([]);
  };

  const finishAIFeedback = (rating: 'good' | 'bad', preferredMove?: AIFeedbackMove) => {
    if (!pendingAIFeedback) return;
    const record = createAIFeedbackRecord(
      pendingAIFeedback.stateBeforeMove,
      pendingAIFeedback.playerId,
      pendingAIFeedback.chosenMove,
      rating,
      preferredMove,
      pendingAIFeedback.candidates,
    );
    if (!saveAIFeedback(record)) {
      setFeedbackError('Could not save feedback on this device. Check browser storage and try again.');
      return;
    }
    setFeedbackCount(getAIFeedbackRecords().length);
    setFeedbackError(null);
    setFeedbackMode('rating');
    setPendingAIFeedback(null);
    setFeedbackHidden(false);
    setShowAICardsDuringFeedback(false);
  };

  const skipAIFeedback = () => {
    setFeedbackError(null);
    setFeedbackMode('rating');
    setPendingAIFeedback(null);
    setFeedbackHidden(false);
    setShowAICardsDuringFeedback(false);
  };

  const downloadAIFeedback = () => {
    const blob = new Blob([exportAIFeedback()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'bobby-ai-evaluations.json';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const downloadHumanMoveData = () => {
    const blob = new Blob([exportHumanMoveDemonstrations()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'bobby-human-demonstrations.json';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleCancel = () => {
    setShowConfirm(false);
    setPendingAction(null);
    setShowTakeOptions(false);
  };

  const getConfirmMessage = () => {
    if (pendingAction === 'play') {
      const cardNames = selectedCards.map(c =>
        `${c.value === 11 ? 'J' : c.value === 12 ? 'Q' : c.value === 13 ? 'K' : c.value === 14 ? 'A' : c.value} of ${c.suit}`
      ).join(', ');
      return `Play ${cardNames}?`;
    } else if (pendingAction === 'take3') {
      return `Take ${takeOptions.take3Count} card${takeOptions.take3Count !== 1 ? 's' : ''} from pile?`;
    } else if (pendingAction === 'takeAll') {
      return `Take all ${takeOptions.takeAllCount} cards from pile?`;
    } else if (pendingAction === 'endTurn') {
      return 'End your turn?';
    }
    return '';
  };

  const feedbackDialog = pendingAIFeedback && feedbackHidden ? (
    <button
      onClick={() => setFeedbackHidden(false)}
      className="fixed right-4 top-4 z-50 flex items-center gap-2 rounded-full border border-amber-400 bg-emerald-900 px-4 py-3 font-semibold text-amber-300 shadow-xl transition-colors hover:bg-emerald-800"
    >
      <Eye className="h-4 w-4" />
      Show AI evaluation
    </button>
  ) : pendingAIFeedback ? (
    <AIFeedbackDialog
      pending={pendingAIFeedback}
      mode={feedbackMode}
      feedbackCount={feedbackCount}
      error={feedbackError}
      onGood={() => finishAIFeedback('good')}
      onStartBad={() => { setFeedbackError(null); setFeedbackMode('chooseMove'); }}
      onChoose={move => finishAIFeedback('bad', move)}
      onBadWithoutAlternative={() => finishAIFeedback('bad')}
      onBack={() => setFeedbackMode('rating')}
      onSkip={skipAIFeedback}
      onExport={downloadAIFeedback}
      showAICards={showAICardsDuringFeedback}
      onToggleAICards={() => setShowAICardsDuringFeedback(value => !value)}
      onHide={() => setFeedbackHidden(true)}
    />
  ) : null;

  if (gameState.phase === 'finished') {
    return (
      <div className="min-h-screen bg-emerald-900 flex items-center justify-center p-4">
        <div className="bg-emerald-800 rounded-2xl p-6 sm:p-8 max-w-md w-full text-center shadow-2xl border border-emerald-600">
          <h2 className="text-2xl sm:text-3xl font-bold text-amber-300 mb-2">Game Over!</h2>

          <div className="flex items-center justify-center gap-2 mb-4 sm:mb-6">
            <Clock className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-300" />
            <span className="text-emerald-200 text-base sm:text-lg">Total Time: {formatTime(elapsedTime)}</span>
          </div>

          <div className="space-y-2 sm:space-y-3 mb-6 sm:mb-8">
            <h3 className="text-sm sm:text-base text-emerald-200 font-semibold">Final Rankings:</h3>
            {gameState.finishOrder.map((player: any, index: number) => (
              <div
                key={player.id}
                className={`flex items-center justify-between p-2 sm:p-3 rounded-lg text-sm ${
                  index === 0 ? 'bg-amber-500 text-emerald-900' :
                  index === gameState.finishOrder.length - 1 ? 'bg-red-500 text-white' :
                  'bg-emerald-600 text-white'
                }`}
              >
                <div className="flex items-center gap-2 sm:gap-3">
                  <span className="font-medium">
                    {index + 1}. {player.name}
                  </span>
                  {index === gameState.finishOrder.length - 1 && (
                    <span className="text-xs font-bold flex items-center gap-1"><Skull className="w-3 h-3" /> LOSER</span>
                  )}
                  {index === 0 && (
                    <span className="text-xs font-bold flex items-center gap-1"><Crown className="w-3 h-3" /> WINNER</span>
                  )}
                </div>
                <div className="flex items-center gap-1 text-xs sm:text-sm">
                  <Clock className="w-3 h-3 sm:w-4 sm:h-4" />
                  <span>{formatTime(player.finishTime || 0)}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={onRestartGame}
              className="flex-1 bg-amber-500 hover:bg-amber-600 text-emerald-900 font-bold text-sm sm:text-base py-3 rounded-lg flex items-center justify-center gap-2 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Play Again
            </button>
            <button
              onClick={onNewGame}
              className="flex-1 bg-emerald-600 border border-emerald-400 text-white hover:bg-emerald-500 text-sm sm:text-base py-3 rounded-lg flex items-center justify-center gap-2 transition-colors"
            >
              <Home className="w-4 h-4" />
              New Game
            </button>
          </div>
          {gameState.options.aiEvaluationEnabled && (
            <button
              onClick={downloadAIFeedback}
              className="w-full mt-3 bg-emerald-700 hover:bg-emerald-600 border border-emerald-500 text-emerald-100 font-semibold text-sm py-3 rounded-lg flex items-center justify-center gap-2 transition-colors"
            >
              <Download className="w-4 h-4" />
              Export AI evaluations ({feedbackCount})
            </button>
          )}
          <button
            onClick={downloadHumanMoveData}
            className="w-full mt-2 bg-emerald-700 hover:bg-emerald-600 border border-emerald-500 text-emerald-100 font-semibold text-sm py-3 rounded-lg flex items-center justify-center gap-2 transition-colors"
          >
            <Download className="w-4 h-4" />
            Export human training data ({humanMoveCount})
          </button>
        </div>
        {feedbackDialog}
      </div>
    );
  }

  if (gameState.phase === 'paused') {
    return (
      <div className="min-h-screen bg-emerald-900 flex items-center justify-center p-4">
        <div className="bg-emerald-800 rounded-2xl p-6 sm:p-8 max-w-md w-full text-center shadow-2xl border border-emerald-600">
          <div className="flex items-center justify-center gap-2 sm:gap-3 mb-4 sm:mb-6">
            <Pause className="w-6 h-6 sm:w-8 sm:h-8 text-amber-300" />
            <h2 className="text-2xl sm:text-3xl font-bold text-amber-300">Game Paused</h2>
          </div>

          <div className="flex items-center justify-center gap-2 mb-6 sm:mb-8">
            <Clock className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-300" />
            <span className="text-emerald-200 text-xl sm:text-2xl font-mono">{formatTime(elapsedTime)}</span>
          </div>

          <div className="space-y-3 sm:space-y-4">
            <button
              onClick={onResumeGame}
              className="w-full bg-amber-500 hover:bg-amber-600 text-emerald-900 font-bold text-base sm:text-lg py-4 sm:py-6 rounded-lg flex items-center justify-center gap-2 transition-colors"
            >
              <Play className="w-4 h-4 sm:w-5 sm:h-5" />
              Resume Game
            </button>

            <button
              onClick={onRestartGame}
              className="w-full bg-emerald-600 border border-emerald-400 text-white hover:bg-emerald-500 text-sm sm:text-base py-3 rounded-lg flex items-center justify-center gap-2 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Restart Game
            </button>

            <button
              onClick={onNewGame}
              className="w-full bg-emerald-600 border border-emerald-400 text-white hover:bg-emerald-500 text-sm sm:text-base py-3 rounded-lg flex items-center justify-center gap-2 transition-colors"
            >
              <Home className="w-4 h-4" />
              New Game
            </button>
            <button
              onClick={downloadHumanMoveData}
              className="w-full bg-emerald-700 hover:bg-emerald-600 border border-emerald-500 text-emerald-100 font-semibold text-sm py-3 rounded-lg flex items-center justify-center gap-2 transition-colors"
            >
              <Download className="w-4 h-4" />
              Export human training data ({humanMoveCount})
            </button>
          </div>
        </div>
        {feedbackDialog}
      </div>
    );
  }

  const shouldShowHand = currentPlayer && !currentPlayer.hasFinished;

  const canTakeCards = validMoves.canTake && !gameState.canContinueTurn;

  return (
    <div className="min-h-screen bg-emerald-900 flex flex-col">
      {/* Top bar */}
      <div className="bg-emerald-800 border-b border-emerald-600 px-2 sm:px-4 py-3 sm:py-3 flex-shrink-0">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-1 sm:gap-4">
            <h1 className="text-base sm:text-xl font-bold text-amber-300">🃏 The Bobby</h1>
            <span className="text-emerald-300 text-xs hidden sm:inline">
              Turn {gameState.turnNumber}
            </span>
          </div>

          <div className="flex items-center gap-3 sm:gap-4">
            <div className="flex items-center gap-2 bg-emerald-700 px-3 sm:px-4 py-2 sm:py-2 rounded-lg">
              <Clock className="w-5 h-5 text-amber-300" />
              <span className="text-white font-mono text-base sm:text-lg">{formatTime(elapsedTime)}</span>
            </div>

            <button
              onClick={onPauseGame}
              className="bg-emerald-700 border border-emerald-500 text-emerald-100 hover:bg-emerald-600 lg:flex hidden items-center gap-1 px-3 py-2 rounded-lg text-sm transition-colors"
            >
              <Pause className="w-4 h-4" />
              Pause
            </button>

            <button
              onClick={() => {
                const next = !mutedState;
                setMutedState(next);
                setMuted(next);
              }}
              title={mutedState ? 'Unmute' : 'Mute'}
              className="bg-emerald-700 border border-emerald-500 text-emerald-100 hover:bg-emerald-600 flex items-center px-3 py-2.5 sm:py-2 rounded-lg text-sm transition-colors"
            >
              {mutedState ? <VolumeX className="w-5 h-5 sm:w-4 sm:h-4" /> : <Volume2 className="w-5 h-5 sm:w-4 sm:h-4" />}
            </button>

            <button
              onClick={onNewGame}
              className="bg-emerald-700 border border-emerald-500 text-emerald-100 hover:bg-emerald-600 flex items-center gap-1 px-3 py-2.5 sm:py-2 rounded-lg text-sm transition-colors"
            >
              <Home className="w-5 h-5 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">New Game</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main game area */}
      <div className="flex-none lg:flex-1 flex flex-col lg:flex-row gap-2 sm:gap-4 px-2 pt-2 pb-0 sm:p-4 max-w-6xl mx-auto w-full overflow-hidden">
        {/* Left sidebar - Players (Desktop) */}
        <div className="hidden lg:flex lg:w-44 flex-col gap-2 overflow-y-auto flex-shrink-0">
          <div className="text-emerald-300 text-xs font-medium uppercase tracking-wide mb-1 px-1">Players</div>
          {gameState.players.map((player: any) => {
            const isCurrent = player.id === currentPlayer?.id;

            return (
              <div
                key={player.id}
                className={`flex-shrink-0 rounded-lg p-2 border transition-all ${
                  isCurrent
                    ? 'border-amber-400 bg-amber-500/10'
                    : 'border-emerald-600 bg-emerald-800/50'
                } ${player.hasFinished ? 'opacity-60' : ''}`}
              >
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    player.hasFinished ? 'bg-gray-500' : isCurrent ? 'bg-amber-400 animate-pulse' : 'bg-emerald-500'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <span className={`text-sm font-medium truncate ${isCurrent ? 'text-amber-300' : 'text-white'}`}>
                        {player.name}
                      </span>
                      {player.isAI && <span className="text-[10px] text-emerald-400">AI</span>}
                    </div>
                    <div className="text-xs text-emerald-400">
                      {player.hasFinished ? (
                        <span className="text-amber-400 flex items-center gap-1">
                          {player.finishPosition === 1 ? <Crown className="w-3 h-3" /> :
                           player.finishPosition === gameState.players.length ? <Skull className="w-3 h-3" /> : null}
                          #{player.finishPosition}
                        </span>
                      ) : (
                        `${player.hand.length} cards`
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Center - Pile and actions */}
        <div className="flex-1 grid grid-rows-[minmax(0,1fr)_auto_minmax(0,1fr)] place-items-center gap-3 sm:gap-4 overflow-y-auto min-h-0">
          <div className="text-center self-end">
            <div className="flex items-center gap-1 sm:gap-2 justify-center mb-1 sm:mb-2">
              <span className="text-emerald-300 text-xs sm:text-sm">Current Turn:</span>
              <span className="text-amber-300 font-bold text-sm sm:text-lg">{currentPlayer?.name}</span>
              {currentPlayer?.isAI && <span className="text-[10px] sm:text-xs text-emerald-400">(AI)</span>}
              {isAIThinking && <span className="text-amber-400 text-xs sm:text-sm animate-pulse">Thinking...</span>}
            </div>
          </div>

          <div className="row-start-2 flex items-center justify-center">
            <GamePile pile={pile} />
          </div>

          <div className="row-start-3 self-start flex w-full max-w-sm flex-col items-center gap-4 sm:gap-4">
          {error && (
            <div className="flex items-center gap-2 bg-red-500 text-white px-3 sm:px-4 py-2 rounded-lg text-sm">
              <AlertCircle className="w-4 h-4" />
              {error}
            </div>
          )}

          {/* Continue turn banner - 4 Nines Start */}
          {gameState.canContinueTurn && isHumanTurn && isFourNinesStart && (
            <div className="bg-purple-600 rounded-lg p-4 sm:p-4 border-2 border-purple-400 shadow-lg w-full">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">🃏</span>
                <span className="text-white font-bold text-base sm:text-lg">Lucky Start!</span>
              </div>
              <p className="text-purple-100 text-xs sm:text-sm mb-4 sm:mb-3">
                You have all 4 nines! Play them now or save them for later.
              </p>
              <div className="flex gap-4 sm:gap-3">
                <button
                  onClick={handlePlayClick}
                  disabled={selectedCards.length === 0}
                  className="bg-white hover:bg-gray-100 text-purple-700 font-bold text-xs sm:text-sm px-4 py-3 sm:py-2 rounded-lg transition-colors disabled:opacity-50"
                >
                  Play Selected ({selectedCards.length})
                </button>
                <button
                  onClick={handleEndTurnClick}
                  className="bg-purple-700 border border-purple-500 text-white hover:bg-purple-600 text-xs sm:text-sm px-4 py-3 sm:py-2 rounded-lg transition-colors"
                >
                  Save for Later
                </button>
              </div>
            </div>
          )}

          {/* Continue turn banner - Regular 4 of a kind */}
          {gameState.canContinueTurn && isHumanTurn && !isFourNinesStart && (
            <div className="bg-amber-600 rounded-lg p-4 sm:p-4 border-2 border-amber-400 shadow-lg w-full">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-900" />
                <span className="text-emerald-900 font-bold text-base sm:text-lg">Combo!</span>
              </div>
              <p className="text-emerald-900 text-xs sm:text-sm mb-4 sm:mb-3">
                You played 4 of a kind! Play another card or end your turn.
              </p>
              <div className="flex gap-4 sm:gap-3">
                <button
                  onClick={handlePlayClick}
                  disabled={selectedCards.length === 0}
                  className="bg-emerald-800 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm px-4 py-3 sm:py-2 rounded-lg transition-colors disabled:opacity-50"
                >
                  Play Selected ({selectedCards.length})
                </button>
                <button
                  onClick={handleEndTurnClick}
                  className="bg-emerald-800 border border-emerald-600 text-white hover:bg-emerald-700 text-xs sm:text-sm px-4 py-3 sm:py-2 rounded-lg transition-colors"
                >
                  End Turn
                </button>
              </div>
            </div>
          )}

          {/* Take options popup */}
          {showTakeOptions && (
            <div className="bg-emerald-700 rounded-lg p-4 sm:p-4 border border-emerald-500 shadow-lg w-full">
              <p className="text-emerald-100 mb-4 sm:mb-3 text-center font-medium text-sm sm:text-base">How many cards to take?</p>
              <div className="flex flex-col sm:flex-row gap-4 sm:gap-3">
                <button
                  onClick={handleTake3}
                  className="bg-amber-500 hover:bg-amber-600 text-emerald-900 font-bold text-sm px-4 py-3 sm:py-2 rounded-lg transition-colors"
                >
                  Take 3 Cards
                </button>
                <button
                  onClick={handleTakeAll}
                  className="bg-amber-500 hover:bg-amber-600 text-emerald-900 font-bold text-sm px-4 py-3 sm:py-2 rounded-lg transition-colors"
                >
                  Take All ({takeOptions.takeAllCount})
                </button>
              </div>
              <button
                onClick={handleCancel}
                className="w-full mt-4 sm:mt-3 bg-emerald-600 border border-emerald-400 text-white hover:bg-emerald-500 text-sm px-4 py-3 sm:py-2 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Action buttons - Desktop only */}
          {isHumanTurn && !showTakeOptions && !gameState.canContinueTurn && (
            <div className="hidden lg:flex flex-wrap gap-3 justify-center">
              <button
                onClick={handlePlayClick}
                disabled={selectedCards.length === 0}
                className="bg-amber-500 hover:bg-amber-600 text-emerald-900 font-bold px-6 py-2 text-sm rounded-lg transition-colors disabled:opacity-50"
              >
                Play ({selectedCards.length})
              </button>

              {canTakeCards && (
                <button
                  onClick={handleTakeClick}
                  className="bg-emerald-600 border border-emerald-400 text-white hover:bg-emerald-500 text-sm px-6 py-2 rounded-lg transition-colors"
                >
                  Take Cards
                </button>
              )}
            </div>
          )}
          </div>
        </div>

        {/* Right sidebar - Move History (Desktop) */}
        <div className="hidden lg:flex lg:w-56 flex-col gap-3 flex-shrink-0">
          <div className="bg-emerald-800 rounded-lg border border-emerald-600 flex flex-col" style={{ maxHeight: '400px' }}>
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="flex items-center justify-between p-3 border-b border-emerald-600 flex-shrink-0"
            >
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-amber-400" />
                <span className="text-white font-medium text-sm">Move History</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-emerald-400 text-xs">{gameState.moveHistory.length}</span>
                {showHistory ? (
                  <ChevronUp className="w-4 h-4 text-emerald-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-emerald-400" />
                )}
              </div>
            </button>

            {showHistory && (
              <div ref={historyContainerRef} className="flex-1 overflow-y-auto p-2 space-y-1 min-h-0">
                {gameState.moveHistory.length === 0 ? (
                  <p className="text-emerald-400 text-xs italic text-center py-4">No moves yet</p>
                ) : (
                  gameState.moveHistory.slice().reverse().map((move: PlayerMove) => (
                    <div
                      key={move.id}
                      className={`text-xs p-2 rounded ${
                        move.type === 'play'
                          ? 'bg-emerald-700/50'
                          : 'bg-amber-900/30'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-0.5">
                        <span className={`font-medium ${move.type === 'play' ? 'text-amber-300' : 'text-emerald-300'}`}>
                          {move.playerName}
                        </span>
                        <span className="text-emerald-500 text-[10px]">T{move.turnNumber}</span>
                      </div>
                      <div className="text-emerald-200 truncate">
                        {move.type === 'play' ? (
                          <span className="flex items-center gap-1">
                            <span className="text-emerald-400">→</span>
                            {move.cards.map(c => getCardDisplayName(c)).join(' ')}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1">
                            <span className="text-amber-400">↑</span>
                            Took {move.cards.length}
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile: Bottom Section */}
      <div className="lg:hidden bg-emerald-800 border-t border-emerald-600 flex-shrink-0">
        {shouldShowHand && (
          <div className="border-b border-emerald-600 px-2 pt-1 pb-2 sm:p-3">
            <div className="text-center mb-1">
              <span className="text-emerald-300 text-xs sm:text-sm">{isHumanTurn ? 'Your' : `${currentPlayer.name}'s`} Hand ({currentPlayer.hand.length} cards)</span>
            </div>
            <div className="flex flex-wrap gap-1.5 justify-center">
              {currentPlayer.hand.map((card: CardType) => {
                const isSelected = handCardsFaceUp && selectedCards.some(c => c.id === card.id);
                const valueStr = card.value === 11 ? 'J' : card.value === 12 ? 'Q' : card.value === 13 ? 'K' : card.value === 14 ? 'A' : card.value.toString();
                const suitSymbol = card.suit === 'hearts' ? '♥' : card.suit === 'diamonds' ? '♦' : card.suit === 'clubs' ? '♣' : '♠';
                const isRed = card.suit === 'hearts' || card.suit === 'diamonds';

                if (!handCardsFaceUp) {
                  return (
                    <div
                      key={card.id}
                      className="w-14 h-20 rounded-lg border-2 border-blue-400 bg-blue-600 flex items-center justify-center shadow-sm opacity-75"
                    >
                      <div className="w-8 h-12 bg-blue-500 rounded border border-blue-300" />
                    </div>
                  );
                }

                return (
                  <button
                    key={card.id}
                    onClick={() => handleCardSelect(card)}
                    disabled={!isHumanTurn}
                    className={`w-14 h-20 rounded-lg border-2 flex flex-col items-center justify-center text-base font-bold transition-all shadow-sm ${
                      isSelected
                        ? 'border-amber-400 bg-amber-50 scale-105 shadow-md'
                        : 'border-slate-300 bg-white hover:border-slate-400 hover:shadow'
                    } ${!isHumanTurn ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <span className={`${isRed ? 'text-red-600' : 'text-slate-900'} leading-none`}>
                      {valueStr}
                    </span>
                    <span className={`${isRed ? 'text-red-600' : 'text-slate-900'} text-sm mt-0.5`}>
                      {suitSymbol}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {isHumanTurn && !showTakeOptions && !gameState.canContinueTurn && (
          <div className="p-4 sm:p-3 border-b border-emerald-600">
            <div className="flex gap-4 sm:gap-3 justify-center mb-4 sm:mb-3">
              <button
                onClick={handlePlayClick}
                disabled={selectedCards.length === 0}
                className="bg-amber-500 hover:bg-amber-600 text-emerald-900 font-bold px-5 py-3 text-sm rounded-lg flex-1 max-w-32 transition-colors disabled:opacity-50"
              >
                Play ({selectedCards.length})
              </button>

              {canTakeCards && (
                <button
                  onClick={handleTakeClick}
                  className="bg-emerald-600 border border-emerald-400 text-white hover:bg-emerald-500 px-5 py-3 text-sm rounded-lg flex-1 max-w-32 transition-colors"
                >
                  Take
                </button>
              )}
            </div>

            <div className="flex justify-center lg:hidden">
              <button
                onClick={onPauseGame}
                className="bg-emerald-700 border border-emerald-500 text-emerald-100 hover:bg-emerald-600 py-2 px-4 text-xs font-medium rounded-lg flex items-center gap-2 transition-colors"
              >
                <Pause className="w-3 h-3" />
                Pause
              </button>
            </div>
          </div>
        )}

        <div className="p-2 sm:p-3 border-b border-emerald-600">
          <div className="text-emerald-300 text-[10px] sm:text-xs font-medium uppercase tracking-wide mb-1 sm:mb-2">Players</div>
          <div className="flex flex-wrap gap-1 sm:gap-2">
            {gameState.players.map((player: any) => {
              const isCurrent = player.id === currentPlayer?.id;
              return (
                <div
                  key={player.id}
                  className={`px-2 py-1 rounded text-[10px] sm:text-xs border ${
                    isCurrent
                      ? 'border-amber-400 bg-amber-500/20 text-amber-300'
                      : 'border-emerald-600 bg-emerald-700/50 text-emerald-200'
                  } ${player.hasFinished ? 'opacity-60' : ''}`}
                >
                  <span className="font-medium">{player.name}</span>
                  {player.isAI && <span className="text-emerald-400 ml-0.5">AI</span>}
                  <span className="text-emerald-400 ml-1">
                    {player.hasFinished ? `#${player.finishPosition}` : `(${player.hand.length})`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="p-2 sm:p-3">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center justify-between w-full"
          >
            <div className="flex items-center gap-1 sm:gap-2">
              <History className="w-3 h-3 sm:w-4 sm:h-4 text-amber-400" />
              <span className="text-white font-medium text-xs sm:text-sm">Move History</span>
              <span className="text-emerald-400 text-[10px] sm:text-xs">({gameState.moveHistory.length})</span>
            </div>
            {showHistory ? (
              <ChevronUp className="w-3 h-3 sm:w-4 sm:h-4 text-emerald-400" />
            ) : (
              <ChevronDown className="w-3 h-3 sm:w-4 sm:h-4 text-emerald-400" />
            )}
          </button>

          {showHistory && (
            <div ref={historyContainerRef} className="mt-2 sm:mt-3 space-y-1 max-h-24 sm:max-h-32 overflow-y-auto">
              {gameState.moveHistory.length === 0 ? (
                <p className="text-emerald-400 text-[10px] sm:text-xs italic">No moves yet</p>
              ) : (
                gameState.moveHistory.slice().reverse().map((move: PlayerMove) => (
                  <div
                    key={move.id}
                    className={`text-[10px] sm:text-xs p-1.5 sm:p-2 rounded ${
                      move.type === 'play'
                        ? 'bg-emerald-700/50'
                        : 'bg-amber-900/30'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-0.5">
                      <span className={`font-medium ${move.type === 'play' ? 'text-amber-300' : 'text-emerald-300'}`}>
                        {move.playerName}
                      </span>
                      <span className="text-emerald-500 text-[8px] sm:text-[10px]">T{move.turnNumber}</span>
                    </div>
                    <div className="text-emerald-200 truncate">
                      {move.type === 'play' ? (
                        <span className="flex items-center gap-1">
                          <span className="text-emerald-400">→</span>
                          {move.cards.map(c => getCardDisplayName(c)).join(' ')}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1">
                          <span className="text-amber-400">↑</span>
                          Took {move.cards.length}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Desktop: Player Hand at bottom */}
      {shouldShowHand && (
        <div className="hidden lg:block bg-emerald-800 border-t border-emerald-600 p-4 flex-shrink-0">
          <div className="max-w-5xl mx-auto">
            <div className="text-center mb-3">
              <span className="text-emerald-300 text-sm">{isHumanTurn ? 'Your' : `${currentPlayer.name}'s`} Hand ({currentPlayer.hand.length} cards)</span>
            </div>
            <PlayerHand
              hand={currentPlayer.hand}
              selectedCards={selectedCards}
              onCardSelect={handleCardSelect}
              disabled={!isHumanTurn}
              faceUp={handCardsFaceUp}
            />
          </div>
        </div>
      )}

      {showConfirm && (
        <ConfirmPopup
          message={getConfirmMessage()}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}

      {feedbackDialog}
    </div>
  );
}

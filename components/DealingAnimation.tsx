import { useEffect, useRef } from 'react';
import { playCardSound } from '../utils/sounds';

interface PlayerInfo {
  name: string;
  isAI: boolean;
  cardCount: number;
}

interface DealingAnimationProps {
  players: PlayerInfo[];
  onComplete: () => void;
}

const VISUAL_CARDS = 7;
const CARD_STAGGER_MS = 65;
const COMPLETE_EXTRA_MS = 500;

function getPlayerStagger(playerCount: number): number {
  const totalCardTime = VISUAL_CARDS * CARD_STAGGER_MS;
  const targetTotal = 1800;
  const available = targetTotal - totalCardTime - COMPLETE_EXTRA_MS;
  if (playerCount <= 1) return 0;
  return Math.min(280, Math.floor(available / (playerCount - 1)));
}

export function DealingAnimation({ players, onComplete }: DealingAnimationProps) {
  const calledRef = useRef(false);

  const playerStagger = getPlayerStagger(players.length);
  const totalDuration =
    (players.length - 1) * playerStagger +
    VISUAL_CARDS * CARD_STAGGER_MS +
    COMPLETE_EXTRA_MS;

  useEffect(() => {
    // Play card sounds staggered across the deal
    const timers: ReturnType<typeof setTimeout>[] = [];

    players.forEach((_, pi) => {
      for (let ci = 0; ci < VISUAL_CARDS; ci++) {
        const delay = pi * playerStagger + ci * CARD_STAGGER_MS;
        timers.push(setTimeout(() => playCardSound(), delay));
      }
    });

    const completeTimer = setTimeout(() => {
      if (!calledRef.current) {
        calledRef.current = true;
        onComplete();
      }
    }, totalDuration);

    return () => {
      timers.forEach(clearTimeout);
      clearTimeout(completeTimer);
    };
  }, []);

  return (
    <div className="min-h-screen bg-emerald-900 flex items-center justify-center p-4">
      <style>{`
        @keyframes dealCard {
          0% { opacity: 0; transform: translateX(-28px) scale(0.75); }
          60% { opacity: 1; transform: translateX(3px) scale(1.05); }
          100% { opacity: 1; transform: translateX(0) scale(1); }
        }
        @keyframes playerRowIn {
          0% { opacity: 0; transform: translateY(12px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        @keyframes deckPulse {
          0%, 100% { transform: scale(1) rotate(-2deg); }
          50% { transform: scale(1.04) rotate(2deg); }
        }
        @keyframes shimmer {
          0% { opacity: 0.4; }
          50% { opacity: 1; }
          100% { opacity: 0.4; }
        }
      `}</style>

      <div className="w-full max-w-lg">
        {/* Title */}
        <div className="text-center mb-8">
          <div
            className="text-5xl mb-3 inline-block"
            style={{ animation: 'deckPulse 0.7s ease-in-out infinite' }}
          >
            🃏
          </div>
          <h2 className="text-2xl font-bold text-amber-300 tracking-wide">
            Dealing Cards...
          </h2>
          <p className="text-emerald-400 text-sm mt-1">
            {players.length} players · {players[0]?.cardCount ?? 0} cards each
          </p>
        </div>

        {/* Player rows */}
        <div className="space-y-3">
          {players.map((player, pi) => {
            const rowDelay = pi * playerStagger;
            return (
              <div
                key={pi}
                className="bg-emerald-800/80 border border-emerald-600 rounded-xl px-4 py-3 flex items-center gap-4"
                style={{
                  animation: `playerRowIn 250ms ease-out both`,
                  animationDelay: `${rowDelay}ms`,
                  opacity: 0,
                }}
              >
                {/* Player name */}
                <div className="w-28 flex-shrink-0">
                  <div className="text-white font-semibold text-sm truncate">
                    {player.name}
                  </div>
                  <div className="text-xs text-emerald-400">
                    {player.isAI ? 'AI' : 'You'} · {player.cardCount} cards
                  </div>
                </div>

                {/* Animated card backs */}
                <div className="flex gap-1 flex-1">
                  {Array.from({ length: VISUAL_CARDS }).map((_, ci) => {
                    const cardDelay = rowDelay + ci * CARD_STAGGER_MS;
                    return (
                      <div
                        key={ci}
                        className="w-7 h-10 rounded-md border border-emerald-400/60 flex-shrink-0 relative overflow-hidden"
                        style={{
                          background: 'linear-gradient(135deg, #1a5c35 0%, #0f3d22 50%, #1a5c35 100%)',
                          animation: `dealCard 220ms cubic-bezier(0.22, 0.61, 0.36, 1) both`,
                          animationDelay: `${cardDelay}ms`,
                          opacity: 0,
                        }}
                      >
                        {/* Card back pattern */}
                        <div
                          className="absolute inset-0.5 rounded border border-amber-500/25"
                          style={{
                            backgroundImage:
                              'repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(251,191,36,0.06) 2px, rgba(251,191,36,0.06) 4px)',
                          }}
                        />
                      </div>
                    );
                  })}
                  {/* "+N more" indicator if many cards */}
                  {player.cardCount > VISUAL_CARDS && (
                    <div
                      className="flex items-center justify-center text-emerald-400 text-xs font-medium flex-shrink-0 px-1"
                      style={{
                        animation: `dealCard 220ms cubic-bezier(0.22, 0.61, 0.36, 1) both`,
                        animationDelay: `${rowDelay + VISUAL_CARDS * CARD_STAGGER_MS}ms`,
                        opacity: 0,
                      }}
                    >
                      +{player.cardCount - VISUAL_CARDS}
                    </div>
                  )}
                </div>

                {/* Done indicator */}
                <div
                  className="w-5 h-5 rounded-full bg-emerald-500 flex-shrink-0 flex items-center justify-center"
                  style={{
                    animation: `dealCard 200ms ease-out both`,
                    animationDelay: `${rowDelay + VISUAL_CARDS * CARD_STAGGER_MS + 40}ms`,
                    opacity: 0,
                  }}
                >
                  <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div
          className="text-center mt-6 text-emerald-300 text-sm"
          style={{
            animation: 'shimmer 1s ease-in-out infinite',
            animationDelay: `${(players.length - 1) * playerStagger + VISUAL_CARDS * CARD_STAGGER_MS + 100}ms`,
            opacity: 0,
          }}
        >
          Game starting...
        </div>
      </div>
    </div>
  );
}

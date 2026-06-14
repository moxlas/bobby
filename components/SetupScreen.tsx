import React, { useState } from 'react';
import { Button } from './ui/button';
import { GameOptions, DEFAULT_OPTIONS } from '../types/game';
import { Users, Play, BookOpen, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';

interface PlayerSetup {
  name: string;
  isAI: boolean;
}

interface SetupScreenProps {
  onStartGame: (players: PlayerSetup[], options: GameOptions) => void;
}

const GAME_RULES = [
  { title: "Overview", content: "The Bobby is a multiplayer card game for 1-8 players. The goal is to be the first to get rid of all your cards!" },
  { title: "Deck & Dealing", content: "The game uses a partial deck with cards from 9 to Ace (24 cards total). Cards are shuffled, cut, and dealt face down to all players one at a time." },
  { title: "Starting the Game", content: "The player with the 9 of diamonds starts the game by throwing it face up on the table. Play continues clockwise." },
  { title: "Playing Cards", content: "Cards are placed on top of the pile in a single stack. You can only play a card of equal or higher value than the top card. The 9 of diamonds always stays at the bottom of the pile." },
  { title: "Taking Cards", content: "If you cannot play a valid card, you must take cards from the pile. You can take 3 cards or all available cards (except the 9 of diamonds)." },
  { title: "Four of a Kind", content: "If you have 4 cards of the same value, you can play them as a single card! After playing 4 of a kind, you can immediately play another card or set of 4 on top." },
  { title: "The 9's Special Rule", content: "If the 9 of diamonds is the only card on the table and you have the other three 9's, you can throw all three 9's on top at once, then continue with another card." },
  { title: "Winning", content: "The first player to get rid of all their cards wins! The last player with cards is the loser!" }
];

export function SetupScreen({ onStartGame }: SetupScreenProps) {
  const [playerCount, setPlayerCount] = useState(2);
  const [players, setPlayers] = useState<PlayerSetup[]>([
    { name: 'Player 1', isAI: false },
    { name: 'Player 2', isAI: true }
  ]);
  const [options, setOptions] = useState<GameOptions>(DEFAULT_OPTIONS);
  const [showRules, setShowRules] = useState(false);
  const [expandedRule, setExpandedRule] = useState<number | null>(null);

  const handlePlayerCountChange = (count: number) => {
    const newCount = Math.max(1, Math.min(8, count));
    setPlayerCount(newCount);
    
    const newPlayers: PlayerSetup[] = [];
    for (let i = 0; i < newCount; i++) {
      if (i < players.length) {
        newPlayers.push(players[i]);
      } else {
        newPlayers.push({ name: `Player ${i + 1}`, isAI: true });
      }
    }
    setPlayers(newPlayers);
  };

  const handlePlayerNameChange = (index: number, name: string) => {
    const newPlayers = [...players];
    newPlayers[index] = { ...newPlayers[index], name };
    setPlayers(newPlayers);
  };

  const handlePlayerTypeChange = (index: number, isAI: boolean) => {
    const newPlayers = [...players];
    newPlayers[index] = { ...newPlayers[index], isAI };
    setPlayers(newPlayers);
  };

  const canStart = players.length >= 1 && players.length <= 8 && players.every(p => p.name.trim());

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-900 to-emerald-950 flex items-center justify-center p-4">
      <div className="w-full max-w-4xl">
        <div className="text-center mb-8">
          <h1 className="text-5xl font-bold text-amber-300 mb-2">🃏 The Bobby</h1>
          <p className="text-emerald-300 text-lg">A multiplayer card game</p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-emerald-800 rounded-2xl p-6 shadow-2xl border border-emerald-600">
            <h2 className="text-xl font-bold text-amber-300 mb-4 flex items-center gap-2">
              <Users className="w-5 h-5" />
              Players
            </h2>

            <div className="mb-6">
              <label className="text-emerald-200 text-sm mb-2 block">Number of Players</label>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="1"
                  max="8"
                  value={playerCount}
                  onChange={(e) => handlePlayerCountChange(parseInt(e.target.value))}
                  className="flex-1 h-2 bg-emerald-600 rounded-lg appearance-none cursor-pointer accent-amber-400"
                />
                <span className="text-amber-300 font-bold text-xl w-8 text-center">{playerCount}</span>
              </div>
            </div>

            <div className="space-y-3 max-h-80 overflow-y-auto pr-2">
              {players.map((player, index) => (
                <div key={index} className="flex gap-2">
                  <input
                    type="text"
                    value={player.name}
                    onChange={(e) => handlePlayerNameChange(index, e.target.value)}
                    placeholder={`Player ${index + 1}`}
                    className="flex-1 bg-emerald-700 border border-emerald-500 rounded-lg px-3 py-2 text-white placeholder-emerald-400 focus:outline-none focus:border-amber-400"
                  />
                  <button
                    onClick={() => handlePlayerTypeChange(index, !player.isAI)}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      player.isAI ? 'bg-emerald-600 text-emerald-200 hover:bg-emerald-500' : 'bg-amber-500 text-emerald-900 hover:bg-amber-400'
                    }`}
                  >
                    {player.isAI ? 'AI' : 'Human'}
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-6 pt-4 border-t border-emerald-600">
              <h3 className="text-lg font-bold text-amber-300 mb-3">Game Options</h3>
              <div className="space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={options.allowFourNinesStart}
                    onChange={(e) => setOptions({ ...options, allowFourNinesStart: e.target.checked })}
                    className="w-5 h-5 rounded border-emerald-500 bg-emerald-700 text-amber-400 focus:ring-amber-400"
                  />
                  <span className="text-emerald-200 text-sm">Allow 4 Nines at Start</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={options.allowTakeAllCards}
                    onChange={(e) => setOptions({ ...options, allowTakeAllCards: e.target.checked })}
                    className="w-5 h-5 rounded border-emerald-500 bg-emerald-700 text-amber-400 focus:ring-amber-400"
                  />
                  <span className="text-emerald-200 text-sm">Allow Take All Cards</span>
                </label>
              </div>
            </div>
          </div>

          <div className="bg-emerald-800 rounded-2xl p-6 shadow-2xl border border-emerald-600">
            <button
              onClick={() => setShowRules(!showRules)}
              className="w-full flex items-center justify-between text-xl font-bold text-amber-300 mb-4"
            >
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5" />
                Game Rules
              </div>
              {showRules ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
            </button>

            {showRules ? (
              <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
                {GAME_RULES.map((rule, index) => (
                  <div key={index} className="bg-emerald-700 rounded-lg overflow-hidden">
                    <button
                      onClick={() => setExpandedRule(expandedRule === index ? null : index)}
                      className="w-full flex items-center justify-between p-3 text-left hover:bg-emerald-600 transition-colors"
                    >
                      <span className="text-amber-200 font-medium text-sm">{rule.title}</span>
                      {expandedRule === index ? <ChevronUp className="w-4 h-4 text-emerald-400" /> : <ChevronDown className="w-4 h-4 text-emerald-400" />}
                    </button>
                    {expandedRule === index && (
                      <div className="px-3 pb-3">
                        <p className="text-emerald-100 text-sm leading-relaxed">{rule.content}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <BookOpen className="w-12 h-12 text-emerald-600 mx-auto mb-3" />
                <p className="text-emerald-400">Click to read the game rules</p>
              </div>
            )}

            <div className="mt-6 pt-4 border-t border-emerald-600">
              <h3 className="text-amber-300 font-bold mb-2 text-sm">Quick Start</h3>
              <ul className="text-emerald-300 text-xs space-y-1">
                <li>• 9 of diamonds starts the game</li>
                <li>• Play equal or higher cards</li>
                <li>• Can't play? Take 3 cards!</li>
                <li>• 4 of a kind = bonus turn</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-8 text-center">
          {!canStart && (
            <div className="flex items-center justify-center gap-2 text-red-400 mb-3">
              <AlertCircle className="w-4 h-4" />
              <span className="text-sm">All players need a name</span>
            </div>
          )}
          <Button
            onClick={() => onStartGame(players, options)}
            disabled={!canStart}
            className="bg-amber-500 hover:bg-amber-400 text-emerald-900 font-bold text-lg px-12 py-6 rounded-xl shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Play className="w-5 h-5 mr-2" />
            Start Game
          </Button>
        </div>
      </div>
    </div>
  );
}
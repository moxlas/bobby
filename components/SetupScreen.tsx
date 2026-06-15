import React, { useState } from 'react';
import { Button } from './ui/button';
import { GameOptions, DEFAULT_OPTIONS, AIDifficulty } from '../types/game';
import { Users, Play, BookOpen, ChevronDown, ChevronUp, AlertCircle, Settings, Zap, ToggleLeft, ToggleRight } from 'lucide-react';

interface PlayerSetup {
  name: string;
  isAI: boolean;
}

interface SetupScreenProps {
  onStartGame: (players: PlayerSetup[], options: GameOptions) => void;
}

const GAME_RULES = [
  { title: "Overview", text: "Get rid of all your cards to win. The last player with cards loses!" },
  { title: "Starting", text: "9 of diamonds starts the game. The player with it plays first." },
  { title: "Playing Cards", text: "Cards must be equal or higher value than the top card of the pile." },
  { title: "Taking Cards", text: "If you can't play, take 3 cards (or all available) from the pile." },
  { title: "Four of a Kind", text: "Play 4 cards of the same value as a single move, then play another card!" },
  { title: "Special 9's", text: "When only 9♦ is on the table, you can play 3 other 9's together." },
];

const AI_DIFFICULTY_OPTIONS: { value: AIDifficulty; label: string; description: string }[] = [
  { value: 'easy', label: 'Easy', description: 'AI plays simple moves, always ends turn after playing' },
  { value: 'medium', label: 'Medium', description: 'AI uses 4-of-a-kind and multi-9 moves strategically' },
  { value: 'hard', label: 'Hard', description: 'AI calculates optimal moves, preserves high cards, seeks combos' },
];

export function SetupScreen({ onStartGame }: SetupScreenProps) {
  const [playerCount, setPlayerCount] = useState(2);
  const [players, setPlayers] = useState<PlayerSetup[]>([
    { name: 'Player 1', isAI: false },
    { name: 'Player 2', isAI: true },
  ]);
  const [showRules, setShowRules] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Game options - all enabled by default
  const [allowFourNinesStart, setAllowFourNinesStart] = useState(true);
  const [allowTakeAllCards, setAllowTakeAllCards] = useState(true);
  const [specialNineRule, setSpecialNineRule] = useState(true);
  const [aiDifficulty, setAiDifficulty] = useState<AIDifficulty>('easy');

  const handlePlayerCountChange = (count: number) => {
    setPlayerCount(count);
    const newPlayers: PlayerSetup[] = [];
    for (let i = 0; i < count; i++) {
      newPlayers.push({
        name: players[i]?.name || `Player ${i + 1}`,
        isAI: players[i]?.isAI ?? (i > 0),
      });
    }
    setPlayers(newPlayers);
    setError(null);
  };

  const handlePlayerNameChange = (index: number, name: string) => {
    const newPlayers = [...players];
    newPlayers[index] = { ...newPlayers[index], name };
    setPlayers(newPlayers);
    setError(null);
  };

  const handlePlayerTypeChange = (index: number, isAI: boolean) => {
    const newPlayers = [...players];
    newPlayers[index] = { ...newPlayers[index], isAI };
    setPlayers(newPlayers);
    setError(null);
  };

  const handleStartGame = () => {
    // Validate at least one human player
    const humanPlayers = players.filter(p => !p.isAI);
    if (humanPlayers.length === 0) {
      setError('At least one human player is required!');
      return;
    }

    // Validate names
    const emptyNames = players.filter(p => p.name.trim() === '');
    if (emptyNames.length > 0) {
      setError('All players must have a name!');
      return;
    }

    const options: GameOptions = {
      allowFourNinesStart,
      allowTakeAllCards,
      specialNineRule,
      aiDifficulty,
    };

    onStartGame(players, options);
  };

  return (
    <div className="min-h-screen bg-emerald-900 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl bg-emerald-800 rounded-xl shadow-2xl overflow-hidden border border-emerald-600">
        {/* Header */}
        <div className="bg-amber-500 p-6 text-center">
          <h1 className="text-3xl font-bold text-emerald-900 mb-2">🃏 The Bobby</h1>
          <p className="text-amber-700">A multiplayer card game</p>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Error Message */}
          {error && (
            <div className="bg-red-500/20 border border-red-500 rounded-lg p-3 flex items-center gap-2 text-red-200">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Player Count */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-emerald-300">Number of Players</label>
            <div className="flex gap-2">
              {[2, 3, 4, 5, 6, 7, 8].map((count) => (
                <button
                  key={count}
                  onClick={() => handlePlayerCountChange(count)}
                  className={`w-10 h-10 rounded-lg font-medium transition-all ${
                    playerCount === count
                      ? 'bg-amber-500 text-emerald-900'
                      : 'bg-emerald-600 text-emerald-300 hover:bg-emerald-500'
                  }`}
                >
                  {count}
                </button>
              ))}
            </div>
          </div>

          {/* Player Setup */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-emerald-300">Players</label>
            {players.map((player, index) => (
              <div key={index} className="flex gap-3 items-center">
                <div className="flex-1">
                  <input
                    type="text"
                    value={player.name}
                    onChange={(e) => handlePlayerNameChange(index, e.target.value)}
                    placeholder={`Player ${index + 1}`}
                    className="w-full px-4 py-2 rounded-lg bg-emerald-700 border border-emerald-500 text-white placeholder-emerald-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => handlePlayerTypeChange(index, false)}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                      !player.isAI
                        ? 'bg-emerald-500 text-white'
                        : 'bg-emerald-600 text-emerald-400 hover:bg-emerald-500'
                    }`}
                  >
                    Human
                  </button>
                  <button
                    onClick={() => handlePlayerTypeChange(index, true)}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                      player.isAI
                        ? 'bg-amber-500 text-emerald-900'
                        : 'bg-emerald-600 text-emerald-400 hover:bg-emerald-500'
                    }`}
                  >
                    AI
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Options Toggle */}
          <button
            onClick={() => setShowOptions(!showOptions)}
            className="w-full flex items-center justify-between p-4 rounded-lg bg-emerald-700 hover:bg-emerald-600 transition-colors border border-emerald-500"
          >
            <div className="flex items-center gap-2">
              <Settings className="w-5 h-5 text-amber-400" />
              <span className="text-white font-medium">Game Options</span>
            </div>
            {showOptions ? (
              <ChevronUp className="w-5 h-5 text-emerald-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-emerald-400" />
            )}
          </button>

          {/* Options Content */}
          {showOptions && (
            <div className="bg-emerald-700/50 rounded-lg p-4 space-y-4 border border-emerald-500">
              {/* 4 of a Kind Rule */}
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-400" />
                    <span className="text-white font-medium">4 of a Kind Rule</span>
                  </div>
                  <p className="text-emerald-400 text-xs mt-1">
                    Play 4 cards of the same value as a single move, then continue your turn
                  </p>
                </div>
                <button
                  onClick={() => setAllowFourNinesStart(!allowFourNinesStart)}
                  className={`p-2 rounded-lg transition-all ${
                    allowFourNinesStart
                      ? 'bg-emerald-500 text-white'
                      : 'bg-emerald-600 text-emerald-400'
                  }`}
                >
                  {allowFourNinesStart ? (
                    <ToggleRight className="w-6 h-6" />
                  ) : (
                    <ToggleLeft className="w-6 h-6" />
                  )}
                </button>
              </div>

              {/* Continue Turn */}
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-400" />
                    <span className="text-white font-medium">Continue Turn</span>
                  </div>
                  <p className="text-emerald-400 text-xs mt-1">
                    After playing 4 of a kind, you may play another card
                  </p>
                </div>
                <button
                  onClick={() => setAllowTakeAllCards(!allowTakeAllCards)}
                  className={`p-2 rounded-lg transition-all ${
                    allowTakeAllCards
                      ? 'bg-emerald-500 text-white'
                      : 'bg-emerald-600 text-emerald-400'
                  }`}
                >
                  {allowTakeAllCards ? (
                    <ToggleRight className="w-6 h-6" />
                  ) : (
                    <ToggleLeft className="w-6 h-6" />
                  )}
                </button>
              </div>

              {/* Special 9's Rule */}
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-400" />
                    <span className="text-white font-medium">Special 9's Rule</span>
                  </div>
                  <p className="text-emerald-400 text-xs mt-1">
                    When only 9♦ is on the table, you can play 3 other 9's together
                  </p>
                </div>
                <button
                  onClick={() => setSpecialNineRule(!specialNineRule)}
                  className={`p-2 rounded-lg transition-all ${
                    specialNineRule
                      ? 'bg-emerald-500 text-white'
                      : 'bg-emerald-600 text-emerald-400'
                  }`}
                >
                  {specialNineRule ? (
                    <ToggleRight className="w-6 h-6" />
                  ) : (
                    <ToggleLeft className="w-6 h-6" />
                  )}
                </button>
              </div>

              {/* AI Difficulty */}
              <div className="pt-2 border-t border-emerald-500">
                <label className="text-sm font-medium text-emerald-300 mb-2 block">AI Difficulty</label>
                <div className="grid grid-cols-3 gap-2">
                  {AI_DIFFICULTY_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => setAiDifficulty(option.value)}
                      className={`p-3 rounded-lg text-left transition-all border ${
                        aiDifficulty === option.value
                          ? 'bg-amber-500 border-amber-400 text-emerald-900'
                          : 'bg-emerald-600 border-emerald-500 text-emerald-300 hover:bg-emerald-500'
                      }`}
                    >
                      <div className="font-medium">{option.label}</div>
                      <div className={`text-xs mt-1 ${aiDifficulty === option.value ? 'text-amber-700' : 'text-emerald-400'}`}>
                        {option.description}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Rules Toggle */}
          <button
            onClick={() => setShowRules(!showRules)}
            className="w-full flex items-center justify-between p-4 rounded-lg bg-emerald-700 hover:bg-emerald-600 transition-colors border border-emerald-500"
          >
            <div className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-amber-400" />
              <span className="text-white font-medium">Game Rules</span>
            </div>
            {showRules ? (
              <ChevronUp className="w-5 h-5 text-emerald-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-emerald-400" />
            )}
          </button>

          {/* Rules Content */}
          {showRules && (
            <div className="bg-emerald-700/50 rounded-lg p-4 space-y-3 border border-emerald-500">
              {GAME_RULES.map((rule, index) => (
                <div key={index} className="text-sm">
                  <span className="text-amber-400 font-medium">{rule.title}: </span>
                  <span className="text-emerald-200">{rule.text}</span>
                </div>
              ))}
            </div>
          )}

          {/* Start Button */}
          <Button
            onClick={handleStartGame}
            className="w-full py-4 text-lg font-bold bg-amber-500 hover:bg-amber-600 text-emerald-900"
          >
            <Play className="w-5 h-5 mr-2" />
            Start Game
          </Button>
        </div>
      </div>
    </div>
  );
}

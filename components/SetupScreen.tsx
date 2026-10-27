import { useState, useEffect } from 'react';
import { GameOptions, DEFAULT_OPTIONS, AIDifficulty, ThemeName, Language } from '../types/game';
import { Play, BookOpen, ChevronDown, ChevronUp, AlertCircle, Settings, Zap, Trophy, Globe } from 'lucide-react';
import { Leaderboard } from './Leaderboard';
import { loadSettings, saveSettings } from '../utils/settings';
import { useTranslation, LANGUAGES } from '../lib/i18n';

interface PlayerSetup {
  name: string;
  isAI: boolean;
}

interface SetupScreenProps {
  onStartGame: (players: PlayerSetup[], options: GameOptions) => void;
}

const AI_DIFFICULTY_VALUES: AIDifficulty[] = ['easy', 'medium', 'hard'];

function LanguageFlag({ language }: { language: Language }) {
  const flagClass = 'h-4 w-7 shrink-0 overflow-hidden rounded-[3px] shadow-sm';

  if (language === 'lt') {
    return (
      <svg viewBox="0 0 30 18" className={flagClass} aria-hidden="true">
        <rect width="30" height="6" fill="#FDB913" />
        <rect y="6" width="30" height="6" fill="#006A44" />
        <rect y="12" width="30" height="6" fill="#C1272D" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 60 30" className={flagClass} aria-hidden="true">
      <rect width="60" height="30" fill="#012169" />
      <path d="M0 0 60 30M60 0 0 30" stroke="#fff" strokeWidth="6" />
      <path d="M0 0 60 30M60 0 0 30" stroke="#C8102E" strokeWidth="2.4" />
      <path d="M30 0v30M0 15h60" stroke="#fff" strokeWidth="10" />
      <path d="M30 0v30M0 15h60" stroke="#C8102E" strokeWidth="4" />
    </svg>
  );
}

interface ToggleProps {
  enabled: boolean;
  onToggle: () => void;
}

function Toggle({ enabled, onToggle }: ToggleProps) {
  return (
    <button
      onClick={onToggle}
      className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${
        enabled ? 'bg-amber-500' : 'bg-emerald-600'
      }`}
    >
      <span
        className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${
          enabled ? 'left-7' : 'left-1'
        }`}
      />
    </button>
  );
}

export function SetupScreen({ onStartGame }: SetupScreenProps) {
  const { t, tArray, language, setLanguage } = useTranslation();
  const saved = loadSettings();
  const [playerCount, setPlayerCount] = useState(saved?.players.length || 2);
  const [players, setPlayers] = useState<PlayerSetup[]>(
    saved?.players || [
      { name: 'Player 1', isAI: false },
      { name: 'Player 2', isAI: true },
    ]
  );
  const [showRules, setShowRules] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showLanguageDropdown, setShowLanguageDropdown] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameWarningIndex, setNameWarningIndex] = useState<number | null>(null);

  const [specialNinesRule, setSpecialNinesRule] = useState(saved?.options.specialNinesRule ?? DEFAULT_OPTIONS.specialNinesRule);
  const [allowTakeAllCards, setAllowTakeAllCards] = useState(saved?.options.allowTakeAllCards ?? DEFAULT_OPTIONS.allowTakeAllCards);
  const [fourOfAKindRule, setFourOfAKindRule] = useState(saved?.options.fourOfAKindRule ?? DEFAULT_OPTIONS.fourOfAKindRule);
  const [aiDifficulty, setAiDifficulty] = useState<AIDifficulty>(saved?.options.aiDifficulty ?? DEFAULT_OPTIONS.aiDifficulty);
  const [rankedSeating, setRankedSeating] = useState(saved?.options.rankedSeating ?? DEFAULT_OPTIONS.rankedSeating);
  const [randomSeating, setRandomSeating] = useState(saved?.options.randomSeating ?? DEFAULT_OPTIONS.randomSeating);
  const [theme, setTheme] = useState<ThemeName>(saved?.options.theme ?? DEFAULT_OPTIONS.theme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

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
    if (name.length > 12) {
      setNameWarningIndex(index);
      setTimeout(() => setNameWarningIndex(null), 2000);
    }
    const newPlayers = [...players];
    newPlayers[index] = { ...newPlayers[index], name: name.slice(0, 12) };
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
    const humanPlayers = players.filter(p => !p.isAI);
    if (humanPlayers.length === 0) {
      setError(t('setup.errorNoHuman'));
      return;
    }
    const emptyNames = players.filter(p => p.name.trim() === '');
    if (emptyNames.length > 0) {
      setError(t('setup.errorEmptyName'));
      return;
    }

    const options: GameOptions = {
      specialNinesRule,
      allowTakeAllCards,
      fourOfAKindRule,
      aiDifficulty,
      rankedSeating,
      randomSeating,
      theme,
      language,
    };

    saveSettings(players, options);
    onStartGame(players, options);
  };

  return (
    <>
      <div className="min-h-screen bg-emerald-900 flex items-center justify-center p-4">
        <div className="w-full max-w-2xl bg-emerald-800 rounded-xl shadow-2xl overflow-hidden border border-emerald-600">
          <div className="bg-amber-500 p-6 text-center relative">
            {/* Language selector */}
            <div className="absolute left-4 top-1/2 -translate-y-1/2">
              <button
                onClick={() => setShowLanguageDropdown(!showLanguageDropdown)}
                onBlur={() => setTimeout(() => setShowLanguageDropdown(false), 150)}
                className="flex items-center gap-1.5 bg-emerald-900/20 hover:bg-emerald-900/30 text-emerald-900 font-medium text-sm px-3 py-2 rounded-lg transition-colors"
              >
                <LanguageFlag language={language} />
                <span className="text-[10px] font-bold leading-none bg-emerald-900/30 text-emerald-800 rounded px-1 py-0.5">{LANGUAGES.find(l => l.code === language)?.badge}</span>
                <span className="hidden sm:inline text-sm">{LANGUAGES.find(l => l.code === language)?.name}</span>
              </button>
              {showLanguageDropdown && (
                <div className="absolute top-full left-0 mt-1 bg-emerald-800 border border-emerald-600 rounded-lg shadow-xl z-50 min-w-[140px]">
                  {LANGUAGES.map((lang) => (
                    <button
                      key={lang.code}
                      onClick={() => { setLanguage(lang.code); setShowLanguageDropdown(false); }}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors first:rounded-t-lg last:rounded-b-lg ${
                        language === lang.code
                          ? 'bg-amber-500/20 text-amber-300'
                          : 'text-emerald-200 hover:bg-emerald-700'
                      }`}
                    >
                      <LanguageFlag language={lang.code} />
                      <span className="text-[10px] font-bold leading-none bg-emerald-700 text-emerald-300 rounded px-1 py-0.5">{lang.badge}</span>
                      <span className="text-sm">{lang.name}</span>
                      {language === lang.code && <span className="ml-auto text-xs text-amber-400">✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <h1 className="text-3xl font-bold text-emerald-900 mb-1">{t('setup.title')}</h1>
            <p className="text-amber-700 text-sm">{t('setup.subtitle')}</p>

            <button
              onClick={() => setShowLeaderboard(true)}
              className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-1.5 bg-emerald-900/20 hover:bg-emerald-900/30 text-emerald-900 font-medium text-sm px-3 py-2 rounded-lg transition-colors"
            >
              <Trophy className="w-4 h-4" />
              <span className="hidden sm:inline">{t('setup.leaderboard')}</span>
            </button>
          </div>

          <div className="p-6 space-y-5">
            {error && (
              <div className="bg-red-500/20 border border-red-500 rounded-lg p-3 flex items-center gap-2 text-red-200">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <span className="text-sm">{error}</span>
              </div>
            )}

            {/* Player count */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-emerald-300">{t('setup.numberOfPlayers')}</label>
              <div className="flex gap-2 flex-wrap">
                {[2, 3, 4, 5, 6, 7, 8].map((count) => (
                  <button
                    key={count}
                    onClick={() => handlePlayerCountChange(count)}
                    className={`w-10 h-10 rounded-lg font-medium transition-all text-sm ${
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

            {/* Players */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-emerald-300">{t('setup.players')}</label>
              {players.map((player, index) => (
                <div key={index} className="flex gap-2 items-center">
                  <div className="flex-1 relative">
                    <input
                      type="text"
                      value={player.name}
                      onChange={(e) => handlePlayerNameChange(index, e.target.value)}
                      placeholder={t('setup.playerPlaceholder', { index: index + 1 })}
                      className="w-full px-4 py-2 rounded-lg bg-emerald-700 border border-emerald-500 text-white placeholder-emerald-400 focus:outline-none focus:ring-2 focus:ring-amber-500 text-sm"
                    />
                    {nameWarningIndex === index && (
                      <div className="absolute -top-8 left-0 bg-red-600 text-white text-xs px-2 py-1 rounded shadow whitespace-nowrap">
                        {t('setup.maxCharacters')}
                        <div className="absolute left-3 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-red-600" />
                      </div>
                    )}
                  </div>
                  <div className="flex rounded-lg overflow-hidden border border-emerald-500">
                    <button
                      onClick={() => handlePlayerTypeChange(index, false)}
                      className={`px-3 py-2 text-sm font-medium transition-all ${
                        !player.isAI
                          ? 'bg-emerald-500 text-white'
                          : 'bg-emerald-700 text-emerald-400 hover:bg-emerald-600'
                      }`}
                    >
                      {t('setup.human')}
                    </button>
                    <button
                      onClick={() => handlePlayerTypeChange(index, true)}
                      className={`px-3 py-2 text-sm font-medium transition-all ${
                        player.isAI
                          ? 'bg-amber-500 text-emerald-900'
                          : 'bg-emerald-700 text-emerald-400 hover:bg-emerald-600'
                      }`}
                    >
                      {t('setup.ai')}
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Game Options */}
            <div>
              <button
                onClick={() => setShowOptions(!showOptions)}
                className="w-full flex items-center justify-between p-4 rounded-lg bg-emerald-700 hover:bg-emerald-600 transition-colors border border-emerald-500"
              >
                <div className="flex items-center gap-2">
                  <Settings className="w-5 h-5 text-amber-400" />
                  <span className="text-white font-medium">{t('setup.gameOptions')}</span>
                </div>
                {showOptions ? (
                  <ChevronUp className="w-5 h-5 text-emerald-400" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-emerald-400" />
                )}
              </button>

              {showOptions && (
                <div className="mt-2 bg-emerald-700/40 rounded-lg p-4 space-y-5 border border-emerald-600">
                  {/* Special 9's Rule */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <Zap className="w-4 h-4 text-amber-400" />
                        <span className="text-white font-medium text-sm">{t('setup.option.specialNines.title')}</span>
                      </div>
                      <p className="text-emerald-400 text-xs">
                        {t('setup.option.specialNines.desc')}
                      </p>
                    </div>
                    <Toggle enabled={specialNinesRule} onToggle={() => setSpecialNinesRule(v => !v)} />
                  </div>

                  {/* Take All Cards */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <Zap className="w-4 h-4 text-amber-400" />
                        <span className="text-white font-medium text-sm">{t('setup.option.takeAll.title')}</span>
                      </div>
                      <p className="text-emerald-400 text-xs">
                        {t('setup.option.takeAll.desc')}
                      </p>
                    </div>
                    <Toggle enabled={allowTakeAllCards} onToggle={() => setAllowTakeAllCards(v => !v)} />
                  </div>

                  {/* 4 of a Kind Rule */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <Zap className="w-4 h-4 text-amber-400" />
                        <span className="text-white font-medium text-sm">{t('setup.option.fourOfAKind.title')}</span>
                      </div>
                      <p className="text-emerald-400 text-xs">
                        {t('setup.option.fourOfAKind.desc')}
                      </p>
                    </div>
                    <Toggle enabled={fourOfAKindRule} onToggle={() => setFourOfAKindRule(v => !v)} />
                  </div>

                  {/* Ranked Seating */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-white font-medium text-sm">{t('setup.option.rankedSeating.title')}</span>
                      </div>
                      <p className="text-emerald-400 text-xs">
                        {t('setup.option.rankedSeating.desc')}
                      </p>
                    </div>
                    <Toggle enabled={rankedSeating} onToggle={() => setRankedSeating(v => !v)} />
                  </div>

                  {/* Random Seating */}
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-white font-medium text-sm">{t('setup.option.randomSeating.title')}</span>
                      </div>
                      <p className="text-emerald-400 text-xs">
                        {t('setup.option.randomSeating.desc')}
                      </p>
                    </div>
                    <Toggle enabled={randomSeating} onToggle={() => setRandomSeating(v => !v)} />
                  </div>

                  {/* Theme */}
                  <div className="pt-2 border-t border-emerald-600/50">
                    <label className="text-sm font-medium text-emerald-300 mb-2 block">{t('setup.theme.title')}</label>
                    <div className="grid grid-cols-3 gap-2">
                      {([
                        { value: 'summer' as ThemeName, label: t('setup.theme.summer.label'), desc: t('setup.theme.summer.desc') },
                        { value: 'midnight' as ThemeName, label: t('setup.theme.midnight.label'), desc: t('setup.theme.midnight.desc') },
                        { value: 'autumn' as ThemeName, label: t('setup.theme.autumn.label'), desc: t('setup.theme.autumn.desc') },
                      ]).map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => setTheme(opt.value)}
                          className={`p-2.5 rounded-lg text-left transition-all border ${
                            theme === opt.value
                              ? 'bg-amber-500 border-amber-400 text-emerald-900'
                              : 'bg-emerald-600 border-emerald-500 text-emerald-300 hover:bg-emerald-500'
                          }`}
                        >
                          <div className="font-semibold text-sm">{opt.label}</div>
                          <div className={`text-xs mt-0.5 leading-tight ${theme === opt.value ? 'text-amber-800' : 'text-emerald-400'}`}>
                            {opt.desc}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* AI Difficulty */}
                  <div className="pt-2 border-t border-emerald-600/50">
                    <label className="text-sm font-medium text-emerald-300 mb-2 block">{t('setup.aiDifficulty.title')}</label>
                    <div className="grid grid-cols-3 gap-2">
                      {AI_DIFFICULTY_VALUES.map((value) => (
                        <button
                          key={value}
                          onClick={() => setAiDifficulty(value)}
                          className={`p-2.5 rounded-lg text-left transition-all border ${
                            aiDifficulty === value
                              ? 'bg-amber-500 border-amber-400 text-emerald-900'
                              : 'bg-emerald-600 border-emerald-500 text-emerald-300 hover:bg-emerald-500'
                          }`}
                        >
                          <div className="font-semibold text-sm">{t(`setup.aiDifficulty.${value}.label`)}</div>
                          <div className={`text-xs mt-0.5 leading-tight ${aiDifficulty === value ? 'text-amber-800' : 'text-emerald-400'}`}>
                            {t(`setup.aiDifficulty.${value}.desc`)}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Game Rules */}
            <div>
              <button
                onClick={() => setShowRules(!showRules)}
                className="w-full flex items-center justify-between p-4 rounded-lg bg-emerald-700 hover:bg-emerald-600 transition-colors border border-emerald-500"
              >
                <div className="flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-amber-400" />
                  <span className="text-white font-medium">{t('setup.gameRules')}</span>
                </div>
                {showRules ? (
                  <ChevronUp className="w-5 h-5 text-emerald-400" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-emerald-400" />
                )}
              </button>

              {showRules && (
                <div className="mt-2 bg-emerald-700/40 rounded-lg p-4 space-y-2.5 border border-emerald-600">
                  {(tArray('setup.rules') as { title: string; text: string }[]).map((rule, index) => (
                    <div key={index} className="text-sm">
                      <span className="text-amber-400 font-medium">{rule.title}: </span>
                      <span className="text-emerald-200">{rule.text}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={handleStartGame}
              className="w-full py-4 text-lg font-bold bg-amber-500 hover:bg-amber-600 text-emerald-900 rounded-lg flex items-center justify-center gap-2 transition-colors"
            >
              <Play className="w-5 h-5" />
              {t('setup.startGame')}
            </button>
          </div>
        </div>
      </div>

      {showLeaderboard && <Leaderboard onClose={() => setShowLeaderboard(false)} />}
    </>
  );
}

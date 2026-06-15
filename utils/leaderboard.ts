const STORAGE_KEY = 'bobby-leaderboard';

export interface PlayerRecord {
  name: string;
  wins: number;
  losses: number;
  totalGames: number;
  totalPosition: number;
}

export interface LeaderboardData {
  records: PlayerRecord[];
  lastUpdated: number;
}

export interface GameResult {
  playerName: string;
  isAI: boolean;
  finishPosition: number;
  totalPlayers: number;
}

export function loadLeaderboard(): LeaderboardData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { records: [], lastUpdated: Date.now() };
    return JSON.parse(raw) as LeaderboardData;
  } catch {
    return { records: [], lastUpdated: Date.now() };
  }
}

export function saveGameResults(results: GameResult[]): void {
  const data = loadLeaderboard();

  for (const result of results) {
    if (result.isAI) continue;

    const existing = data.records.find(r => r.name === result.playerName);
    if (existing) {
      existing.totalGames += 1;
      existing.wins += result.finishPosition === 1 ? 1 : 0;
      existing.losses += result.finishPosition === result.totalPlayers ? 1 : 0;
      existing.totalPosition += result.finishPosition;
    } else {
      data.records.push({
        name: result.playerName,
        wins: result.finishPosition === 1 ? 1 : 0,
        losses: result.finishPosition === result.totalPlayers ? 1 : 0,
        totalGames: 1,
        totalPosition: result.finishPosition,
      });
    }
  }

  data.lastUpdated = Date.now();

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // storage full or unavailable
  }
}

export function clearLeaderboard(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // unavailable
  }
}

export function getWinRate(record: PlayerRecord): number {
  if (record.totalGames === 0) return 0;
  return Math.round((record.wins / record.totalGames) * 100);
}

export function getAvgPosition(record: PlayerRecord): string {
  if (record.totalGames === 0) return '—';
  return (record.totalPosition / record.totalGames).toFixed(1);
}

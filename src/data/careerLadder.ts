export interface BeltRank {
  id: string;
  name: string;
  minXp: number;
  color: string;
  badgeBg: string;
  badgeBorder: string;
  badgeText: string;
  iconEmoji: string;
  title: string;
}

export const BELT_RANKS: BeltRank[] = [
  {
    id: 'white',
    name: 'White Belt',
    minXp: 0,
    color: '#f8fafc',
    badgeBg: 'bg-slate-100/10',
    badgeBorder: 'border-slate-300/40',
    badgeText: 'text-slate-200',
    iconEmoji: '⚪',
    title: 'Novice Stick Handler',
  },
  {
    id: 'yellow',
    name: 'Yellow Belt',
    minXp: 600,
    color: '#eab308',
    badgeBg: 'bg-yellow-950/50',
    badgeBorder: 'border-yellow-500/50',
    badgeText: 'text-yellow-300',
    iconEmoji: '🟡',
    title: 'Rhythm Apprentice',
  },
  {
    id: 'green',
    name: 'Green Belt',
    minXp: 1800,
    color: '#22c55e',
    badgeBg: 'bg-emerald-950/50',
    badgeBorder: 'border-emerald-500/50',
    badgeText: 'text-emerald-300',
    iconEmoji: '🟢',
    title: 'Groove Keeper',
  },
  {
    id: 'blue',
    name: 'Blue Belt',
    minXp: 4000,
    color: '#3b82f6',
    badgeBg: 'bg-blue-950/50',
    badgeBorder: 'border-blue-500/50',
    badgeText: 'text-blue-300',
    iconEmoji: '🔵',
    title: 'Rudiment Master',
  },
  {
    id: 'red',
    name: 'Red Belt',
    minXp: 8000,
    color: '#ef4444',
    badgeBg: 'bg-red-950/50',
    badgeBorder: 'border-red-500/50',
    badgeText: 'text-red-300',
    iconEmoji: '🔴',
    title: 'Speed Demon',
  },
  {
    id: 'black',
    name: 'Black Belt',
    minXp: 14000,
    color: '#a855f7',
    badgeBg: 'bg-purple-950/60',
    badgeBorder: 'border-purple-400/60',
    badgeText: 'text-purple-300',
    iconEmoji: '⚫',
    title: 'Virtuoso Drummer',
  },
];

export function getRankFromXp(xp: number): { currentRank: BeltRank; nextRank: BeltRank | null; progressPercent: number } {
  let currentRankIndex = 0;
  for (let i = 0; i < BELT_RANKS.length; i++) {
    if (xp >= BELT_RANKS[i].minXp) {
      currentRankIndex = i;
    }
  }

  const currentRank = BELT_RANKS[currentRankIndex];
  const nextRank = currentRankIndex < BELT_RANKS.length - 1 ? BELT_RANKS[currentRankIndex + 1] : null;

  let progressPercent = 100;
  if (nextRank) {
    const range = nextRank.minXp - currentRank.minXp;
    const gained = xp - currentRank.minXp;
    progressPercent = Math.min(100, Math.max(0, Math.round((gained / range) * 100)));
  }

  return { currentRank, nextRank, progressPercent };
}

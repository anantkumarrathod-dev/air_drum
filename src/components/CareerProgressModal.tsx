import React from 'react';
import { BELT_RANKS, getRankFromXp } from '../data/careerLadder';
import { Trophy, Award, Zap, Target, Flame, X } from 'lucide-react';

interface CareerProgressModalProps {
  xp: number;
  streak: number;
  maxStreak: number;
  totalHits: number;
  accuracy: number;
  isOpen: boolean;
  onClose: () => void;
}

export const CareerProgressModal: React.FC<CareerProgressModalProps> = ({
  xp,
  streak,
  maxStreak,
  totalHits,
  accuracy,
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  const { currentRank, nextRank, progressPercent } = getRankFromXp(xp);

  const achievements = [
    { title: 'First Sticking Hit', desc: 'Landed your first note on the highway', unlocked: totalHits >= 1, icon: '🥢' },
    { title: 'Centurion Streak', desc: 'Maintained a 25+ note combo', unlocked: maxStreak >= 25, icon: '🔥' },
    { title: 'Groove Machine', desc: 'Achieved 90%+ timing accuracy', unlocked: accuracy >= 90 && totalHits >= 30, icon: '🎯' },
    { title: 'Speed Titan', desc: 'Reached 1500+ XP in practice drills', unlocked: xp >= 1500, icon: '⚡' },
    { title: 'Polyrhythm Virtuoso', desc: 'Reached Black Belt Rank (14k XP)', unlocked: xp >= 14000, icon: '👑' },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-150">
      <div className="w-full max-w-xl bg-gradient-to-b from-slate-900 via-[#0e1628] to-[#070b14] border border-slate-700/80 rounded-2xl p-4 sm:p-6 shadow-2xl flex flex-col gap-4 max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-400 to-orange-500 p-0.5 flex items-center justify-center shadow-[0_0_12px_rgba(251,191,36,0.4)]">
              <div className="w-full h-full bg-[#0b1020] rounded-[10px] flex items-center justify-center">
                <Trophy className="w-4 h-4 text-amber-400" />
              </div>
            </div>
            <div>
              <h2 className="font-display font-black text-sm sm:text-base text-white tracking-wide">
                DRUMMER CAREER & BELT MASTERY
              </h2>
              <p className="text-[11px] text-slate-400 font-mono-code">
                Level up by hitting notes in tempo & completing workout bars
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Current Belt Card */}
        <div className={`p-4 rounded-xl border ${currentRank.badgeBorder} ${currentRank.badgeBg} flex flex-col gap-3 shadow-lg`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-3xl">{currentRank.iconEmoji}</span>
              <div>
                <div className="flex items-center gap-2">
                  <span className={`font-display font-black text-base sm:text-lg ${currentRank.badgeText}`}>
                    {currentRank.name.toUpperCase()}
                  </span>
                  <span className="text-[10px] font-mono-code px-2 py-0.5 rounded bg-black/50 border border-white/10 text-white font-bold">
                    {xp.toLocaleString()} XP
                  </span>
                </div>
                <p className="text-xs text-slate-300 font-mono-code">{currentRank.title}</p>
              </div>
            </div>

            <div className="text-right">
              <span className="text-[10px] font-mono-code text-slate-400 block">NEXT BELT</span>
              <span className="font-display font-bold text-xs text-slate-200">
                {nextRank ? `${nextRank.iconEmoji} ${nextRank.name}` : 'MAX RANK (VIRTUOSO)'}
              </span>
            </div>
          </div>

          {/* XP Progress Bar */}
          <div className="flex flex-col gap-1">
            <div className="w-full h-2.5 bg-black/60 rounded-full border border-white/10 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-400 via-amber-400 to-orange-500 rounded-full transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[10px] font-mono-code text-slate-400">
              <span>Current: {xp} XP</span>
              <span>{nextRank ? `${nextRank.minXp - xp} XP to ${nextRank.name}` : 'Belt Completed'}</span>
            </div>
          </div>
        </div>

        {/* Live Practice Stats Grid */}
        <div className="grid grid-cols-3 gap-2">
          <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-col items-center text-center">
            <Target className="w-4 h-4 text-cyan-400 mb-1" />
            <span className="text-[10px] font-mono-code text-slate-400">ACCURACY</span>
            <span className="font-display font-black text-sm text-cyan-300">{accuracy}%</span>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-col items-center text-center">
            <Flame className="w-4 h-4 text-orange-400 mb-1" />
            <span className="text-[10px] font-mono-code text-slate-400">STREAK (CURRENT / MAX)</span>
            <span className="font-display font-black text-sm text-orange-300">{streak} / {maxStreak}</span>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-col items-center text-center">
            <Zap className="w-4 h-4 text-amber-400 mb-1" />
            <span className="text-[10px] font-mono-code text-slate-400">TOTAL HITS</span>
            <span className="font-display font-black text-sm text-amber-300">{totalHits}</span>
          </div>
        </div>

        {/* Belt Tier Ladder Showcase */}
        <div>
          <span className="text-[11px] font-mono-code font-bold text-slate-400 mb-2 block">
            🥋 6-STAGE BELT RANKING LADDER:
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            {BELT_RANKS.map((b) => {
              const isAchieved = xp >= b.minXp;
              return (
                <div
                  key={b.id}
                  className={`p-2 rounded-lg border text-left transition-all ${
                    isAchieved
                      ? 'bg-slate-900/90 border-slate-700 text-white'
                      : 'bg-slate-950/40 border-slate-800/60 opacity-50 text-slate-500'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm">{b.iconEmoji}</span>
                    <span className="font-display font-bold text-xs">{b.name}</span>
                  </div>
                  <span className="text-[9px] font-mono-code block mt-0.5 text-slate-400">
                    {b.minXp} XP {isAchieved ? '✓' : ''}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Achievements Showcase */}
        <div>
          <span className="text-[11px] font-mono-code font-bold text-slate-400 mb-2 block">
            🏆 MILESTONE TROPHIES:
          </span>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {achievements.map((ach) => (
              <div
                key={ach.title}
                className={`p-2 rounded-xl border flex items-center gap-2.5 transition-all ${
                  ach.unlocked
                    ? 'bg-gradient-to-r from-amber-950/30 to-slate-900 border-amber-500/40 text-slate-200'
                    : 'bg-slate-950/40 border-slate-800/60 opacity-50 text-slate-500'
                }`}
              >
                <span className="text-xl shrink-0">{ach.icon}</span>
                <div className="flex flex-col min-w-0">
                  <span className="font-display font-bold text-xs truncate flex items-center gap-1">
                    {ach.title} {ach.unlocked && <Award className="w-3 h-3 text-amber-400 inline shrink-0" />}
                  </span>
                  <span className="text-[10px] font-mono-code text-slate-400 line-clamp-1">{ach.desc}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-black font-display font-black text-xs tracking-wider transition-colors shadow-[0_0_15px_rgba(0,229,255,0.4)]"
        >
          CONTINUE DRUMMING
        </button>
      </div>
    </div>
  );
};

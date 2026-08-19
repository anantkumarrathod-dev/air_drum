import React, { useState } from 'react';
import { Handedness, SpeedTrainerConfig, AccessibilityConfig, PracticeStats } from '../types/drum';
import { 
  RotateCcw, 
  Zap, 
  Sliders, 
  Activity, 
  RefreshCw,
  Plus,
  Minus,
  Clock,
  Tv
} from 'lucide-react';

interface PracticeHUDProps {
  isPlaying: boolean;
  isCountingDown: boolean;
  onTogglePlay: () => void;
  onReset: () => void;
  bpm: number;
  onBpmChange: (bpm: number) => void;
  handedness: Handedness;
  onToggleHandedness: () => void;
  invertHands: boolean;
  onToggleInvertHands: () => void;
  isPracticeMode: boolean;
  onTogglePracticeMode: () => void;
  speedTrainer: SpeedTrainerConfig;
  onUpdateSpeedTrainer: (config: Partial<SpeedTrainerConfig>) => void;
  accessibility: AccessibilityConfig;
  onUpdateAccessibility: (config: Partial<AccessibilityConfig>) => void;
  stats: PracticeStats;
  onResetStats: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  autoFullscreenOnStart: boolean;
  onToggleAutoFullscreen: (val: boolean) => void;
  bufferCountdownEnabled: boolean;
  onToggleBufferCountdown: (val: boolean) => void;
}

export const PracticeHUD: React.FC<PracticeHUDProps> = ({
  onReset,
  bpm,
  onBpmChange,
  handedness,
  onToggleHandedness,
  onToggleInvertHands,
  isPracticeMode,
  onTogglePracticeMode,
  speedTrainer,
  onUpdateSpeedTrainer,
  stats,
  onResetStats,
  autoFullscreenOnStart,
  onToggleAutoFullscreen,
  bufferCountdownEnabled,
  onToggleBufferCountdown,
}) => {
  const [tapTimes, setTapTimes] = useState<number[]>([]);

  const handleTapTempo = () => {
    const now = performance.now();
    const newTapTimes = [...tapTimes.slice(-4), now];
    setTapTimes(newTapTimes);

    if (newTapTimes.length > 1) {
      let totalDiff = 0;
      for (let i = 1; i < newTapTimes.length; i++) {
        totalDiff += newTapTimes[i] - newTapTimes[i - 1];
      }
      const avgDiff = totalDiff / (newTapTimes.length - 1);
      const calculatedBpm = Math.round(60000 / avgDiff);
      if (calculatedBpm >= 30 && calculatedBpm <= 240) {
        onBpmChange(calculatedBpm);
      }
    }
  };

  const handleAdjustBpm = (delta: number) => {
    onBpmChange(Math.max(30, Math.min(240, bpm + delta)));
  };

  return (
    <div className="flex flex-col gap-2.5 rounded-xl bg-gradient-to-r from-slate-900 via-[#12192c] to-slate-900 border border-slate-800 p-3 shadow-xl overflow-hidden text-xs">
      {/* Top Controls Row */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
        <div className="flex items-center gap-1.5">
          <button
            onClick={onReset}
            className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-mono-code font-bold transition-all"
            title="Reset to Step 0"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset Position</span>
          </button>

          {/* Mode Switcher */}
          <div className="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800">
            <button
              onClick={() => isPracticeMode && onTogglePracticeMode()}
              className={`px-2.5 py-1 rounded text-[11px] font-display font-bold transition-all ${
                !isPracticeMode
                  ? 'bg-cyan-500 text-black shadow-[0_0_8px_#00E5FF]'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              WATCH MODE
            </button>
            <button
              onClick={() => !isPracticeMode && onTogglePracticeMode()}
              className={`px-2.5 py-1 rounded text-[11px] font-display font-bold flex items-center gap-1 transition-all ${
                isPracticeMode
                  ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-black shadow-[0_0_8px_#FF6D00]'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Activity className="w-3 h-3" />
              HIT MODE
            </button>
          </div>
        </div>

        {/* Handedness Switch & Swap */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={onToggleHandedness}
            className={`px-2.5 py-1 rounded text-[11px] font-mono-code font-bold border transition-all ${
              handedness === 'RIGHT_HANDED'
                ? 'bg-orange-950/40 border-orange-500/50 text-orange-300'
                : 'bg-purple-950/40 border-purple-500/50 text-purple-300'
            }`}
          >
            {handedness === 'RIGHT_HANDED' ? 'Right-Handed' : 'Left-Handed'}
          </button>

          <button
            onClick={onToggleInvertHands}
            className="flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-[11px] font-mono-code transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Swap Hands</span>
          </button>
        </div>
      </div>

      {/* Tempo & Speed Trainer Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 bg-slate-950/60 p-2.5 rounded-lg border border-slate-800 items-center">
        {/* Left: BPM Slider & Tweak Buttons */}
        <div className="flex flex-col gap-1 md:col-span-2">
          <div className="flex items-center justify-between">
            <span className="font-display font-bold text-slate-300 flex items-center gap-1">
              <Sliders className="w-3.5 h-3.5 text-cyan-400" />
              TEMPO SLIDER:
            </span>
            <div className="flex items-center gap-1 font-mono-code font-bold text-cyan-400">
              <span className="text-base text-white">{bpm}</span>
              <span className="text-[10px] text-slate-400">BPM</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleAdjustBpm(-5)}
              className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
            >
              <Minus className="w-3 h-3" />
            </button>

            <input
              type="range"
              min="30"
              max="240"
              value={bpm}
              onChange={(e) => onBpmChange(Number(e.target.value))}
              className="w-full accent-cyan-400 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
            />

            <button
              onClick={() => handleAdjustBpm(5)}
              className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
            >
              <Plus className="w-3 h-3" />
            </button>

            <button
              onClick={handleTapTempo}
              className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 text-[10px] font-mono-code font-bold active:scale-95 transition-all whitespace-nowrap"
            >
              TAP TEMPO
            </button>
          </div>
        </div>

        {/* Right: Speed Trainer & Buffer Toggles */}
        <div className="flex flex-col gap-1 border-t md:border-t-0 md:border-l border-slate-800 pt-1.5 md:pt-0 md:pl-3">
          <div className="flex items-center justify-between">
            <span className="font-display font-bold text-amber-300 flex items-center gap-1 text-[11px]">
              <Zap className="w-3 h-3" />
              SPEED TRAINER:
            </span>
            <input
              type="checkbox"
              checked={speedTrainer.enabled}
              onChange={(e) => onUpdateSpeedTrainer({ enabled: e.target.checked })}
              className="w-3.5 h-3.5 accent-amber-500 cursor-pointer"
            />
          </div>

          <div className="flex items-center gap-3 pt-0.5 text-[10px] text-slate-400">
            <label className="flex items-center gap-1 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={bufferCountdownEnabled}
                onChange={(e) => onToggleBufferCountdown(e.target.checked)}
                className="accent-cyan-400 cursor-pointer"
              />
              <Clock className="w-3 h-3 text-cyan-400" />
              <span>5s Buffer</span>
            </label>

            <label className="flex items-center gap-1 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoFullscreenOnStart}
                onChange={(e) => onToggleAutoFullscreen(e.target.checked)}
                className="accent-indigo-400 cursor-pointer"
              />
              <Tv className="w-3 h-3 text-indigo-400" />
              <span>Auto Fullscreen</span>
            </label>
          </div>
        </div>
      </div>

      {/* Real-Time Practice Stats */}
      {isPracticeMode && (
        <div className="grid grid-cols-5 gap-1.5 bg-slate-950/80 p-2 rounded-lg border border-amber-500/30 items-center text-center">
          <div className="flex flex-col">
            <span className="text-[9px] font-mono-code text-slate-400">ACCURACY</span>
            <span className="font-display font-black text-sm text-emerald-400">
              {stats.accuracyPercentage}%
            </span>
          </div>

          <div className="flex flex-col">
            <span className="text-[9px] font-mono-code text-slate-400">PERFECT</span>
            <span className="font-display font-black text-sm text-cyan-400">
              {stats.perfect}
            </span>
          </div>

          <div className="flex flex-col">
            <span className="text-[9px] font-mono-code text-slate-400">EARLY/LATE</span>
            <span className="font-display font-black text-sm text-amber-400">
              {stats.early + stats.late}
            </span>
          </div>

          <div className="flex flex-col">
            <span className="text-[9px] font-mono-code text-slate-400">STREAK</span>
            <span className="font-display font-black text-sm text-orange-400">
              {stats.maxStreak} 🔥
            </span>
          </div>

          <div className="flex items-center justify-center">
            <button
              onClick={onResetStats}
              className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-mono-code border border-slate-700"
            >
              Reset
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

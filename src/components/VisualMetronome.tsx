import React from 'react';

interface VisualMetronomeProps {
  currentStep: number;
  totalSteps: number;
  bpm: number;
  isPlaying: boolean;
  currentBar: number;
  barsUntilIncrement?: number;
}

export const VisualMetronome: React.FC<VisualMetronomeProps> = ({
  currentStep,
  totalSteps,
  isPlaying,
  currentBar,
}) => {
  const stepsPerBeat = totalSteps === 24 ? 6 : 4;
  const currentBeat = Math.floor(currentStep / stepsPerBeat) % 4; // 0, 1, 2, 3
  const subIdx = currentStep % 4;
  const subLabels = ['1', 'e', '&', 'a'];
  const isBeatOne = currentBeat === 0;

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border transition-all duration-75 select-none shadow-sm ${
        isPlaying
          ? isBeatOne
            ? 'bg-amber-950/70 border-amber-400 shadow-[0_0_10px_rgba(255,215,0,0.5)]'
            : 'bg-cyan-950/70 border-cyan-400 shadow-[0_0_8px_rgba(0,229,255,0.4)]'
          : 'bg-slate-900/90 border-slate-800'
      }`}
    >
      {/* Beat Pulse Dot */}
      <div
        className={`w-2 h-2 rounded-full transition-all ${
          isPlaying
            ? isBeatOne
              ? 'bg-amber-400 shadow-[0_0_6px_#FFD700] scale-125'
              : 'bg-cyan-400 shadow-[0_0_6px_#00E5FF] scale-110'
            : 'bg-slate-600'
        }`}
      />

      {/* Main Beat Text */}
      <span className="font-display font-black text-[11px] text-white tracking-wide">
        BEAT {currentBeat + 1}
      </span>

      <span className="text-slate-600 text-[10px]">•</span>

      {/* 1 - e - & - a Subdivision Pill String */}
      <div className="flex items-center gap-0.5 font-mono-code text-[10px] font-bold">
        {subLabels.map((sub, i) => {
          const isSubActive = isPlaying && subIdx === i;
          return (
            <span
              key={sub}
              className={`px-1 py-0.2 rounded transition-all ${
                isSubActive
                  ? isBeatOne
                    ? 'bg-amber-400 text-black font-black shadow-[0_0_6px_#FFD700]'
                    : 'bg-cyan-400 text-black font-black shadow-[0_0_6px_#00E5FF]'
                  : 'text-slate-500'
              }`}
            >
              {sub}
            </span>
          );
        })}
      </div>

      <span className="text-slate-600 text-[10px]">•</span>

      {/* Bar Number */}
      <span className="text-[9px] font-mono-code text-slate-400">
        BAR #{currentBar}
      </span>
    </div>
  );
};

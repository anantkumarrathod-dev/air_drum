import React, { useState } from 'react';
import { HitFeedbackEvent } from '../types/drum';
import { audioEngine } from '../services/audioEngine';
import { Mic, MicOff, RefreshCw, BarChart2 } from 'lucide-react';

interface TimingScatterPlotProps {
  hitHistory: HitFeedbackEvent[];
  onClearHistory: () => void;
}

export const TimingScatterPlot: React.FC<TimingScatterPlotProps> = ({
  hitHistory,
  onClearHistory,
}) => {
  const [isRecording, setIsRecording] = useState<boolean>(false);

  const handleToggleRecord = () => {
    if (!isRecording) {
      const started = audioEngine.startRecording();
      if (started) setIsRecording(true);
    } else {
      audioEngine.stopRecordingAndDownload(`drum_practice_take_${Date.now()}.webm`);
      setIsRecording(false);
    }
  };

  // Compute Rush / Drag averages
  const recent30Hits = hitHistory.slice(-30);
  const leftHits = recent30Hits.filter((h) => h.hand === 'LEFT');
  const rightHits = recent30Hits.filter((h) => h.hand === 'RIGHT');

  const avgLeftOffset = leftHits.length > 0
    ? Math.round(leftHits.reduce((acc, h) => acc + h.offsetMs, 0) / leftHits.length)
    : 0;

  const avgRightOffset = rightHits.length > 0
    ? Math.round(rightHits.reduce((acc, h) => acc + h.offsetMs, 0) / rightHits.length)
    : 0;

  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-gradient-to-b from-slate-900 via-[#0e1628] to-[#090f1d] border border-slate-800 p-4 shadow-xl">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-2.5">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-indigo-950 border border-indigo-500/40 text-indigo-400">
            <BarChart2 className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-display font-black text-sm text-white flex items-center gap-2">
              RUSH / DRAG TIMING SCATTER & AUDIO RECORDER
            </h3>
            <p className="text-[11px] font-mono-code text-slate-400">
              Live millisecond offset analytics per hand & session audio take recorder
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Audio Take Recorder Button */}
          <button
            onClick={handleToggleRecord}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-display font-bold transition-all shadow-md ${
              isRecording
                ? 'bg-red-600 hover:bg-red-500 text-white animate-pulse shadow-[0_0_15px_#EF4444]'
                : 'bg-indigo-600/40 hover:bg-indigo-600/60 text-indigo-200 border border-indigo-500/40'
            }`}
          >
            {isRecording ? (
              <>
                <MicOff className="w-3.5 h-3.5" />
                <span>STOP & SAVE TAKE</span>
              </>
            ) : (
              <>
                <Mic className="w-3.5 h-3.5" />
                <span>RECORD AUDIO TAKE</span>
              </>
            )}
          </button>

          {hitHistory.length > 0 && (
            <button
              onClick={onClearHistory}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
              title="Clear Scatter History"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Average Tendency Cards */}
      <div className="grid grid-cols-2 gap-3 text-xs font-mono-code">
        <div className="flex items-center justify-between p-2.5 rounded-xl bg-cyan-950/40 border border-cyan-500/40 text-cyan-200">
          <span>LEFT STICK TENDENCY:</span>
          <strong className={`font-black text-sm ${avgLeftOffset > 10 ? 'text-amber-400' : avgLeftOffset < -10 ? 'text-yellow-400' : 'text-emerald-400'}`}>
            {avgLeftOffset > 0 ? `+${avgLeftOffset}ms (Dragging)` : avgLeftOffset < 0 ? `${avgLeftOffset}ms (Rushing)` : '0ms (Locked)'}
          </strong>
        </div>

        <div className="flex items-center justify-between p-2.5 rounded-xl bg-orange-950/40 border border-orange-500/40 text-orange-200">
          <span>RIGHT STICK TENDENCY:</span>
          <strong className={`font-black text-sm ${avgRightOffset > 10 ? 'text-amber-400' : avgRightOffset < -10 ? 'text-yellow-400' : 'text-emerald-400'}`}>
            {avgRightOffset > 0 ? `+${avgRightOffset}ms (Dragging)` : avgRightOffset < 0 ? `${avgRightOffset}ms (Rushing)` : '0ms (Locked)'}
          </strong>
        </div>
      </div>

      {/* Timing Drift Visual Scatter Plot */}
      <div className="relative w-full h-32 bg-[#070b16] rounded-xl border border-slate-800 overflow-hidden flex flex-col justify-between p-2">
        {/* Zero Center Line (Perfect Hit Line) */}
        <div className="absolute top-1/2 left-0 right-0 h-px bg-emerald-500/50 shadow-[0_0_6px_#10B981]" />
        
        {/* Early Line (-50ms) */}
        <div className="absolute top-1/4 left-0 right-0 h-px bg-yellow-500/20 border-dashed" />
        <span className="absolute top-2 left-2 text-[9px] font-mono-code text-yellow-400/70">-50ms (Rushing / Early)</span>

        {/* Late Line (+50ms) */}
        <div className="absolute top-3/4 left-0 right-0 h-px bg-amber-500/20 border-dashed" />
        <span className="absolute bottom-2 left-2 text-[9px] font-mono-code text-amber-400/70">+50ms (Dragging / Late)</span>

        <span className="absolute top-1/2 right-2 -translate-y-1/2 text-[9px] font-mono-code text-emerald-400 font-bold">PERFECT (0ms)</span>

        {/* Scatter Hit Dots */}
        <div className="relative w-full h-full">
          {recent30Hits.map((hit, idx) => {
            const xPercent = (idx / Math.max(1, recent30Hits.length - 1)) * 90 + 5;
            const clampedOffset = Math.max(-100, Math.min(100, hit.offsetMs));
            const yPercent = 50 + (clampedOffset / 100) * 40;

            return (
              <div
                key={hit.id}
                style={{
                  left: `${xPercent}%`,
                  top: `${yPercent}%`,
                  backgroundColor: hit.hand === 'RIGHT' ? '#FF6D00' : '#00E5FF',
                  boxShadow: hit.hand === 'RIGHT' ? '0 0 8px #FF6D00' : '0 0 8px #00E5FF',
                }}
                className="absolute w-2.5 h-2.5 rounded-full -translate-x-1/2 -translate-y-1/2 transition-all duration-150 animate-in fade-in"
                title={`${hit.hand} Hand: ${hit.offsetMs > 0 ? '+' : ''}${hit.offsetMs}ms (${hit.rating})`}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
};

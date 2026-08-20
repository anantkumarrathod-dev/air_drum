import React, { useEffect, useState } from 'react';
import { DrumInstrumentId, Handedness, Hand } from '../types/drum';
import { Maximize2, Minimize2, Play, Square, RefreshCw, Drum } from 'lucide-react';

interface DrumKitVisualizerProps {
  activeHits: { instrument: DrumInstrumentId; hand: Hand; timestamp: number }[];
  handedness: Handedness;
  invertHands: boolean;
  onPadClick?: (instrument: DrumInstrumentId) => void;
  isPlaying?: boolean;
  onTogglePlay?: () => void;
  bpm?: number;
  patternTitle?: string;
  currentBeat?: number;
  onToggleHandedness?: () => void;
  onToggleInvertHands?: () => void;
}

export const DrumKitVisualizer: React.FC<DrumKitVisualizerProps> = ({
  activeHits,
  handedness,
  onPadClick,
  isPlaying = false,
  onTogglePlay,
  bpm = 95,
  patternTitle = 'Rock 8th-Beat',
  currentBeat = 0,
  onToggleHandedness,
  onToggleInvertHands,
}) => {
  const [activeInstMap, setActiveInstMap] = useState<Record<string, { hand: Hand; timestamp: number }>>({});
  const [isKitSoloFullscreen, setIsKitSoloFullscreen] = useState<boolean>(false);

  useEffect(() => {
    if (activeHits.length > 0) {
      const newMap: Record<string, { hand: Hand; timestamp: number }> = {};
      const now = Date.now();
      activeHits.forEach((hit) => {
        if (now - hit.timestamp < 400) {
          newMap[hit.instrument] = { hand: hit.hand, timestamp: hit.timestamp };
        }
      });
      setActiveInstMap(newMap);
    }
  }, [activeHits]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isKitSoloFullscreen) {
        setIsKitSoloFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isKitSoloFullscreen]);

  const isLefty = handedness === 'LEFT_HANDED';

  // Helper to render realistic 3D-styled cymbals
  const renderRealisticCymbal = (
    id: DrumInstrumentId,
    label: string,
    baseDiameter: number,
    scaleMultiplier: number = 1.0
  ) => {
    const activeInfo = activeInstMap[id];
    const isHit = Boolean(activeInfo && Date.now() - activeInfo.timestamp < 320);
    const diameter = Math.round(baseDiameter * scaleMultiplier);

    return (
      <div className="flex flex-col items-center gap-1">
        <button
          onClick={() => onPadClick && onPadClick(id)}
          style={{ width: `${diameter}px`, height: `${diameter}px` }}
          className={`relative rounded-full select-none cursor-pointer transition-all duration-75 flex items-center justify-center ${
            isHit
              ? 'scale-105 rotate-3 shadow-[0_0_40px_rgba(255,215,0,0.95)]'
              : 'hover:scale-[1.03] shadow-[0_6px_20px_rgba(0,0,0,0.7)]'
          }`}
          title={label}
        >
          {/* Lathed Bronze Radial Gradient */}
          <div
            className="absolute inset-0 rounded-full border-2 border-amber-600/80 ring-1 ring-amber-500/30 transition-all"
            style={{
              background: isHit
                ? 'radial-gradient(circle, #fef08a 0%, #facc15 25%, #d97706 70%, #78350f 100%)'
                : 'radial-gradient(circle, #fde047 0%, #eab308 30%, #ca8a04 65%, #854d0e 90%, #451a03 100%)',
              boxShadow: 'inset 0 0 12px rgba(0,0,0,0.6)',
            }}
          >
            <div className="absolute inset-1.5 rounded-full border border-amber-950/25 pointer-events-none" />
            <div className="absolute inset-3.5 rounded-full border border-amber-950/20 pointer-events-none" />
            <div className="absolute inset-5 rounded-full border border-amber-950/15 pointer-events-none" />
            <div className="absolute inset-0 rounded-full bg-gradient-to-tr from-transparent via-white/15 to-transparent pointer-events-none" />

            {/* Hammered Bell */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-gradient-to-br from-yellow-100 via-amber-400 to-amber-800 border border-amber-950/60 shadow-[0_2px_4px_rgba(0,0,0,0.5)] flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-slate-900 border border-slate-600" />
            </div>
          </div>

          {/* Stick Impact Ripple */}
          {isHit && (
            <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full animate-ping pointer-events-none opacity-80 bg-amber-400" />
          )}
        </button>

        {/* Clean Instrument Name Badge */}
        <span className="text-[9px] font-mono-code font-bold px-2 py-0.2 rounded-full shadow border border-slate-700/80 bg-slate-900/90 text-slate-200">
          {label}
        </span>
      </div>
    );
  };

  // Helper to render realistic Acoustic Drums
  const renderRealisticDrum = (
    id: DrumInstrumentId,
    label: string,
    baseDiameter: number,
    scaleMultiplier: number = 1.0,
    options?: {
      isBass?: boolean;
      isSnare?: boolean;
      isFloorTom?: boolean;
    }
  ) => {
    const activeInfo = activeInstMap[id];
    const isHit = Boolean(activeInfo && Date.now() - activeInfo.timestamp < 300);
    const diameter = Math.round(baseDiameter * scaleMultiplier);

    return (
      <div className="flex flex-col items-center gap-1">
        <button
          onClick={() => onPadClick && onPadClick(id)}
          style={{ width: `${diameter}px`, height: `${diameter}px` }}
          className={`relative rounded-full select-none cursor-pointer transition-all duration-75 flex items-center justify-center ${
            isHit
              ? 'scale-105 shadow-[0_0_35px_rgba(255,255,255,0.95)]'
              : 'hover:scale-[1.02] shadow-[0_8px_24px_rgba(0,0,0,0.85)]'
          }`}
          title={label}
        >
          {/* Chrome Hoop & Rim */}
          <div
            className="absolute inset-0 rounded-full border-[3px] border-slate-500 ring-1 ring-slate-400/40 bg-[#1e293b] transition-colors"
            style={{
              boxShadow: isHit
                ? '0 0 30px rgba(255,255,255,0.8)'
                : 'inset 0 2px 4px rgba(255,255,255,0.3), 0 4px 10px rgba(0,0,0,0.8)',
            }}
          >
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1.5 h-2.5 bg-gradient-to-b from-slate-200 to-slate-400 rounded-sm shadow-sm" />
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1.5 h-2.5 bg-gradient-to-t from-slate-200 to-slate-400 rounded-sm shadow-sm" />
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-2.5 h-1.5 bg-gradient-to-r from-slate-200 to-slate-400 rounded-sm shadow-sm" />
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2.5 h-1.5 bg-gradient-to-l from-slate-200 to-slate-400 rounded-sm shadow-sm" />
          </div>

          {/* Drumhead Surface */}
          <div
            className={`absolute inset-2 rounded-full transition-all flex flex-col items-center justify-center overflow-hidden ${
              options?.isBass
                ? isHit
                  ? 'bg-gradient-to-b from-slate-800 to-slate-900 border-2 border-amber-400'
                  : 'bg-gradient-to-b from-[#0f172a] to-[#020617] border border-slate-700'
                : options?.isSnare
                ? isHit
                  ? 'bg-gradient-to-b from-white via-slate-100 to-slate-200 border-2 border-cyan-400'
                  : 'bg-gradient-to-b from-slate-100 via-slate-200 to-slate-300 border border-slate-400'
                : isHit
                ? 'bg-gradient-to-b from-slate-800 via-slate-900 to-black border-2 border-cyan-400'
                : 'bg-gradient-to-b from-slate-900 to-[#0f172a] border border-slate-700'
            }`}
          >
            <div className="absolute inset-1.5 rounded-full border border-black/10 pointer-events-none" />
            <div className="absolute inset-3.5 rounded-full border border-black/5 pointer-events-none" />

            {/* Center Brand Dot */}
            <div
              className={`w-5 h-5 rounded-full border flex items-center justify-center ${
                options?.isSnare
                  ? 'bg-slate-300/60 border-slate-400'
                  : options?.isBass
                  ? 'bg-amber-600/30 border-amber-500/50'
                  : 'bg-white/10 border-white/20'
              }`}
            >
              {options?.isBass ? (
                <div className="w-2.5 h-2.5 rounded-full bg-amber-500 shadow-[0_0_6px_#FFD700]" />
              ) : options?.isSnare ? (
                <div className="w-2 h-2 rounded-full bg-slate-500/50" />
              ) : null}
            </div>

            {/* Impact Ripple */}
            {isHit && (
              <div className="absolute inset-0 rounded-full animate-ping pointer-events-none opacity-60 bg-white" />
            )}
          </div>
        </button>

        {/* Clean Instrument Name Badge */}
        <span className="text-[9px] font-mono-code font-bold px-2 py-0.2 rounded-full shadow border border-slate-700/80 bg-slate-900/90 text-slate-200">
          {label}
        </span>
      </div>
    );
  };

  // Dedicated Render Body for Kit Elements (Authentic Drummer's Cockpit Perspective with Lowest Bass Drum)
  const renderKitBody = (scale: number = 1.0, isFullscreenView: boolean = false) => (
    <div
      onContextMenu={(e) => e.preventDefault()}
      className={`relative w-full ${
        isFullscreenView
          ? 'max-w-5xl aspect-[16/10] sm:aspect-[16/9]'
          : 'max-w-[540px] aspect-[16/11] sm:aspect-[16/10]'
      } mx-auto select-none transition-transform duration-300 my-auto ${
        isLefty ? 'scale-x-[-1]' : ''
      }`}
    >
      {/* 1. Crash Cymbal (Top Left) */}
      <div className={`absolute top-[0%] left-[8%] -translate-x-1/2 z-20 ${isLefty ? 'scale-x-[-1]' : ''}`}>
        {renderRealisticCymbal('crash', 'CRASH', 80, scale)}
      </div>

      {/* 2. High Tom (Rack Tom 1 - Top Center-Left) */}
      <div className={`absolute top-[2%] left-[36%] -translate-x-1/2 z-10 ${isLefty ? 'scale-x-[-1]' : ''}`}>
        {renderRealisticDrum('high_tom', 'HIGH TOM', 68, scale)}
      </div>

      {/* 3. Mid Tom (Rack Tom 2 - Top Center-Right) */}
      <div className={`absolute top-[2%] left-[64%] -translate-x-1/2 z-10 ${isLefty ? 'scale-x-[-1]' : ''}`}>
        {renderRealisticDrum('mid_tom', 'MID TOM', 72, scale)}
      </div>

      {/* 4. Ride Cymbal (Top Right) */}
      <div className={`absolute top-[0%] left-[92%] -translate-x-1/2 z-20 ${isLefty ? 'scale-x-[-1]' : ''}`}>
        {renderRealisticCymbal('ride', 'RIDE', 86, scale)}
      </div>

      {/* 5. Hi-Hat (Mid-Left) */}
      <div className={`absolute top-[32%] left-[9%] -translate-x-1/2 z-20 flex flex-col items-center gap-0.5 ${isLefty ? 'scale-x-[-1]' : ''}`}>
        {renderRealisticCymbal('hihat_closed', 'HI-HAT', 74, scale)}
        <button
          onClick={() => onPadClick && onPadClick('hihat_open')}
          className="text-[8px] font-mono-code font-bold px-1.5 py-0.2 rounded bg-sky-950/80 hover:bg-sky-900 text-sky-300 border border-sky-500/40 transition-colors shadow-sm mt-0.5"
          title="Open Hi-Hat Strike"
        >
          Open Hat
        </button>
      </div>

      {/* 6. Snare Drum (Middle-Left) */}
      <div className={`absolute top-[34%] left-[32%] -translate-x-1/2 z-20 ${isLefty ? 'scale-x-[-1]' : ''}`}>
        {renderRealisticDrum('snare', 'SNARE', 82, scale, { isSnare: true })}
      </div>

      {/* 7. Floor Tom (Middle-Right) */}
      <div className={`absolute top-[34%] left-[72%] -translate-x-1/2 z-20 ${isLefty ? 'scale-x-[-1]' : ''}`}>
        {renderRealisticDrum('floor_tom', 'FLOOR TOM', 88, scale, { isFloorTom: true })}
      </div>

      {/* 8. Bass Drum / Kick (Lowest Bottom Center - Ergonomic for Thumb / Single Hand Play) */}
      <div className={`absolute top-[52%] left-[50%] -translate-x-1/2 z-10 ${isLefty ? 'scale-x-[-1]' : ''}`}>
        {renderRealisticDrum('bass', 'BASS DRUM', 106, scale, { isBass: true })}
      </div>
    </div>
  );

  return (
    <>
      {/* 1. DEDICATED FULLSCREEN DRUM KIT MODAL / SOLO STAGE OVERLAY */}
      {isKitSoloFullscreen && (
        <div
          onContextMenu={(e) => e.preventDefault()}
          className="fixed inset-0 z-50 bg-[#060a14] flex flex-col items-center justify-between p-4 sm:p-8 animate-in fade-in duration-150 overflow-y-auto"
        >
          {/* Top Stage Control Header */}
          <div className="w-full max-w-6xl flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-3 bg-slate-900/60 p-4 rounded-2xl backdrop-blur-md">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-amber-500 p-0.5 flex items-center justify-center">
                <div className="w-full h-full bg-[#0b1020] rounded-[10px] flex items-center justify-center">
                  <Drum className="w-5 h-5 text-cyan-400" />
                </div>
              </div>
              <div>
                <h2 className="font-display font-black text-lg text-white flex items-center gap-2">
                  FULLSCREEN DRUM KIT STAGE
                  <span className="text-[10px] font-mono-code px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/40">
                    LIVE STAGE
                  </span>
                </h2>
                <p className="text-xs font-mono-code text-slate-400">
                  {patternTitle} • {bpm} BPM
                </p>
              </div>
            </div>

            {/* Center Beat Pulse Circles in Fullscreen */}
            <div className="flex items-center gap-2">
              {[0, 1, 2, 3].map((b) => (
                <div
                  key={b}
                  className={`w-9 h-9 rounded-full flex items-center justify-center font-display font-bold text-sm transition-all ${
                    isPlaying && currentBeat === b
                      ? b === 0
                        ? 'bg-amber-400 text-black shadow-[0_0_15px_#FFD700] scale-110'
                        : 'bg-cyan-400 text-black shadow-[0_0_15px_#00E5FF] scale-110'
                      : 'bg-slate-800 text-slate-500'
                  }`}
                >
                  {b + 1}
                </div>
              ))}
            </div>

            {/* Actions: Play/Pause, Handedness, Exit Fullscreen */}
            <div className="flex items-center gap-2">
              {onTogglePlay && (
                <button
                  onClick={onTogglePlay}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-display font-bold transition-all ${
                    isPlaying
                      ? 'bg-amber-500 text-black shadow-[0_0_15px_#FFD700]'
                      : 'bg-emerald-500 text-black shadow-[0_0_15px_#10B981]'
                  }`}
                >
                  {isPlaying ? <Square className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
                  <span>{isPlaying ? 'PAUSE' : 'PLAY'}</span>
                </button>
              )}

              {onToggleHandedness && (
                <button
                  onClick={onToggleHandedness}
                  className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-mono-code"
                >
                  {isLefty ? 'Lefty Kit' : 'Righty Kit'}
                </button>
              )}

              {onToggleInvertHands && (
                <button
                  onClick={onToggleInvertHands}
                  className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                  title="Swap Hands"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              )}

              <button
                onClick={() => setIsKitSoloFullscreen(false)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-950/70 hover:bg-red-900 text-red-200 border border-red-500/40 text-xs font-display font-bold transition-colors"
              >
                <Minimize2 className="w-4 h-4" />
                <span>EXIT FULLSCREEN [ESC]</span>
              </button>
            </div>
          </div>

          {/* Massive Centered Realistic Drum Set */}
          <div className="my-auto py-8 w-full flex-1 flex items-center justify-center">
            {renderKitBody(1.75, true)}
          </div>
        </div>
      )}

      {/* 2. STANDARD IN-PAGE DRUM KIT CARD */}
      <div className="relative rounded-xl bg-gradient-to-b from-slate-900 via-[#0e1628] to-[#090f1d] border border-slate-800 p-2.5 sm:p-3 shadow-xl flex flex-col items-center justify-between overflow-hidden">
        {/* Header bar */}
        <div className="w-full flex items-center justify-between border-b border-slate-800/80 pb-1.5 mb-2">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_#10B981]" />
            <span className="font-display font-black text-xs text-white tracking-wide">
              ACOUSTIC DRUM KIT
            </span>
            <span className="text-[9px] font-mono-code px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 border border-slate-700">
              {isLefty ? 'LEFTY' : 'RIGHTY'}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setIsKitSoloFullscreen(true)}
              className="flex items-center gap-1 text-[10px] font-display font-bold px-2 py-0.5 rounded bg-cyan-600/30 hover:bg-cyan-600/50 text-cyan-200 border border-cyan-400/50 transition-all"
              title="Expand Drum Kit to Fullscreen Stage"
            >
              <Maximize2 className="w-3 h-3 text-cyan-400" />
              <span>STAGE</span>
            </button>
          </div>
        </div>

        {/* Drum Stage Layout */}
        {renderKitBody(1.0)}
      </div>
    </>
  );
};

import React, { useRef, useEffect, useState } from 'react';
import { BeatPattern, DrumInstrumentId, Hand, Handedness, HitFeedbackEvent } from '../types/drum';
import { DRUM_INSTRUMENTS, getInstrumentHand } from '../data/beatLibrary';

interface RhythmHighwayProps {
  pattern: BeatPattern;
  currentPlaybackTime: number; // In seconds within loop
  loopDuration: number; // In seconds
  isPlaying: boolean;
  handedness: Handedness;
  invertHands: boolean;
  recentHits: HitFeedbackEvent[];
  onManualHitPad?: (hand: Hand, instrument?: DrumInstrumentId) => void;
}

export const RhythmHighway: React.FC<RhythmHighwayProps> = ({
  pattern,
  currentPlaybackTime,
  loopDuration,
  isPlaying,
  handedness,
  invertHands,
  recentHits,
  onManualHitPad,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [activeLaneFlash, setActiveLaneFlash] = useState<{ [key in Hand]?: number }>({});

  const floorBassHand: Hand = handedness === 'RIGHT_HANDED' ? (!invertHands ? 'RIGHT' : 'LEFT') : (!invertHands ? 'LEFT' : 'RIGHT');
  const leftLaneHand: Hand = 'LEFT';
  const rightLaneHand: Hand = 'RIGHT';

  useEffect(() => {
    if (recentHits.length > 0) {
      const latest = recentHits[recentHits.length - 1];
      setActiveLaneFlash((prev) => ({ ...prev, [latest.hand]: Date.now() }));
    }
  }, [recentHits]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;

    const render = () => {
      const width = canvas.width;
      const height = canvas.height;

      // Dark studio grid canvas background
      ctx.fillStyle = '#070b14';
      ctx.fillRect(0, 0, width, height);

      const laneWidth = width / 2;
      const hitLineY = height - 70;
      const noteTravelTime = 2.0;

      // Subtle Perspective Vertical Grid Lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
      ctx.lineWidth = 1;
      for (let x = 40; x < width; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }

      // 1. Lane Glow Backgrounds
      ctx.fillStyle = 'rgba(0, 229, 255, 0.035)';
      ctx.fillRect(0, 0, laneWidth, height);

      ctx.fillStyle = 'rgba(255, 109, 0, 0.035)';
      ctx.fillRect(laneWidth, 0, laneWidth, height);

      // Center Divider Track
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 8]);
      ctx.beginPath();
      ctx.moveTo(laneWidth, 0);
      ctx.lineTo(laneWidth, height);
      ctx.stroke();
      ctx.setLineDash([]);

      // Lane Hit Flash Feedback
      const now = Date.now();
      if (activeLaneFlash.LEFT && now - activeLaneFlash.LEFT < 220) {
        ctx.fillStyle = 'rgba(0, 229, 255, 0.18)';
        ctx.fillRect(0, 0, laneWidth, height);
      }
      if (activeLaneFlash.RIGHT && now - activeLaneFlash.RIGHT < 220) {
        ctx.fillStyle = 'rgba(255, 109, 0, 0.18)';
        ctx.fillRect(laneWidth, 0, laneWidth, height);
      }

      // 2. Timing Window & Hit Bar
      ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.fillRect(0, hitLineY - 14, width, 28);

      // Main Strike Line with Glow
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3.5;
      ctx.shadowColor = '#ffffff';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.moveTo(0, hitLineY);
      ctx.lineTo(width, hitLineY);
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Target Pads
      const padW = laneWidth - 36;
      const padH = 42;

      // Left Target Pad
      ctx.fillStyle = leftLaneHand === floorBassHand ? 'rgba(255, 109, 0, 0.25)' : 'rgba(0, 229, 255, 0.25)';
      ctx.strokeStyle = leftLaneHand === floorBassHand ? '#FF6D00' : '#00E5FF';
      ctx.lineWidth = 2;
      ctx.roundRect(18, hitLineY - padH / 2, padW, padH, 10);
      ctx.fill();
      ctx.stroke();

      // Right Target Pad
      ctx.fillStyle = rightLaneHand === floorBassHand ? 'rgba(255, 109, 0, 0.25)' : 'rgba(0, 229, 255, 0.25)';
      ctx.strokeStyle = rightLaneHand === floorBassHand ? '#FF6D00' : '#00E5FF';
      ctx.lineWidth = 2;
      ctx.roundRect(laneWidth + 18, hitLineY - padH / 2, padW, padH, 10);
      ctx.fill();
      ctx.stroke();

      // Target Pad Labels
      ctx.font = 'bold 12px "JetBrains Mono", monospace';
      ctx.fillStyle = leftLaneHand === floorBassHand ? '#FFB74D' : '#80DEEA';
      ctx.textAlign = 'center';
      ctx.fillText(
        leftLaneHand === floorBassHand ? '✦ LEFT: FLOOR & BASS' : '✦ LEFT: SNARE & CYMBALS',
        laneWidth / 2,
        hitLineY + 5
      );

      ctx.fillStyle = rightLaneHand === floorBassHand ? '#FFB74D' : '#80DEEA';
      ctx.fillText(
        rightLaneHand === floorBassHand ? '✦ RIGHT: FLOOR & BASS' : '✦ RIGHT: SNARE & CYMBALS',
        laneWidth + laneWidth / 2,
        hitLineY + 5
      );

      // 3. Falling Notes
      if (loopDuration > 0) {
        const stepDuration = loopDuration / pattern.totalSteps;

        [-1, 0, 1].forEach((loopOffset) => {
          pattern.notes.forEach((note) => {
            const noteHand = getInstrumentHand(note.instrument, handedness, invertHands);
            const isLeftLane = noteHand === 'LEFT';
            const instDef = DRUM_INSTRUMENTS[note.instrument];

            const noteTargetTime = (note.step * stepDuration) + (loopOffset * loopDuration);
            const timeUntilHit = noteTargetTime - currentPlaybackTime;

            if (timeUntilHit >= -0.2 && timeUntilHit <= noteTravelTime) {
              const progress = 1 - (timeUntilHit / noteTravelTime);
              const noteY = progress * hitLineY;

              const noteX = isLeftLane ? 26 : laneWidth + 26;
              const noteW = padW - 16;
              const noteH = 34;

              const isFloorBassInst = note.instrument === 'bass' || note.instrument === 'floor_tom';
              const glowColor = isFloorBassInst ? 'rgba(255, 109, 0, 0.7)' : 'rgba(0, 229, 255, 0.7)';

              ctx.shadowColor = glowColor;
              ctx.shadowBlur = 14;
              ctx.fillStyle = isFloorBassInst
                ? 'linear-gradient(180deg, #ff9100 0%, #e65100 100%)'
                : 'linear-gradient(180deg, #00e5ff 0%, #0097a7 100%)';
              
              ctx.fillStyle = isFloorBassInst ? '#ff6d00' : '#00e5ff';
              ctx.roundRect(noteX, noteY - noteH / 2, noteW, noteH, 8);
              ctx.fill();

              ctx.strokeStyle = '#ffffff';
              ctx.lineWidth = 1.5;
              ctx.stroke();
              ctx.shadowBlur = 0;

              // Note Text
              ctx.fillStyle = '#000000';
              ctx.font = 'bold 12px "Chakra Petch", sans-serif';
              ctx.textAlign = 'left';
              ctx.fillText(`${instDef.shortName}`, noteX + 12, noteY + 4);

              ctx.textAlign = 'right';
              ctx.font = 'bold 11px "JetBrains Mono", monospace';
              const beatNum = Math.floor(note.step / 4) + 1;
              const subStr = ['1', 'e', '&', 'a'][note.step % 4];
              ctx.fillText(`[${beatNum}${subStr !== '1' ? subStr : ''}]`, noteX + noteW - 12, noteY + 4);
            }
          });
        });
      }

      // 4. Hit Splashes
      recentHits.slice(-4).forEach((hit) => {
        const age = (Date.now() - hit.timestamp) / 1000;
        if (age < 0.6) {
          const alpha = Math.max(0, 1 - age / 0.6);
          const isLeft = hit.hand === 'LEFT';
          const splashX = isLeft ? laneWidth / 2 : laneWidth + laneWidth / 2;
          const splashY = hitLineY - 38 - age * 32;

          ctx.save();
          ctx.globalAlpha = alpha;
          ctx.textAlign = 'center';

          let ratingColor = '#00E676';
          if (hit.rating === 'EARLY') ratingColor = '#FFD600';
          if (hit.rating === 'LATE') ratingColor = '#FF9100';
          if (hit.rating === 'MISS') ratingColor = '#FF1744';

          ctx.fillStyle = ratingColor;
          ctx.font = 'bold 18px "Chakra Petch", sans-serif';
          ctx.shadowColor = ratingColor;
          ctx.shadowBlur = 12;
          ctx.fillText(hit.rating, splashX, splashY);

          if (hit.offsetMs !== 0) {
            ctx.font = 'bold 11px "JetBrains Mono", monospace';
            ctx.fillStyle = '#ffffff';
            ctx.fillText(`${hit.offsetMs > 0 ? '+' : ''}${hit.offsetMs}ms`, splashX, splashY + 16);
          }

          ctx.restore();
        }
      });

      if (isPlaying) {
        animId = requestAnimationFrame(render);
      }
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [pattern, currentPlaybackTime, loopDuration, isPlaying, handedness, invertHands, recentHits, activeLaneFlash, floorBassHand, leftLaneHand, rightLaneHand]);

  return (
    <div className="relative flex flex-col rounded-2xl bg-gradient-to-b from-slate-900 via-[#0d1424] to-[#070b16] border border-slate-800 p-4 shadow-2xl overflow-hidden">
      {/* Top Lane Header */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        {/* Left Lane Card */}
        <div
          className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl border transition-colors ${
            leftLaneHand === floorBassHand
              ? 'bg-orange-950/40 border-orange-500/40 text-orange-300 shadow-[0_0_12px_rgba(255,109,0,0.15)]'
              : 'bg-cyan-950/40 border-cyan-500/40 text-cyan-300 shadow-[0_0_12px_rgba(0,229,255,0.15)]'
          }`}
        >
          <div className="flex items-center gap-2">
            <div
              className={`w-3.5 h-3.5 rounded-full ${
                leftLaneHand === floorBassHand ? 'bg-orange-500 shadow-[0_0_8px_#FF6D00]' : 'bg-cyan-400 shadow-[0_0_8px_#00E5FF]'
              }`}
            />
            <span className="font-display font-black text-xs sm:text-sm tracking-wide">LEFT STICK LANE</span>
          </div>
          <span className="text-[11px] font-mono-code bg-black/60 px-2 py-0.5 rounded border border-white/10 text-white font-bold">
            {leftLaneHand === floorBassHand ? 'FLOOR & BASS' : 'REST OF KIT'}
          </span>
        </div>

        {/* Right Lane Card */}
        <div
          className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl border transition-colors ${
            rightLaneHand === floorBassHand
              ? 'bg-orange-950/40 border-orange-500/40 text-orange-300 shadow-[0_0_12px_rgba(255,109,0,0.15)]'
              : 'bg-cyan-950/40 border-cyan-500/40 text-cyan-300 shadow-[0_0_12px_rgba(0,229,255,0.15)]'
          }`}
        >
          <div className="flex items-center gap-2">
            <div
              className={`w-3.5 h-3.5 rounded-full ${
                rightLaneHand === floorBassHand ? 'bg-orange-500 shadow-[0_0_8px_#FF6D00]' : 'bg-cyan-400 shadow-[0_0_8px_#00E5FF]'
              }`}
            />
            <span className="font-display font-black text-xs sm:text-sm tracking-wide">RIGHT STICK LANE</span>
          </div>
          <span className="text-[11px] font-mono-code bg-black/60 px-2 py-0.5 rounded border border-white/10 text-white font-bold">
            {rightLaneHand === floorBassHand ? 'FLOOR & BASS' : 'REST OF KIT'}
          </span>
        </div>
      </div>

      {/* Waterfall Canvas */}
      <div className="relative w-full aspect-[16/10] max-h-[300px] rounded-xl overflow-hidden border border-slate-800 bg-[#070b14] shadow-inner">
        <canvas
          ref={canvasRef}
          width={640}
          height={380}
          className="w-full h-full object-fill block"
        />
      </div>

      {/* Interactive Touch / Click Pads */}
      <div className="grid grid-cols-2 gap-2 mt-2">
        <button
          onClick={() => onManualHitPad && onManualHitPad('LEFT')}
          className={`flex flex-col items-center justify-center py-2.5 rounded-xl border-2 active:scale-95 transition-all shadow-md select-none ${
            leftLaneHand === floorBassHand
              ? 'bg-gradient-to-b from-orange-600/30 to-orange-950/70 border-orange-500 text-orange-200 hover:bg-orange-600/40'
              : 'bg-gradient-to-b from-cyan-600/30 to-cyan-950/70 border-cyan-500 text-cyan-200 hover:bg-cyan-600/40'
          }`}
        >
          <span className="font-display font-black text-xs sm:text-sm">LEFT STRIKE [D / F]</span>
        </button>

        <button
          onClick={() => onManualHitPad && onManualHitPad('RIGHT')}
          className={`flex flex-col items-center justify-center py-2.5 rounded-xl border-2 active:scale-95 transition-all shadow-md select-none ${
            rightLaneHand === floorBassHand
              ? 'bg-gradient-to-b from-orange-600/30 to-orange-950/70 border-orange-500 text-orange-200 hover:bg-orange-600/40'
              : 'bg-gradient-to-b from-cyan-600/30 to-cyan-950/70 border-cyan-500 text-cyan-200 hover:bg-cyan-600/40'
          }`}
        >
          <span className="font-display font-black text-xs sm:text-sm">RIGHT STRIKE [J / K]</span>
        </button>
      </div>
    </div>
  );
};

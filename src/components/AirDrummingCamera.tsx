import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Hand, Handedness } from '../types/drum';
import { Camera, CameraOff, Video, Sliders, Hand as HandIcon, Zap, AlertCircle } from 'lucide-react';

interface AirDrummingCameraProps {
  onAirStrike: (hand: Hand) => void;
  handedness?: Handedness;
  invertHands?: boolean;
}

export const AirDrummingCamera: React.FC<AirDrummingCameraProps> = ({
  onAirStrike,
  handedness = 'RIGHT_HANDED',
  invertHands = false,
}) => {
  const [isActive, setIsActive] = useState<boolean>(false);
  const [trackingMode, setTrackingMode] = useState<'fingers' | 'sticks'>('fingers');
  const [sensitivity, setSensitivity] = useState<number>(40);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [fps, setFps] = useState<number>(0);
  const [leftMotionLevel, setLeftMotionLevel] = useState<number>(0);
  const [rightMotionLevel, setRightMotionLevel] = useState<number>(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const procCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Determine drum assignments for Left & Right zones
  const isFloorBassRight = handedness === 'RIGHT_HANDED' ? !invertHands : invertHands;

  const leftZoneConfig = {
    color: isFloorBassRight ? '#00E5FF' : '#FF6D00',
    colorName: isFloorBassRight ? 'CYAN' : 'ORANGE',
    bgClass: isFloorBassRight ? 'bg-cyan-950/40 border-cyan-500/50 text-cyan-200' : 'bg-orange-950/40 border-orange-500/50 text-orange-200',
    barColorClass: isFloorBassRight ? 'bg-cyan-400' : 'bg-orange-500',
    textAccentClass: isFloorBassRight ? 'text-cyan-300' : 'text-orange-300',
    drumParts: isFloorBassRight ? 'SNARE • HI-HAT • CYMBALS • TOMS' : 'FLOOR TOM • BASS DRUM (KICK)',
    shortDrums: isFloorBassRight ? ['SNARE', 'HI-HAT', 'CYMBALS', 'TOMS'] : ['FLOOR TOM', 'BASS DRUM'],
  };

  const rightZoneConfig = {
    color: isFloorBassRight ? '#FF6D00' : '#00E5FF',
    colorName: isFloorBassRight ? 'ORANGE' : 'CYAN',
    bgClass: isFloorBassRight ? 'bg-orange-950/40 border-orange-500/50 text-orange-200' : 'bg-cyan-950/40 border-cyan-500/50 text-cyan-200',
    barColorClass: isFloorBassRight ? 'bg-orange-500' : 'bg-cyan-400',
    textAccentClass: isFloorBassRight ? 'text-orange-300' : 'text-cyan-300',
    drumParts: isFloorBassRight ? 'FLOOR TOM • BASS DRUM (KICK)' : 'SNARE • HI-HAT • CYMBALS • TOMS',
    shortDrums: isFloorBassRight ? ['FLOOR TOM', 'BASS DRUM'] : ['SNARE', 'HI-HAT', 'CYMBALS', 'TOMS'],
  };

  // Optical flow / motion history
  const prevFrameDataRef = useRef<Uint8ClampedArray | null>(null);
  const lastStrikeTimeRef = useRef<{ LEFT: number; RIGHT: number }>({ LEFT: 0, RIGHT: 0 });
  const [activeZoneFlash, setActiveZoneFlash] = useState<{ LEFT: boolean; RIGHT: boolean }>({ LEFT: false, RIGHT: false });

  const triggerStrike = useCallback((hand: Hand) => {
    const now = performance.now();
    if (now - lastStrikeTimeRef.current[hand] < 180) return; // 180ms debounce
    lastStrikeTimeRef.current[hand] = now;

    setActiveZoneFlash((prev) => ({ ...prev, [hand]: true }));
    setTimeout(() => {
      setActiveZoneFlash((prev) => ({ ...prev, [hand]: false }));
    }, 180);

    onAirStrike(hand);
  }, [onAirStrike]);

  const startCamera = async () => {
    try {
      setCameraError(null);
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera access is not supported on this device/browser.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
        videoRef.current.playsInline = true;
        await videoRef.current.play();
      }
      setIsActive(true);
    } catch (err: unknown) {
      console.error('Camera access error:', err);
      const msg = err instanceof Error ? err.message : 'Camera access denied or unavailable.';
      setCameraError(msg);
      setIsActive(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsActive(false);
    prevFrameDataRef.current = null;
    setFps(0);
    setLeftMotionLevel(0);
    setRightMotionLevel(0);
  };

  // Motion processing loop
  useEffect(() => {
    if (!isActive) return;

    let animId: number;
    let frameCount = 0;
    let lastFpsCalcTime = performance.now();

    if (!procCanvasRef.current) {
      procCanvasRef.current = document.createElement('canvas');
      procCanvasRef.current.width = 160;
      procCanvasRef.current.height = 120;
    }

    const processMotion = () => {
      const video = videoRef.current;
      const overlayCanvas = overlayCanvasRef.current;
      const procCanvas = procCanvasRef.current;

      if (!video || !overlayCanvas || !procCanvas || video.readyState < 2) {
        animId = requestAnimationFrame(processMotion);
        return;
      }

      frameCount++;
      const now = performance.now();
      if (now - lastFpsCalcTime >= 1000) {
        setFps(frameCount);
        frameCount = 0;
        lastFpsCalcTime = now;
      }

      // 1. Process Downscaled Frame for Motion
      const pCtx = procCanvas.getContext('2d', { willReadFrequently: true });
      if (pCtx) {
        pCtx.drawImage(video, 0, 0, 160, 120);
        const frame = pCtx.getImageData(0, 0, 160, 120);
        const data = frame.data;

        if (prevFrameDataRef.current && prevFrameDataRef.current.length === data.length) {
          const prev = prevFrameDataRef.current;
          const midX = 80;
          const targetMinY = Math.floor(120 * 0.25);
          const targetMaxY = Math.floor(120 * 0.95);

          let leftMotionSum = 0;
          let rightMotionSum = 0;

          for (let y = targetMinY; y < targetMaxY; y += 2) {
            for (let x = 0; x < 160; x += 2) {
              const i = (y * 160 + x) * 4;
              const diff = Math.abs(data[i] - prev[i]) +
                           Math.abs(data[i + 1] - prev[i + 1]) +
                           Math.abs(data[i + 2] - prev[i + 2]);

              if (diff > 50) {
                // Since the video is mirrored (scale-x-[-1]), user's left hand is on left side of camera
                if (x < midX) {
                  leftMotionSum += diff;
                } else {
                  rightMotionSum += diff;
                }
              }
            }
          }

          // Sensitivity threshold
          const thresholdMultiplier = trackingMode === 'fingers' ? 0.75 : 1.0;
          const threshold = (100 - sensitivity) * 120 * thresholdMultiplier;

          const leftNorm = Math.min(100, Math.round((leftMotionSum / (threshold * 1.5)) * 100));
          const rightNorm = Math.min(100, Math.round((rightMotionSum / (threshold * 1.5)) * 100));

          setLeftMotionLevel(leftNorm);
          setRightMotionLevel(rightNorm);

          if (leftMotionSum > threshold) {
            triggerStrike('LEFT');
          }
          if (rightMotionSum > threshold) {
            triggerStrike('RIGHT');
          }
        }

        prevFrameDataRef.current = new Uint8ClampedArray(data);
      }

      // 2. Render Overlay HUD onto Transparent Canvas with Color-Coded Drum Part Zones
      const oCtx = overlayCanvas.getContext('2d');
      if (oCtx) {
        const w = overlayCanvas.width;
        const h = overlayCanvas.height;
        oCtx.clearRect(0, 0, w, h);

        const padW = w * 0.44;
        const padH = h * 0.65;
        const padY = h * 0.28;

        // Left Strike Zone (Color Coded)
        const leftX = w * 0.04;
        oCtx.save();
        oCtx.strokeStyle = activeZoneFlash.LEFT ? '#FFFFFF' : leftZoneConfig.color;
        oCtx.lineWidth = activeZoneFlash.LEFT ? 6 : 3;
        oCtx.fillStyle = activeZoneFlash.LEFT ? `${leftZoneConfig.color}66` : `${leftZoneConfig.color}1F`;
        oCtx.beginPath();
        oCtx.roundRect(leftX, padY, padW, padH, 16);
        oCtx.fill();
        oCtx.stroke();

        // Left Zone Header
        oCtx.fillStyle = leftZoneConfig.color;
        oCtx.font = 'bold 15px "Montserrat", sans-serif';
        oCtx.fillText('LEFT AIR ZONE', leftX + 14, padY + 26);

        // Drum Part Names
        oCtx.fillStyle = '#FFFFFF';
        oCtx.font = 'bold 13px "Montserrat", sans-serif';
        oCtx.fillText(leftZoneConfig.drumParts, leftX + 14, padY + 50);

        // Strike Action
        oCtx.fillStyle = leftZoneConfig.color;
        oCtx.font = '11px monospace';
        oCtx.fillText(
          trackingMode === 'fingers' ? '👉 HIT WITH INDEX FINGER' : '🥢 HIT WITH DRUMSTICK',
          leftX + 14,
          padY + 74
        );
        oCtx.restore();

        // Right Strike Zone (Color Coded)
        const rightX = w * 0.52;
        oCtx.save();
        oCtx.strokeStyle = activeZoneFlash.RIGHT ? '#FFFFFF' : rightZoneConfig.color;
        oCtx.lineWidth = activeZoneFlash.RIGHT ? 6 : 3;
        oCtx.fillStyle = activeZoneFlash.RIGHT ? `${rightZoneConfig.color}66` : `${rightZoneConfig.color}1F`;
        oCtx.beginPath();
        oCtx.roundRect(rightX, padY, padW, padH, 16);
        oCtx.fill();
        oCtx.stroke();

        // Right Zone Header
        oCtx.fillStyle = rightZoneConfig.color;
        oCtx.font = 'bold 15px "Montserrat", sans-serif';
        oCtx.fillText('RIGHT AIR ZONE', rightX + 14, padY + 26);

        // Drum Part Names
        oCtx.fillStyle = '#FFFFFF';
        oCtx.font = 'bold 13px "Montserrat", sans-serif';
        oCtx.fillText(rightZoneConfig.drumParts, rightX + 14, padY + 50);

        // Strike Action
        oCtx.fillStyle = rightZoneConfig.color;
        oCtx.font = '11px monospace';
        oCtx.fillText(
          trackingMode === 'fingers' ? '👉 HIT WITH INDEX FINGER' : '🥢 HIT WITH DRUMSTICK',
          rightX + 14,
          padY + 74
        );
        oCtx.restore();
      }

      animId = requestAnimationFrame(processMotion);
    };

    animId = requestAnimationFrame(processMotion);

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [isActive, sensitivity, trackingMode, triggerStrike, activeZoneFlash, leftZoneConfig, rightZoneConfig]);

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-gradient-to-b from-slate-900 via-[#0e1628] to-[#070b14] border border-slate-800 p-3 shadow-xl overflow-hidden">
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded-lg bg-emerald-950 border border-emerald-500/30 text-emerald-400">
            <Camera className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-display font-black text-xs sm:text-sm text-white flex items-center gap-2">
              AIR DRUMMING
              {isActive && (
                <span className="text-[10px] font-mono-code px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/40">
                  ● {fps} FPS
                </span>
              )}
            </h3>
            <p className="text-[10px] font-mono-code text-slate-400">
              Motion-tracked visual strike zones for drumsticks & index fingers
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {isActive ? (
            <button
              onClick={stopCamera}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-950/80 hover:bg-red-900 text-red-200 border border-red-500/40 text-xs font-mono-code font-bold transition-colors"
            >
              <CameraOff className="w-3.5 h-3.5" />
              <span>Turn Off</span>
            </button>
          ) : (
            <button
              onClick={startCamera}
              className="flex items-center gap-1 px-3 py-1 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-display font-black shadow-[0_0_12px_rgba(16,185,129,0.4)] transition-all"
            >
              <Video className="w-3.5 h-3.5" />
              <span>START AIR DRUMMING</span>
            </button>
          )}
        </div>
      </div>

      {cameraError && (
        <div className="p-2 rounded-lg bg-red-950/70 border border-red-500/50 text-red-200 text-[11px] font-mono-code flex items-start gap-2">
          <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
          <div className="flex flex-col">
            <strong>Camera Permission Required:</strong>
            <span>Please allow camera access when prompted by your browser to use Air Drumming.</span>
          </div>
        </div>
      )}

      {/* Viewport */}
      {isActive ? (
        <div className="flex flex-col gap-2">
          {/* Live Video with Canvas Overlay */}
          <div className="relative w-full aspect-[16/9] max-h-[240px] rounded-lg overflow-hidden border-2 border-slate-700 bg-black flex items-center justify-center shadow-lg">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover transform scale-x-[-1]"
            />

            <canvas
              ref={overlayCanvasRef}
              width={640}
              height={360}
              className="absolute inset-0 w-full h-full object-cover pointer-events-none"
            />
          </div>

          {/* Color-Coded Drum Part Zone Cards with Motion Gauges */}
          <div className="grid grid-cols-2 gap-2 text-[11px] font-mono-code">
            {/* Left Zone Card */}
            <div className={`flex flex-col gap-1 p-2 rounded-lg border ${leftZoneConfig.bgClass}`}>
              <div className="flex items-center justify-between">
                <span className="font-bold flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: leftZoneConfig.color }} />
                  LEFT ZONE
                </span>
                <span className="font-black">{leftMotionLevel}%</span>
              </div>
              <div className="font-display font-bold text-xs text-white truncate">
                {leftZoneConfig.drumParts}
              </div>
              <div className="w-full h-1.5 rounded-full bg-slate-900 overflow-hidden mt-0.5">
                <div
                  className={`h-full ${leftZoneConfig.barColorClass} transition-all duration-75`}
                  style={{ width: `${leftMotionLevel}%` }}
                />
              </div>
            </div>

            {/* Right Zone Card */}
            <div className={`flex flex-col gap-1 p-2 rounded-lg border ${rightZoneConfig.bgClass}`}>
              <div className="flex items-center justify-between">
                <span className="font-bold flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: rightZoneConfig.color }} />
                  RIGHT ZONE
                </span>
                <span className="font-black">{rightMotionLevel}%</span>
              </div>
              <div className="font-display font-bold text-xs text-white truncate">
                {rightZoneConfig.drumParts}
              </div>
              <div className="w-full h-1.5 rounded-full bg-slate-900 overflow-hidden mt-0.5">
                <div
                  className={`h-full ${rightZoneConfig.barColorClass} transition-all duration-75`}
                  style={{ width: `${rightMotionLevel}%` }}
                />
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-slate-950/80 p-2 rounded-lg border border-slate-800 text-xs">
            {/* Tracking Mode Switcher */}
            <div className="flex flex-col gap-1">
              <span className="font-mono-code font-bold text-slate-300 flex items-center gap-1 text-[11px]">
                <HandIcon className="w-3 h-3 text-cyan-400" />
                STRIKE TRACKING TYPE:
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setTrackingMode('fingers')}
                  className={`flex-1 py-1 rounded font-display font-bold text-[11px] transition-all ${
                    trackingMode === 'fingers'
                      ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-black shadow-[0_0_8px_#00E5FF]'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  👉 INDEX FINGERS
                </button>
                <button
                  onClick={() => setTrackingMode('sticks')}
                  className={`flex-1 py-1 rounded font-display font-bold text-[11px] transition-all ${
                    trackingMode === 'sticks'
                      ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-black shadow-[0_0_8px_#FF6D00]'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  🥢 DRUMSTICKS
                </button>
              </div>
            </div>

            {/* Motion Sensitivity Slider */}
            <div className="flex flex-col gap-1">
              <div className="flex justify-between font-mono-code text-slate-300 text-[11px]">
                <span className="flex items-center gap-1">
                  <Sliders className="w-3 h-3 text-amber-400" />
                  SENSITIVITY:
                </span>
                <span className="text-cyan-400 font-bold">{sensitivity}%</span>
              </div>
              <input
                type="range"
                min="15"
                max="75"
                value={sensitivity}
                onChange={(e) => setSensitivity(Number(e.target.value))}
                className="w-full accent-cyan-400 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
              />
            </div>
          </div>

          {/* Quick Manual Test Buttons */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => triggerStrike('LEFT')}
              className={`py-1.5 px-2 rounded-lg font-mono-code font-bold text-[11px] flex items-center justify-center gap-1 transition-colors border ${
                isFloorBassRight
                  ? 'bg-cyan-950 hover:bg-cyan-900 border-cyan-500/40 text-cyan-200'
                  : 'bg-orange-950 hover:bg-orange-900 border-orange-500/40 text-orange-200'
              }`}
            >
              <Zap className="w-3 h-3" />
              <span>Test Left Air Strike</span>
            </button>
            <button
              onClick={() => triggerStrike('RIGHT')}
              className={`py-1.5 px-2 rounded-lg font-mono-code font-bold text-[11px] flex items-center justify-center gap-1 transition-colors border ${
                isFloorBassRight
                  ? 'bg-orange-950 hover:bg-orange-900 border-orange-500/40 text-orange-200'
                  : 'bg-cyan-950 hover:bg-cyan-900 border-cyan-500/40 text-cyan-200'
              }`}
            >
              <Zap className="w-3 h-3" />
              <span>Test Right Air Strike</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2 p-3 rounded-lg bg-slate-950/60 border border-slate-800 text-xs font-mono-code text-slate-300">
          <div className="flex items-center gap-1.5 text-amber-300 font-bold">
            <Video className="w-3.5 h-3.5 text-amber-400" />
            <span>Air Drumming Sensor Ready</span>
          </div>
          <p className="text-[11px] text-slate-400">
            Click <strong className="text-emerald-400">"START AIR DRUMMING"</strong> to activate camera tracking. You will see two color-coded zones:
          </p>
          <div className="grid grid-cols-2 gap-2 mt-1">
            <div className={`p-2 rounded border ${leftZoneConfig.bgClass}`}>
              <div className="font-bold flex items-center gap-1">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: leftZoneConfig.color }} />
                LEFT ZONE:
              </div>
              <div className="text-white font-bold text-[11px]">{leftZoneConfig.drumParts}</div>
              <div className="text-[10px] opacity-75 mt-0.5">👉 Index Finger or 🥢 Left Stick</div>
            </div>
            <div className={`p-2 rounded border ${rightZoneConfig.bgClass}`}>
              <div className="font-bold flex items-center gap-1">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: rightZoneConfig.color }} />
                RIGHT ZONE:
              </div>
              <div className="text-white font-bold text-[11px]">{rightZoneConfig.drumParts}</div>
              <div className="text-[10px] opacity-75 mt-0.5">👉 Index Finger or 🥢 Right Stick</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

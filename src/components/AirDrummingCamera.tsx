import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Hand, Handedness } from '../types/drum';
import { Camera, CameraOff, Video, Sliders, Hand as HandIcon, Zap, AlertCircle, Sparkles, RefreshCw } from 'lucide-react';

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
  const [isStarting, setIsStarting] = useState<boolean>(false);
  const [trackingMode, setTrackingMode] = useState<'fingers' | 'sticks'>('fingers');
  const [sensitivity, setSensitivity] = useState<number>(65); // High responsiveness
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [fps, setFps] = useState<number>(0);
  const [leftMotionLevel, setLeftMotionLevel] = useState<number>(0);
  const [rightMotionLevel, setRightMotionLevel] = useState<number>(0);
  const [leftHitCount, setLeftHitCount] = useState<number>(0);
  const [rightHitCount, setRightHitCount] = useState<number>(0);
  const [cameraResolution, setCameraResolution] = useState<string>('');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mainCanvasRef = useRef<HTMLCanvasElement | null>(null);
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
  };

  const rightZoneConfig = {
    color: isFloorBassRight ? '#FF6D00' : '#00E5FF',
    colorName: isFloorBassRight ? 'ORANGE' : 'CYAN',
    bgClass: isFloorBassRight ? 'bg-orange-950/40 border-orange-500/50 text-orange-200' : 'bg-cyan-950/40 border-cyan-500/50 text-cyan-200',
    barColorClass: isFloorBassRight ? 'bg-orange-500' : 'bg-cyan-400',
    textAccentClass: isFloorBassRight ? 'text-orange-300' : 'text-cyan-300',
    drumParts: isFloorBassRight ? 'FLOOR TOM • BASS DRUM (KICK)' : 'SNARE • HI-HAT • CYMBALS • TOMS',
  };

  // Optical flow / motion history
  const prevFrameDataRef = useRef<Uint8ClampedArray | null>(null);
  const lastStrikeTimeRef = useRef<{ LEFT: number; RIGHT: number }>({ LEFT: 0, RIGHT: 0 });
  const [activeZoneFlash, setActiveZoneFlash] = useState<{ LEFT: boolean; RIGHT: boolean }>({ LEFT: false, RIGHT: false });

  const triggerStrike = useCallback((hand: Hand) => {
    const now = performance.now();
    if (now - lastStrikeTimeRef.current[hand] < 160) return; // 160ms debounce for natural drumming rate
    lastStrikeTimeRef.current[hand] = now;

    if (hand === 'LEFT') {
      setLeftHitCount((c) => c + 1);
    } else {
      setRightHitCount((c) => c + 1);
    }

    setActiveZoneFlash((prev) => ({ ...prev, [hand]: true }));
    setTimeout(() => {
      setActiveZoneFlash((prev) => ({ ...prev, [hand]: false }));
    }, 180);

    onAirStrike(hand);
  }, [onAirStrike]);

  const startCamera = async () => {
    try {
      setCameraError(null);
      setIsStarting(true);

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera access is not supported by your browser or requires HTTPS.');
      }

      // 1. Acquire Camera Stream with progressive fallback
      let stream: MediaStream | null = null;
      const constraintsList: MediaStreamConstraints[] = [
        {
          video: {
            width: { ideal: 640 },
            height: { ideal: 480 },
            facingMode: 'user',
          },
          audio: false,
        },
        {
          video: { facingMode: 'user' },
          audio: false,
        },
        {
          video: true,
          audio: false,
        },
      ];

      for (const constraints of constraintsList) {
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraints);
          if (stream) break;
        } catch {
          // Try next fallback
        }
      }

      if (!stream) {
        throw new Error('Unable to access camera. Please check your browser camera permissions.');
      }

      streamRef.current = stream;

      // 2. Attach Stream to Hidden Video Element
      let video = videoRef.current;
      if (!video) {
        video = document.createElement('video');
        video.setAttribute('playsinline', 'true');
        video.setAttribute('webkit-playsinline', 'true');
        video.muted = true;
        video.autoplay = true;
        videoRef.current = video;
      }

      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;

      // Wait for video to begin receiving frames
      await new Promise<void>((resolve) => {
        if (!video) return resolve();
        video.onloadedmetadata = async () => {
          try {
            await video?.play();
            if (video) {
              setCameraResolution(`${video.videoWidth}x${video.videoHeight}`);
            }
          } catch (e) {
            console.warn('Video play error:', e);
          }
          resolve();
        };

        // Fallback timeout
        setTimeout(async () => {
          try {
            await video?.play();
            if (video && video.videoWidth > 0) {
              setCameraResolution(`${video.videoWidth}x${video.videoHeight}`);
            }
          } catch {}
          resolve();
        }, 500);
      });

      setIsActive(true);
      setIsStarting(false);
    } catch (err: unknown) {
      console.error('Camera access error:', err);
      const msg = err instanceof Error ? err.message : 'Camera access denied or unavailable.';
      setCameraError(msg);
      setIsActive(false);
      setIsStarting(false);
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
    setIsStarting(false);
    prevFrameDataRef.current = null;
    setFps(0);
    setLeftMotionLevel(0);
    setRightMotionLevel(0);
    setCameraResolution('');
  };

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // Main Unified Canvas Render & Motion Loop
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

    const renderAndDetect = () => {
      const video = videoRef.current;
      const mainCanvas = mainCanvasRef.current;
      const procCanvas = procCanvasRef.current;

      if (!mainCanvas || !procCanvas) {
        animId = requestAnimationFrame(renderAndDetect);
        return;
      }

      const mCtx = mainCanvas.getContext('2d');
      if (!mCtx) {
        animId = requestAnimationFrame(renderAndDetect);
        return;
      }

      const w = mainCanvas.width;
      const h = mainCanvas.height;

      // 1. Calculate FPS
      frameCount++;
      const now = performance.now();
      if (now - lastFpsCalcTime >= 1000) {
        setFps(frameCount);
        frameCount = 0;
        lastFpsCalcTime = now;
      }

      // 2. Draw Camera Video directly onto Main Canvas (Mirrored)
      if (video && video.readyState >= 2 && video.videoWidth > 0) {
        mCtx.save();
        mCtx.translate(w, 0);
        mCtx.scale(-1, 1);
        mCtx.drawImage(video, 0, 0, w, h);
        mCtx.restore();

        // 3. Downscale to Process Canvas for Optical Flow
        const pCtx = procCanvas.getContext('2d', { willReadFrequently: true });
        if (pCtx) {
          pCtx.drawImage(video, 0, 0, 160, 120);
          const frame = pCtx.getImageData(0, 0, 160, 120);
          const data = frame.data;

          if (prevFrameDataRef.current && prevFrameDataRef.current.length === data.length) {
            const prev = prevFrameDataRef.current;
            const midX = 80;
            const targetMinY = Math.floor(120 * 0.18);
            const targetMaxY = Math.floor(120 * 0.95);

            let leftMotionSum = 0;
            let rightMotionSum = 0;

            for (let y = targetMinY; y < targetMaxY; y += 2) {
              for (let x = 0; x < 160; x += 2) {
                const i = (y * 160 + x) * 4;
                const diff = Math.abs(data[i] - prev[i]) +
                             Math.abs(data[i + 1] - prev[i + 1]) +
                             Math.abs(data[i + 2] - prev[i + 2]);

                if (diff > 25) {
                  // In mirrored view, user's left hand is on left side of camera frame
                  if (x < midX) {
                    leftMotionSum += diff;
                  } else {
                    rightMotionSum += diff;
                  }
                }
              }
            }

            // Sensitivity threshold
            const thresholdMultiplier = trackingMode === 'fingers' ? 0.65 : 0.9;
            const rawThreshold = (380 + (100 - sensitivity) * 18) * thresholdMultiplier;

            const leftPercent = Math.min(100, Math.round((leftMotionSum / rawThreshold) * 100));
            const rightPercent = Math.min(100, Math.round((rightMotionSum / rawThreshold) * 100));

            setLeftMotionLevel(leftPercent);
            setRightMotionLevel(rightPercent);

            if (leftMotionSum >= rawThreshold) {
              triggerStrike('LEFT');
            }
            if (rightMotionSum >= rawThreshold) {
              triggerStrike('RIGHT');
            }
          }

          prevFrameDataRef.current = new Uint8ClampedArray(data);
        }
      } else {
        // Video loading state
        mCtx.fillStyle = '#060a14';
        mCtx.fillRect(0, 0, w, h);
        mCtx.fillStyle = '#38bdf8';
        mCtx.font = 'bold 16px "Montserrat", sans-serif';
        mCtx.fillText('Connecting video stream...', w / 2 - 100, h / 2);
      }

      // 4. Render Glowing Strike Zones & HUD directly on top of video frame
      const padW = w * 0.44;
      const padH = h * 0.70;
      const padY = h * 0.22;

      // Left Strike Zone (Color Coded)
      const leftX = w * 0.04;
      mCtx.save();
      mCtx.strokeStyle = activeZoneFlash.LEFT ? '#FFFFFF' : leftZoneConfig.color;
      mCtx.lineWidth = activeZoneFlash.LEFT ? 6 : 3;
      mCtx.fillStyle = activeZoneFlash.LEFT ? `${leftZoneConfig.color}66` : `${leftZoneConfig.color}22`;
      mCtx.beginPath();
      mCtx.roundRect(leftX, padY, padW, padH, 16);
      mCtx.fill();
      mCtx.stroke();

      // Left Zone Header
      mCtx.fillStyle = leftZoneConfig.color;
      mCtx.font = 'bold 15px "Montserrat", sans-serif';
      mCtx.fillText('LEFT AIR ZONE', leftX + 14, padY + 26);

      // Drum Part Names
      mCtx.fillStyle = '#FFFFFF';
      mCtx.font = 'bold 13px "Montserrat", sans-serif';
      mCtx.fillText(leftZoneConfig.drumParts, leftX + 14, padY + 50);

      // Strike Action
      mCtx.fillStyle = leftZoneConfig.color;
      mCtx.font = '11px monospace';
      mCtx.fillText(
        trackingMode === 'fingers' ? '👉 HIT WITH INDEX FINGER' : '🥢 HIT WITH DRUMSTICK',
        leftX + 14,
        padY + 74
      );
      mCtx.restore();

      // Right Strike Zone (Color Coded)
      const rightX = w * 0.52;
      mCtx.save();
      mCtx.strokeStyle = activeZoneFlash.RIGHT ? '#FFFFFF' : rightZoneConfig.color;
      mCtx.lineWidth = activeZoneFlash.RIGHT ? 6 : 3;
      mCtx.fillStyle = activeZoneFlash.RIGHT ? `${rightZoneConfig.color}66` : `${rightZoneConfig.color}22`;
      mCtx.beginPath();
      mCtx.roundRect(rightX, padY, padW, padH, 16);
      mCtx.fill();
      mCtx.stroke();

      // Right Zone Header
      mCtx.fillStyle = rightZoneConfig.color;
      mCtx.font = 'bold 15px "Montserrat", sans-serif';
      mCtx.fillText('RIGHT AIR ZONE', rightX + 14, padY + 26);

      // Drum Part Names
      mCtx.fillStyle = '#FFFFFF';
      mCtx.font = 'bold 13px "Montserrat", sans-serif';
      mCtx.fillText(rightZoneConfig.drumParts, rightX + 14, padY + 50);

      // Strike Action
      mCtx.fillStyle = rightZoneConfig.color;
      mCtx.font = '11px monospace';
      mCtx.fillText(
        trackingMode === 'fingers' ? '👉 HIT WITH INDEX FINGER' : '🥢 HIT WITH DRUMSTICK',
        rightX + 14,
        padY + 74
      );
      mCtx.restore();

      animId = requestAnimationFrame(renderAndDetect);
    };

    animId = requestAnimationFrame(renderAndDetect);

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
                  ● {fps} FPS {cameraResolution ? `• ${cameraResolution}` : ''}
                </span>
              )}
            </h3>
            <p className="text-[10px] font-mono-code text-slate-400">
              Real-time video canvas motion tracking for drumsticks & index fingers
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
              disabled={isStarting}
              className="flex items-center gap-1 px-3 py-1 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-display font-black shadow-[0_0_12px_rgba(16,185,129,0.4)] transition-all disabled:opacity-50"
            >
              {isStarting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Video className="w-3.5 h-3.5" />}
              <span>{isStarting ? 'STARTING...' : 'START AIR DRUMMING'}</span>
            </button>
          )}
        </div>
      </div>

      {cameraError && (
        <div className="p-2.5 rounded-lg bg-red-950/70 border border-red-500/50 text-red-200 text-[11px] font-mono-code flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <div className="flex flex-col gap-0.5">
            <strong className="text-red-300 font-bold">Camera Permission Required:</strong>
            <span>{cameraError}</span>
            <span className="text-[10px] text-slate-400 mt-1">
              💡 Tip: Click "Allow" in your browser address bar to enable webcam access, or click the zones below!
            </span>
          </div>
        </div>
      )}

      {/* Viewport: Direct Canvas Renderer (Guaranteed No Layering / Blackscreen Glitches) */}
      <div className="relative w-full aspect-[16/9] max-h-[250px] rounded-lg overflow-hidden border-2 border-slate-700 bg-black flex items-center justify-center shadow-lg">
        {/* Main Visible Canvas: Draws Live Video + Glowing Strike Zones */}
        <canvas
          ref={mainCanvasRef}
          width={640}
          height={360}
          className={`w-full h-full object-cover transition-opacity duration-200 ${
            isActive ? 'opacity-100' : 'opacity-0'
          }`}
        />

        {/* When Camera is Offline: Standby Screen */}
        {!isActive && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-[#0b1020] to-[#060a14] p-4 text-center gap-3">
            <div className="w-12 h-12 rounded-full bg-emerald-950/80 border border-emerald-500/50 flex items-center justify-center text-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.3)]">
              <Video className="w-6 h-6" />
            </div>
            <div className="flex flex-col gap-1 max-w-sm">
              <h4 className="font-display font-black text-sm text-white flex items-center justify-center gap-1.5">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                Air Drumming Sensor Offline
              </h4>
              <p className="text-[11px] font-mono-code text-slate-400">
                Click below to turn on your webcam. Position your hands in the glowing strike zones to play drums in the air!
              </p>
            </div>
            <button
              onClick={startCamera}
              disabled={isStarting}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-display font-black text-xs shadow-[0_0_15px_rgba(16,185,129,0.5)] transition-all active:scale-95 disabled:opacity-50 flex items-center gap-1.5"
            >
              {isStarting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Video className="w-3.5 h-3.5" />}
              <span>{isStarting ? 'CONNECTING CAMERA...' : 'START AIR DRUMMING'}</span>
            </button>
          </div>
        )}

        {/* Direct Touch / Click Strike Zones on Top of Video */}
        {isActive && (
          <div className="absolute inset-0 grid grid-cols-2 pointer-events-auto">
            <div
              onClick={() => triggerStrike('LEFT')}
              className="cursor-pointer active:bg-cyan-500/20 transition-colors"
              title="Tap to trigger Left Air Strike"
            />
            <div
              onClick={() => triggerStrike('RIGHT')}
              className="cursor-pointer active:bg-orange-500/20 transition-colors"
              title="Tap to trigger Right Air Strike"
            />
          </div>
        )}
      </div>

      {/* Color-Coded Drum Part Zone Cards with Motion Gauges & Hit Counters */}
      <div className="grid grid-cols-2 gap-2 text-[11px] font-mono-code">
        {/* Left Zone Card */}
        <div
          onClick={() => triggerStrike('LEFT')}
          className={`flex flex-col gap-1 p-2 rounded-lg border cursor-pointer select-none transition-all active:scale-[0.98] ${
            activeZoneFlash.LEFT
              ? 'bg-cyan-500/40 border-white shadow-[0_0_15px_#00E5FF]'
              : leftZoneConfig.bgClass
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="font-bold flex items-center gap-1">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: leftZoneConfig.color }} />
              LEFT AIR ZONE
            </span>
            <span className="font-black text-xs">{isActive ? `${leftMotionLevel}%` : '0%'}</span>
          </div>
          <div className="font-display font-bold text-xs text-white truncate">
            {leftZoneConfig.drumParts}
          </div>
          <div className="w-full h-2 rounded-full bg-slate-900 overflow-hidden mt-0.5 relative">
            <div
              className={`h-full ${leftZoneConfig.barColorClass} transition-all duration-75`}
              style={{ width: `${Math.min(100, leftMotionLevel)}%` }}
            />
            <div className="absolute right-0 top-0 bottom-0 w-1 bg-white/60" />
          </div>
          <div className="flex justify-between items-center text-[10px] text-slate-400 mt-0.5">
            <span>Hits: <strong className="text-white">{leftHitCount}</strong></span>
            <span className="text-[9px] opacity-75">Click / Air Strike</span>
          </div>
        </div>

        {/* Right Zone Card */}
        <div
          onClick={() => triggerStrike('RIGHT')}
          className={`flex flex-col gap-1 p-2 rounded-lg border cursor-pointer select-none transition-all active:scale-[0.98] ${
            activeZoneFlash.RIGHT
              ? 'bg-orange-500/40 border-white shadow-[0_0_15px_#FF6D00]'
              : rightZoneConfig.bgClass
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="font-bold flex items-center gap-1">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: rightZoneConfig.color }} />
              RIGHT AIR ZONE
            </span>
            <span className="font-black text-xs">{isActive ? `${rightMotionLevel}%` : '0%'}</span>
          </div>
          <div className="font-display font-bold text-xs text-white truncate">
            {rightZoneConfig.drumParts}
          </div>
          <div className="w-full h-2 rounded-full bg-slate-900 overflow-hidden mt-0.5 relative">
            <div
              className={`h-full ${rightZoneConfig.barColorClass} transition-all duration-75`}
              style={{ width: `${Math.min(100, rightMotionLevel)}%` }}
            />
            <div className="absolute right-0 top-0 bottom-0 w-1 bg-white/60" />
          </div>
          <div className="flex justify-between items-center text-[10px] text-slate-400 mt-0.5">
            <span>Hits: <strong className="text-white">{rightHitCount}</strong></span>
            <span className="text-[9px] opacity-75">Click / Air Strike</span>
          </div>
        </div>
      </div>

      {/* Controls: Mode & Sensitivity Presets */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-slate-950/80 p-2 rounded-lg border border-slate-800 text-xs">
        {/* Tracking Mode Switcher */}
        <div className="flex flex-col gap-1">
          <span className="font-mono-code font-bold text-slate-300 flex items-center gap-1 text-[11px]">
            <HandIcon className="w-3 h-3 text-cyan-400" />
            STRIKE TRACKING TYPE:
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                setTrackingMode('fingers');
                setSensitivity(70);
              }}
              className={`flex-1 py-1 rounded font-display font-bold text-[11px] transition-all ${
                trackingMode === 'fingers'
                  ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-black shadow-[0_0_8px_#00E5FF]'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              👉 INDEX FINGERS
            </button>
            <button
              onClick={() => {
                setTrackingMode('sticks');
                setSensitivity(60);
              }}
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

        {/* Motion Sensitivity Presets & Slider */}
        <div className="flex flex-col gap-1">
          <div className="flex justify-between font-mono-code text-slate-300 text-[11px]">
            <span className="flex items-center gap-1">
              <Sliders className="w-3 h-3 text-amber-400" />
              MOTION SENSITIVITY:
            </span>
            <span className="text-cyan-400 font-bold">{sensitivity}%</span>
          </div>
          <input
            type="range"
            min="20"
            max="95"
            value={sensitivity}
            onChange={(e) => setSensitivity(Number(e.target.value))}
            className="w-full accent-cyan-400 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
          />
          <div className="flex justify-between text-[9px] font-mono-code text-slate-400">
            <button onClick={() => setSensitivity(45)} className="hover:text-white">Normal (45%)</button>
            <button onClick={() => setSensitivity(65)} className="hover:text-white font-bold text-amber-300">Responsive (65%)</button>
            <button onClick={() => setSensitivity(85)} className="hover:text-white">Ultra (85%)</button>
          </div>
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
          <span>Test Left Air Strike [D/F]</span>
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
          <span>Test Right Air Strike [J/K]</span>
        </button>
      </div>
    </div>
  );
};

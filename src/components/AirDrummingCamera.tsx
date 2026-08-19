import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Hand, Handedness, DrumInstrumentId } from '../types/drum';
import { getInstrumentHand } from '../data/beatLibrary';
import { Camera, CameraOff, Video, Sliders, Hand as HandIcon, AlertCircle, Sparkles, RefreshCw } from 'lucide-react';

interface AirDrummingCameraProps {
  onAirStrike: (instrument: DrumInstrumentId, hand: Hand) => void;
  handedness?: Handedness;
  invertHands?: boolean;
}

interface AirZoneDef {
  id: DrumInstrumentId;
  name: string;
  shortName: string;
  xRatio: number;
  yRatio: number;
  wRatio: number;
  hRatio: number;
}

// 8 Discrete Drum Zones in 3D Air Space
const AIR_ZONES: AirZoneDef[] = [
  // Top Row: Cymbals & Rack Toms
  { id: 'crash', name: 'CRASH CYMBAL', shortName: 'CRASH', xRatio: 0.03, yRatio: 0.03, wRatio: 0.21, hRatio: 0.27 },
  { id: 'high_tom', name: 'HIGH TOM', shortName: 'HI-TOM', xRatio: 0.27, yRatio: 0.03, wRatio: 0.21, hRatio: 0.27 },
  { id: 'mid_tom', name: 'MID TOM', shortName: 'MID-TOM', xRatio: 0.52, yRatio: 0.03, wRatio: 0.21, hRatio: 0.27 },
  { id: 'ride', name: 'RIDE CYMBAL', shortName: 'RIDE', xRatio: 0.76, yRatio: 0.03, wRatio: 0.21, hRatio: 0.27 },

  // Middle Row: Hi-Hat, Snare, Floor Tom
  { id: 'hihat_closed', name: 'HI-HAT', shortName: 'HI-HAT', xRatio: 0.03, yRatio: 0.35, wRatio: 0.21, hRatio: 0.28 },
  { id: 'snare', name: 'SNARE DRUM', shortName: 'SNARE', xRatio: 0.27, yRatio: 0.35, wRatio: 0.21, hRatio: 0.28 },
  { id: 'floor_tom', name: 'FLOOR TOM', shortName: 'FLOOR TOM', xRatio: 0.76, yRatio: 0.35, wRatio: 0.21, hRatio: 0.28 },

  // Bottom Center: Bass Drum (Kick)
  { id: 'bass', name: 'BASS DRUM (KICK)', shortName: 'BASS DRUM', xRatio: 0.35, yRatio: 0.67, wRatio: 0.30, hRatio: 0.30 },
];

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
  const [cameraResolution, setCameraResolution] = useState<string>('');

  // Per-zone motion levels & flash states for all 8 drum parts
  const [zoneMotionLevels, setZoneMotionLevels] = useState<Record<string, number>>({});
  const [zoneFlashes, setZoneFlashes] = useState<Record<string, boolean>>({});
  const [zoneHitCounts, setZoneHitCounts] = useState<Record<string, number>>({});

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mainCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const procCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Optical flow / motion history
  const prevFrameDataRef = useRef<Uint8ClampedArray | null>(null);
  const lastZoneStrikeTimeRef = useRef<Record<string, number>>({});

  const triggerStrike = useCallback((instId: DrumInstrumentId) => {
    const now = performance.now();
    const lastTime = lastZoneStrikeTimeRef.current[instId] || 0;
    if (now - lastTime < 160) return; // 160ms debounce
    lastZoneStrikeTimeRef.current[instId] = now;

    const assignedHand = getInstrumentHand(instId, handedness, invertHands);

    setZoneHitCounts((prev) => ({ ...prev, [instId]: (prev[instId] || 0) + 1 }));
    setZoneFlashes((prev) => ({ ...prev, [instId]: true }));
    setTimeout(() => {
      setZoneFlashes((prev) => ({ ...prev, [instId]: false }));
    }, 180);

    onAirStrike(instId, assignedHand);
  }, [onAirStrike, handedness, invertHands]);

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
    setZoneMotionLevels({});
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

  // Main Unified Canvas Render & 8-Zone Motion Detection Loop
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

      // 2. Draw Mirrored Camera Video directly onto Main Canvas
      if (video && video.readyState >= 2 && video.videoWidth > 0) {
        mCtx.save();
        mCtx.translate(w, 0);
        mCtx.scale(-1, 1);
        mCtx.drawImage(video, 0, 0, w, h);
        mCtx.restore();

        // 3. Process Optical Flow across all 8 zones
        const pCtx = procCanvas.getContext('2d', { willReadFrequently: true });
        if (pCtx) {
          pCtx.drawImage(video, 0, 0, 160, 120);
          const frame = pCtx.getImageData(0, 0, 160, 120);
          const data = frame.data;

          if (prevFrameDataRef.current && prevFrameDataRef.current.length === data.length) {
            const prev = prevFrameDataRef.current;
            const thresholdMultiplier = trackingMode === 'fingers' ? 0.65 : 0.9;
            const rawThreshold = (220 + (100 - sensitivity) * 12) * thresholdMultiplier;

            const newMotionLevels: Record<string, number> = {};

            AIR_ZONES.forEach((zone) => {
              const minX = Math.floor(zone.xRatio * 160);
              const maxX = Math.floor((zone.xRatio + zone.wRatio) * 160);
              const minY = Math.floor(zone.yRatio * 120);
              const maxY = Math.floor((zone.yRatio + zone.hRatio) * 120);

              let zoneMotionSum = 0;

              for (let py = minY; py < maxY; py += 2) {
                for (let px = minX; px < maxX; px += 2) {
                  const i = (py * 160 + px) * 4;
                  const diff = Math.abs(data[i] - prev[i]) +
                               Math.abs(data[i + 1] - prev[i + 1]) +
                               Math.abs(data[i + 2] - prev[i + 2]);

                  if (diff > 25) {
                    zoneMotionSum += diff;
                  }
                }
              }

              const percent = Math.min(100, Math.round((zoneMotionSum / rawThreshold) * 100));
              newMotionLevels[zone.id] = percent;

              if (zoneMotionSum >= rawThreshold) {
                triggerStrike(zone.id);
              }
            });

            setZoneMotionLevels(newMotionLevels);
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

      // 4. Render all 8 Glowing Drum Strike Zones onto Canvas
      AIR_ZONES.forEach((zone) => {
        const zx = Math.round(zone.xRatio * w);
        const zy = Math.round(zone.yRatio * h);
        const zw = Math.round(zone.wRatio * w);
        const zh = Math.round(zone.hRatio * h);

        const assignedHand = getInstrumentHand(zone.id, handedness, invertHands);
        const zoneColor = assignedHand === 'RIGHT' ? '#FF6D00' : '#00E5FF';
        const isFlashing = zoneFlashes[zone.id];

        mCtx.save();
        mCtx.strokeStyle = isFlashing ? '#FFFFFF' : zoneColor;
        mCtx.lineWidth = isFlashing ? 5 : 2.5;
        mCtx.fillStyle = isFlashing ? `${zoneColor}66` : `${zoneColor}1F`;
        mCtx.beginPath();
        mCtx.roundRect(zx, zy, zw, zh, 12);
        mCtx.fill();
        mCtx.stroke();

        // Header
        mCtx.fillStyle = isFlashing ? '#FFFFFF' : zoneColor;
        mCtx.font = 'bold 12px "Montserrat", sans-serif';
        mCtx.fillText(zone.shortName, zx + 8, zy + 18);

        // Hand & Trigger Label
        mCtx.fillStyle = '#FFFFFF';
        mCtx.font = '10px monospace';
        mCtx.fillText(assignedHand === 'RIGHT' ? 'RH [J/K]' : 'LH [D/F]', zx + 8, zy + 34);

        mCtx.restore();
      });

      animId = requestAnimationFrame(renderAndDetect);
    };

    animId = requestAnimationFrame(renderAndDetect);

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [isActive, sensitivity, trackingMode, triggerStrike, zoneFlashes, handedness, invertHands]);

  // Direct canvas click handler to find which zone was clicked
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!mainCanvasRef.current) return;
    const rect = mainCanvasRef.current.getBoundingClientRect();
    const clickXRatio = (e.clientX - rect.left) / rect.width;
    const clickYRatio = (e.clientY - rect.top) / rect.height;

    const clickedZone = AIR_ZONES.find(
      (z) =>
        clickXRatio >= z.xRatio &&
        clickXRatio <= z.xRatio + z.wRatio &&
        clickYRatio >= z.yRatio &&
        clickYRatio <= z.yRatio + z.hRatio
    );

    if (clickedZone) {
      triggerStrike(clickedZone.id);
    }
  };

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
              AIR DRUMMING • 8 DRUM ZONES
              {isActive && (
                <span className="text-[10px] font-mono-code px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/40">
                  ● {fps} FPS {cameraResolution ? `• ${cameraResolution}` : ''}
                </span>
              )}
            </h3>
            <p className="text-[10px] font-mono-code text-slate-400">
              8-zone 3D spatial motion tracking for drumsticks & index fingers
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

      {/* Viewport: Direct Canvas Renderer with 8 Spatial Drum Zones */}
      <div className="relative w-full aspect-[16/9] max-h-[250px] rounded-lg overflow-hidden border-2 border-slate-700 bg-black flex items-center justify-center shadow-lg">
        {/* Main Visible Canvas: Draws Live Video + 8 Glowing Strike Zones */}
        <canvas
          ref={mainCanvasRef}
          width={640}
          height={360}
          onClick={handleCanvasClick}
          className={`w-full h-full object-cover cursor-pointer transition-opacity duration-200 ${
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
                Click below to turn on your webcam. 8 color-coded zones will appear for each drum part!
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
      </div>

      {/* 8 Drum Part Live Status Grid */}
      <div className="grid grid-cols-4 sm:grid-cols-8 gap-1 text-[10px] font-mono-code">
        {AIR_ZONES.map((zone) => {
          const assignedHand = getInstrumentHand(zone.id, handedness, invertHands);
          const isRight = assignedHand === 'RIGHT';
          const motion = zoneMotionLevels[zone.id] || 0;
          const isFlashing = zoneFlashes[zone.id];
          const hitCount = zoneHitCounts[zone.id] || 0;

          return (
            <button
              key={zone.id}
              onClick={() => triggerStrike(zone.id)}
              className={`flex flex-col items-center justify-between p-1.5 rounded-lg border transition-all active:scale-95 ${
                isFlashing
                  ? 'bg-white text-black border-white shadow-[0_0_12px_#FFF]'
                  : isRight
                  ? 'bg-orange-950/40 border-orange-500/50 text-orange-200 hover:border-orange-400'
                  : 'bg-cyan-950/40 border-cyan-500/50 text-cyan-200 hover:border-cyan-400'
              }`}
              title={`Click or strike ${zone.name} in the air`}
            >
              <span className="font-bold truncate w-full text-center">{zone.shortName}</span>
              <div className="w-full h-1 rounded-full bg-slate-900 overflow-hidden my-0.5">
                <div
                  className={`h-full ${isRight ? 'bg-orange-500' : 'bg-cyan-400'} transition-all duration-75`}
                  style={{ width: `${Math.min(100, motion)}%` }}
                />
              </div>
              <span className="text-[9px] opacity-75">{hitCount > 0 ? `${hitCount} hits` : (isRight ? 'RH' : 'LH')}</span>
            </button>
          );
        })}
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
    </div>
  );
};

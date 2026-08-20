import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Hand, Handedness, DrumInstrumentId } from '../types/drum';
import { getInstrumentHand } from '../data/beatLibrary';
import { Camera, CameraOff, Video, Sliders, Hand as HandIcon, AlertCircle, RefreshCw } from 'lucide-react';

interface AirDrummingCameraProps {
  onAirStrike: (instrument: DrumInstrumentId, hand: Hand) => void;
  handedness?: Handedness;
  invertHands?: boolean;
}

interface AirZoneDef {
  id: DrumInstrumentId;
  name: string;
  shortName: string;
  type: 'cymbal' | 'drum';
  xRatio: number;
  yRatio: number;
  wRatio: number;
  hRatio: number;
}

// 8 Discrete Drum Zones in 3D Air Space
const AIR_ZONES: AirZoneDef[] = [
  // Top Row: Cymbals & Rack Toms
  { id: 'crash', name: 'CRASH CYMBAL', shortName: 'CRASH 16"', type: 'cymbal', xRatio: 0.02, yRatio: 0.03, wRatio: 0.22, hRatio: 0.28 },
  { id: 'high_tom', name: 'HIGH TOM', shortName: 'HIGH TOM', type: 'drum', xRatio: 0.26, yRatio: 0.03, wRatio: 0.22, hRatio: 0.28 },
  { id: 'mid_tom', name: 'MID TOM', shortName: 'MID TOM', type: 'drum', xRatio: 0.52, yRatio: 0.03, wRatio: 0.22, hRatio: 0.28 },
  { id: 'ride', name: 'RIDE CYMBAL', shortName: 'RIDE 20"', type: 'cymbal', xRatio: 0.76, yRatio: 0.03, wRatio: 0.22, hRatio: 0.28 },

  // Middle Row: Hi-Hat, Snare, Floor Tom
  { id: 'hihat_closed', name: 'HI-HAT', shortName: 'HI-HAT 14"', type: 'cymbal', xRatio: 0.02, yRatio: 0.35, wRatio: 0.22, hRatio: 0.29 },
  { id: 'snare', name: 'SNARE DRUM', shortName: 'SNARE 14"', type: 'drum', xRatio: 0.26, yRatio: 0.35, wRatio: 0.22, hRatio: 0.29 },
  { id: 'floor_tom', name: 'FLOOR TOM', shortName: 'FLOOR TOM', type: 'drum', xRatio: 0.76, yRatio: 0.35, wRatio: 0.22, hRatio: 0.29 },

  // Bottom Center: Bass Drum (Kick)
  { id: 'bass', name: 'BASS DRUM (KICK)', shortName: 'BASS DRUM 22"', type: 'drum', xRatio: 0.33, yRatio: 0.67, wRatio: 0.34, hRatio: 0.30 },
];

export const AirDrummingCamera: React.FC<AirDrummingCameraProps> = ({
  onAirStrike,
  handedness = 'RIGHT_HANDED',
  invertHands = false,
}) => {
  const [isActive, setIsActive] = useState<boolean>(false);
  const [isStarting, setIsStarting] = useState<boolean>(false);
  const [trackingMode, setTrackingMode] = useState<'fingers' | 'sticks'>('fingers');
  const [sensitivity, setSensitivity] = useState<number>(65);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [fps, setFps] = useState<number>(0);
  const [cameraResolution, setCameraResolution] = useState<string>('');

  // Per-zone motion levels & flash states
  const [zoneMotionLevels, setZoneMotionLevels] = useState<Record<string, number>>({});
  const [zoneFlashes, setZoneFlashes] = useState<Record<string, boolean>>({});
  const [zoneHitCounts, setZoneHitCounts] = useState<Record<string, number>>({});

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mainCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const procCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const prevFrameDataRef = useRef<Uint8ClampedArray | null>(null);
  const lastZoneStrikeTimeRef = useRef<Record<string, number>>({});

  const triggerStrike = useCallback((instId: DrumInstrumentId) => {
    const now = performance.now();
    const lastTime = lastZoneStrikeTimeRef.current[instId] || 0;
    if (now - lastTime < 160) return;
    lastZoneStrikeTimeRef.current[instId] = now;

    const assignedHand = getInstrumentHand(instId, handedness, invertHands);

    setZoneHitCounts((prev) => ({ ...prev, [instId]: (prev[instId] || 0) + 1 }));
    setZoneFlashes((prev) => ({ ...prev, [instId]: true }));
    setTimeout(() => {
      setZoneFlashes((prev) => ({ ...prev, [instId]: false }));
    }, 200);

    onAirStrike(instId, assignedHand);
  }, [onAirStrike, handedness, invertHands]);

  const startCamera = async () => {
    try {
      setCameraError(null);
      setIsStarting(true);

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API requires HTTPS or a supported browser.');
      }

      // Progressive constraint fallback
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
          // Try next
        }
      }

      if (!stream) {
        throw new Error('Unable to access webcam. Please allow camera permissions in your browser.');
      }

      streamRef.current = stream;

      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        video.muted = true;
        video.playsInline = true;

        await new Promise<void>((resolve) => {
          video.onloadedmetadata = async () => {
            try {
              await video.play();
              if (video.videoWidth > 0) {
                setCameraResolution(`${video.videoWidth}x${video.videoHeight}`);
              }
            } catch (e) {
              console.warn('Video play auto-resume error:', e);
            }
            resolve();
          };

          // Fallback
          setTimeout(async () => {
            try {
              await video.play();
              if (video.videoWidth > 0) {
                setCameraResolution(`${video.videoWidth}x${video.videoHeight}`);
              }
            } catch {}
            resolve();
          }, 600);
        });
      }

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

  // Clean up stream on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // Main Canvas Render & Motion Detection Loop (Always Active)
  useEffect(() => {
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

      // 2. Background: Live Mirrored Video or Studio Skeleton Stage
      const isVideoReady = isActive && video && video.readyState >= 2 && video.videoWidth > 0;

      if (isVideoReady && video) {
        mCtx.save();
        mCtx.translate(w, 0);
        mCtx.scale(-1, 1);
        mCtx.drawImage(video, 0, 0, w, h);
        mCtx.restore();

        // 3. Process Optical Flow
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
        // Studio Stage Grid
        const bgGrad = mCtx.createLinearGradient(0, 0, 0, h);
        bgGrad.addColorStop(0, '#0a1020');
        bgGrad.addColorStop(0.5, '#070b16');
        bgGrad.addColorStop(1, '#03050a');
        mCtx.fillStyle = bgGrad;
        mCtx.fillRect(0, 0, w, h);

        mCtx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
        mCtx.lineWidth = 1;
        for (let gx = 0; gx < w; gx += 40) {
          mCtx.beginPath();
          mCtx.moveTo(gx, 0);
          mCtx.lineTo(gx, h);
          mCtx.stroke();
        }
        for (let gy = 0; gy < h; gy += 40) {
          mCtx.beginPath();
          mCtx.moveTo(0, gy);
          mCtx.lineTo(w, gy);
          mCtx.stroke();
        }
      }

      // 4. Render 8-Zone Skeleton Rig & AR Crosshairs
      AIR_ZONES.forEach((zone) => {
        const zx = Math.round(zone.xRatio * w);
        const zy = Math.round(zone.yRatio * h);
        const zw = Math.round(zone.wRatio * w);
        const zh = Math.round(zone.hRatio * h);
        const cx = zx + zw / 2;
        const cy = zy + zh / 2;

        const assignedHand = getInstrumentHand(zone.id, handedness, invertHands);
        const isRight = assignedHand === 'RIGHT';
        const zoneColor = isRight ? '#FF6D00' : '#00E5FF';
        const isFlashing = zoneFlashes[zone.id];

        mCtx.save();

        // 4A. Zone Bounding Box
        mCtx.strokeStyle = isFlashing ? '#FFFFFF' : isVideoReady ? zoneColor : `${zoneColor}99`;
        mCtx.lineWidth = isFlashing ? 5 : 2;
        mCtx.fillStyle = isFlashing
          ? `${zoneColor}88`
          : isVideoReady
          ? `${zoneColor}1F`
          : `${zoneColor}14`;

        mCtx.beginPath();
        mCtx.roundRect(zx, zy, zw, zh, 12);
        mCtx.fill();
        mCtx.stroke();

        // 4B. AR Corner Brackets
        const cLen = 12;
        mCtx.strokeStyle = isFlashing ? '#FFFFFF' : zoneColor;
        mCtx.lineWidth = 3;
        mCtx.beginPath();
        mCtx.moveTo(zx, zy + cLen);
        mCtx.lineTo(zx, zy);
        mCtx.lineTo(zx + cLen, zy);
        mCtx.moveTo(zx + zw - cLen, zy);
        mCtx.lineTo(zx + zw, zy);
        mCtx.lineTo(zx + zw, zy + cLen);
        mCtx.moveTo(zx, zy + zh - cLen);
        mCtx.lineTo(zx, zy + zh);
        mCtx.lineTo(zx + cLen, zy + zh);
        mCtx.moveTo(zx + zw - cLen, zy + zh);
        mCtx.lineTo(zx + zw, zy + zh);
        mCtx.lineTo(zx + zw, zy + zh - cLen);
        mCtx.stroke();

        // 4C. Drum/Cymbal Wireframe Graphic
        const radius = Math.min(zw, zh) * 0.32;
        if (zone.type === 'cymbal') {
          mCtx.strokeStyle = isFlashing ? '#FFFFFF' : `${zoneColor}88`;
          mCtx.lineWidth = 1.5;
          mCtx.beginPath();
          mCtx.arc(cx, cy, radius, 0, Math.PI * 2);
          mCtx.stroke();

          mCtx.beginPath();
          mCtx.arc(cx, cy, radius * 0.65, 0, Math.PI * 2);
          mCtx.stroke();

          mCtx.fillStyle = isFlashing ? '#FFFFFF' : zoneColor;
          mCtx.beginPath();
          mCtx.arc(cx, cy, radius * 0.28, 0, Math.PI * 2);
          mCtx.fill();
        } else {
          mCtx.strokeStyle = isFlashing ? '#FFFFFF' : `${zoneColor}88`;
          mCtx.lineWidth = 2;
          mCtx.beginPath();
          mCtx.arc(cx, cy, radius, 0, Math.PI * 2);
          mCtx.stroke();

          mCtx.strokeStyle = `${zoneColor}44`;
          mCtx.lineWidth = 1;
          mCtx.beginPath();
          mCtx.arc(cx, cy, radius * 0.75, 0, Math.PI * 2);
          mCtx.stroke();

          mCtx.strokeStyle = isFlashing ? '#FFFFFF' : zoneColor;
          mCtx.lineWidth = 1.5;
          mCtx.beginPath();
          mCtx.moveTo(cx - radius * 0.4, cy);
          mCtx.lineTo(cx + radius * 0.4, cy);
          mCtx.moveTo(cx, cy - radius * 0.4);
          mCtx.lineTo(cx, cy + radius * 0.4);
          mCtx.stroke();

          mCtx.fillStyle = isFlashing ? '#FFFFFF' : zoneColor;
          mCtx.beginPath();
          mCtx.arc(cx, cy, radius * 0.22, 0, Math.PI * 2);
          mCtx.fill();
        }

        // 4D. Labels
        mCtx.fillStyle = isFlashing ? '#FFFFFF' : zoneColor;
        mCtx.font = 'bold 11px "Montserrat", sans-serif';
        mCtx.fillText(zone.shortName, zx + 8, zy + 16);

        mCtx.fillStyle = '#FFFFFF';
        mCtx.font = '10px monospace';
        mCtx.fillText(isRight ? 'RH [J/K]' : 'LH [D/F]', zx + 8, zy + 30);

        mCtx.restore();
      });

      animId = requestAnimationFrame(renderAndDetect);
    };

    animId = requestAnimationFrame(renderAndDetect);

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [isActive, sensitivity, trackingMode, triggerStrike, zoneFlashes, handedness, invertHands]);

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
    <div className="w-full flex flex-col gap-1.5 rounded-xl bg-gradient-to-b from-slate-900 via-[#0e1628] to-[#070b14] border border-slate-800 p-2.5 shadow-xl">
      {/* Hidden Real HTML Video Tag in DOM Tree so browser decodes frames */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{
          position: 'absolute',
          width: '1px',
          height: '1px',
          opacity: 0.001,
          pointerEvents: 'none',
          zIndex: -999,
        }}
      />

      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded-lg bg-emerald-950 border border-emerald-500/30 text-emerald-400">
            <Camera className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-display font-black text-xs sm:text-sm text-white flex items-center gap-2">
              AIR DRUMMING • 8 DRUM SKELETON
              {isActive && (
                <span className="text-[10px] font-mono-code px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/40">
                  ● {fps} FPS {cameraResolution ? `• ${cameraResolution}` : ''}
                </span>
              )}
            </h3>
            <p className="text-[10px] font-mono-code text-slate-400">
              Interactive 8-zone spatial drum skeleton with motion tracking
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {isActive ? (
            <button
              onClick={stopCamera}
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-red-950/80 hover:bg-red-900 text-red-200 border border-red-500/40 text-xs font-mono-code font-bold transition-colors"
            >
              <CameraOff className="w-3 h-3" />
              <span>Turn Off</span>
            </button>
          ) : (
            <button
              onClick={startCamera}
              disabled={isStarting}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-display font-black shadow-[0_0_12px_rgba(16,185,129,0.4)] transition-all disabled:opacity-50"
            >
              {isStarting ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Video className="w-3 h-3" />}
              <span>{isStarting ? 'CONNECTING...' : 'START CAMERA'}</span>
            </button>
          )}
        </div>
      </div>

      {cameraError && (
        <div className="p-2 rounded-lg bg-red-950/70 border border-red-500/50 text-red-200 text-[10px] font-mono-code flex items-start gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
          <div className="flex flex-col">
            <strong className="text-red-300 font-bold">Camera Notice:</strong>
            <span>{cameraError}</span>
            <span className="text-[9px] text-slate-400 mt-0.5">
              💡 Tap or click any of the 8 skeleton zones below to play immediately!
            </span>
          </div>
        </div>
      )}

      {/* Main Viewport: Canvas with responsive aspect ratio */}
      <div className="relative w-full aspect-[16/9] max-h-[220px] rounded-lg overflow-hidden border-2 border-slate-700 bg-black flex items-center justify-center shadow-lg">
        <canvas
          ref={mainCanvasRef}
          width={640}
          height={360}
          onClick={handleCanvasClick}
          className="w-full h-full object-cover cursor-pointer select-none"
          title="Click or strike any drum zone"
        />

        {/* Top Floating Guide */}
        <div className="absolute top-1.5 left-1/2 -translate-x-1/2 pointer-events-none px-2.5 py-0.5 rounded-full bg-black/75 backdrop-blur-md border border-slate-700/80 flex items-center gap-2 text-[9px] font-mono-code text-slate-300 shadow-md">
          <span className="flex items-center gap-1 text-cyan-300">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
            CYAN = LEFT HAND [D/F]
          </span>
          <span className="text-slate-500">•</span>
          <span className="flex items-center gap-1 text-orange-300">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
            ORANGE = RIGHT HAND [J/K]
          </span>
        </div>
      </div>

      {/* 8 Drum Part Live Status Buttons */}
      <div className="grid grid-cols-4 sm:grid-cols-8 gap-1 text-[9px] font-mono-code">
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
              className={`flex flex-col items-center justify-between p-1 rounded-lg border transition-all active:scale-95 ${
                isFlashing
                  ? 'bg-white text-black border-white shadow-[0_0_10px_#FFF]'
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
              <span className="text-[8px] opacity-75">{hitCount > 0 ? `${hitCount} hits` : (isRight ? 'RH' : 'LH')}</span>
            </button>
          );
        })}
      </div>

      {/* Mode & Sensitivity Controls */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 bg-slate-950/80 p-1.5 rounded-lg border border-slate-800 text-xs">
        {/* Tracking Mode */}
        <div className="flex flex-col gap-0.5">
          <span className="font-mono-code font-bold text-slate-300 flex items-center gap-1 text-[10px]">
            <HandIcon className="w-3 h-3 text-cyan-400" />
            TRACKING TYPE:
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                setTrackingMode('fingers');
                setSensitivity(70);
              }}
              className={`flex-1 py-0.5 rounded font-display font-bold text-[10px] transition-all ${
                trackingMode === 'fingers'
                  ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-black shadow-[0_0_6px_#00E5FF]'
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
              className={`flex-1 py-0.5 rounded font-display font-bold text-[10px] transition-all ${
                trackingMode === 'sticks'
                  ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-black shadow-[0_0_6px_#FF6D00]'
                  : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              🥢 DRUMSTICKS
            </button>
          </div>
        </div>

        {/* Motion Sensitivity */}
        <div className="flex flex-col gap-0.5">
          <div className="flex justify-between font-mono-code text-slate-300 text-[10px]">
            <span className="flex items-center gap-1">
              <Sliders className="w-3 h-3 text-amber-400" />
              SENSITIVITY:
            </span>
            <span className="text-cyan-400 font-bold">{sensitivity}%</span>
          </div>
          <input
            type="range"
            min="20"
            max="95"
            value={sensitivity}
            onChange={(e) => setSensitivity(Number(e.target.value))}
            className="w-full accent-cyan-400 cursor-pointer h-1 bg-slate-800 rounded-lg"
          />
          <div className="flex justify-between text-[8px] font-mono-code text-slate-400">
            <button onClick={() => setSensitivity(45)} className="hover:text-white">Normal (45%)</button>
            <button onClick={() => setSensitivity(65)} className="hover:text-white font-bold text-amber-300">Responsive (65%)</button>
            <button onClick={() => setSensitivity(85)} className="hover:text-white">Ultra (85%)</button>
          </div>
        </div>
      </div>
    </div>
  );
};

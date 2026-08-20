import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Hand, Handedness, DrumInstrumentId } from '../types/drum';
import { getInstrumentHand } from '../data/beatLibrary';
import { Camera, CameraOff, Video, Sliders, Hand as HandIcon, AlertCircle, RefreshCw, CheckCircle2, Play, Info, Sparkles } from 'lucide-react';

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
  const [cameraDeviceLabel, setCameraDeviceLabel] = useState<string>('');
  const [isVideoPaused, setIsVideoPaused] = useState<boolean>(false);
  const [availableDevices, setAvailableDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [showDiagnostics, setShowDiagnostics] = useState<boolean>(false);
  const [diagnosticLogs, setDiagnosticLogs] = useState<string[]>([]);
  const [isDemoMode, setIsDemoMode] = useState<boolean>(false);

  // Per-zone motion levels & flash states
  const [zoneMotionLevels, setZoneMotionLevels] = useState<Record<string, number>>({});
  const [zoneFlashes, setZoneFlashes] = useState<Record<string, boolean>>({});
  const [zoneHitCounts, setZoneHitCounts] = useState<Record<string, number>>({});

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const procCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const prevFrameDataRef = useRef<Uint8ClampedArray | null>(null);
  const lastZoneStrikeTimeRef = useRef<Record<string, number>>({});

  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString();
    setDiagnosticLogs((prev) => [`[${time}] ${msg}`, ...prev.slice(0, 15)]);
  };

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

  // Enumerate camera devices
  const refreshDevices = useCallback(async () => {
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevs = devices.filter((d) => d.kind === 'videoinput');
        setAvailableDevices(videoDevs);
        if (videoDevs.length > 0 && !selectedDeviceId) {
          setSelectedDeviceId(videoDevs[0].deviceId);
        }
      }
    } catch (e) {
      console.warn('Device enumeration error:', e);
    }
  }, [selectedDeviceId]);

  useEffect(() => {
    refreshDevices();
  }, [refreshDevices]);

  const startCamera = async (overrideDeviceId?: string) => {
    try {
      setCameraError(null);
      setIsStarting(true);
      setIsVideoPaused(false);
      setIsDemoMode(false);
      addLog('Requesting camera permissions...');

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera API requires HTTPS or a modern browser.');
      }

      const targetDevice = overrideDeviceId || selectedDeviceId;

      // Progressive constraint fallback
      let stream: MediaStream | null = null;
      const constraintsList: MediaStreamConstraints[] = [
        ...(targetDevice
          ? [{ video: { deviceId: { exact: targetDevice } }, audio: false }]
          : []),
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
          if (stream) {
            addLog(`Acquired stream successfully with ${JSON.stringify(constraints.video)}`);
            break;
          }
        } catch (err: unknown) {
          addLog(`Constraint failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      if (!stream) {
        throw new Error('Unable to access camera. Please check browser permissions and Windows/Mac camera privacy settings.');
      }

      streamRef.current = stream;

      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        setCameraDeviceLabel(videoTrack.label || 'Webcam');
        addLog(`Video Track: ${videoTrack.label} (${videoTrack.readyState})`);
      }

      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        video.muted = true;
        video.playsInline = true;
        video.autoplay = true;

        video.onpause = () => setIsVideoPaused(true);
        video.onplay = () => setIsVideoPaused(false);

        try {
          await video.play();
          addLog('video.play() called successfully');
          if (video.videoWidth > 0) {
            setCameraResolution(`${video.videoWidth}x${video.videoHeight}`);
          }
        } catch (e) {
          addLog(`video.play() rejected: ${e}`);
        }

        video.onloadedmetadata = async () => {
          try {
            await video.play();
            if (video.videoWidth > 0) {
              setCameraResolution(`${video.videoWidth}x${video.videoHeight}`);
              addLog(`Metadata loaded: ${video.videoWidth}x${video.videoHeight}`);
            }
          } catch (playErr) {
            addLog(`onloadedmetadata play error: ${playErr}`);
          }
        };
      }

      setIsActive(true);
      setIsStarting(false);
      refreshDevices();
    } catch (err: unknown) {
      console.error('Camera access error:', err);
      const msg = err instanceof Error ? err.message : 'Camera access denied or unavailable.';
      setCameraError(msg);
      addLog(`ERROR: ${msg}`);
      setIsActive(false);
      setIsStarting(false);
    }
  };

  const resumeVideo = async () => {
    const video = videoRef.current;
    if (video) {
      try {
        await video.play();
        setIsVideoPaused(false);
        addLog('Resumed video playback');
      } catch (e) {
        addLog(`Resume error: ${e}`);
      }
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
    setIsVideoPaused(false);
    setIsDemoMode(false);
    prevFrameDataRef.current = null;
    setFps(0);
    setZoneMotionLevels({});
    setCameraResolution('');
    setCameraDeviceLabel('');
    addLog('Camera stopped');
  };

  // Demo motion simulation
  useEffect(() => {
    if (!isDemoMode) return;
    let demoIdx = 0;
    const demoOrder: DrumInstrumentId[] = ['hihat_closed', 'snare', 'hihat_closed', 'bass', 'crash', 'high_tom', 'mid_tom', 'floor_tom'];
    const timer = setInterval(() => {
      const target = demoOrder[demoIdx % demoOrder.length];
      triggerStrike(target);
      demoIdx++;
    }, 450);
    return () => clearInterval(timer);
  }, [isDemoMode, triggerStrike]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // Main Canvas Render & Motion Detection Loop
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
      const overlayCanvas = overlayCanvasRef.current;
      const procCanvas = procCanvasRef.current;

      if (!overlayCanvas || !procCanvas) {
        animId = requestAnimationFrame(renderAndDetect);
        return;
      }

      const oCtx = overlayCanvas.getContext('2d');
      if (!oCtx) {
        animId = requestAnimationFrame(renderAndDetect);
        return;
      }

      const w = overlayCanvas.width;
      const h = overlayCanvas.height;

      // 1. Calculate FPS
      frameCount++;
      const now = performance.now();
      if (now - lastFpsCalcTime >= 1000) {
        setFps(frameCount);
        frameCount = 0;
        lastFpsCalcTime = now;
      }

      // 2. Clear canvas when active so video shows through 100%
      if (isActive) {
        oCtx.clearRect(0, 0, w, h);

        // 3. Process Optical Flow from Video
        if (video && video.readyState >= 2 && video.videoWidth > 0) {
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
                const rawX = zone.xRatio;
                const mirroredX = 1.0 - (rawX + zone.wRatio);

                const minX = Math.floor(mirroredX * 160);
                const maxX = Math.floor((mirroredX + zone.wRatio) * 160);
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
        }
      } else {
        // When Camera is OFFLINE: Render Studio Stage Grid
        const bgGrad = oCtx.createLinearGradient(0, 0, 0, h);
        bgGrad.addColorStop(0, '#0a1020');
        bgGrad.addColorStop(0.5, '#070b16');
        bgGrad.addColorStop(1, '#03050a');
        oCtx.fillStyle = bgGrad;
        oCtx.fillRect(0, 0, w, h);

        oCtx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
        oCtx.lineWidth = 1;
        for (let gx = 0; gx < w; gx += 40) {
          oCtx.beginPath();
          oCtx.moveTo(gx, 0);
          oCtx.lineTo(gx, h);
          oCtx.stroke();
        }
        for (let gy = 0; gy < h; gy += 40) {
          oCtx.beginPath();
          oCtx.moveTo(0, gy);
          oCtx.lineTo(w, gy);
          oCtx.stroke();
        }
      }

      // 4. Render 8-Zone Skeleton Rig & AR Crosshairs onto Overlay Canvas
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

        oCtx.save();

        // 4A. Zone Bounding Box
        oCtx.strokeStyle = isFlashing ? '#FFFFFF' : isActive ? zoneColor : `${zoneColor}99`;
        oCtx.lineWidth = isFlashing ? 5 : 2;
        oCtx.fillStyle = isFlashing
          ? `${zoneColor}88`
          : isActive
          ? `${zoneColor}1F`
          : `${zoneColor}14`;

        oCtx.beginPath();
        oCtx.roundRect(zx, zy, zw, zh, 12);
        oCtx.fill();
        oCtx.stroke();

        // 4B. AR Corner Brackets
        const cLen = 12;
        oCtx.strokeStyle = isFlashing ? '#FFFFFF' : zoneColor;
        oCtx.lineWidth = 3;
        oCtx.beginPath();
        oCtx.moveTo(zx, zy + cLen);
        oCtx.lineTo(zx, zy);
        oCtx.lineTo(zx + cLen, zy);
        oCtx.moveTo(zx + zw - cLen, zy);
        oCtx.lineTo(zx + zw, zy);
        oCtx.lineTo(zx + zw, zy + cLen);
        oCtx.moveTo(zx, zy + zh - cLen);
        oCtx.lineTo(zx, zy + zh);
        oCtx.lineTo(zx + cLen, zy + zh);
        oCtx.moveTo(zx + zw - cLen, zy + zh);
        oCtx.lineTo(zx + zw, zy + zh);
        oCtx.lineTo(zx + zw, zy + zh - cLen);
        oCtx.stroke();

        // 4C. Drum/Cymbal Wireframe Graphic
        const radius = Math.min(zw, zh) * 0.32;
        if (zone.type === 'cymbal') {
          oCtx.strokeStyle = isFlashing ? '#FFFFFF' : `${zoneColor}88`;
          oCtx.lineWidth = 1.5;
          oCtx.beginPath();
          oCtx.arc(cx, cy, radius, 0, Math.PI * 2);
          oCtx.stroke();

          oCtx.beginPath();
          oCtx.arc(cx, cy, radius * 0.65, 0, Math.PI * 2);
          oCtx.stroke();

          oCtx.fillStyle = isFlashing ? '#FFFFFF' : zoneColor;
          oCtx.beginPath();
          oCtx.arc(cx, cy, radius * 0.28, 0, Math.PI * 2);
          oCtx.fill();
        } else {
          oCtx.strokeStyle = isFlashing ? '#FFFFFF' : `${zoneColor}88`;
          oCtx.lineWidth = 2;
          oCtx.beginPath();
          oCtx.arc(cx, cy, radius, 0, Math.PI * 2);
          oCtx.stroke();

          oCtx.strokeStyle = `${zoneColor}44`;
          oCtx.lineWidth = 1;
          oCtx.beginPath();
          oCtx.arc(cx, cy, radius * 0.75, 0, Math.PI * 2);
          oCtx.stroke();

          oCtx.strokeStyle = isFlashing ? '#FFFFFF' : zoneColor;
          oCtx.lineWidth = 1.5;
          oCtx.beginPath();
          oCtx.moveTo(cx - radius * 0.4, cy);
          oCtx.lineTo(cx + radius * 0.4, cy);
          oCtx.moveTo(cx, cy - radius * 0.4);
          oCtx.lineTo(cx, cy + radius * 0.4);
          oCtx.stroke();

          oCtx.fillStyle = isFlashing ? '#FFFFFF' : zoneColor;
          oCtx.beginPath();
          oCtx.arc(cx, cy, radius * 0.22, 0, Math.PI * 2);
          oCtx.fill();
        }

        // 4D. Labels
        oCtx.fillStyle = isFlashing ? '#FFFFFF' : zoneColor;
        oCtx.font = 'bold 11px "Montserrat", sans-serif';
        oCtx.fillText(zone.shortName, zx + 8, zy + 16);

        oCtx.fillStyle = '#FFFFFF';
        oCtx.font = '10px monospace';
        oCtx.fillText(isRight ? 'RH [J/K]' : 'LH [D/F]', zx + 8, zy + 30);

        oCtx.restore();
      });

      animId = requestAnimationFrame(renderAndDetect);
    };

    animId = requestAnimationFrame(renderAndDetect);

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [isActive, sensitivity, trackingMode, triggerStrike, zoneFlashes, handedness, invertHands]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!overlayCanvasRef.current) return;
    const rect = overlayCanvasRef.current.getBoundingClientRect();
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
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1 rounded-lg bg-emerald-950 border border-emerald-500/30 text-emerald-400">
            <Camera className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-display font-black text-xs sm:text-sm text-white flex items-center gap-2">
              AIR DRUMMING
              {isActive ? (
                <span className="text-[10px] font-mono-code px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  ● LIVE FEED {cameraResolution ? `(${cameraResolution})` : ''} • {fps} FPS
                </span>
              ) : isDemoMode ? (
                <span className="text-[10px] font-mono-code px-1.5 py-0.2 rounded bg-purple-950 text-purple-300 border border-purple-500/40 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-purple-400 animate-pulse" />
                  ● DEMO AUTO-TRACKING
                </span>
              ) : (
                <span className="text-[10px] font-mono-code px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700">
                  STANDBY (SKELETON READY)
                </span>
              )}
            </h3>
            <p className="text-[10px] font-mono-code text-slate-400">
              {cameraDeviceLabel ? `Active: ${cameraDeviceLabel}` : 'Interactive 8-zone spatial drum skeleton with motion tracking'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Camera Selector Dropdown if multiple devices */}
          {availableDevices.length > 1 && !isActive && (
            <select
              value={selectedDeviceId}
              onChange={(e) => {
                setSelectedDeviceId(e.target.value);
                if (isActive) startCamera(e.target.value);
              }}
              className="bg-slate-900 border border-slate-700 text-slate-200 text-[10px] rounded px-1.5 py-1 font-mono-code max-w-[130px] truncate"
            >
              {availableDevices.map((d, i) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Camera ${i + 1}`}
                </option>
              ))}
            </select>
          )}

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
              onClick={() => startCamera()}
              disabled={isStarting}
              className="flex items-center gap-1 px-3 py-1 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-display font-black shadow-[0_0_12px_rgba(16,185,129,0.4)] transition-all disabled:opacity-50"
            >
              {isStarting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Video className="w-3.5 h-3.5" />}
              <span>{isStarting ? 'STARTING...' : 'START CAMERA'}</span>
            </button>
          )}

          {/* Diagnostic Toggle */}
          <button
            onClick={() => setShowDiagnostics((p) => !p)}
            className={`p-1 rounded-lg border text-xs font-mono-code transition-colors ${
              showDiagnostics ? 'bg-amber-950 border-amber-500 text-amber-300' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
            }`}
            title="Toggle Live Camera Diagnostics"
          >
            <Info className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {cameraError && (
        <div className="p-2 rounded-lg bg-red-950/80 border border-red-500 text-red-200 text-[10px] font-mono-code flex items-start gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
          <div className="flex flex-col gap-0.5">
            <strong className="text-red-300 font-bold">Camera Access Issue:</strong>
            <span>{cameraError}</span>
            <div className="flex items-center gap-2 mt-1">
              <button
                onClick={() => startCamera()}
                className="px-2 py-0.5 rounded bg-red-800 hover:bg-red-700 text-white font-bold text-[9px]"
              >
                🔄 Retry Camera
              </button>
              <button
                onClick={() => setIsDemoMode((p) => !p)}
                className="px-2 py-0.5 rounded bg-purple-900 hover:bg-purple-800 text-purple-200 font-bold text-[9px]"
              >
                ✨ Try Demo Mode
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Live Diagnostics Panel */}
      {showDiagnostics && (
        <div className="p-2 rounded-lg bg-black/90 border border-amber-500/40 text-[9px] font-mono-code text-amber-200 flex flex-col gap-1">
          <div className="flex justify-between items-center border-b border-amber-500/20 pb-1">
            <span className="font-bold text-amber-400">CAMERA & SENSOR DIAGNOSTICS</span>
            <button onClick={() => setDiagnosticLogs([])} className="text-slate-400 hover:text-white">Clear</button>
          </div>
          <div className="grid grid-cols-2 gap-1 text-slate-300">
            <div>HTTPS Context: <strong className={window.isSecureContext ? 'text-emerald-400' : 'text-red-400'}>{window.isSecureContext ? 'YES (Secure)' : 'NO (Insecure)'}</strong></div>
            <div>MediaDevices API: <strong className={navigator.mediaDevices ? 'text-emerald-400' : 'text-red-400'}>{navigator.mediaDevices ? 'AVAILABLE' : 'UNAVAILABLE'}</strong></div>
            <div>Active State: <strong className="text-white">{isActive ? 'ACTIVE' : 'IDLE'}</strong></div>
            <div>Video Res: <strong className="text-white">{cameraResolution || '0x0'}</strong></div>
          </div>
          <div className="max-h-20 overflow-y-auto bg-slate-950/80 p-1 rounded border border-slate-800 flex flex-col gap-0.5 text-slate-400">
            {diagnosticLogs.length === 0 ? (
              <span>No logs yet. Click "START CAMERA" to record events.</span>
            ) : (
              diagnosticLogs.map((l, i) => <div key={i}>{l}</div>)
            )}
          </div>
        </div>
      )}

      {/* Main Viewport: Native Video Layer (Bottom) + Transparent Skeleton Canvas Layer (Top) */}
      <div className="relative w-full aspect-[16/9] max-h-[225px] rounded-lg overflow-hidden border-2 border-slate-700 bg-black flex items-center justify-center shadow-lg">
        {/* 1. Real Native HTML5 Video Element */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`absolute inset-0 w-full h-full object-cover transform scale-x-[-1] transition-opacity duration-200 ${
            isActive ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        />

        {/* 2. Transparent Interactive 8-Drum Skeleton Overlay Canvas */}
        <canvas
          ref={overlayCanvasRef}
          width={640}
          height={360}
          onClick={handleCanvasClick}
          className="absolute inset-0 w-full h-full object-cover cursor-pointer select-none z-10"
          title="Click or strike any drum zone"
        />

        {/* If Video is Paused by browser */}
        {isActive && isVideoPaused && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <button
              onClick={resumeVideo}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg"
            >
              <Play className="w-4 h-4 fill-white" />
              <span>Resume Camera Feed</span>
            </button>
          </div>
        )}

        {/* Top Floating Guide */}
        <div className="absolute top-1.5 left-1/2 -translate-x-1/2 pointer-events-none px-2.5 py-0.5 rounded-full bg-black/75 backdrop-blur-md border border-slate-700/80 flex items-center gap-2 text-[9px] font-mono-code text-slate-300 shadow-md z-20">
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

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { DrumInstrumentId, Hand, Handedness } from '../types/drum';
import { getInstrumentHand } from '../data/beatLibrary';
import { 
  Camera, 
  Square, 
  RefreshCw, 
  Video, 
  AlertCircle, 
  Layers, 
  Maximize2, 
  Minimize2, 
  Play, 
  Activity, 
  Sparkles, 
  Tv, 
  Gauge, 
  Flame,
  Zap,
  Target,
  CheckCircle2
} from 'lucide-react';

interface AirDrummingCameraProps {
  onAirStrike: (instrument: DrumInstrumentId, hand: Hand) => void;
  handedness?: Handedness;
  invertHands?: boolean;
}

interface AirZoneConfig {
  id: DrumInstrumentId;
  label: string;
  sub: string;
  type: 'cymbal' | 'snare' | 'tom' | 'bass';
  leftPct: number;
  topPct: number;
  widthPct: number;
  heightPct: number;
}

// Ergonomic 8-Part Acoustic Drum Layout
const AIR_ZONES: AirZoneConfig[] = [
  { id: 'crash',        label: 'CRASH',     sub: '16" Cymbal',  type: 'cymbal', leftPct: 3,  topPct: 3,  widthPct: 22, heightPct: 29 },
  { id: 'high_tom',     label: 'HIGH TOM',  sub: '10" Tom',     type: 'tom',    leftPct: 27, topPct: 3,  widthPct: 22, heightPct: 29 },
  { id: 'mid_tom',      label: 'MID TOM',   sub: '12" Tom',     type: 'tom',    leftPct: 51, topPct: 3,  widthPct: 22, heightPct: 29 },
  { id: 'ride',         label: 'RIDE',      sub: '20" Cymbal',  type: 'cymbal', leftPct: 75, topPct: 3,  widthPct: 22, heightPct: 29 },
  { id: 'hihat_closed', label: 'HI-HAT',    sub: '14" Cymbals', type: 'cymbal', leftPct: 3,  topPct: 35, widthPct: 22, heightPct: 31 },
  { id: 'snare',        label: 'SNARE',     sub: '14" Snare',   type: 'snare',  leftPct: 27, topPct: 35, widthPct: 22, heightPct: 31 },
  { id: 'floor_tom',    label: 'FLOOR TOM', sub: '16" Floor',   type: 'tom',    leftPct: 75, topPct: 35, widthPct: 22, heightPct: 31 },
  { id: 'bass',         label: 'BASS DRUM', sub: '22" Kick',    type: 'bass',   leftPct: 33, topPct: 68, widthPct: 34, heightPct: 29 },
];

type FitMode = 'cover' | 'contain' | 'fill' | '16:9' | '4:3';

interface FingerPoint {
  x: number; // 0 to 100%
  y: number; // 0 to 100%
  active: boolean;
  isStriking: boolean;
}

export const AirDrummingCamera: React.FC<AirDrummingCameraProps> = ({
  onAirStrike,
  handedness = 'RIGHT_HANDED',
  invertHands = false,
}) => {
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const [isStarting, setIsStarting] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [showZones, setShowZones] = useState<boolean>(true);
  const [isMirrored, setIsMirrored] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [flashes, setFlashes] = useState<Record<string, boolean>>({});
  const [isVirtualCam, setIsVirtualCam] = useState<boolean>(false);

  // Camera Dimension & Layout Fit
  const [fitMode, setFitMode] = useState<FitMode>('cover');

  // AI Finger Tracking State
  const [isAiLoaded, setIsAiLoaded] = useState<boolean>(false);
  const [motionSensitivity, setMotionSensitivity] = useState<number>(75); // 1-100
  const [hitCounts, setHitCounts] = useState<Record<string, number>>({});
  const [totalHits, setTotalHits] = useState<number>(0);

  // Dual Index Finger Landmark Dots
  const [leftFinger, setLeftFinger] = useState<FingerPoint>({ x: 30, y: 50, active: false, isStriking: false });
  const [rightFinger, setRightFinger] = useState<FingerPoint>({ x: 70, y: 50, active: false, isStriking: false });

  // Live Telemetry & Diagnostics
  const [resolution, setResolution] = useState<string>('0×0');
  const [deviceLabel, setDeviceLabel] = useState<string>('');
  const [availableDevices, setAvailableDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [statusLog, setStatusLog] = useState<string>('Initializing AI Index Finger Vision...');
  const [showDiag, setShowDiag] = useState<boolean>(false);
  const [isBlackStream, setIsBlackStream] = useState<boolean>(false);
  const [videoStats, setVideoStats] = useState({ readyState: 0, paused: true, currentTime: 0 });

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lastHit = useRef<Record<string, number>>({});
  const handsModelRef = useRef<unknown>(null);
  const isProcessingRef = useRef<boolean>(false);
  const animFrameRef = useRef<number>(0);
  const prevYRef = useRef<{ left: number; right: number }>({ left: 50, right: 50 });
  const virtualCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const virtualAnimRef = useRef<number>(0);

  // ── Strike Trigger (Ultra-Fast 50ms Cooldown for Instant Drum Rolls) ────────
  const fireStrike = useCallback(
    (id: DrumInstrumentId, hand: Hand) => {
      const now = performance.now();
      if (now - (lastHit.current[id] || 0) < 50) return;
      lastHit.current[id] = now;

      setHitCounts((prev) => ({ ...prev, [id]: (prev[id] || 0) + 1 }));
      setTotalHits((prev) => prev + 1);
      setFlashes((prev) => ({ ...prev, [id]: true }));
      setTimeout(() => {
        setFlashes((prev) => ({ ...prev, [id]: false }));
      }, 120);

      onAirStrike(id, hand);
    },
    [onAirStrike]
  );

  // ── Initialize MediaPipe Hands AI Engine ────────────────────────────────────
  useEffect(() => {
    let checkCount = 0;
    const initHands = () => {
      const win = window as unknown as { Hands?: new (cfg: { locateFile: (f: string) => string }) => unknown };
      if (typeof win.Hands === 'function') {
        try {
          const hands = new win.Hands({
            locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
          }) as {
            setOptions: (opts: unknown) => void;
            onResults: (cb: (res: unknown) => void) => void;
            send: (input: { image: HTMLVideoElement }) => Promise<void>;
            close?: () => void;
          };

          hands.setOptions({
            maxNumHands: 2,
            modelComplexity: 1,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5,
          });

          hands.onResults((results: unknown) => {
            const res = results as {
              multiHandLandmarks?: Array<Array<{ x: number; y: number; z: number }>>;
              multiHandedness?: Array<{ label: string; score: number }>;
            };

            let lPt: FingerPoint = { x: 30, y: 50, active: false, isStriking: false };
            let rPt: FingerPoint = { x: 70, y: 50, active: false, isStriking: false };

            if (res.multiHandLandmarks && res.multiHandedness) {
              for (let i = 0; i < res.multiHandLandmarks.length; i++) {
                const landmarks = res.multiHandLandmarks[i];
                const handednessInfo = res.multiHandedness[i];
                // Landmark 8 is the exact INDEX FINGERTIP
                const indexTip = landmarks[8];

                if (indexTip) {
                  // In mirrored selfie mode, x coordinates flip
                  const rawX = indexTip.x * 100;
                  const rawY = indexTip.y * 100;

                  // Label can be 'Left' or 'Right'
                  const isLeftLabel = handednessInfo.label === 'Left';

                  // Determine hand side based on screen position and label
                  if (rawX > 50 || isLeftLabel) {
                    const vy = rawY - prevYRef.current.left;
                    prevYRef.current.left = rawY;
                    lPt = {
                      x: isMirrored ? (100 - rawX) : rawX,
                      y: rawY,
                      active: true,
                      isStriking: vy > 1.2,
                    };
                  } else {
                    const vy = rawY - prevYRef.current.right;
                    prevYRef.current.right = rawY;
                    rPt = {
                      x: isMirrored ? (100 - rawX) : rawX,
                      y: rawY,
                      active: true,
                      isStriking: vy > 1.2,
                    };
                  }
                }
              }
            }

            setLeftFinger(lPt);
            setRightFinger(rPt);

            // 🎯 CHECK IF INDEX FINGER TIP IS INSIDE ANY DRUM PAD
            const checkFingerStrike = (f: FingerPoint, hand: Hand) => {
              if (!f.active) return;
              AIR_ZONES.forEach((zone) => {
                const inX = f.x >= zone.leftPct && f.x <= (zone.leftPct + zone.widthPct);
                const inY = f.y >= zone.topPct && f.y <= (zone.topPct + zone.heightPct);
                if (inX && inY) {
                  fireStrike(zone.id, hand);
                }
              });
            };

            checkFingerStrike(lPt, 'LEFT');
            checkFingerStrike(rPt, 'RIGHT');
            isProcessingRef.current = false;
          });

          handsModelRef.current = hands;
          setIsAiLoaded(true);
          setStatusLog('AI Index Finger Vision Active');
        } catch (e) {
          console.warn('MediaPipe Hands init warning:', e);
        }
      } else {
        checkCount++;
        if (checkCount < 30) {
          setTimeout(initHands, 200);
        }
      }
    };

    initHands();

    return () => {
      const h = handsModelRef.current as { close?: () => void } | null;
      if (h && typeof h.close === 'function') {
        h.close();
      }
    };
  }, [isMirrored, fireStrike]);

  // ── AI Video Frame Processing Loop ──────────────────────────────────────────
  useEffect(() => {
    if (!mediaStream) {
      cancelAnimationFrame(animFrameRef.current);
      return;
    }

    const processFrame = async () => {
      const videoEl = videoRef.current;
      const hands = handsModelRef.current as { send: (input: { image: HTMLVideoElement }) => Promise<void> } | null;

      if (videoEl && videoEl.readyState >= 2 && hands && !isProcessingRef.current) {
        isProcessingRef.current = true;
        try {
          await hands.send({ image: videoEl });
        } catch {
          isProcessingRef.current = false;
        }
      }

      animFrameRef.current = requestAnimationFrame(processFrame);
    };

    animFrameRef.current = requestAnimationFrame(processFrame);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [mediaStream]);

  // ── Enumerate Connected Video Cameras ───────────────────────────────────────
  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = allDevices.filter((d) => d.kind === 'videoinput');
      setAvailableDevices(videoInputs);
    } catch (err) {
      console.warn('enumerateDevices error:', err);
    }
  }, []);

  useEffect(() => {
    refreshDevices();
    if (navigator.mediaDevices?.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', refreshDevices);
      return () => {
        navigator.mediaDevices.removeEventListener('devicechange', refreshDevices);
      };
    }
  }, [refreshDevices]);

  // ── Declarative Video Binding Effect ────────────────────────────────────────
  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;

    if (mediaStream) {
      if (videoEl.srcObject !== mediaStream) {
        videoEl.srcObject = mediaStream;
      }
      videoEl.muted = true;
      videoEl.playsInline = true;

      const handleMeta = () => {
        if (videoEl.videoWidth > 0) {
          setResolution(`${videoEl.videoWidth}×${videoEl.videoHeight}`);
          setStatusLog(`Live Feed: ${videoEl.videoWidth}×${videoEl.videoHeight}`);
        }
        videoEl.play().catch((e) => console.log('play on loadedmetadata:', e));
      };

      videoEl.onloadedmetadata = handleMeta;
      videoEl.onloadeddata = handleMeta;
      videoEl.oncanplay = handleMeta;
      videoEl.play().catch(() => {});

      // Black Frame Detection Watchdog
      const sampleCanvas = document.createElement('canvas');
      sampleCanvas.width = 32;
      sampleCanvas.height = 18;
      const sampleCtx = sampleCanvas.getContext('2d');

      const interval = setInterval(() => {
        if (videoEl) {
          setVideoStats({
            readyState: videoEl.readyState,
            paused: videoEl.paused,
            currentTime: Math.round(videoEl.currentTime * 10) / 10,
          });

          if (videoEl.videoWidth > 0) {
            setResolution(`${videoEl.videoWidth}×${videoEl.videoHeight}`);

            if (sampleCtx && videoEl.readyState >= 2) {
              try {
                sampleCtx.drawImage(videoEl, 0, 0, 32, 18);
                const p = sampleCtx.getImageData(0, 0, 32, 18).data;
                let lum = 0;
                for (let i = 0; i < p.length; i += 4) {
                  lum += (p[i] + p[i + 1] + p[i + 2]) / 3;
                }
                const avgLum = lum / (32 * 18);
                setIsBlackStream(avgLum < 4);
              } catch {}
            }
          }
        }
      }, 800);

      return () => clearInterval(interval);
    } else {
      videoEl.srcObject = null;
      setResolution('0×0');
      setIsBlackStream(false);
    }
  }, [mediaStream]);

  // ── Meeting App Camera Starter ──────────────────────────────────────────────
  const startCamera = async (targetDeviceId?: string) => {
    setCameraError(null);
    setIsStarting(true);
    setIsVirtualCam(false);
    setStatusLog('Requesting camera permission...');

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const err = 'Camera API not supported or blocked by browser (requires HTTPS).';
      setCameraError(err);
      setStatusLog(`Error: ${err}`);
      setIsStarting(false);
      return;
    }

    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => t.stop());
      setMediaStream(null);
    }

    const deviceId = targetDeviceId || selectedDeviceId;
    const constraints: MediaStreamConstraints = {
      video: deviceId 
        ? { deviceId: { exact: deviceId } } 
        : { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    };

    try {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }

      setMediaStream(stream);

      const track = stream.getVideoTracks()[0];
      if (track) {
        setDeviceLabel(track.label || 'Webcam');
        setStatusLog(`Connected: ${track.label || 'Camera'} (${track.readyState})`);

        track.onended = () => {
          stopCamera();
          setCameraError('Camera was disconnected.');
          setStatusLog('Camera track ended.');
        };
      }

      setIsStarting(false);
      await refreshDevices();
    } catch (err: unknown) {
      const errorObj = err as Error;
      console.error('getUserMedia error:', errorObj);
      const msg = errorObj?.name === 'NotAllowedError'
        ? 'Camera permission denied. Please click the lock icon in your address bar and set Camera to Allow.'
        : errorObj?.name === 'NotReadableError'
        ? 'Camera is locked by another app (Zoom, Teams, etc.). Please close other video apps.'
        : `Camera error: ${errorObj?.message || 'Failed to start'}`;

      setCameraError(msg);
      setStatusLog(`Failed: ${errorObj?.name || 'Error'}`);
      setIsStarting(false);
    }
  };

  // ── Virtual Test Camera (Animated Canvas Stream) ───────────────────────────
  const startVirtualCamera = () => {
    setCameraError(null);
    setIsStarting(true);
    setIsVirtualCam(true);

    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => t.stop());
    }

    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 360;
    virtualCanvasRef.current = canvas;
    const ctx = canvas.getContext('2d');

    let t = 0;
    const renderAnim = () => {
      t += 0.045;
      if (ctx) {
        const grad = ctx.createLinearGradient(0, 0, 640, 360);
        grad.addColorStop(0, '#090e1c');
        grad.addColorStop(1, '#1e1b4b');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 640, 360);

        // Moving simulated index fingertip dots
        const x1 = 320 + Math.sin(t) * 220;
        const y1 = 180 + Math.cos(t * 1.6) * 110;
        ctx.beginPath();
        ctx.arc(x1, y1, 25, 0, Math.PI * 2);
        ctx.fillStyle = '#00E5FF';
        ctx.shadowColor = '#00E5FF';
        ctx.shadowBlur = 25;
        ctx.fill();

        const x2 = 320 - Math.sin(t * 1.4) * 200;
        const y2 = 180 - Math.cos(t * 1.2) * 100;
        ctx.beginPath();
        ctx.arc(x2, y2, 25, 0, Math.PI * 2);
        ctx.fillStyle = '#FF6D00';
        ctx.shadowColor = '#FF6D00';
        ctx.shadowBlur = 25;
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.font = 'bold 18px monospace';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.fillText('🌈 VIRTUAL TEST CAMERA PATTERN', 320, 45);
        ctx.font = '13px monospace';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText('Moving objects trigger index fingertip strikes', 320, 75);
      }
      virtualAnimRef.current = requestAnimationFrame(renderAnim);
    };
    renderAnim();

    const stream = canvas.captureStream(30);
    setMediaStream(stream);
    setDeviceLabel('Virtual Test Camera');
    setStatusLog('Virtual camera pattern streaming.');
    setIsStarting(false);
  };

  // ── Stop Camera ─────────────────────────────────────────────────────────────
  const stopCamera = () => {
    cancelAnimationFrame(virtualAnimRef.current);
    cancelAnimationFrame(animFrameRef.current);
    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => t.stop());
      setMediaStream(null);
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsVirtualCam(false);
    setIsStarting(false);
    setResolution('0×0');
    setStatusLog('Camera stopped.');
  };

  const handleDeviceChange = (newDeviceId: string) => {
    setSelectedDeviceId(newDeviceId);
    if (mediaStream && !isVirtualCam) {
      startCamera(newDeviceId);
    }
  };

  const forcePlayVideo = () => {
    if (videoRef.current) {
      videoRef.current.play().catch((e) => console.log('forcePlay error:', e));
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(virtualAnimRef.current);
      cancelAnimationFrame(animFrameRef.current);
      if (mediaStream) {
        mediaStream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [mediaStream]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const isActive = Boolean(mediaStream);

  // Compute CSS styles based on selected Fit Mode
  const getVideoStyle = (): React.CSSProperties => {
    const base: React.CSSProperties = {
      transform: isMirrored ? 'scaleX(-1)' : 'none',
      backgroundColor: '#050811',
    };

    if (fitMode === 'cover') {
      return { ...base, width: '100%', height: '100%', objectFit: 'cover' };
    }
    if (fitMode === 'contain') {
      return { ...base, width: '100%', height: '100%', objectFit: 'contain' };
    }
    if (fitMode === 'fill') {
      return { ...base, width: '100%', height: '100%', objectFit: 'fill' };
    }
    if (fitMode === '16:9') {
      return { ...base, width: '100%', height: '100%', aspectRatio: '16/9', objectFit: 'cover' };
    }
    if (fitMode === '4:3') {
      return { ...base, width: '100%', height: '100%', aspectRatio: '4/3', objectFit: 'cover' };
    }
    return base;
  };

  return (
    <div
      onContextMenu={(e) => e.preventDefault()}
      className="w-full h-full flex-1 flex flex-col min-h-0 bg-[#070b14] rounded-2xl border border-slate-800 p-2 select-none gap-2 shadow-2xl overflow-hidden font-mono-code"
    >
      {/* ── TOP CONTROL BAR ── */}
      <div className="shrink-0 flex items-center justify-between flex-wrap gap-2 bg-[#0c1222] border border-slate-800 rounded-xl px-3 py-2">
        {/* Left: Status & Hit Stats */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/50 flex items-center justify-center">
            <Target className={`w-4 h-4 ${isActive ? 'text-emerald-400 animate-pulse' : 'text-slate-400'}`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-display font-black text-xs sm:text-sm text-white tracking-wide">
                INDEX FINGER AIR DRUMMING
              </h2>
              {isAiLoaded ? (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-500/50 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-cyan-400" />
                  AI VISION READY
                </span>
              ) : (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                  LOADING AI...
                </span>
              )}
              {totalHits > 0 && (
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-orange-950 text-orange-300 border border-orange-500/40 flex items-center gap-1">
                  <Flame className="w-3 h-3 text-orange-400" />
                  {totalHits} STRIKES
                </span>
              )}
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5 truncate max-w-[180px] sm:max-w-none">
              {deviceLabel ? `📷 ${deviceLabel}` : statusLog}
            </p>
          </div>
        </div>

        {/* Center: Camera Dimension & Fit Mode Dropdown + Flinch Sensitivity Slider */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Layout Dimension Selector */}
          <div className="flex items-center gap-1.5 bg-black/70 border border-slate-700 px-2.5 py-1 rounded-xl text-xs">
            <Tv className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span className="text-[10px] text-slate-400 font-bold hidden sm:inline">FIT:</span>
            <select
              value={fitMode}
              onChange={(e) => setFitMode(e.target.value as FitMode)}
              className="bg-transparent text-cyan-300 text-[11px] font-black outline-none cursor-pointer"
              title="Change Camera Framing & Scale"
            >
              <option value="cover" className="bg-slate-900 text-white">Fill & Cover (Max Stage)</option>
              <option value="contain" className="bg-slate-900 text-white">Fit Entire Sensor</option>
              <option value="fill" className="bg-slate-900 text-white">Stretch to Edges</option>
              <option value="16:9" className="bg-slate-900 text-white">16:9 Widescreen</option>
              <option value="4:3" className="bg-slate-900 text-white">4:3 Standard</option>
            </select>
          </div>

          {/* Finger Sensitivity Slider */}
          <div className="flex items-center gap-1.5 bg-black/70 border border-slate-700 px-2.5 py-1 rounded-xl text-xs">
            <Gauge className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="text-[10px] text-slate-400 font-bold hidden sm:inline">DOT SENS:</span>
            <input
              type="range"
              min="20"
              max="95"
              value={motionSensitivity}
              onChange={(e) => setMotionSensitivity(Number(e.target.value))}
              className="w-16 sm:w-24 accent-amber-400 cursor-pointer h-1.5"
              title={`Finger Dot Sensitivity: ${motionSensitivity}%`}
            />
            <span className="text-[10px] font-bold text-amber-300 w-6">{motionSensitivity}%</span>
          </div>

          {/* Camera Device Switcher */}
          {availableDevices.length > 1 && !isVirtualCam && (
            <div className="flex items-center gap-1.5 bg-black/60 border border-slate-700 px-2 py-1 rounded-xl text-xs">
              <Video className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <select
                value={selectedDeviceId}
                onChange={(e) => handleDeviceChange(e.target.value)}
                className="bg-transparent text-slate-200 text-[11px] font-bold outline-none cursor-pointer max-w-[130px] truncate"
                title="Select Camera"
              >
                {availableDevices.map((d, idx) => (
                  <option key={d.deviceId || idx} value={d.deviceId} className="bg-slate-900 text-white">
                    {d.label || `Camera ${idx + 1}`}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Right: Master Control Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Virtual Cam Pattern Test */}
          {!isActive && (
            <button
              onClick={startVirtualCamera}
              className="px-2.5 py-1.5 rounded-xl bg-purple-950/80 hover:bg-purple-900 border border-purple-500/50 text-purple-300 text-[11px] font-bold flex items-center gap-1 transition-all"
              title="Test with Virtual Camera Pattern"
            >
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              <span>TEST PATTERN</span>
            </button>
          )}

          {/* Force Play button if paused */}
          {isActive && videoStats.paused && (
            <button
              onClick={forcePlayVideo}
              className="px-2.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-[11px] font-bold flex items-center gap-1 shadow-md animate-pulse"
              title="Click to unfreeze video"
            >
              <Play className="w-3 h-3 fill-current" />
              <span>PLAY VIDEO</span>
            </button>
          )}

          {/* Toggle Drum Zones Overlay */}
          <button
            onClick={() => setShowZones((prev) => !prev)}
            className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-bold transition-all flex items-center gap-1 ${
              showZones
                ? 'bg-cyan-950/70 border-cyan-500/50 text-cyan-300'
                : 'bg-slate-800 border-slate-700 text-slate-400'
            }`}
            title="Toggle Drum Zones Overlay"
          >
            <Layers className="w-3 h-3" />
            <span>{showZones ? 'ZONES: ON' : 'ZONES: OFF'}</span>
          </button>

          {/* Mirror Toggle */}
          <button
            onClick={() => setIsMirrored((prev) => !prev)}
            className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-bold transition-all flex items-center gap-1 ${
              isMirrored
                ? 'bg-slate-800 border-slate-700 text-slate-300'
                : 'bg-indigo-950/70 border-indigo-500/50 text-indigo-300'
            }`}
            title={isMirrored ? 'Mirrored (Selfie)' : 'Normal View'}
          >
            <RefreshCw className="w-3 h-3" />
            <span>{isMirrored ? 'MIRROR' : 'NORMAL'}</span>
          </button>

          {/* Start / Stop Button */}
          {isActive ? (
            <button
              onClick={stopCamera}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl font-display font-bold text-xs bg-red-950 hover:bg-red-900 text-red-200 border border-red-500/50 transition-all shadow-md"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>STOP CAMERA</span>
            </button>
          ) : (
            <button
              onClick={() => startCamera()}
              disabled={isStarting}
              className={`flex items-center gap-1.5 px-5 py-1.5 rounded-xl font-display font-black text-xs transition-all shadow-md ${
                isStarting
                  ? 'bg-slate-800 text-slate-400 cursor-not-allowed'
                  : 'bg-gradient-to-r from-emerald-500 to-teal-500 text-black shadow-[0_0_15px_rgba(16,185,129,0.5)] hover:scale-105'
              }`}
            >
              <Camera className="w-4 h-4" />
              <span>{isStarting ? 'CONNECTING...' : 'START CAMERA'}</span>
            </button>
          )}

          {/* Diagnostics toggle */}
          <button
            onClick={() => setShowDiag((prev) => !prev)}
            className={`p-1.5 rounded-xl border text-xs ${showDiag ? 'bg-amber-950 text-amber-300 border-amber-500' : 'bg-slate-800 text-slate-400 border-slate-700'}`}
            title="Toggle Live Telemetry"
          >
            <Activity className="w-3.5 h-3.5" />
          </button>

          {/* Fullscreen Toggle */}
          <button
            onClick={toggleFullscreen}
            className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs"
            title="Toggle Fullscreen"
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* ── BLACK STREAM HARDWARE WARNING ── */}
      {isBlackStream && isActive && !isVirtualCam && (
        <div className="shrink-0 p-3 rounded-xl bg-amber-950/90 border border-amber-500 text-amber-200 text-xs flex items-center justify-between gap-2 shadow-lg animate-pulse">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              <b>Webcam is sending pure black frames.</b> Check if your webcam has a physical sliding privacy shutter or switch.
            </span>
          </div>
          <button
            onClick={startVirtualCamera}
            className="px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs shrink-0"
          >
            Switch to Test Pattern
          </button>
        </div>
      )}

      {/* ── ERROR NOTICE BANNER ── */}
      {cameraError && (
        <div className="shrink-0 p-3 rounded-xl bg-red-950/90 border border-red-500 text-red-200 text-xs flex items-center justify-between gap-2 shadow-lg">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{cameraError}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={startVirtualCamera}
              className="px-3 py-1 rounded-lg bg-purple-900 hover:bg-purple-800 text-purple-200 font-bold text-xs"
            >
              Try Test Pattern
            </button>
            <button
              onClick={() => startCamera()}
              className="px-3 py-1 rounded-lg bg-red-800 hover:bg-red-700 text-white font-bold text-xs"
            >
              🔄 Retry
            </button>
          </div>
        </div>
      )}

      {/* ── LIVE TELEMETRY DRAWER ── */}
      {showDiag && (
        <div className="shrink-0 p-2.5 rounded-xl bg-black/90 border border-slate-700 text-[11px] text-slate-300 grid grid-cols-2 sm:grid-cols-5 gap-2">
          <div>Stream: <b className={isActive ? 'text-emerald-400' : 'text-slate-500'}>{isActive ? `ACTIVE (${resolution})` : 'OFF'}</b></div>
          <div>AI Status: <b className={isAiLoaded ? 'text-cyan-400' : 'text-amber-400'}>{isAiLoaded ? 'TRACKING' : 'LOADING'}</b></div>
          <div>Sens: <b className="text-amber-300">{motionSensitivity}%</b></div>
          <div>Left Finger: <b className="text-cyan-400">{leftFinger.active ? `${Math.round(leftFinger.x)}%, ${Math.round(leftFinger.y)}%` : 'Not Detected'}</b></div>
          <div>Right Finger: <b className="text-orange-400">{rightFinger.active ? `${Math.round(rightFinger.x)}%, ${Math.round(rightFinger.y)}%` : 'Not Detected'}</b></div>
        </div>
      )}

      {/* ── AIR DRUM VIEWPORT WITH AI INDEX FINGER TRACKING DOTS ── */}
      <div className="relative w-full flex-1 min-h-[350px] rounded-2xl border-2 border-slate-800 bg-[#050811] overflow-hidden flex items-center justify-center">
        {/* Native HTML5 Video Element */}
        <video
          ref={(el) => {
            videoRef.current = el;
            if (el && mediaStream && el.srcObject !== mediaStream) {
              el.srcObject = mediaStream;
              el.play().catch(() => {});
            }
          }}
          autoPlay
          playsInline
          muted
          style={getVideoStyle()}
        />

        {/* Standby Placeholder Screen */}
        {!isActive && (
          <div className="absolute inset-0 bg-[#050811] flex flex-col items-center justify-center gap-3 text-slate-400 p-6 text-center z-10">
            <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center shadow-lg">
              <Video className="w-8 h-8 text-slate-500" />
            </div>
            <div>
              <p className="font-bold text-white text-sm">Camera is currently inactive</p>
              <p className="text-xs text-slate-500 mt-1">Click "START CAMERA" to begin AI index finger air drumming</p>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={() => startCamera()}
                disabled={isStarting}
                className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs shadow-lg transition-transform hover:scale-105"
              >
                {isStarting ? 'CONNECTING...' : '📷 START CAMERA'}
              </button>
              <button
                onClick={startVirtualCamera}
                className="px-4 py-2 rounded-xl bg-purple-900 hover:bg-purple-800 text-purple-200 font-bold text-xs shadow-lg transition-transform hover:scale-105"
              >
                ✨ TEST PATTERN
              </button>
            </div>
          </div>
        )}

        {/* ── 8 GLOWING NEON ERGONOMIC DRUM PADS ── */}
        {isActive && showZones && (
          <div className="absolute inset-0 pointer-events-auto z-10">
            {AIR_ZONES.map((zone) => {
              const hand = getInstrumentHand(zone.id, handedness, invertHands);
              const isRight = hand === 'RIGHT';
              const color = isRight ? '#FF6D00' : '#00E5FF';
              const isFlashing = Boolean(flashes[zone.id]);
              const hits = hitCounts[zone.id] || 0;

              return (
                <div
                  key={zone.id}
                  onClick={() => fireStrike(zone.id, hand)}
                  onTouchStart={(e) => {
                    e.preventDefault();
                    fireStrike(zone.id, hand);
                  }}
                  style={{
                    position: 'absolute',
                    left: `${zone.leftPct}%`,
                    top: `${zone.topPct}%`,
                    width: `${zone.widthPct}%`,
                    height: `${zone.heightPct}%`,
                    border: isFlashing 
                      ? '3px solid #ffffff' 
                      : `1.5px dashed ${color}88`,
                    backgroundColor: isFlashing 
                      ? 'rgba(255,255,255,0.45)' 
                      : 'rgba(0,0,0,0.18)',
                    boxShadow: isFlashing 
                      ? '0 0 35px #ffffff, inset 0 0 25px #ffffff' 
                      : `0 0 10px ${color}20`,
                  }}
                  className="rounded-2xl cursor-pointer flex flex-col items-center justify-between p-2 select-none transition-all hover:bg-white/10 group backdrop-blur-[1px]"
                >
                  {/* Top Bar: Name & Hand Indicator */}
                  <div className="w-full flex items-center justify-between pointer-events-none">
                    <span 
                      className="text-xs sm:text-sm font-black text-white tracking-wide" 
                      style={{ textShadow: `0 0 8px ${color}` }}
                    >
                      {zone.label}
                    </span>
                    <span
                      className="text-[9px] font-bold px-1.5 py-0.2 rounded border bg-black/70 shadow-sm flex items-center gap-0.5"
                      style={{ borderColor: color, color }}
                    >
                      <Zap className="w-2.5 h-2.5" />
                      {isRight ? 'RH' : 'LH'}
                    </span>
                  </div>

                  {/* Center: Hit Counter Badge */}
                  <div className="w-full flex flex-col items-center gap-1 pointer-events-none px-2">
                    {hits > 0 ? (
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-black/80 text-cyan-300 border border-cyan-500/50 shadow-md">
                        {hits} hits
                      </span>
                    ) : (
                      <span className="text-[8px] text-slate-500">Touch with finger</span>
                    )}
                  </div>

                  {/* Bottom Subtitle */}
                  <div className="w-full flex items-center justify-between pointer-events-none text-[9px] text-slate-300">
                    <span className="bg-black/80 px-1.5 py-0.5 rounded border border-slate-800/80">
                      {zone.sub}
                    </span>
                    <span className="text-[8px] font-bold text-slate-400">
                      {isFlashing ? 'HIT!' : 'Target'}
                    </span>
                  </div>
                </div>
              );
            })}

            {/* 🔵 AI LEFT INDEX FINGER TRACKING DOT */}
            {leftFinger.active && (
              <div
                style={{
                  left: `${leftFinger.x}%`,
                  top: `${leftFinger.y}%`,
                  transform: 'translate(-50%, -50%)',
                }}
                className="absolute pointer-events-none z-30 transition-all duration-75 flex flex-col items-center"
              >
                {/* Glowing AI Laser Crosshair Dot */}
                <div className="relative flex items-center justify-center">
                  <div className="w-7 h-7 rounded-full bg-cyan-400/40 animate-ping absolute" />
                  <div className="w-6 h-6 rounded-full bg-cyan-400 border-2 border-white shadow-[0_0_25px_#00E5FF] flex items-center justify-center">
                    <div className="w-2.5 h-2.5 rounded-full bg-white" />
                  </div>
                </div>
                {/* Tracker Label */}
                <span className="mt-1 text-[9px] font-black px-2 py-0.5 rounded bg-cyan-950/90 text-cyan-300 border border-cyan-400 shadow-md whitespace-nowrap">
                  LH INDEX
                </span>
              </div>
            )}

            {/* 🟠 AI RIGHT INDEX FINGER TRACKING DOT */}
            {rightFinger.active && (
              <div
                style={{
                  left: `${rightFinger.x}%`,
                  top: `${rightFinger.y}%`,
                  transform: 'translate(-50%, -50%)',
                }}
                className="absolute pointer-events-none z-30 transition-all duration-75 flex flex-col items-center"
              >
                {/* Glowing AI Laser Crosshair Dot */}
                <div className="relative flex items-center justify-center">
                  <div className="w-7 h-7 rounded-full bg-orange-400/40 animate-ping absolute" />
                  <div className="w-6 h-6 rounded-full bg-orange-500 border-2 border-white shadow-[0_0_25px_#FF6D00] flex items-center justify-center">
                    <div className="w-2.5 h-2.5 rounded-full bg-white" />
                  </div>
                </div>
                {/* Tracker Label */}
                <span className="mt-1 text-[9px] font-black px-2 py-0.5 rounded bg-orange-950/90 text-orange-300 border border-orange-400 shadow-md whitespace-nowrap">
                  RH INDEX
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── QUICK TAP DRUM BUTTONS BAR ── */}
      <div className="shrink-0 flex items-center justify-between gap-2 bg-[#0c1222] border border-slate-800 rounded-xl px-3 py-2 overflow-x-auto">
        <span className="text-[11px] font-bold text-slate-400 whitespace-nowrap">
          🥁 QUICK TEST PADS:
        </span>
        <div className="flex items-center gap-1.5 flex-1 justify-end">
          {AIR_ZONES.map((zone) => {
            const hand = getInstrumentHand(zone.id, handedness, invertHands);
            const isRight = hand === 'RIGHT';
            return (
              <button
                key={zone.id}
                onClick={() => fireStrike(zone.id, hand)}
                className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition-transform active:scale-95 ${
                  isRight
                    ? 'bg-orange-950/60 border-orange-500/50 text-orange-200 hover:bg-orange-900'
                    : 'bg-cyan-950/60 border-cyan-500/50 text-cyan-200 hover:bg-cyan-900'
                }`}
              >
                {zone.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

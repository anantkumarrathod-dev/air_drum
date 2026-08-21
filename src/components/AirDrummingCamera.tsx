import React, { useRef, useEffect, useState, useCallback } from 'react';
import { DrumInstrumentId, Hand, Handedness } from '../types/drum';
import { getInstrumentHand } from '../data/beatLibrary';
import { Camera, Sparkles, Square, Maximize2, Minimize2, Activity, RefreshCw, Video, AlertCircle } from 'lucide-react';

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
  left: string;
  top: string;
  width: string;
  height: string;
  iconType: 'crash' | 'ride' | 'hihat' | 'snare' | 'high_tom' | 'mid_tom' | 'floor_tom' | 'bass';
}

const AIR_ZONES: AirZoneConfig[] = [
  { id: 'crash',        label: 'CRASH',     sub: '16" Cymbal',   type: 'cymbal', left: '3%',  top: '3%',  width: '21%', height: '28%', iconType: 'crash' },
  { id: 'high_tom',     label: 'HIGH TOM',  sub: '10" Rack Tom', type: 'tom',    left: '27%', top: '3%',  width: '21%', height: '28%', iconType: 'high_tom' },
  { id: 'mid_tom',      label: 'MID TOM',   sub: '12" Rack Tom', type: 'tom',    left: '52%', top: '3%',  width: '21%', height: '28%', iconType: 'mid_tom' },
  { id: 'ride',         label: 'RIDE',      sub: '20" Cymbal',   type: 'cymbal', left: '76%', top: '3%',  width: '21%', height: '28%', iconType: 'ride' },
  { id: 'hihat_closed', label: 'HI-HAT',    sub: '14" Cymbals',  type: 'cymbal', left: '3%',  top: '35%', width: '21%', height: '30%', iconType: 'hihat' },
  { id: 'snare',        label: 'SNARE',     sub: '14" Snare',    type: 'snare',  left: '27%', top: '35%', width: '21%', height: '30%', iconType: 'snare' },
  { id: 'floor_tom',    label: 'FLOOR TOM', sub: '16" Floor',    type: 'tom',    left: '76%', top: '35%', width: '21%', height: '30%', iconType: 'floor_tom' },
  { id: 'bass',         label: 'BASS DRUM', sub: '22" Kick',     type: 'bass',   left: '32%', top: '68%', width: '36%', height: '29%', iconType: 'bass' },
];

export const AirDrummingCamera: React.FC<AirDrummingCameraProps> = ({
  onAirStrike,
  handedness = 'RIGHT_HANDED',
  invertHands = false,
}) => {
  const [isActive, setIsActive] = useState<boolean>(false);
  const [isStarting, setIsStarting] = useState<boolean>(false);
  const [isDemoMode, setIsDemoMode] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [showDiag, setShowDiag] = useState<boolean>(false);
  const [diagLogs, setDiagLogs] = useState<string[]>([]);
  const [sensitivity, setSensitivity] = useState<number>(65);
  const [flashes, setFlashes] = useState<Record<string, boolean>>({});
  const [motions, setMotions] = useState<Record<string, number>>({});
  const [hitCounts, setHitCounts] = useState<Record<string, number>>({});
  const [fps, setFps] = useState<number>(0);
  const [resolution, setResolution] = useState<string>('');
  const [deviceLabel, setDeviceLabel] = useState<string>('');
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isMirrored, setIsMirrored] = useState<boolean>(true);

  // Multi-device & External Camera Support
  const [availableDevices, setAvailableDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');

  const videoRef = useRef<HTMLVideoElement>(null);
  const procRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const prevFrame = useRef<Uint8ClampedArray | null>(null);
  const lastHit = useRef<Record<string, number>>({});
  const rafRef = useRef<number>(0);
  const sensRef = useRef<number>(sensitivity);
  sensRef.current = sensitivity;

  const log = useCallback((msg: string) => {
    const t = new Date().toLocaleTimeString();
    setDiagLogs((prev) => [`[${t}] ${msg}`, ...prev.slice(0, 49)]);
    console.log(`[AirDrumming] ${msg}`);
  }, []);

  // ── Enumerate Connected Video Cameras (External USB & Built-in) ─────────────
  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = allDevices.filter((d) => d.kind === 'videoinput');
      setAvailableDevices(videoInputs);
      log(`Detected ${videoInputs.length} camera(s).`);
    } catch (err) {
      log(`enumerateDevices notice: ${err}`);
    }
  }, [log]);

  useEffect(() => {
    refreshDevices();
    if (navigator.mediaDevices?.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', refreshDevices);
      return () => {
        navigator.mediaDevices.removeEventListener('devicechange', refreshDevices);
      };
    }
  }, [refreshDevices]);

  // ── Strike Trigger ──────────────────────────────────────────────────────────
  const fireStrike = useCallback(
    (id: DrumInstrumentId) => {
      const now = performance.now();
      if (now - (lastHit.current[id] || 0) < 170) return;
      lastHit.current[id] = now;

      setFlashes((prev) => ({ ...prev, [id]: true }));
      setTimeout(() => {
        setFlashes((prev) => ({ ...prev, [id]: false }));
      }, 220);

      setHitCounts((prev) => ({ ...prev, [id]: (prev[id] || 0) + 1 }));

      const hand = getInstrumentHand(id, handedness, invertHands);
      onAirStrike(id, hand);
    },
    [onAirStrike, handedness, invertHands]
  );

  // ── Automated Demo Mode Beat Loop ───────────────────────────────────────────
  useEffect(() => {
    if (!isDemoMode) return;

    const demoSequence: DrumInstrumentId[] = [
      'hihat_closed', 'bass',
      'hihat_closed',
      'hihat_closed', 'snare',
      'hihat_closed',
      'hihat_closed', 'bass',
      'hihat_closed', 'bass',
      'hihat_closed', 'snare',
      'crash',        'high_tom',
      'mid_tom',      'floor_tom',
    ];

    let step = 0;
    const interval = setInterval(() => {
      const currentInst = demoSequence[step % demoSequence.length];
      fireStrike(currentInst);
      step++;
    }, 280);

    return () => clearInterval(interval);
  }, [isDemoMode, fireStrike]);

  // ── Unified Camera Stream Starter (Cross-Device: iOS, Android, Desktop, USB) ──
  const startCamera = async (targetDeviceId?: string) => {
    setCameraError(null);
    setIsStarting(true);
    setIsDemoMode(false);
    prevFrame.current = null;

    const deviceToUse = targetDeviceId || selectedDeviceId;
    log(`Requesting camera feed (Device: ${deviceToUse ? deviceToUse.slice(0, 8) + '...' : 'Default / External'})...`);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const err = 'Camera API is unavailable. Browsers require HTTPS (like GitHub Pages) or localhost to access cameras.';
      setCameraError(err);
      log(`ERROR: ${err}`);
      setIsStarting(false);
      return;
    }

    // Stop existing stream if active
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    let stream: MediaStream | null = null;
    let caughtError: unknown = null;

    // Strategy 1: Ideal Resolution & Device (never throws OverconstrainedError)
    try {
      const videoConfig: MediaTrackConstraints = {};
      if (deviceToUse) {
        videoConfig.deviceId = { ideal: deviceToUse };
      }
      videoConfig.width = { ideal: 1280 };
      videoConfig.height = { ideal: 720 };

      log(`Connecting camera with ideal constraints...`);
      stream = await navigator.mediaDevices.getUserMedia({ video: videoConfig, audio: false });
    } catch (firstErr) {
      caughtError = firstErr;
      log(`Ideal constraint attempt note: ${firstErr}. Trying standard fallback...`);
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      } catch (secondErr) {
        caughtError = secondErr;
        log(`Standard fallback failed: ${secondErr}`);
      }
    }

    if (!stream) {
      const isSecure = window.isSecureContext;
      const errName = (caughtError as { name?: string })?.name || '';
      const errMsg = (caughtError as Error)?.message || String(caughtError);

      let userAdvice = 'Camera access failed.';
      if (!isSecure) {
        userAdvice = '🔒 Camera blocked: Page is running on insecure HTTP. Please use the HTTPS link.';
      } else if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
        userAdvice = '🚫 Camera permission blocked. Click the lock/settings icon in your browser address bar → Set Camera to "Allow" → Retry.';
      } else if (errName === 'NotReadableError' || errName === 'AbortError' || errName === 'TrackStartError') {
        userAdvice = '🔌 Camera is locked by another application (e.g. Zoom, MS Teams, Skype, or Windows Camera). Please close other video apps and retry.';
      } else if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
        userAdvice = '📷 No camera hardware detected. If using an external USB camera, check your USB connection.';
      } else if (errName === 'OverconstrainedError') {
        userAdvice = '⚙️ Camera resolution constraint not supported. Falling back to default...';
      } else {
        userAdvice = `⚠️ Camera error (${errName || 'Notice'}): ${errMsg || 'Please allow camera access in browser.'}`;
      }

      setCameraError(userAdvice);
      log(`ERROR (${errName}): ${errMsg}`);
      setIsStarting(false);
      return;
    }

    streamRef.current = stream;
    const track = stream.getVideoTracks()[0];
    if (track) {
      const settings = track.getSettings ? track.getSettings() : {};
      const activeDevId = settings.deviceId || track.id;
      if (activeDevId && !selectedDeviceId) {
        setSelectedDeviceId(activeDevId);
      }
      setDeviceLabel(track.label || 'Webcam / External USB Camera');
      log(`Camera Live: "${track.label || 'Webcam'}" (Ready: ${track.readyState})`);

      // Hardware disconnection & mute listeners
      track.onended = () => {
        log('Camera track ended (hardware disconnected or permission revoked).');
        stopCamera();
        setCameraError('Camera was disconnected. Reconnect USB camera and click Start Camera.');
      };

      track.onmute = () => {
        log('Notice: Camera track muted (hardware privacy shutter or background mode).');
      };

      track.onunmute = () => {
        log('Notice: Camera track unmuted.');
      };
    }

    // Attach stream to <video> element with full cross-browser mobile/desktop attributes
    const videoEl = videoRef.current;
    if (videoEl) {
      videoEl.srcObject = stream;
      videoEl.muted = true;
      videoEl.playsInline = true;
      videoEl.setAttribute('autoplay', '');
      videoEl.setAttribute('playsinline', '');
      videoEl.setAttribute('webkit-playsinline', 'true');
      videoEl.setAttribute('muted', '');

      const applyResolution = () => {
        if (videoEl.videoWidth > 0 && videoEl.videoHeight > 0) {
          setResolution(`${videoEl.videoWidth}×${videoEl.videoHeight}`);
          log(`Video stream resolution confirmed: ${videoEl.videoWidth}×${videoEl.videoHeight}`);
        }
      };

      videoEl.onloadedmetadata = () => {
        applyResolution();
        videoEl.play().catch((e) => log(`onloadedmetadata play: ${e}`));
      };

      videoEl.onloadeddata = () => {
        applyResolution();
        videoEl.play().catch(() => {});
      };

      videoEl.oncanplay = () => {
        applyResolution();
        videoEl.play().catch(() => {});
      };

      try {
        await videoEl.play();
        log('video.play() resolved successfully.');
      } catch (playErr) {
        log(`video.play() waiting on metadata: ${playErr}`);
      }
    }

    setIsActive(true);
    setIsStarting(false);

    // Refresh device list to populate names now that permission is granted
    await refreshDevices();
  };

  // ── Stop Camera Stream ──────────────────────────────────────────────────────
  const stopCamera = () => {
    cancelAnimationFrame(rafRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    prevFrame.current = null;
    setIsActive(false);
    setIsStarting(false);
    setIsDemoMode(false);
    setFps(0);
    setResolution('');
    setMotions({});
    log('Camera stopped.');
  };

  // ── Switch Camera Source ────────────────────────────────────────────────────
  const handleDeviceChange = async (newDeviceId: string) => {
    setSelectedDeviceId(newDeviceId);
    log(`Selected Camera Device: ${newDeviceId}`);
    if (isActive) {
      await startCamera(newDeviceId);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // ── Real-time Motion Detection Loop ─────────────────────────────────────────
  useEffect(() => {
    if (!isActive) return;

    if (!procRef.current) {
      procRef.current = document.createElement('canvas');
      procRef.current.width = 160;
      procRef.current.height = 90;
    }
    const proc = procRef.current;
    let frames = 0;
    let fpsTimer = performance.now();

    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);
      const v = videoRef.current;
      if (!v || v.readyState < 2 || v.videoWidth === 0) return;

      frames++;
      const now = performance.now();
      if (now - fpsTimer >= 1000) {
        setFps(frames);
        frames = 0;
        fpsTimer = now;
      }

      const pCtx = proc.getContext('2d', { willReadFrequently: true });
      if (!pCtx) return;

      // Draw video frame to processing canvas
      pCtx.save();
      if (isMirrored) {
        pCtx.translate(160, 0);
        pCtx.scale(-1, 1);
      }
      pCtx.drawImage(v, 0, 0, 160, 90);
      pCtx.restore();

      const frame = pCtx.getImageData(0, 0, 160, 90).data;
      const prev = prevFrame.current;

      if (prev && prev.length === frame.length) {
        const threshold = 75 + (100 - sensRef.current) * 6;
        const newMotions: Record<string, number> = {};

        AIR_ZONES.forEach((z) => {
          const x0 = Math.round((parseFloat(z.left) / 100) * 160);
          const x1 = Math.round(((parseFloat(z.left) + parseFloat(z.width)) / 100) * 160);
          const y0 = Math.round((parseFloat(z.top) / 100) * 90);
          const y1 = Math.round(((parseFloat(z.top) + parseFloat(z.height)) / 100) * 90);

          let diffSum = 0;
          for (let py = y0; py < y1; py += 2) {
            for (let px = x0; px < x1; px += 2) {
              const i = (py * 160 + px) * 4;
              const d =
                Math.abs(frame[i] - prev[i]) +
                Math.abs(frame[i + 1] - prev[i + 1]) +
                Math.abs(frame[i + 2] - prev[i + 2]);
              if (d > 22) diffSum += d;
            }
          }

          const motionPct = Math.min(100, Math.round((diffSum / threshold) * 100));
          newMotions[z.id] = motionPct;

          if (diffSum >= threshold) {
            fireStrike(z.id);
          }
        });

        setMotions(newMotions);
      }

      prevFrame.current = new Uint8ClampedArray(frame);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isActive, isMirrored, fireStrike]);

  // Fullscreen sync listener
  useEffect(() => {
    const handleFS = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', handleFS);
    return () => document.removeEventListener('fullscreenchange', handleFS);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  return (
    <div
      onContextMenu={(e) => e.preventDefault()}
      className="w-full h-full flex-1 flex flex-col min-h-0 bg-[#070b14] rounded-2xl border border-slate-800/90 p-2 sm:p-3 select-none gap-2 shadow-2xl overflow-hidden font-mono-code"
    >
      {/* ── TOP CONTROL BAR ── */}
      <div className="shrink-0 flex items-center justify-between flex-wrap gap-2 bg-[#0c1222] border border-slate-800 rounded-xl px-3 py-2">
        {/* Left: Title & Status Badge */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-500 via-emerald-400 to-amber-400 p-0.5 flex items-center justify-center shadow-sm">
            <div className="w-full h-full bg-[#090e1a] rounded-[6px] flex items-center justify-center">
              <Camera className="w-4 h-4 text-cyan-400" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-display font-black text-xs sm:text-sm text-white tracking-wide">
                8-ZONE AIR DRUMMING
              </h2>
              {isActive && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-950/90 text-emerald-300 border border-emerald-500/50 flex items-center gap-1 shadow-[0_0_8px_rgba(16,185,129,0.4)]">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  LIVE {resolution} • {fps} FPS
                </span>
              )}
              {isDemoMode && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-950/90 text-purple-300 border border-purple-500/50 flex items-center gap-1 animate-pulse shadow-[0_0_8px_rgba(168,85,247,0.4)]">
                  <Sparkles className="w-3 h-3 text-purple-400" />
                  DEMO BEAT ACTIVE
                </span>
              )}
              {!isActive && !isDemoMode && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800/80 text-slate-400 border border-slate-700">
                  STANDBY
                </span>
              )}
            </div>
            {deviceLabel && <p className="text-[10px] text-slate-400 mt-0.5 truncate max-w-[200px] sm:max-w-none">📷 {deviceLabel}</p>}
          </div>
        </div>

        {/* Center: Camera Device Selector (External vs Integrated) */}
        {availableDevices.length > 1 && (
          <div className="flex items-center gap-1.5 bg-black/60 border border-slate-700 px-2 py-1 rounded-xl text-xs">
            <Video className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <select
              value={selectedDeviceId}
              onChange={(e) => handleDeviceChange(e.target.value)}
              className="bg-transparent text-slate-200 text-[11px] font-bold outline-none cursor-pointer max-w-[180px] sm:max-w-[240px] truncate"
              title="Switch Camera (External USB or Built-in)"
            >
              {availableDevices.map((d, idx) => (
                <option key={d.deviceId || idx} value={d.deviceId} className="bg-slate-900 text-white">
                  {d.label || `Camera ${idx + 1} (${d.deviceId.slice(0, 6)}...)`}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Right: Master Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Mirror Video Toggle */}
          <button
            onClick={() => setIsMirrored((prev) => !prev)}
            className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-bold transition-all flex items-center gap-1 ${
              isMirrored
                ? 'bg-slate-800 border-slate-700 text-slate-300'
                : 'bg-cyan-950/60 border-cyan-500/40 text-cyan-300'
            }`}
            title={isMirrored ? 'Mirrored Mode (Selfie style)' : 'Normal Mode (External camera angle)'}
          >
            <RefreshCw className="w-3 h-3" />
            <span>{isMirrored ? 'MIRROR: ON' : 'MIRROR: OFF'}</span>
          </button>

          {/* Demo Mode Button */}
          <button
            onClick={() => {
              if (isActive) stopCamera();
              setIsDemoMode((prev) => !prev);
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-display font-bold text-xs transition-all shadow-md ${
              isDemoMode
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-[0_0_12px_rgba(147,51,234,0.6)] scale-105'
                : 'bg-purple-950/50 hover:bg-purple-900/60 text-purple-300 border border-purple-500/50'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{isDemoMode ? 'STOP DEMO' : 'DEMO MODE'}</span>
          </button>

          {/* Camera Start / Stop Button */}
          {isActive ? (
            <button
              onClick={stopCamera}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl font-display font-bold text-xs bg-red-950/80 hover:bg-red-900 text-red-200 border border-red-500/50 transition-all shadow-md"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>STOP CAMERA</span>
            </button>
          ) : (
            <button
              onClick={() => startCamera()}
              disabled={isStarting}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-xl font-display font-bold text-xs transition-all shadow-md ${
                isStarting
                  ? 'bg-slate-800 text-slate-400 cursor-not-allowed'
                  : 'bg-gradient-to-r from-emerald-500 to-teal-500 text-black font-black shadow-[0_0_12px_rgba(16,185,129,0.5)] hover:scale-105'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              <span>{isStarting ? 'STARTING...' : 'START CAMERA'}</span>
            </button>
          )}

          {/* Fullscreen Toggle */}
          <button
            onClick={toggleFullscreen}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 text-xs font-bold"
            title="Toggle Fullscreen Mode"
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>

          {/* Diagnostics Logs Button */}
          <button
            onClick={() => setShowDiag((prev) => !prev)}
            className={`p-1.5 rounded-xl border text-xs font-bold transition-all ${
              showDiag
                ? 'bg-amber-950/80 border-amber-500/70 text-amber-300'
                : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-white'
            }`}
            title="Toggle System Diagnostics & Event Logs"
          >
            <Activity className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── ERROR NOTICE BANNER ── */}
      {cameraError && (
        <div className="shrink-0 p-3 rounded-xl bg-red-950/90 border border-red-500 text-red-200 text-xs flex items-center justify-between gap-2 shadow-lg animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{cameraError}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => startCamera()}
              className="px-3 py-1 rounded-lg bg-red-800 hover:bg-red-700 text-white font-bold text-xs"
            >
              🔄 Retry Camera
            </button>
            <button
              onClick={() => {
                setCameraError(null);
                setIsDemoMode(true);
              }}
              className="px-3 py-1 rounded-lg bg-purple-900 hover:bg-purple-800 text-purple-200 font-bold text-xs"
            >
              ✨ Try Demo Mode
            </button>
          </div>
        </div>
      )}

      {/* ── DIAGNOSTICS CONSOLE DRAWER ── */}
      {showDiag && (
        <div className="shrink-0 p-3 rounded-xl bg-black/90 border border-amber-500/50 text-amber-300 text-xs shadow-xl animate-in slide-in-from-top-2">
          <div className="flex items-center justify-between border-b border-amber-500/30 pb-1.5 mb-2 font-bold">
            <span className="flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-amber-400" /> SYSTEM DIAGNOSTICS & CAMERAS
            </span>
            <div className="flex items-center gap-2">
              <button onClick={() => setDiagLogs([])} className="text-slate-400 hover:text-white text-[10px]">
                Clear Logs
              </button>
              <button onClick={() => setShowDiag(false)} className="text-amber-400 hover:text-white font-bold">
                ✕
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[10px] text-slate-300 mb-2">
            <div>HTTPS Context: <b className={window.isSecureContext ? 'text-emerald-400' : 'text-red-400'}>{window.isSecureContext ? 'SECURE (HTTPS) ✓' : 'INSECURE (HTTP) ✗'}</b></div>
            <div>Cameras Detected: <b className="text-cyan-300">{availableDevices.length} device(s)</b></div>
            <div>Camera State: <b className="text-white">{isActive ? 'ACTIVE (STREAMING)' : 'OFF / STANDBY'}</b></div>
            <div>Resolution: <b className="text-white">{resolution || 'N/A'}</b></div>
          </div>
          <div className="max-h-28 overflow-y-auto bg-slate-950 p-2 rounded-lg text-[10px] text-slate-400 space-y-0.5">
            {diagLogs.length === 0 ? <p>No events logged yet. Click START CAMERA or DEMO MODE.</p> : diagLogs.map((l, i) => <div key={i}>{l}</div>)}
          </div>
        </div>
      )}

      {/* ── 8-ZONE DRUM SKELETON & VIDEO VIEWPORT ── */}
      <div className="relative w-full flex-1 min-h-[300px] sm:min-h-[400px] rounded-2xl border-2 border-slate-800 bg-[#03060f] overflow-hidden shadow-inner flex items-center justify-center">
        {/* Live Camera Video Feed (Mirrored or Normal) with Guaranteed Direct Inline Styling */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: isMirrored ? 'scaleX(-1)' : 'none',
            zIndex: 1,
            display: isActive ? 'block' : 'none',
            backgroundColor: '#000000',
          }}
        />

        {/* Ambient Drum Stage Lighting Background (Shown ONLY when camera is in standby) */}
        {!isActive && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 1,
              pointerEvents: 'none',
              background: 'radial-gradient(circle at 50% 40%, #0d1e38 0%, #060b18 60%, #02040a 100%)',
            }}
          >
            {/* Subtle Isometric Grid Lines */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                opacity: 0.15,
                backgroundImage: 'linear-gradient(rgba(0,229,255,0.2) 1px, transparent 1px), linear-gradient(90deg, rgba(0,229,255,0.2) 1px, transparent 1px)',
                backgroundSize: '48px 48px',
              }}
            />
          </div>
        )}

        {/* Top Legend Bar */}
        <div className="absolute top-2.5 left-1/2 -translate-x-1/2 z-20 px-3.5 py-1 rounded-full bg-black/80 border border-slate-700/80 backdrop-blur-md shadow-lg flex items-center gap-3 text-[10px] font-bold">
          <span className="text-cyan-400 flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_#00E5FF]" />
            LEFT HAND (LH)
          </span>
          <span className="text-slate-500">|</span>
          <span className="text-orange-400 flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-orange-400 shadow-[0_0_8px_#FF6D00]" />
            RIGHT HAND (RH)
          </span>
        </div>

        {/* ── 8 GLOWING DRUM SKELETON ZONES ── */}
        {AIR_ZONES.map((zone) => {
          const hand = getInstrumentHand(zone.id, handedness, invertHands);
          const isRight = hand === 'RIGHT';
          const primaryColor = isRight ? '#FF6D00' : '#00E5FF';
          const isFlashing = Boolean(flashes[zone.id]);
          const motionValue = motions[zone.id] || 0;
          const hits = hitCounts[zone.id] || 0;

          return (
            <div
              key={zone.id}
              onClick={() => fireStrike(zone.id)}
              onTouchStart={(e) => {
                e.preventDefault();
                fireStrike(zone.id);
              }}
              style={{
                position: 'absolute',
                left: zone.left,
                top: zone.top,
                width: zone.width,
                height: zone.height,
              }}
              className={`cursor-pointer rounded-2xl transition-all duration-100 flex flex-col items-center justify-between p-2 select-none group z-10 ${
                isFlashing
                  ? 'scale-105 shadow-[0_0_40px_rgba(255,255,255,0.9)] ring-4 ring-white'
                  : 'hover:scale-[1.02] shadow-[0_4px_20px_rgba(0,0,0,0.6)]'
              }`}
            >
              {/* Outer Glowing Skeleton Boundary */}
              <div
                className="absolute inset-0 rounded-2xl transition-all duration-100"
                style={{
                  border: isFlashing
                    ? '3px solid #ffffff'
                    : `2px solid ${primaryColor}`,
                  background: isFlashing
                    ? 'rgba(255,255,255,0.4)'
                    : isActive
                    ? 'rgba(0,0,0,0.15)' // Clean translucent glass over camera feed
                    : isRight
                    ? 'radial-gradient(circle, rgba(255,109,0,0.22) 0%, rgba(255,109,0,0.08) 70%, rgba(0,0,0,0.4) 100%)'
                    : 'radial-gradient(circle, rgba(0,229,255,0.22) 0%, rgba(0,229,255,0.08) 70%, rgba(0,0,0,0.4) 100%)',
                  boxShadow: isFlashing
                    ? 'inset 0 0 30px #ffffff, 0 0 30px #ffffff'
                    : `inset 0 0 15px ${isRight ? 'rgba(255,109,0,0.3)' : 'rgba(0,229,255,0.3)'}, 0 0 12px ${isRight ? 'rgba(255,109,0,0.4)' : 'rgba(0,229,255,0.4)'}`,
                }}
              />

              {/* Four Corner Target Brackets */}
              <div
                className="absolute top-1 left-1 w-3 h-3 border-t-2 border-l-2 pointer-events-none transition-colors"
                style={{ borderColor: isFlashing ? '#ffffff' : primaryColor }}
              />
              <div
                className="absolute top-1 right-1 w-3 h-3 border-t-2 border-r-2 pointer-events-none transition-colors"
                style={{ borderColor: isFlashing ? '#ffffff' : primaryColor }}
              />
              <div
                className="absolute bottom-1 left-1 w-3 h-3 border-b-2 border-l-2 pointer-events-none transition-colors"
                style={{ borderColor: isFlashing ? '#ffffff' : primaryColor }}
              />
              <div
                className="absolute bottom-1 right-1 w-3 h-3 border-b-2 border-r-2 pointer-events-none transition-colors"
                style={{ borderColor: isFlashing ? '#ffffff' : primaryColor }}
              />

              {/* Top Tag Header: Label + Hand Badge */}
              <div className="w-full flex items-center justify-between z-10 pointer-events-none px-1">
                <span
                  className="font-display font-black text-[11px] sm:text-xs tracking-wider"
                  style={{
                    color: isFlashing ? '#ffffff' : primaryColor,
                    textShadow: `0 0 8px ${primaryColor}`,
                  }}
                >
                  {zone.label}
                </span>

                <span
                  className="text-[9px] font-bold px-1.5 py-0.2 rounded-full border shadow-sm"
                  style={{
                    backgroundColor: isRight ? '#431407' : '#083344',
                    borderColor: primaryColor,
                    color: isRight ? '#fdba74' : '#67e8f9',
                  }}
                >
                  {isRight ? 'RH' : 'LH'}
                </span>
              </div>

              {/* Center Authentic Drum / Cymbal Skeleton Graphic */}
              <div className="relative flex-1 w-full flex items-center justify-center pointer-events-none z-10">
                {zone.type === 'cymbal' ? (
                  // Cymbal Concentric Rings Skeleton
                  <div
                    className="w-16 h-16 sm:w-20 sm:h-20 rounded-full flex items-center justify-center transition-all duration-75 relative"
                    style={{
                      border: `2px solid ${isFlashing ? '#ffffff' : primaryColor}`,
                      background: isFlashing
                        ? 'radial-gradient(circle, #ffffff 0%, #fef08a 50%, #eab308 100%)'
                        : 'radial-gradient(circle, rgba(254,240,138,0.3) 0%, rgba(234,179,8,0.2) 50%, rgba(120,53,15,0.25) 100%)',
                      boxShadow: isFlashing ? '0 0 25px #ffffff' : `0 0 12px ${primaryColor}`,
                    }}
                  >
                    <div className="w-10 h-10 rounded-full border border-amber-500/40" />
                    <div className="w-4 h-4 rounded-full bg-amber-400/80 shadow-sm" />
                  </div>
                ) : (
                  // Drum Head & Shell Skeleton
                  <div
                    className={`rounded-full flex items-center justify-center transition-all duration-75 relative ${
                      zone.type === 'bass' ? 'w-20 h-20 sm:w-24 sm:h-24' : 'w-16 h-16 sm:w-20 sm:h-20'
                    }`}
                    style={{
                      border: `2px solid ${isFlashing ? '#ffffff' : primaryColor}`,
                      background: isFlashing
                        ? 'radial-gradient(circle, #ffffff 0%, #e2e8f0 70%, #94a3b8 100%)'
                        : isRight
                        ? 'radial-gradient(circle, rgba(255,255,255,0.2) 0%, rgba(255,109,0,0.18) 60%, rgba(15,23,42,0.3) 100%)'
                        : 'radial-gradient(circle, rgba(255,255,255,0.2) 0%, rgba(0,229,255,0.18) 60%, rgba(15,23,42,0.3) 100%)',
                      boxShadow: isFlashing ? '0 0 25px #ffffff' : `0 0 12px ${primaryColor}`,
                    }}
                  >
                    {/* Concentric Rim & Center Dot */}
                    <div className="w-10 h-10 rounded-full border border-white/20" />
                    <div
                      className="w-3.5 h-3.5 rounded-full"
                      style={{ backgroundColor: isFlashing ? '#ffffff' : primaryColor }}
                    />
                  </div>
                )}

                {/* Hit Ripple Wave on Strike */}
                {isFlashing && (
                  <div className="absolute inset-0 rounded-full border-2 border-white animate-ping opacity-80 pointer-events-none" />
                )}
              </div>

              {/* Bottom Info: Subtitle & Motion Level Bar */}
              <div className="w-full flex flex-col gap-1 z-10 pointer-events-none">
                <div className="flex items-center justify-between text-[9px] text-slate-400 px-1">
                  <span>{zone.sub}</span>
                  {hits > 0 && <span className="font-bold text-white bg-slate-800 px-1.5 rounded">{hits} hits</span>}
                </div>

                {/* Real-time Optical Flow Motion Meter Bar */}
                {isActive && (
                  <div className="w-full h-1.5 bg-slate-900/90 rounded-full overflow-hidden border border-slate-700/60">
                    <div
                      className="h-full rounded-full transition-all duration-75"
                      style={{
                        width: `${motionValue}%`,
                        backgroundColor: isFlashing ? '#ffffff' : primaryColor,
                        boxShadow: `0 0 6px ${primaryColor}`,
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Bottom Standby Guide Prompt */}
        {!isActive && !isDemoMode && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 px-4 py-1.5 rounded-xl bg-black/85 border border-slate-700 text-slate-300 text-[11px] font-bold backdrop-blur-md shadow-xl flex items-center gap-2">
            <span>✨ Tap any zone to play directly</span>
            <span className="text-slate-600">•</span>
            <span className="text-emerald-400">Click START CAMERA for motion</span>
            <span className="text-slate-600">•</span>
            <span className="text-purple-400">Click DEMO MODE for preview</span>
          </div>
        )}
      </div>

      {/* ── SENSITIVITY CONTROLS & BOTTOM 8-PAD QUICK BAR ── */}
      <div className="shrink-0 flex items-center justify-between gap-3 bg-[#0c1222] border border-slate-800 rounded-xl px-3 py-2 flex-wrap">
        {/* Left: Sensitivity Slider */}
        <div className="flex items-center gap-3 flex-1 min-w-[240px]">
          <span className="text-[11px] font-bold text-slate-400 whitespace-nowrap">
            🎚 MOTION SENSITIVITY:
          </span>
          <input
            type="range"
            min={20}
            max={90}
            value={sensitivity}
            onChange={(e) => setSensitivity(Number(e.target.value))}
            className="flex-1 accent-cyan-400 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
          />
          <span className="text-xs font-bold text-cyan-400 w-10 text-right">{sensitivity}%</span>
        </div>

        {/* Right: Quick Preset Buttons */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setSensitivity(45)}
            className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 text-[10px] font-bold"
          >
            Low (45%)
          </button>
          <button
            onClick={() => setSensitivity(65)}
            className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 text-[10px] font-bold border border-amber-500/30"
          >
            Default (65%)
          </button>
          <button
            onClick={() => setSensitivity(85)}
            className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 text-[10px] font-bold"
          >
            High (85%)
          </button>
        </div>
      </div>
    </div>
  );
};

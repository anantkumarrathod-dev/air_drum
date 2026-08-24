import React, { useRef, useEffect, useState, useCallback } from 'react';
import { DrumInstrumentId, Hand, Handedness } from '../types/drum';
import { getInstrumentHand } from '../data/beatLibrary';
import { Camera, Square, RefreshCw, Video, AlertCircle, Layers, Maximize2, Minimize2, Play, Activity } from 'lucide-react';

interface AirDrummingCameraProps {
  onAirStrike: (instrument: DrumInstrumentId, hand: Hand) => void;
  handedness?: Handedness;
  invertHands?: boolean;
}

interface AirZoneConfig {
  id: DrumInstrumentId;
  label: string;
  sub: string;
  left: string;
  top: string;
  width: string;
  height: string;
}

const AIR_ZONES: AirZoneConfig[] = [
  { id: 'crash',        label: 'CRASH',     sub: '16" Cymbal',   left: '4%',  top: '4%',  width: '20%', height: '28%' },
  { id: 'high_tom',     label: 'HIGH TOM',  sub: '10" Tom',      left: '28%', top: '4%',  width: '20%', height: '28%' },
  { id: 'mid_tom',      label: 'MID TOM',   sub: '12" Tom',      left: '52%', top: '4%',  width: '20%', height: '28%' },
  { id: 'ride',         label: 'RIDE',      sub: '20" Cymbal',   left: '76%', top: '4%',  width: '20%', height: '28%' },
  { id: 'hihat_closed', label: 'HI-HAT',    sub: '14" Cymbals',  left: '4%',  top: '36%', width: '20%', height: '30%' },
  { id: 'snare',        label: 'SNARE',     sub: '14" Snare',    left: '28%', top: '36%', width: '20%', height: '30%' },
  { id: 'floor_tom',    label: 'FLOOR TOM', sub: '16" Floor',    left: '76%', top: '36%', width: '20%', height: '30%' },
  { id: 'bass',         label: 'BASS DRUM', sub: '22" Kick',     left: '34%', top: '68%', width: '32%', height: '28%' },
];

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

  // Live Telemetry & Diagnostics
  const [resolution, setResolution] = useState<string>('0×0');
  const [deviceLabel, setDeviceLabel] = useState<string>('');
  const [availableDevices, setAvailableDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [statusLog, setStatusLog] = useState<string>('Ready to connect camera.');
  const [showDiag, setShowDiag] = useState<boolean>(false);
  const [videoStats, setVideoStats] = useState({ readyState: 0, paused: true, currentTime: 0 });

  const videoRef = useRef<HTMLVideoElement>(null);
  const lastHit = useRef<Record<string, number>>({});

  // ── Strike Trigger ──────────────────────────────────────────────────────────
  const fireStrike = useCallback(
    (id: DrumInstrumentId) => {
      const now = performance.now();
      if (now - (lastHit.current[id] || 0) < 160) return;
      lastHit.current[id] = now;

      setFlashes((prev) => ({ ...prev, [id]: true }));
      setTimeout(() => {
        setFlashes((prev) => ({ ...prev, [id]: false }));
      }, 200);

      const hand = getInstrumentHand(id, handedness, invertHands);
      onAirStrike(id, hand);
    },
    [onAirStrike, handedness, invertHands]
  );

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
      videoEl.srcObject = mediaStream;
      videoEl.muted = true;
      videoEl.playsInline = true;

      const updateDimensions = () => {
        if (videoEl.videoWidth > 0) {
          setResolution(`${videoEl.videoWidth}×${videoEl.videoHeight}`);
          setStatusLog(`Streaming: ${videoEl.videoWidth}×${videoEl.videoHeight}`);
        }
      };

      videoEl.onloadedmetadata = () => {
        updateDimensions();
        videoEl.play().catch((e) => console.log('play on loadedmetadata:', e));
      };

      videoEl.onloadeddata = updateDimensions;
      videoEl.oncanplay = updateDimensions;
      videoEl.play().catch(() => {});

      // Watchdog interval to ensure stats are updated
      const interval = setInterval(() => {
        if (videoEl) {
          setVideoStats({
            readyState: videoEl.readyState,
            paused: videoEl.paused,
            currentTime: Math.round(videoEl.currentTime * 10) / 10,
          });
          if (videoEl.videoWidth > 0 && resolution === '0×0') {
            setResolution(`${videoEl.videoWidth}×${videoEl.videoHeight}`);
          }
        }
      }, 500);

      return () => clearInterval(interval);
    } else {
      videoEl.srcObject = null;
      setResolution('0×0');
    }
  }, [mediaStream, resolution]);

  // ── Meeting App Camera Starter ──────────────────────────────────────────────
  const startCamera = async (targetDeviceId?: string) => {
    setCameraError(null);
    setIsStarting(true);
    setStatusLog('Requesting camera permission...');

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const err = 'Camera API not supported or blocked by browser (requires HTTPS).';
      setCameraError(err);
      setStatusLog(`Error: ${err}`);
      setIsStarting(false);
      return;
    }

    // Stop previous stream
    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => t.stop());
      setMediaStream(null);
    }

    const deviceId = targetDeviceId || selectedDeviceId;
    const constraints: MediaStreamConstraints = {
      video: deviceId ? { deviceId: { exact: deviceId } } : true,
      audio: false,
    };

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
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
        ? 'Camera permission denied. Please allow camera access in your browser address bar.'
        : errorObj?.name === 'NotReadableError'
        ? 'Camera is in use by another app (e.g. Zoom, Teams). Please close other video apps.'
        : `Camera error: ${errorObj?.message || 'Failed to start'}`;

      setCameraError(msg);
      setStatusLog(`Failed: ${errorObj?.name || 'Error'}`);
      setIsStarting(false);
    }
  };

  // ── Stop Camera ─────────────────────────────────────────────────────────────
  const stopCamera = () => {
    if (mediaStream) {
      mediaStream.getTracks().forEach((t) => t.stop());
      setMediaStream(null);
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsStarting(false);
    setResolution('0×0');
    setStatusLog('Camera stopped.');
  };

  const handleDeviceChange = (newDeviceId: string) => {
    setSelectedDeviceId(newDeviceId);
    if (mediaStream) {
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

  return (
    <div
      onContextMenu={(e) => e.preventDefault()}
      className="w-full h-full flex-1 flex flex-col min-h-0 bg-[#070b14] rounded-2xl border border-slate-800 p-2 sm:p-3 select-none gap-2 shadow-2xl overflow-hidden font-mono-code"
    >
      {/* ── TOP CONTROL BAR ── */}
      <div className="shrink-0 flex items-center justify-between flex-wrap gap-2 bg-[#0c1222] border border-slate-800 rounded-xl px-3 py-2">
        {/* Left: Meeting Style Status Indicator */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/50 flex items-center justify-center">
            <Camera className={`w-4 h-4 ${isActive ? 'text-emerald-400 animate-pulse' : 'text-slate-400'}`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-display font-black text-xs sm:text-sm text-white tracking-wide">
                CAMERA FEED
              </h2>
              {isActive ? (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-500/50 flex items-center gap-1 shadow-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  LIVE • {resolution}
                </span>
              ) : (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                  STANDBY
                </span>
              )}
            </div>
            <p className="text-[10px] text-slate-400 mt-0.5 truncate max-w-[220px] sm:max-w-none">
              {deviceLabel ? `📷 ${deviceLabel}` : statusLog}
            </p>
          </div>
        </div>

        {/* Center: Camera Device Selector */}
        {availableDevices.length > 1 && (
          <div className="flex items-center gap-1.5 bg-black/60 border border-slate-700 px-2 py-1 rounded-xl text-xs">
            <Video className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <select
              value={selectedDeviceId}
              onChange={(e) => handleDeviceChange(e.target.value)}
              className="bg-transparent text-slate-200 text-[11px] font-bold outline-none cursor-pointer max-w-[180px] sm:max-w-[240px] truncate"
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

        {/* Right: Master Control Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Force Play button if stream exists but paused */}
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

      {/* ── ERROR NOTICE BANNER ── */}
      {cameraError && (
        <div className="shrink-0 p-3 rounded-xl bg-red-950/90 border border-red-500 text-red-200 text-xs flex items-center justify-between gap-2 shadow-lg">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{cameraError}</span>
          </div>
          <button
            onClick={() => startCamera()}
            className="px-3 py-1 rounded-lg bg-red-800 hover:bg-red-700 text-white font-bold text-xs"
          >
            🔄 Retry
          </button>
        </div>
      )}

      {/* ── LIVE TELEMETRY DRAWER ── */}
      {showDiag && (
        <div className="shrink-0 p-2.5 rounded-xl bg-black/90 border border-slate-700 text-[11px] text-slate-300 grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div>Stream: <b className={isActive ? 'text-emerald-400' : 'text-slate-500'}>{isActive ? 'ACTIVE' : 'OFF'}</b></div>
          <div>Resolution: <b className="text-white">{resolution}</b></div>
          <div>Player Ready: <b className="text-white">{videoStats.readyState} / 4</b></div>
          <div>Player State: <b className={videoStats.paused ? 'text-amber-400' : 'text-emerald-400'}>{videoStats.paused ? 'PAUSED' : 'PLAYING'}</b></div>
        </div>
      )}

      {/* ── MEETING APP VIDEO VIEWPORT ── */}
      <div className="relative w-full flex-1 min-h-[320px] rounded-2xl border-2 border-slate-800 bg-[#050811] overflow-hidden flex items-center justify-center">
        {/* Simple Direct HTML5 Video Player (Always rendered in DOM, never display:none) */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            backgroundColor: '#050811',
            transform: isMirrored ? 'scaleX(-1)' : 'none',
          }}
        />

        {/* Standby Placeholder Screen (Shown only when no stream is connected) */}
        {!isActive && (
          <div className="absolute inset-0 bg-[#050811] flex flex-col items-center justify-center gap-3 text-slate-400 p-6 text-center z-10">
            <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center shadow-lg">
              <Video className="w-8 h-8 text-slate-500" />
            </div>
            <div>
              <p className="font-bold text-white text-sm">Camera is currently inactive</p>
              <p className="text-xs text-slate-500 mt-1">Click the green "START CAMERA" button above to begin video stream</p>
            </div>
            <button
              onClick={() => startCamera()}
              disabled={isStarting}
              className="mt-2 px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs shadow-lg transition-transform hover:scale-105"
            >
              {isStarting ? 'CONNECTING...' : '📷 START CAMERA'}
            </button>
          </div>
        )}

        {/* Optional 8 Drum Zones Overlay */}
        {isActive && showZones && (
          <div className="absolute inset-0 pointer-events-auto z-10">
            {AIR_ZONES.map((zone) => {
              const hand = getInstrumentHand(zone.id, handedness, invertHands);
              const isRight = hand === 'RIGHT';
              const color = isRight ? '#FF6D00' : '#00E5FF';
              const isFlashing = Boolean(flashes[zone.id]);

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
                    border: isFlashing ? '3px solid #ffffff' : `2px dashed ${color}`,
                    backgroundColor: isFlashing ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.15)',
                    boxShadow: isFlashing ? '0 0 25px #ffffff' : `0 0 10px ${color}33`,
                  }}
                  className="rounded-2xl cursor-pointer flex flex-col items-center justify-between p-2 select-none transition-all hover:bg-white/10"
                >
                  <div className="w-full flex items-center justify-between pointer-events-none">
                    <span className="text-[11px] font-black text-white" style={{ textShadow: `0 0 6px ${color}` }}>
                      {zone.label}
                    </span>
                    <span
                      className="text-[9px] font-bold px-1.5 py-0.2 rounded border"
                      style={{ borderColor: color, color }}
                    >
                      {isRight ? 'RH' : 'LH'}
                    </span>
                  </div>

                  <span className="text-[9px] text-slate-300 bg-black/60 px-1.5 py-0.5 rounded pointer-events-none">
                    {zone.sub}
                  </span>
                </div>
              );
            })}
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
                onClick={() => fireStrike(zone.id)}
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

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { DrumInstrumentId, Hand, Handedness } from '../types/drum';
import { getInstrumentHand } from '../data/beatLibrary';

interface AirDrummingCameraProps {
  onAirStrike: (instrument: DrumInstrumentId, hand: Hand) => void;
  handedness?: Handedness;
  invertHands?: boolean;
}

// ── 8 Air Drum Zones (normalized 0..1 coords) ──────────────────────────────
const ZONES: Array<{
  id: DrumInstrumentId;
  label: string;
  type: 'cymbal' | 'drum';
  x: number; y: number; w: number; h: number;
}> = [
  { id: 'crash',        label: 'CRASH',     type: 'cymbal', x: 0.02, y: 0.03, w: 0.22, h: 0.28 },
  { id: 'high_tom',     label: 'HI TOM',    type: 'drum',   x: 0.26, y: 0.03, w: 0.22, h: 0.28 },
  { id: 'mid_tom',      label: 'MID TOM',   type: 'drum',   x: 0.52, y: 0.03, w: 0.22, h: 0.28 },
  { id: 'ride',         label: 'RIDE',      type: 'cymbal', x: 0.76, y: 0.03, w: 0.22, h: 0.28 },
  { id: 'hihat_closed', label: 'HI-HAT',    type: 'cymbal', x: 0.02, y: 0.35, w: 0.22, h: 0.29 },
  { id: 'snare',        label: 'SNARE',     type: 'drum',   x: 0.26, y: 0.35, w: 0.22, h: 0.29 },
  { id: 'floor_tom',    label: 'FLOOR TOM', type: 'drum',   x: 0.76, y: 0.35, w: 0.22, h: 0.29 },
  { id: 'bass',         label: 'BASS',      type: 'drum',   x: 0.33, y: 0.67, w: 0.34, h: 0.30 },
];

export const AirDrummingCamera: React.FC<AirDrummingCameraProps> = ({
  onAirStrike,
  handedness = 'RIGHT_HANDED',
  invertHands = false,
}) => {
  // ── State ──────────────────────────────────────────────────────────────────
  const [isActive, setIsActive]     = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [fps, setFps]               = useState(0);
  const [resolution, setResolution] = useState('');
  const [deviceLabel, setDeviceLabel] = useState('');
  const [showDiag, setShowDiag]     = useState(false);
  const [diagLogs, setDiagLogs]     = useState<string[]>([]);
  const [sensitivity, setSensitivity] = useState(60);

  // Per-zone flash + hit count stored in refs to avoid re-render lag
  const flashRef    = useRef<Record<string, number>>({});   // timestamp of last flash
  const hitCountRef = useRef<Record<string, number>>({});
  const lastHitRef  = useRef<Record<string, number>>({});

  // ── Refs ───────────────────────────────────────────────────────────────────
  // Hidden video element — never shown in DOM visually, only used as source for canvas.drawImage
  const videoRef    = useRef<HTMLVideoElement | null>(null);
  const canvasRef   = useRef<HTMLCanvasElement | null>(null);
  const procRef     = useRef<HTMLCanvasElement | null>(null);   // 160×90 processing canvas
  const streamRef   = useRef<MediaStream | null>(null);
  const prevFrameRef = useRef<Uint8ClampedArray | null>(null);
  const rafRef      = useRef<number>(0);

  // Force a rerender for hit count display
  const [hitDisplay, setHitDisplay] = useState<Record<string, number>>({});
  const [motionDisplay, setMotionDisplay] = useState<Record<string, number>>({});

  // ── Logging ────────────────────────────────────────────────────────────────
  const log = useCallback((msg: string) => {
    const t = new Date().toLocaleTimeString();
    setDiagLogs(p => [`[${t}] ${msg}`, ...p.slice(0, 24)]);
    console.log('[AirDrum]', msg);
  }, []);

  // ── Strike trigger ─────────────────────────────────────────────────────────
  const fireStrike = useCallback((id: DrumInstrumentId) => {
    const now = performance.now();
    if (now - (lastHitRef.current[id] || 0) < 180) return;
    lastHitRef.current[id] = now;
    flashRef.current[id] = now;
    hitCountRef.current[id] = (hitCountRef.current[id] || 0) + 1;

    // Batch UI updates once per strike
    setHitDisplay(p => ({ ...p, [id]: hitCountRef.current[id] }));

    const hand = getInstrumentHand(id, handedness, invertHands);
    onAirStrike(id, hand);
  }, [onAirStrike, handedness, invertHands]);

  // ── Demo mode ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isDemoMode) return;
    const seq: DrumInstrumentId[] = [
      'hihat_closed', 'snare', 'hihat_closed', 'bass',
      'crash', 'high_tom', 'mid_tom', 'floor_tom',
    ];
    let i = 0;
    const t = setInterval(() => { fireStrike(seq[i++ % seq.length]); }, 430);
    return () => clearInterval(t);
  }, [isDemoMode, fireStrike]);

  // ── Camera start ───────────────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    setCameraError(null);
    setIsStarting(true);
    setIsDemoMode(false);
    prevFrameRef.current = null;
    log('Requesting camera...');

    if (!navigator.mediaDevices?.getUserMedia) {
      const e = 'Camera API unavailable. This page needs HTTPS or localhost.';
      setCameraError(e); log('ERROR: ' + e); setIsStarting(false); return;
    }

    const attempts: MediaStreamConstraints[] = [
      { video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }, audio: false },
      { video: { facingMode: 'user' }, audio: false },
      { video: true, audio: false },
    ];

    let stream: MediaStream | null = null;
    for (const c of attempts) {
      try {
        stream = await navigator.mediaDevices.getUserMedia(c);
        log(`Stream acquired (${JSON.stringify(c.video)})`);
        break;
      } catch (err) {
        log(`Attempt failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (!stream) {
      const e = 'Camera blocked. Check browser permissions → site settings → camera → allow.';
      setCameraError(e); log('ERROR: ' + e); setIsStarting(false); return;
    }

    streamRef.current = stream;
    const track = stream.getVideoTracks()[0];
    if (track) { setDeviceLabel(track.label || 'Camera'); log('Track: ' + track.label); }

    // Attach stream to the HIDDEN video element
    const video = videoRef.current!;
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;

    try {
      await video.play();
      log('video.play() success');
    } catch {
      // onloadedmetadata fallback
      log('video.play() deferred to metadata');
    }

    video.onloadedmetadata = () => {
      video.play().catch(() => {});
      setResolution(`${video.videoWidth}×${video.videoHeight}`);
      log(`Metadata: ${video.videoWidth}×${video.videoHeight}`);
    };

    setIsActive(true);
    setIsStarting(false);
  }, [log]);

  // ── Camera stop ────────────────────────────────────────────────────────────
  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) { videoRef.current.srcObject = null; }
    prevFrameRef.current = null;
    setIsActive(false); setIsStarting(false); setIsDemoMode(false);
    setFps(0); setResolution(''); setDeviceLabel('');
    log('Camera stopped.');
  }, [log]);

  // Cleanup on unmount
  useEffect(() => () => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
  }, []);

  // ── Draw a zone box + icon on canvas ──────────────────────────────────────
  const drawZone = (
    ctx: CanvasRenderingContext2D,
    zone: typeof ZONES[0],
    W: number, H: number,
    flashing: boolean,
    active: boolean,
    hand: 'LEFT' | 'RIGHT',
  ) => {
    const zx = zone.x * W, zy = zone.y * H;
    const zw = zone.w * W, zh = zone.h * H;
    const cx = zx + zw / 2, cy = zy + zh / 2;
    const col = hand === 'RIGHT' ? '#FF6D00' : '#00E5FF';
    const alpha = active ? '44' : '28';

    ctx.save();

    // Box fill
    ctx.fillStyle = flashing ? col + 'AA' : col + alpha;
    ctx.strokeStyle = flashing ? '#FFFFFF' : col;
    ctx.lineWidth = flashing ? 4 : 2;
    ctx.beginPath();
    ctx.roundRect(zx, zy, zw, zh, 10);
    ctx.fill();
    ctx.stroke();

    // Corner brackets
    const cL = 10;
    ctx.strokeStyle = flashing ? '#FFF' : col;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(zx, zy + cL); ctx.lineTo(zx, zy); ctx.lineTo(zx + cL, zy);
    ctx.moveTo(zx + zw - cL, zy); ctx.lineTo(zx + zw, zy); ctx.lineTo(zx + zw, zy + cL);
    ctx.moveTo(zx, zy + zh - cL); ctx.lineTo(zx, zy + zh); ctx.lineTo(zx + cL, zy + zh);
    ctx.moveTo(zx + zw - cL, zy + zh); ctx.lineTo(zx + zw, zy + zh); ctx.lineTo(zx + zw, zy + zh - cL);
    ctx.stroke();

    // Icon
    const r = Math.min(zw, zh) * 0.28;
    ctx.strokeStyle = flashing ? '#FFF' : col + '88';
    ctx.lineWidth = 1.5;
    if (zone.type === 'cymbal') {
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.6, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = flashing ? '#FFF' : col;
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.22, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = col + '44'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.7, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = flashing ? '#FFF' : col; ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx - r * 0.4, cy); ctx.lineTo(cx + r * 0.4, cy);
      ctx.moveTo(cx, cy - r * 0.4); ctx.lineTo(cx, cy + r * 0.4);
      ctx.stroke();
      ctx.fillStyle = flashing ? '#FFF' : col;
      ctx.beginPath(); ctx.arc(cx, cy, r * 0.18, 0, Math.PI * 2); ctx.fill();
    }

    // Label
    ctx.fillStyle = flashing ? '#FFF' : col;
    ctx.font = 'bold 10px monospace';
    ctx.fillText(zone.label, zx + 6, zy + 14);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.font = '9px monospace';
    ctx.fillText(hand === 'RIGHT' ? 'RH' : 'LH', zx + 6, zy + 25);

    ctx.restore();
  };

  // ── Main render + motion detection loop ────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Offscreen 160×90 processing canvas for optical flow
    if (!procRef.current) {
      procRef.current = document.createElement('canvas');
      procRef.current.width = 160;
      procRef.current.height = 90;
    }
    const proc = procRef.current;

    let frameCount = 0;
    let fpsTimer = performance.now();
    const newMotions: Record<string, number> = {};

    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const W = canvas.width, H = canvas.height;

      // FPS
      frameCount++;
      const now = performance.now();
      if (now - fpsTimer >= 1000) {
        setFps(frameCount);
        frameCount = 0;
        fpsTimer = now;
      }

      // ── BACKGROUND ──────────────────────────────────────────────────────
      const video = videoRef.current;
      const videoReady = video && video.readyState >= 2 && video.videoWidth > 0;

      if (isActive && videoReady) {
        // Draw mirrored video frame as background
        ctx.save();
        ctx.translate(W, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, W, H);
        ctx.restore();

        // ── MOTION DETECTION ──────────────────────────────────────────────
        const pCtx = proc.getContext('2d', { willReadFrequently: true });
        if (pCtx) {
          pCtx.save();
          pCtx.translate(160, 0);
          pCtx.scale(-1, 1);
          pCtx.drawImage(video, 0, 0, 160, 90);
          pCtx.restore();

          const frame = pCtx.getImageData(0, 0, 160, 90);
          const d = frame.data;
          const prev = prevFrameRef.current;

          if (prev && prev.length === d.length) {
            const threshold = (100 + (100 - sensitivity) * 8);

            ZONES.forEach(z => {
              const x0 = Math.floor(z.x * 160), x1 = Math.floor((z.x + z.w) * 160);
              const y0 = Math.floor(z.y * 90),  y1 = Math.floor((z.y + z.h) * 90);
              let sum = 0;
              for (let py = y0; py < y1; py += 2) {
                for (let px = x0; px < x1; px += 2) {
                  const i = (py * 160 + px) * 4;
                  const diff = Math.abs(d[i] - prev[i])
                             + Math.abs(d[i+1] - prev[i+1])
                             + Math.abs(d[i+2] - prev[i+2]);
                  if (diff > 20) sum += diff;
                }
              }
              const pct = Math.min(100, Math.round(sum / threshold * 100));
              newMotions[z.id] = pct;
              if (sum >= threshold) fireStrike(z.id as DrumInstrumentId);
            });
            setMotionDisplay({ ...newMotions });
          }
          prevFrameRef.current = new Uint8ClampedArray(d);
        }
      } else {
        // Dark gradient background when camera is off
        const bg = ctx.createLinearGradient(0, 0, 0, H);
        bg.addColorStop(0, '#0a1020');
        bg.addColorStop(1, '#03050a');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, W, H);
        // Subtle grid
        ctx.strokeStyle = 'rgba(255,255,255,0.04)';
        ctx.lineWidth = 1;
        for (let gx = 0; gx < W; gx += 40) {
          ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke();
        }
        for (let gy = 0; gy < H; gy += 40) {
          ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
        }
      }

      // ── DRAW 8 ZONES (always, over whatever background) ────────────────
      const flashNow = performance.now();
      ZONES.forEach(z => {
        const hand = getInstrumentHand(z.id, handedness, invertHands);
        const flashing = flashNow - (flashRef.current[z.id] || 0) < 220;
        drawZone(ctx, z, W, H, flashing, isActive, hand);
      });

      // ── TOP LEGEND ───────────────────────────────────────────────────────
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.beginPath();
      ctx.roundRect(W / 2 - 130, 5, 260, 18, 9);
      ctx.fill();
      ctx.font = '9px monospace';
      ctx.fillStyle = '#67e8f9';
      ctx.textAlign = 'left';
      ctx.fillText('● CYAN = LEFT HAND', W / 2 - 122, 17);
      ctx.fillStyle = '#94a3b8';
      ctx.fillText('  |  ', W / 2 - 10, 17);
      ctx.fillStyle = '#fb923c';
      ctx.fillText('● ORANGE = RIGHT HAND', W / 2 + 18, 17);
      ctx.textAlign = 'left';

      // ── STATUS badge ─────────────────────────────────────────────────────
      if (isActive && videoReady) {
        ctx.fillStyle = 'rgba(4,120,87,0.85)';
        ctx.beginPath(); ctx.roundRect(6, 6, 90, 16, 4); ctx.fill();
        ctx.fillStyle = '#6ee7b7'; ctx.font = 'bold 9px monospace';
        ctx.fillText(`● LIVE ${fps}fps`, 12, 17);
      } else if (isActive && !videoReady) {
        ctx.fillStyle = 'rgba(180,83,9,0.85)';
        ctx.beginPath(); ctx.roundRect(6, 6, 100, 16, 4); ctx.fill();
        ctx.fillStyle = '#fcd34d'; ctx.font = 'bold 9px monospace';
        ctx.fillText('⏳ LOADING VIDEO...', 12, 17);
      }
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, sensitivity, handedness, invertHands, fireStrike, fps]);

  // ── Canvas click → trigger zone ────────────────────────────────────────────
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const rx = (e.clientX - rect.left) / rect.width;
    const ry = (e.clientY - rect.top)  / rect.height;
    const hit = ZONES.find(z => rx >= z.x && rx <= z.x + z.w && ry >= z.y && ry <= z.y + z.h);
    if (hit) fireStrike(hit.id);
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8,
      borderRadius: 12, background: 'linear-gradient(180deg,#0f172a,#070b14)',
      border: '1px solid #1e293b', padding: 10 }}>

      {/* HIDDEN video element — only used as drawImage source */}
      <video ref={videoRef} autoPlay playsInline muted
        style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none' }} />

      {/* ── HEADER ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        borderBottom: '1px solid #1e293b', paddingBottom: 8, flexWrap: 'wrap', gap: 6 }}>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 900, fontSize: 13, color: '#fff', fontFamily: 'monospace' }}>
              🥁 AIR DRUMMING — 8 ZONES
            </span>
            {isActive
              ? <span style={{ fontSize: 10, color: '#6ee7b7', background: '#022c22', border: '1px solid #10b981', borderRadius: 4, padding: '1px 6px', fontFamily: 'monospace' }}>● LIVE {resolution}</span>
              : isDemoMode
              ? <span style={{ fontSize: 10, color: '#c084fc', background: '#3b0764', border: '1px solid #a855f7', borderRadius: 4, padding: '1px 6px', fontFamily: 'monospace' }}>✨ DEMO</span>
              : <span style={{ fontSize: 10, color: '#64748b', background: '#1e293b', border: '1px solid #334155', borderRadius: 4, padding: '1px 6px', fontFamily: 'monospace' }}>STANDBY</span>
            }
          </div>
          {deviceLabel && <div style={{ fontSize: 10, color: '#64748b', fontFamily: 'monospace', marginTop: 2 }}>📷 {deviceLabel}</div>}
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {/* Demo */}
          <button onClick={() => { if (isActive) stopCamera(); setIsDemoMode(p => !p); }}
            style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #7c3aed',
              background: isDemoMode ? '#7c3aed' : '#3b076699',
              color: isDemoMode ? '#fff' : '#c084fc',
              fontWeight: 700, fontSize: 11, cursor: 'pointer', fontFamily: 'monospace' }}>
            ✨ {isDemoMode ? 'STOP DEMO' : 'DEMO MODE'}
          </button>

          {/* Start / Stop camera */}
          {isActive
            ? <button onClick={stopCamera}
                style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #ef4444',
                  background: '#450a0a', color: '#fca5a5', fontWeight: 700, fontSize: 11,
                  cursor: 'pointer', fontFamily: 'monospace' }}>
                ⏹ STOP
              </button>
            : <button onClick={startCamera} disabled={isStarting}
                style={{ padding: '4px 12px', borderRadius: 6, border: 'none',
                  background: isStarting ? '#374151' : 'linear-gradient(90deg,#059669,#0d9488)',
                  color: '#fff', fontWeight: 900, fontSize: 11,
                  cursor: isStarting ? 'not-allowed' : 'pointer', fontFamily: 'monospace' }}>
                {isStarting ? '⏳ STARTING...' : '📷 START CAMERA'}
              </button>
          }

          {/* Logs */}
          <button onClick={() => setShowDiag(p => !p)}
            style={{ padding: '4px 8px', borderRadius: 6,
              border: `1px solid ${showDiag ? '#f59e0b' : '#334155'}`,
              background: showDiag ? '#451a03' : '#1e293b',
              color: showDiag ? '#fcd34d' : '#94a3b8',
              fontWeight: 700, fontSize: 11, cursor: 'pointer', fontFamily: 'monospace' }}>
            🔍 LOGS
          </button>
        </div>
      </div>

      {/* ── ERROR BANNER ── */}
      {cameraError && (
        <div style={{ padding: 8, borderRadius: 8, background: '#450a0a',
          border: '1px solid #ef4444', color: '#fca5a5', fontSize: 11, fontFamily: 'monospace' }}>
          ⚠️ {cameraError}
          <div style={{ marginTop: 6, display: 'flex', gap: 6 }}>
            <button onClick={startCamera}
              style={{ padding: '2px 8px', borderRadius: 4, background: '#7f1d1d',
                color: '#fff', border: 'none', cursor: 'pointer', fontSize: 10, fontFamily: 'monospace', fontWeight: 700 }}>
              🔄 Retry
            </button>
            <button onClick={() => { setCameraError(null); setIsDemoMode(true); }}
              style={{ padding: '2px 8px', borderRadius: 4, background: '#3b0764',
                color: '#c084fc', border: 'none', cursor: 'pointer', fontSize: 10, fontFamily: 'monospace', fontWeight: 700 }}>
              ✨ Try Demo
            </button>
          </div>
        </div>
      )}

      {/* ── DIAGNOSTICS ── */}
      {showDiag && (
        <div style={{ padding: 8, borderRadius: 8, background: '#000',
          border: '1px solid #f59e0b88', fontFamily: 'monospace', fontSize: 10, color: '#fcd34d' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #f59e0b44',
            paddingBottom: 4, marginBottom: 6 }}>
            <strong>🔍 DIAGNOSTICS</strong>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setDiagLogs([])}
                style={{ color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', fontSize: 10 }}>Clear</button>
              <button onClick={() => setShowDiag(false)}
                style={{ color: '#fcd34d', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>✕</button>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, color: '#cbd5e1', marginBottom: 6, fontSize: 9 }}>
            <span>HTTPS: <strong style={{ color: window.isSecureContext ? '#34d399' : '#f87171' }}>{window.isSecureContext ? 'YES ✓' : 'NO ✗'}</strong></span>
            <span>Camera API: <strong style={{ color: navigator.mediaDevices ? '#34d399' : '#f87171' }}>{navigator.mediaDevices ? 'OK ✓' : 'MISSING ✗'}</strong></span>
            <span>State: <strong style={{ color: '#fff' }}>{isActive ? 'ACTIVE' : 'IDLE'}</strong></span>
            <span>Resolution: <strong style={{ color: '#fff' }}>{resolution || 'N/A'}</strong></span>
          </div>
          <div style={{ maxHeight: 80, overflowY: 'auto', background: '#0f172a', padding: 4,
            borderRadius: 4, color: '#94a3b8', fontSize: 9 }}>
            {diagLogs.length === 0
              ? 'No logs. Click START CAMERA.'
              : diagLogs.map((l, i) => <div key={i}>{l}</div>)}
          </div>
        </div>
      )}

      {/* ── SINGLE CANVAS: video + zones drawn together ── */}
      <div style={{ position: 'relative', borderRadius: 8, overflow: 'hidden',
        border: '2px solid #334155', background: '#000' }}>
        <canvas
          ref={canvasRef}
          width={640}
          height={360}
          onClick={handleCanvasClick}
          style={{ display: 'block', width: '100%', cursor: 'pointer' }}
          title="Click any zone to play it. Move in front of camera to trigger motion detection."
        />
        {!isActive && !isDemoMode && (
          <div style={{ position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)',
            background: 'rgba(0,0,0,0.8)', border: '1px solid #334155', borderRadius: 6,
            padding: '4px 12px', color: '#64748b', fontSize: 10, fontFamily: 'monospace',
            whiteSpace: 'nowrap', pointerEvents: 'none' }}>
            Click zone to play · START CAMERA for motion detection · DEMO MODE to preview
          </div>
        )}
      </div>

      {/* ── 8-ZONE STATUS GRID ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 4, fontFamily: 'monospace' }}>
        {ZONES.map(z => {
          const hand = getInstrumentHand(z.id, handedness, invertHands);
          const isRight = hand === 'RIGHT';
          const flashing = performance.now() - (flashRef.current[z.id] || 0) < 220;
          const motion = motionDisplay[z.id] || 0;
          const hits = hitDisplay[z.id] || 0;
          return (
            <button key={z.id} onClick={() => fireStrike(z.id)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                padding: '4px 2px', borderRadius: 6, cursor: 'pointer', transition: 'all 0.1s',
                border: `1px solid ${flashing ? '#fff' : isRight ? '#f9731688' : '#06b6d488'}`,
                background: flashing ? '#fff' : isRight ? '#43140733' : '#08334433',
                color: flashing ? '#000' : isRight ? '#fdba74' : '#67e8f9',
              }}>
              <span style={{ fontSize: 9, fontWeight: 700 }}>{z.label}</span>
              <div style={{ width: '80%', height: 3, background: '#1e293b', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ width: `${motion}%`, height: '100%',
                  background: isRight ? '#f97316' : '#22d3ee', transition: 'width 60ms' }} />
              </div>
              <span style={{ fontSize: 8, opacity: 0.7 }}>{hits > 0 ? `${hits}×` : (isRight ? 'RH' : 'LH')}</span>
            </button>
          );
        })}
      </div>

      {/* ── SENSITIVITY ── */}
      <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, padding: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10,
          fontFamily: 'monospace', color: '#94a3b8', marginBottom: 4 }}>
          <span>🎚 MOTION SENSITIVITY</span>
          <span style={{ color: '#22d3ee', fontWeight: 700 }}>{sensitivity}%</span>
        </div>
        <input type="range" min={20} max={90} value={sensitivity}
          onChange={e => setSensitivity(+e.target.value)}
          style={{ width: '100%', accentColor: '#22d3ee', cursor: 'pointer' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9,
          fontFamily: 'monospace', color: '#475569', marginTop: 2 }}>
          <button onClick={() => setSensitivity(40)}
            style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 9 }}>
            Low (40%)
          </button>
          <button onClick={() => setSensitivity(60)}
            style={{ background: 'none', border: 'none', color: '#fbbf24', cursor: 'pointer', fontSize: 9, fontWeight: 700 }}>
            Default (60%)
          </button>
          <button onClick={() => setSensitivity(80)}
            style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 9 }}>
            High (80%)
          </button>
        </div>
      </div>
    </div>
  );
};

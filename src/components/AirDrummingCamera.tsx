import React, { useRef, useEffect, useState, useCallback } from 'react';
import { DrumInstrumentId, Hand, Handedness } from '../types/drum';
import { getInstrumentHand } from '../data/beatLibrary';

interface AirDrummingCameraProps {
  onAirStrike: (instrument: DrumInstrumentId, hand: Hand) => void;
  handedness?: Handedness;
  invertHands?: boolean;
}

const ZONES: Array<{
  id: DrumInstrumentId; label: string; type: 'cymbal' | 'drum';
  x: number; y: number; w: number; h: number;
}> = [
  { id: 'crash',        label: 'CRASH',      type: 'cymbal', x: 0.02, y: 0.03, w: 0.22, h: 0.28 },
  { id: 'high_tom',     label: 'HI TOM',     type: 'drum',   x: 0.26, y: 0.03, w: 0.22, h: 0.28 },
  { id: 'mid_tom',      label: 'MID TOM',    type: 'drum',   x: 0.52, y: 0.03, w: 0.22, h: 0.28 },
  { id: 'ride',         label: 'RIDE',       type: 'cymbal', x: 0.76, y: 0.03, w: 0.22, h: 0.28 },
  { id: 'hihat_closed', label: 'HI-HAT',     type: 'cymbal', x: 0.02, y: 0.35, w: 0.22, h: 0.29 },
  { id: 'snare',        label: 'SNARE',      type: 'drum',   x: 0.26, y: 0.35, w: 0.22, h: 0.29 },
  { id: 'floor_tom',    label: 'FLOOR TOM',  type: 'drum',   x: 0.76, y: 0.35, w: 0.22, h: 0.29 },
  { id: 'bass',         label: 'BASS DRUM',  type: 'drum',   x: 0.33, y: 0.67, w: 0.34, h: 0.30 },
];

const HAND_COLOR: Record<string, string> = { LEFT: '#00E5FF', RIGHT: '#FF6D00' };

// Draw a rect without roundRect (maximum browser compatibility)
function drawRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  fill: string, stroke: string, lineWidth: number,
) {
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;
  ctx.strokeRect(x, y, w, h);
}

export const AirDrummingCamera: React.FC<AirDrummingCameraProps> = ({
  onAirStrike,
  handedness = 'RIGHT_HANDED',
  invertHands = false,
}) => {
  const [isActive,    setIsActive]    = useState(false);
  const [isStarting,  setIsStarting]  = useState(false);
  const [isDemoMode,  setIsDemoMode]  = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [showDiag,    setShowDiag]    = useState(false);
  const [diagLogs,    setDiagLogs]    = useState<string[]>([]);
  const [sensitivity, setSensitivity] = useState(60);
  const [statusLine,  setStatusLine]  = useState('STANDBY — zones visible without camera');

  const flashRef    = useRef<Record<string, number>>({});
  const lastHitRef  = useRef<Record<string, number>>({});
  const hitRef      = useRef<Record<string, number>>({});

  const videoRef  = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const procRef   = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const prevFrame = useRef<Uint8ClampedArray | null>(null);
  const rafRef    = useRef<number>(0);
  const isActiveRef   = useRef(false);
  const sensitivityRef = useRef(sensitivity);

  // Keep refs in sync with state (avoids stale closure in render loop)
  isActiveRef.current    = isActive;
  sensitivityRef.current = sensitivity;

  // ── Logging ─────────────────────────────────────────────────────────────
  const log = useCallback((msg: string) => {
    const t = new Date().toLocaleTimeString();
    setDiagLogs(p => [`[${t}] ${msg}`, ...p.slice(0, 29)]);
  }, []);

  // ── Strike ───────────────────────────────────────────────────────────────
  const fireStrike = useCallback((id: DrumInstrumentId) => {
    const now = performance.now();
    if (now - (lastHitRef.current[id] || 0) < 180) return;
    lastHitRef.current[id] = now;
    flashRef.current[id]   = now;
    hitRef.current[id]     = (hitRef.current[id] || 0) + 1;
    const hand = getInstrumentHand(id, handedness, invertHands);
    onAirStrike(id, hand);
  }, [onAirStrike, handedness, invertHands]);

  // ── Demo ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isDemoMode) return;
    const seq: DrumInstrumentId[] = [
      'hihat_closed','snare','hihat_closed','bass',
      'crash','high_tom','mid_tom','floor_tom',
    ];
    let i = 0;
    const t = setInterval(() => fireStrike(seq[i++ % seq.length]), 430);
    return () => clearInterval(t);
  }, [isDemoMode, fireStrike]);

  // ── Camera start ──────────────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    setCameraError(null);
    setIsStarting(true);
    setIsDemoMode(false);
    prevFrame.current = null;
    log('Requesting camera...');
    setStatusLine('Requesting camera permission...');

    if (!navigator.mediaDevices?.getUserMedia) {
      const e = 'Camera API not available. Page must be served over HTTPS or localhost.';
      setCameraError(e); log('ERROR: ' + e); setIsStarting(false);
      setStatusLine('ERROR: No camera API'); return;
    }

    let stream: MediaStream | null = null;
    const tries: MediaStreamConstraints[] = [
      { video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }, audio: false },
      { video: { facingMode: 'user' }, audio: false },
      { video: true, audio: false },
    ];
    for (const c of tries) {
      try { stream = await navigator.mediaDevices.getUserMedia(c); if (stream) { log('Stream OK'); break; } }
      catch (err) { log('Attempt failed: ' + (err instanceof Error ? err.message : String(err))); }
    }

    if (!stream) {
      const e = 'Camera blocked. Open browser settings → Site Settings → Camera → Allow for this site.';
      setCameraError(e); log('ERROR: ' + e); setIsStarting(false);
      setStatusLine('Camera blocked'); return;
    }

    streamRef.current = stream;
    const track = stream.getVideoTracks()[0];
    log('Track: ' + (track?.label || 'unknown'));

    const v = videoRef.current!;
    v.srcObject = stream;
    v.muted = true;
    v.playsInline = true;
    v.onloadedmetadata = () => {
      v.play().catch(() => {});
      log(`Video: ${v.videoWidth}×${v.videoHeight}`);
      setStatusLine(`LIVE ${v.videoWidth}×${v.videoHeight} — move hands in zones to drum`);
    };
    try { await v.play(); } catch (_) { /* handled by onloadedmetadata */ }

    setIsActive(true);
    setIsStarting(false);
    setStatusLine('Camera starting...');
  }, [log]);

  // ── Camera stop ───────────────────────────────────────────────────────────
  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    prevFrame.current = null;
    setIsActive(false); setIsStarting(false); setIsDemoMode(false);
    setStatusLine('STANDBY — zones visible without camera');
    log('Camera stopped.');
  }, [log]);

  useEffect(() => () => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
  }, []);

  // ── MAIN RENDER LOOP ──────────────────────────────────────────────────────
  // Uses REFS for isActive/sensitivity to avoid restarting on every change.
  // NO roundRect anywhere — uses fillRect/strokeRect for max compatibility.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (!procRef.current) {
      procRef.current = document.createElement('canvas');
      procRef.current.width  = 160;
      procRef.current.height = 90;
    }
    const proc = procRef.current;

    let frames = 0;
    let fpsTimer = performance.now();
    let fpsDisplay = 0;

    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);

      try {
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const W = canvas.width, H = canvas.height;

        // FPS (stored locally, never causes re-render)
        frames++;
        const now = performance.now();
        if (now - fpsTimer >= 1000) { fpsDisplay = frames; frames = 0; fpsTimer = now; }

        const active = isActiveRef.current;
        const video  = videoRef.current;
        const videoReady = !!(video && video.readyState >= 2 && video.videoWidth > 0);

        // ── BACKGROUND ──────────────────────────────────────────────────
        if (active && videoReady) {
          // Mirror-flip video onto canvas
          ctx.save();
          ctx.translate(W, 0);
          ctx.scale(-1, 1);
          ctx.drawImage(video, 0, 0, W, H);
          ctx.restore();

          // ── MOTION DETECTION ────────────────────────────────────────
          const pCtx = proc.getContext('2d', { willReadFrequently: true });
          if (pCtx) {
            pCtx.save(); pCtx.translate(160, 0); pCtx.scale(-1, 1);
            pCtx.drawImage(video, 0, 0, 160, 90);
            pCtx.restore();
            const frame = pCtx.getImageData(0, 0, 160, 90).data;
            const prev  = prevFrame.current;
            if (prev && prev.length === frame.length) {
              const thr = 80 + (100 - sensitivityRef.current) * 6;
              ZONES.forEach(z => {
                const x0 = Math.floor(z.x * 160), x1 = Math.floor((z.x + z.w) * 160);
                const y0 = Math.floor(z.y * 90),  y1 = Math.floor((z.y + z.h) * 90);
                let s = 0;
                for (let py = y0; py < y1; py += 2)
                  for (let px = x0; px < x1; px += 2) {
                    const i = (py * 160 + px) * 4;
                    const d = Math.abs(frame[i]-prev[i]) + Math.abs(frame[i+1]-prev[i+1]) + Math.abs(frame[i+2]-prev[i+2]);
                    if (d > 20) s += d;
                  }
                if (s >= thr) fireStrike(z.id as DrumInstrumentId);
              });
            }
            prevFrame.current = new Uint8ClampedArray(frame);
          }
        } else {
          // Dark background with grid
          ctx.fillStyle = '#080d1a';
          ctx.fillRect(0, 0, W, H);
          ctx.strokeStyle = 'rgba(255,255,255,0.05)';
          ctx.lineWidth = 1;
          for (let gx = 0; gx < W; gx += 40) { ctx.beginPath(); ctx.moveTo(gx,0); ctx.lineTo(gx,H); ctx.stroke(); }
          for (let gy = 0; gy < H; gy += 40) { ctx.beginPath(); ctx.moveTo(0,gy); ctx.lineTo(W,gy); ctx.stroke(); }

          // Centre prompt when standby
          if (!active) {
            ctx.fillStyle = 'rgba(255,255,255,0.12)';
            ctx.font = 'bold 14px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('↓  Click START CAMERA or DEMO MODE  ↓', W/2, H/2 + 4);
            ctx.textAlign = 'left';
          }
        }

        // ── DRAW 8 ZONES (always visible) ──────────────────────────────
        ZONES.forEach(z => {
          const zx = Math.round(z.x * W), zy = Math.round(z.y * H);
          const zw = Math.round(z.w * W), zh = Math.round(z.h * H);
          const hand  = getInstrumentHand(z.id, handedness, invertHands);
          const col   = HAND_COLOR[hand];
          const flash = (performance.now() - (flashRef.current[z.id] || 0)) < 220;

          // Box — no roundRect, just fillRect + strokeRect
          ctx.globalAlpha = flash ? 0.75 : (active ? 0.22 : 0.18);
          ctx.fillStyle   = col;
          ctx.fillRect(zx, zy, zw, zh);
          ctx.globalAlpha = 1;
          ctx.strokeStyle = flash ? '#FFFFFF' : col;
          ctx.lineWidth   = flash ? 4 : 2;
          ctx.strokeRect(zx, zy, zw, zh);

          // Corner brackets (L-shapes at each corner)
          const cL = 10;
          ctx.strokeStyle = flash ? '#FFF' : col;
          ctx.lineWidth   = 3;
          ctx.beginPath();
          // TL
          ctx.moveTo(zx, zy+cL); ctx.lineTo(zx, zy); ctx.lineTo(zx+cL, zy);
          // TR
          ctx.moveTo(zx+zw-cL, zy); ctx.lineTo(zx+zw, zy); ctx.lineTo(zx+zw, zy+cL);
          // BL
          ctx.moveTo(zx, zy+zh-cL); ctx.lineTo(zx, zy+zh); ctx.lineTo(zx+cL, zy+zh);
          // BR
          ctx.moveTo(zx+zw-cL, zy+zh); ctx.lineTo(zx+zw, zy+zh); ctx.lineTo(zx+zw, zy+zh-cL);
          ctx.stroke();

          // Drum/cymbal icon
          const cx = zx + zw/2, cy = zy + zh/2;
          const r  = Math.min(zw, zh) * 0.28;
          ctx.strokeStyle = flash ? '#FFF' : col + '88';
          ctx.lineWidth   = 1.5;
          ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.stroke();
          if (z.type === 'cymbal') {
            ctx.beginPath(); ctx.arc(cx, cy, r*0.55, 0, Math.PI*2); ctx.stroke();
            ctx.fillStyle = flash ? '#FFF' : col;
            ctx.beginPath(); ctx.arc(cx, cy, r*0.2, 0, Math.PI*2); ctx.fill();
          } else {
            ctx.strokeStyle = flash ? '#FFF' : col;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(cx-r*0.4, cy); ctx.lineTo(cx+r*0.4, cy);
            ctx.moveTo(cx, cy-r*0.4); ctx.lineTo(cx, cy+r*0.4);
            ctx.stroke();
            ctx.fillStyle = flash ? '#FFF' : col;
            ctx.beginPath(); ctx.arc(cx, cy, r*0.18, 0, Math.PI*2); ctx.fill();
          }

          // Label text
          ctx.fillStyle = flash ? '#FFF' : col;
          ctx.font = 'bold 10px monospace';
          ctx.textAlign = 'left';
          ctx.fillText(z.label, zx+5, zy+14);
          ctx.fillStyle = 'rgba(255,255,255,0.75)';
          ctx.font = '9px monospace';
          ctx.fillText(hand === 'RIGHT' ? 'RH' : 'LH', zx+5, zy+25);

          // Hit count badge
          const hc = hitRef.current[z.id] || 0;
          if (hc > 0) {
            ctx.fillStyle = col;
            ctx.fillRect(zx+zw-20, zy+2, 18, 12);
            ctx.fillStyle = '#000';
            ctx.font = 'bold 8px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(String(hc), zx+zw-11, zy+11);
            ctx.textAlign = 'left';
          }
        });

        // ── STATUS BAR (top) ─────────────────────────────────────────
        if (active && videoReady) {
          drawRect(ctx, 4, 4, 100, 16, 'rgba(4,120,87,0.85)', 'transparent', 0);
          ctx.fillStyle = '#6ee7b7'; ctx.font = 'bold 9px monospace';
          ctx.fillText(`● LIVE  ${fpsDisplay}fps`, 8, 16);
        } else if (active && !videoReady) {
          drawRect(ctx, 4, 4, 120, 16, 'rgba(180,83,9,0.85)', 'transparent', 0);
          ctx.fillStyle = '#fcd34d'; ctx.font = 'bold 9px monospace';
          ctx.fillText('⏳ LOADING VIDEO...', 8, 16);
        }

        // ── LEGEND ──────────────────────────────────────────────────
        const lW = 240, lH = 16, lX = W/2 - lW/2, lY = 5;
        drawRect(ctx, lX, lY, lW, lH, 'rgba(0,0,0,0.6)', 'transparent', 0);
        ctx.font = '8px monospace'; ctx.textAlign = 'left';
        ctx.fillStyle = '#67e8f9'; ctx.fillText('● CYAN=LEFT HAND', lX+6, lY+11);
        ctx.fillStyle = '#fb923c'; ctx.fillText('● ORANGE=RIGHT HAND', lX+126, lY+11);
        ctx.textAlign = 'left';

      } catch (err) {
        // Show any canvas error visually so it's never silent
        try {
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.fillStyle = '#1a0000'; ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#ff4444'; ctx.font = 'bold 13px monospace';
            ctx.fillText('RENDER ERROR (check console):', 10, 30);
            ctx.fillStyle = '#ffaaaa'; ctx.font = '11px monospace';
            const msg = err instanceof Error ? err.message : String(err);
            ctx.fillText(msg.slice(0, 80), 10, 50);
          }
        } catch (_) { /* last resort */ }
      }
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
    // handedness/invertHands read inside loop — no need in deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // ← Empty deps: loop runs once forever, reads everything from refs

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current; if (!c) return;
    const r = c.getBoundingClientRect();
    const rx = (e.clientX - r.left) / r.width;
    const ry = (e.clientY - r.top)  / r.height;
    const hit = ZONES.find(z => rx >= z.x && rx <= z.x+z.w && ry >= z.y && ry <= z.y+z.h);
    if (hit) fireStrike(hit.id);
  };

  // ── JSX ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:8,
      borderRadius:12, background:'linear-gradient(180deg,#0f172a,#070b14)',
      border:'1px solid #1e293b', padding:10 }}>

      {/* Hidden video — data source only */}
      <video ref={videoRef} autoPlay playsInline muted
        style={{ position:'fixed', top:-9999, left:-9999, width:1, height:1 }} />

      {/* ── HEADER ── */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
        borderBottom:'1px solid #1e293b', paddingBottom:8, flexWrap:'wrap', gap:6 }}>
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontWeight:900, fontSize:13, color:'#fff', fontFamily:'monospace' }}>
              🥁 AIR DRUMMING — 8 ZONES
            </span>
            {isActive
              ? <span style={{ fontSize:10, color:'#6ee7b7', background:'#022c22', border:'1px solid #10b981', borderRadius:4, padding:'1px 6px', fontFamily:'monospace' }}>● LIVE</span>
              : isDemoMode
              ? <span style={{ fontSize:10, color:'#c084fc', background:'#3b0764', border:'1px solid #a855f7', borderRadius:4, padding:'1px 6px', fontFamily:'monospace' }}>✨ DEMO</span>
              : <span style={{ fontSize:10, color:'#64748b', background:'#1e293b', border:'1px solid #334155', borderRadius:4, padding:'1px 6px', fontFamily:'monospace' }}>STANDBY</span>}
          </div>
          <div style={{ fontSize:9, color:'#64748b', fontFamily:'monospace', marginTop:2 }}>{statusLine}</div>
        </div>

        <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
          <button onClick={() => { if (isActive) stopCamera(); setIsDemoMode(p => !p); }}
            style={{ padding:'4px 10px', borderRadius:6, border:'1px solid #7c3aed',
              background: isDemoMode ? '#7c3aed' : '#3b076699',
              color: isDemoMode ? '#fff' : '#c084fc',
              fontWeight:700, fontSize:11, cursor:'pointer', fontFamily:'monospace' }}>
            ✨ {isDemoMode ? 'STOP DEMO' : 'DEMO MODE'}
          </button>

          {isActive
            ? <button onClick={stopCamera}
                style={{ padding:'4px 10px', borderRadius:6, border:'1px solid #ef4444',
                  background:'#450a0a', color:'#fca5a5', fontWeight:700, fontSize:11,
                  cursor:'pointer', fontFamily:'monospace' }}>⏹ STOP</button>
            : <button onClick={startCamera} disabled={isStarting}
                style={{ padding:'4px 14px', borderRadius:6, border:'none',
                  background: isStarting ? '#374151' : 'linear-gradient(90deg,#059669,#0d9488)',
                  color:'#fff', fontWeight:900, fontSize:11,
                  cursor: isStarting ? 'not-allowed' : 'pointer', fontFamily:'monospace' }}>
                {isStarting ? '⏳ STARTING...' : '📷 START CAMERA'}
              </button>}

          <button onClick={() => setShowDiag(p => !p)}
            style={{ padding:'4px 8px', borderRadius:6,
              border:`1px solid ${showDiag ? '#f59e0b' : '#334155'}`,
              background: showDiag ? '#451a03' : '#1e293b',
              color: showDiag ? '#fcd34d' : '#94a3b8',
              fontWeight:700, fontSize:11, cursor:'pointer', fontFamily:'monospace' }}>
            🔍 LOGS
          </button>
        </div>
      </div>

      {/* ── ERROR ── */}
      {cameraError && (
        <div style={{ padding:8, borderRadius:8, background:'#450a0a',
          border:'1px solid #ef4444', color:'#fca5a5', fontSize:11, fontFamily:'monospace' }}>
          ⚠️ {cameraError}
          <div style={{ marginTop:6, display:'flex', gap:6 }}>
            <button onClick={startCamera}
              style={{ padding:'2px 8px', borderRadius:4, background:'#7f1d1d', color:'#fff',
                border:'none', cursor:'pointer', fontSize:10, fontFamily:'monospace', fontWeight:700 }}>
              🔄 Retry
            </button>
            <button onClick={() => { setCameraError(null); setIsDemoMode(true); }}
              style={{ padding:'2px 8px', borderRadius:4, background:'#3b0764', color:'#c084fc',
                border:'none', cursor:'pointer', fontSize:10, fontFamily:'monospace', fontWeight:700 }}>
              ✨ Try Demo Instead
            </button>
          </div>
        </div>
      )}

      {/* ── DIAGNOSTICS ── */}
      {showDiag && (
        <div style={{ padding:8, borderRadius:8, background:'#000',
          border:'1px solid #f59e0b88', fontFamily:'monospace', fontSize:10, color:'#fcd34d' }}>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
            <strong>🔍 DIAGNOSTICS</strong>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={() => setDiagLogs([])}
                style={{ color:'#94a3b8', background:'none', border:'none', cursor:'pointer', fontSize:10 }}>Clear</button>
              <button onClick={() => setShowDiag(false)}
                style={{ color:'#fcd34d', background:'none', border:'none', cursor:'pointer', fontWeight:700 }}>✕</button>
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:4, color:'#cbd5e1', marginBottom:6, fontSize:9 }}>
            <span>HTTPS: <strong style={{ color: window.isSecureContext ? '#34d399' : '#f87171' }}>{window.isSecureContext ? 'YES ✓' : 'NO ✗'}</strong></span>
            <span>Camera API: <strong style={{ color: navigator.mediaDevices ? '#34d399' : '#f87171' }}>{navigator.mediaDevices ? 'OK ✓' : 'MISSING ✗'}</strong></span>
            <span>Canvas ready: <strong style={{ color: canvasRef.current ? '#34d399' : '#f87171' }}>{canvasRef.current ? 'YES ✓' : 'NO ✗'}</strong></span>
            <span>Camera: <strong style={{ color:'#fff' }}>{isActive ? 'ACTIVE' : 'IDLE'}</strong></span>
          </div>
          <div style={{ maxHeight:80, overflowY:'auto', background:'#0f172a', padding:4, borderRadius:4, color:'#94a3b8', fontSize:9 }}>
            {diagLogs.length === 0 ? 'No logs yet.' : diagLogs.map((l,i) => <div key={i}>{l}</div>)}
          </div>
        </div>
      )}

      {/* ── CANVAS (single element: background + video + zones) ── */}
      <canvas ref={canvasRef} width={640} height={360}
        onClick={handleCanvasClick}
        style={{ display:'block', width:'100%', borderRadius:8,
          border:'2px solid #334155', cursor:'pointer', background:'#080d1a' }}
        title="Click any zone · START CAMERA for motion detection · DEMO MODE to preview" />

      {/* ── 8-ZONE STATUS GRID ── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:4, fontFamily:'monospace' }}>
        {ZONES.map(z => {
          const hand    = getInstrumentHand(z.id, handedness, invertHands);
          const isRight = hand === 'RIGHT';
          return (
            <button key={z.id} onClick={() => fireStrike(z.id)}
              style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:2,
                padding:'4px 2px', borderRadius:6, cursor:'pointer',
                border:`1px solid ${isRight ? '#f9731688' : '#06b6d488'}`,
                background: isRight ? '#43140733' : '#08334433',
                color: isRight ? '#fdba74' : '#67e8f9' }}>
              <span style={{ fontSize:9, fontWeight:700 }}>{z.label}</span>
              <span style={{ fontSize:8, opacity:0.6 }}>{isRight ? 'RH' : 'LH'}</span>
            </button>
          );
        })}
      </div>

      {/* ── SENSITIVITY ── */}
      <div style={{ background:'#0f172a', border:'1px solid #1e293b', borderRadius:8, padding:8 }}>
        <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, fontFamily:'monospace', color:'#94a3b8', marginBottom:4 }}>
          <span>🎚 MOTION SENSITIVITY</span>
          <span style={{ color:'#22d3ee', fontWeight:700 }}>{sensitivity}%</span>
        </div>
        <input type="range" min={20} max={90} value={sensitivity}
          onChange={e => { setSensitivity(+e.target.value); sensitivityRef.current = +e.target.value; }}
          style={{ width:'100%', accentColor:'#22d3ee', cursor:'pointer' }} />
      </div>
    </div>
  );
};

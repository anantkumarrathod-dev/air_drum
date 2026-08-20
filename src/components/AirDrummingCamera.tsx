import React, { useRef, useEffect, useState, useCallback } from 'react';
import { DrumInstrumentId, Hand, Handedness } from '../types/drum';
import { getInstrumentHand } from '../data/beatLibrary';

interface AirDrummingCameraProps {
  onAirStrike: (instrument: DrumInstrumentId, hand: Hand) => void;
  handedness?: Handedness;
  invertHands?: boolean;
}

interface Zone {
  id: DrumInstrumentId;
  label: string;
  type: 'cymbal' | 'drum';
  x: number; // 0..1
  y: number;
  w: number;
  h: number;
}

const ZONES: Zone[] = [
  { id: 'crash',        label: 'CRASH',     type: 'cymbal', x: 0.02, y: 0.03, w: 0.22, h: 0.28 },
  { id: 'high_tom',     label: 'HI TOM',    type: 'drum',   x: 0.26, y: 0.03, w: 0.22, h: 0.28 },
  { id: 'mid_tom',      label: 'MID TOM',   type: 'drum',   x: 0.52, y: 0.03, w: 0.22, h: 0.28 },
  { id: 'ride',         label: 'RIDE',      type: 'cymbal', x: 0.76, y: 0.03, w: 0.22, h: 0.28 },
  { id: 'hihat_closed', label: 'HI-HAT',   type: 'cymbal', x: 0.02, y: 0.35, w: 0.22, h: 0.29 },
  { id: 'snare',        label: 'SNARE',     type: 'drum',   x: 0.26, y: 0.35, w: 0.22, h: 0.29 },
  { id: 'floor_tom',    label: 'FLOOR TOM', type: 'drum',   x: 0.76, y: 0.35, w: 0.22, h: 0.29 },
  { id: 'bass',         label: 'BASS DRUM', type: 'drum',   x: 0.33, y: 0.67, w: 0.34, h: 0.30 },
];

export const AirDrummingCamera: React.FC<AirDrummingCameraProps> = ({
  onAirStrike,
  handedness = 'RIGHT_HANDED',
  invertHands = false,
}) => {
  const [isActive, setIsActive] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [fps, setFps] = useState(0);
  const [resolution, setResolution] = useState('');
  const [deviceLabel, setDeviceLabel] = useState('');
  const [isPaused, setIsPaused] = useState(false);
  const [sensitivity, setSensitivity] = useState(65);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [showDiag, setShowDiag] = useState(false);
  const [diagLogs, setDiagLogs] = useState<string[]>([]);
  const [flashes, setFlashes] = useState<Record<string, boolean>>({});
  const [hits, setHits] = useState<Record<string, number>>({});
  const [motions, setMotions] = useState<Record<string, number>>({});

  const videoRef = useRef<HTMLVideoElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const procRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const prevFrameRef = useRef<Uint8ClampedArray | null>(null);
  const lastHitRef = useRef<Record<string, number>>({});

  const log = (msg: string) => {
    const t = new Date().toLocaleTimeString();
    setDiagLogs(prev => [`[${t}] ${msg}`, ...prev.slice(0, 19)]);
  };

  const fireStrike = useCallback((id: DrumInstrumentId) => {
    const now = performance.now();
    if (now - (lastHitRef.current[id] || 0) < 180) return;
    lastHitRef.current[id] = now;
    const hand = getInstrumentHand(id, handedness, invertHands);
    setHits(p => ({ ...p, [id]: (p[id] || 0) + 1 }));
    setFlashes(p => ({ ...p, [id]: true }));
    setTimeout(() => setFlashes(p => ({ ...p, [id]: false })), 200);
    onAirStrike(id, hand);
  }, [onAirStrike, handedness, invertHands]);

  // Demo mode auto-cycle
  useEffect(() => {
    if (!isDemoMode) return;
    const seq: DrumInstrumentId[] = ['hihat_closed','snare','hihat_closed','bass','crash','high_tom','mid_tom','floor_tom'];
    let i = 0;
    const t = setInterval(() => { fireStrike(seq[i++ % seq.length]); }, 420);
    return () => clearInterval(t);
  }, [isDemoMode, fireStrike]);

  const startCamera = async () => {
    setCameraError(null);
    setIsStarting(true);
    setIsDemoMode(false);
    log('Requesting camera access...');

    if (!navigator.mediaDevices?.getUserMedia) {
      const msg = 'Camera API not available (requires HTTPS or localhost).';
      setCameraError(msg); log('ERROR: ' + msg); setIsStarting(false); return;
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
        log('Camera acquired: ' + JSON.stringify(c.video));
        break;
      } catch (e: unknown) {
        log('Attempt failed: ' + (e instanceof Error ? e.message : String(e)));
      }
    }

    if (!stream) {
      const msg = 'Camera blocked. Check Windows Settings → Privacy → Camera, or close Zoom/Teams.';
      setCameraError(msg); log('ERROR: ' + msg); setIsStarting(false); return;
    }

    streamRef.current = stream;
    const track = stream.getVideoTracks()[0];
    if (track) { setDeviceLabel(track.label || 'Camera'); log('Track: ' + track.label); }

    const video = videoRef.current;
    if (video) {
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      video.onpause = () => setIsPaused(true);
      video.onplay  = () => setIsPaused(false);
      video.onloadedmetadata = () => {
        video.play().then(() => {
          setResolution(`${video.videoWidth}x${video.videoHeight}`);
          log(`Feed: ${video.videoWidth}x${video.videoHeight}`);
        }).catch(e => log('play() error: ' + e));
      };
      try { await video.play(); } catch (_) { /* onloadedmetadata will handle */ }
    }

    setIsActive(true);
    setIsStarting(false);
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setIsActive(false); setIsStarting(false); setIsPaused(false);
    setIsDemoMode(false); setFps(0); setResolution(''); setDeviceLabel('');
    prevFrameRef.current = null;
    log('Camera stopped.');
  };

  useEffect(() => () => { streamRef.current?.getTracks().forEach(t => t.stop()); }, []);

  // Render loop: skeleton overlay + motion detection
  useEffect(() => {
    let raf: number;
    let frameCount = 0;
    let fpsTimer = performance.now();

    if (!procRef.current) {
      procRef.current = document.createElement('canvas');
      procRef.current.width = 160;
      procRef.current.height = 90;
    }

    const loop = () => {
      const canvas = overlayRef.current;
      if (!canvas) { raf = requestAnimationFrame(loop); return; }
      const ctx = canvas.getContext('2d');
      if (!ctx) { raf = requestAnimationFrame(loop); return; }
      const W = canvas.width, H = canvas.height;

      // FPS counter
      frameCount++;
      const now = performance.now();
      if (now - fpsTimer >= 1000) { setFps(frameCount); frameCount = 0; fpsTimer = now; }

      if (isActive) {
        // Transparent overlay — video shows through
        ctx.clearRect(0, 0, W, H);

        // Motion detection
        const video = videoRef.current;
        const proc = procRef.current!;
        if (video && video.readyState >= 2 && video.videoWidth > 0) {
          const pCtx = proc.getContext('2d', { willReadFrequently: true });
          if (pCtx) {
            pCtx.drawImage(video, 0, 0, 160, 90);
            const frame = pCtx.getImageData(0, 0, 160, 90);
            const d = frame.data;
            const prev = prevFrameRef.current;
            if (prev && prev.length === d.length) {
              const threshold = (220 + (100 - sensitivity) * 10) * 0.7;
              const newMotions: Record<string, number> = {};
              ZONES.forEach(z => {
                // mirror x because video is flipped
                const mx = 1 - z.x - z.w;
                const x0 = Math.floor(mx * 160), x1 = Math.floor((mx + z.w) * 160);
                const y0 = Math.floor(z.y * 90),  y1 = Math.floor((z.y + z.h) * 90);
                let sum = 0;
                for (let py = y0; py < y1; py += 2) {
                  for (let px = x0; px < x1; px += 2) {
                    const i = (py * 160 + px) * 4;
                    const diff = Math.abs(d[i]-prev[i]) + Math.abs(d[i+1]-prev[i+1]) + Math.abs(d[i+2]-prev[i+2]);
                    if (diff > 20) sum += diff;
                  }
                }
                newMotions[z.id] = Math.min(100, Math.round(sum / threshold * 100));
                if (sum >= threshold) fireStrike(z.id);
              });
              setMotions(newMotions);
            }
            prevFrameRef.current = new Uint8ClampedArray(d);
          }
        }
      } else {
        // Dark grid background when camera is off
        ctx.fillStyle = '#070b16';
        ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = 'rgba(255,255,255,0.04)';
        ctx.lineWidth = 1;
        for (let gx = 0; gx < W; gx += 40) { ctx.beginPath(); ctx.moveTo(gx,0); ctx.lineTo(gx,H); ctx.stroke(); }
        for (let gy = 0; gy < H; gy += 40) { ctx.beginPath(); ctx.moveTo(0,gy); ctx.lineTo(W,gy); ctx.stroke(); }
      }

      // Draw 8-zone skeleton
      ZONES.forEach(z => {
        const zx = Math.round(z.x * W), zy = Math.round(z.y * H);
        const zw = Math.round(z.w * W), zh = Math.round(z.h * H);
        const cx = zx + zw / 2, cy = zy + zh / 2;
        const flash = flashes[z.id];
        const hand = getInstrumentHand(z.id, handedness, invertHands);
        const col = hand === 'RIGHT' ? '#FF6D00' : '#00E5FF';

        ctx.save();
        // Box
        ctx.strokeStyle = flash ? '#FFF' : col;
        ctx.lineWidth = flash ? 4 : 2;
        ctx.fillStyle = flash ? col + 'AA' : (isActive ? col + '22' : col + '18');
        ctx.beginPath(); ctx.roundRect(zx, zy, zw, zh, 10); ctx.fill(); ctx.stroke();

        // Corner brackets
        const cL = 10;
        ctx.strokeStyle = flash ? '#FFF' : col; ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(zx, zy+cL); ctx.lineTo(zx, zy); ctx.lineTo(zx+cL, zy);
        ctx.moveTo(zx+zw-cL, zy); ctx.lineTo(zx+zw, zy); ctx.lineTo(zx+zw, zy+cL);
        ctx.moveTo(zx, zy+zh-cL); ctx.lineTo(zx, zy+zh); ctx.lineTo(zx+cL, zy+zh);
        ctx.moveTo(zx+zw-cL, zy+zh); ctx.lineTo(zx+zw, zy+zh); ctx.lineTo(zx+zw, zy+zh-cL);
        ctx.stroke();

        // Cymbal or drum icon
        const r = Math.min(zw, zh) * 0.3;
        ctx.strokeStyle = flash ? '#FFF' : col + '99'; ctx.lineWidth = 1.5;
        if (z.type === 'cymbal') {
          ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.stroke();
          ctx.beginPath(); ctx.arc(cx, cy, r*0.6, 0, Math.PI*2); ctx.stroke();
          ctx.fillStyle = flash ? '#FFF' : col;
          ctx.beginPath(); ctx.arc(cx, cy, r*0.25, 0, Math.PI*2); ctx.fill();
        } else {
          ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); ctx.stroke();
          ctx.strokeStyle = col + '44';
          ctx.beginPath(); ctx.arc(cx, cy, r*0.7, 0, Math.PI*2); ctx.stroke();
          ctx.strokeStyle = flash ? '#FFF' : col; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(cx-r*0.4, cy); ctx.lineTo(cx+r*0.4, cy);
          ctx.moveTo(cx, cy-r*0.4); ctx.lineTo(cx, cy+r*0.4); ctx.stroke();
          ctx.fillStyle = flash ? '#FFF' : col;
          ctx.beginPath(); ctx.arc(cx, cy, r*0.2, 0, Math.PI*2); ctx.fill();
        }

        // Label
        ctx.fillStyle = flash ? '#FFF' : col;
        ctx.font = 'bold 10px monospace';
        ctx.fillText(z.label, zx+6, zy+14);
        ctx.fillStyle = '#FFF';
        ctx.font = '9px monospace';
        ctx.fillText(hand === 'RIGHT' ? 'RH' : 'LH', zx+6, zy+26);

        ctx.restore();
      });

      raf = requestAnimationFrame(loop);
    };

    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [isActive, sensitivity, flashes, handedness, invertHands, fireStrike]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = overlayRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const rx = (e.clientX - rect.left) / rect.width;
    const ry = (e.clientY - rect.top)  / rect.height;
    const zone = ZONES.find(z => rx >= z.x && rx <= z.x+z.w && ry >= z.y && ry <= z.y+z.h);
    if (zone) fireStrike(zone.id);
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'8px', borderRadius:'12px', background:'linear-gradient(180deg,#0f172a,#0e1628,#070b14)', border:'1px solid #1e293b', padding:'10px' }}>

      {/* ── HEADER ── */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:'1px solid #1e293b', paddingBottom:'8px', flexWrap:'wrap', gap:'6px' }}>
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
            <span style={{ fontSize:'14px', fontWeight:900, color:'#fff', fontFamily:'monospace' }}>🥁 AIR DRUMMING</span>
            {isActive && (
              <span style={{ fontSize:'10px', color:'#34d399', background:'#022c22', border:'1px solid #10b981', borderRadius:'4px', padding:'1px 6px', fontFamily:'monospace' }}>
                ● LIVE {resolution} · {fps}fps
              </span>
            )}
            {isDemoMode && (
              <span style={{ fontSize:'10px', color:'#c084fc', background:'#3b0764', border:'1px solid #a855f7', borderRadius:'4px', padding:'1px 6px', fontFamily:'monospace' }}>
                ✨ DEMO RUNNING
              </span>
            )}
            {!isActive && !isDemoMode && (
              <span style={{ fontSize:'10px', color:'#64748b', background:'#1e293b', border:'1px solid #334155', borderRadius:'4px', padding:'1px 6px', fontFamily:'monospace' }}>
                STANDBY
              </span>
            )}
          </div>
          {deviceLabel && <div style={{ fontSize:'10px', color:'#64748b', fontFamily:'monospace', marginTop:'2px' }}>📷 {deviceLabel}</div>}
        </div>

        <div style={{ display:'flex', gap:'6px', alignItems:'center', flexWrap:'wrap' }}>
          {/* DEMO MODE */}
          <button
            onClick={() => { if (isActive) stopCamera(); setIsDemoMode(p => !p); }}
            style={{ padding:'4px 10px', borderRadius:'6px', border:'1px solid #7c3aed', background: isDemoMode ? '#7c3aed' : '#3b076699', color: isDemoMode ? '#fff' : '#c084fc', fontWeight:700, fontSize:'11px', cursor:'pointer', fontFamily:'monospace' }}
          >
            ✨ {isDemoMode ? 'STOP DEMO' : 'DEMO MODE'}
          </button>

          {/* START / STOP CAMERA */}
          {isActive ? (
            <button onClick={stopCamera} style={{ padding:'4px 10px', borderRadius:'6px', border:'1px solid #ef4444', background:'#450a0a', color:'#fca5a5', fontWeight:700, fontSize:'11px', cursor:'pointer', fontFamily:'monospace' }}>
              ⏹ STOP CAMERA
            </button>
          ) : (
            <button onClick={startCamera} disabled={isStarting} style={{ padding:'4px 12px', borderRadius:'6px', border:'none', background: isStarting ? '#374151' : 'linear-gradient(90deg,#059669,#0d9488)', color:'#fff', fontWeight:900, fontSize:'11px', cursor: isStarting ? 'not-allowed' : 'pointer', fontFamily:'monospace' }}>
              {isStarting ? '⏳ STARTING...' : '📷 START CAMERA'}
            </button>
          )}

          {/* DIAGNOSTICS */}
          <button
            onClick={() => setShowDiag(p => !p)}
            style={{ padding:'4px 8px', borderRadius:'6px', border:`1px solid ${showDiag ? '#f59e0b' : '#334155'}`, background: showDiag ? '#451a03' : '#1e293b', color: showDiag ? '#fcd34d' : '#94a3b8', fontWeight:700, fontSize:'11px', cursor:'pointer', fontFamily:'monospace' }}
          >
            🔍 LOGS
          </button>
        </div>
      </div>

      {/* ── ERROR BANNER ── */}
      {cameraError && (
        <div style={{ padding:'8px', borderRadius:'8px', background:'#450a0a', border:'1px solid #ef4444', color:'#fca5a5', fontSize:'11px', fontFamily:'monospace' }}>
          ⚠️ {cameraError}
          <div style={{ marginTop:'6px', display:'flex', gap:'6px' }}>
            <button onClick={startCamera} style={{ padding:'2px 8px', borderRadius:'4px', background:'#7f1d1d', color:'#fff', border:'none', cursor:'pointer', fontSize:'10px', fontFamily:'monospace', fontWeight:700 }}>🔄 RETRY</button>
            <button onClick={() => { setCameraError(null); setIsDemoMode(true); }} style={{ padding:'2px 8px', borderRadius:'4px', background:'#3b0764', color:'#c084fc', border:'none', cursor:'pointer', fontSize:'10px', fontFamily:'monospace', fontWeight:700 }}>✨ TRY DEMO INSTEAD</button>
          </div>
        </div>
      )}

      {/* ── DIAGNOSTICS PANEL ── */}
      {showDiag && (
        <div style={{ padding:'8px', borderRadius:'8px', background:'#000', border:'1px solid #f59e0b88', fontFamily:'monospace', fontSize:'10px', color:'#fcd34d' }}>
          <div style={{ display:'flex', justifyContent:'space-between', borderBottom:'1px solid #f59e0b44', paddingBottom:'4px', marginBottom:'4px' }}>
            <strong>🔍 CAMERA DIAGNOSTICS</strong>
            <div style={{ display:'flex', gap:'8px' }}>
              <button onClick={() => setDiagLogs([])} style={{ color:'#94a3b8', background:'none', border:'none', cursor:'pointer', fontSize:'10px' }}>Clear</button>
              <button onClick={() => setShowDiag(false)} style={{ color:'#fcd34d', background:'none', border:'none', cursor:'pointer', fontWeight:700 }}>✕</button>
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'4px', color:'#cbd5e1', marginBottom:'6px' }}>
            <span>HTTPS: <strong style={{ color: window.isSecureContext ? '#34d399' : '#f87171' }}>{window.isSecureContext ? 'YES ✓' : 'NO ✗'}</strong></span>
            <span>MediaDevices: <strong style={{ color: navigator.mediaDevices ? '#34d399' : '#f87171' }}>{navigator.mediaDevices ? 'OK ✓' : 'MISSING ✗'}</strong></span>
            <span>Camera State: <strong style={{ color:'#fff' }}>{isActive ? 'ACTIVE' : 'IDLE'}</strong></span>
            <span>Resolution: <strong style={{ color:'#fff' }}>{resolution || 'N/A'}</strong></span>
          </div>
          <div style={{ maxHeight:'80px', overflowY:'auto', background:'#0f172a', padding:'4px', borderRadius:'4px', color:'#94a3b8', fontSize:'9px' }}>
            {diagLogs.length === 0 ? 'No logs yet. Click START CAMERA.' : diagLogs.map((l,i) => <div key={i}>{l}</div>)}
          </div>
        </div>
      )}

      {/* ── VIDEO + CANVAS VIEWPORT ── */}
      <div style={{ position:'relative', width:'100%', aspectRatio:'16/9', maxHeight:'220px', borderRadius:'8px', overflow:'hidden', border:'2px solid #334155', background:'#000' }}>
        {/* Real video element — fills container behind canvas */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover', transform:'scaleX(-1)', opacity: isActive ? 1 : 0, transition:'opacity 0.2s' }}
        />

        {/* Skeleton overlay canvas */}
        <canvas
          ref={overlayRef}
          width={640}
          height={360}
          onClick={handleCanvasClick}
          style={{ position:'absolute', inset:0, width:'100%', height:'100%', cursor:'pointer', zIndex:10 }}
          title="Click a zone to play it"
        />

        {/* Paused overlay */}
        {isActive && isPaused && (
          <div style={{ position:'absolute', inset:0, zIndex:20, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.6)' }}>
            <button onClick={() => videoRef.current?.play()} style={{ padding:'6px 14px', borderRadius:'8px', background:'#059669', color:'#fff', fontWeight:700, fontSize:'12px', border:'none', cursor:'pointer' }}>▶ Resume Feed</button>
          </div>
        )}

        {/* Hand key guide */}
        <div style={{ position:'absolute', top:'6px', left:'50%', transform:'translateX(-50%)', background:'rgba(0,0,0,0.75)', border:'1px solid #334155', borderRadius:'9999px', padding:'2px 10px', display:'flex', gap:'8px', fontSize:'9px', fontFamily:'monospace', zIndex:15, whiteSpace:'nowrap' }}>
          <span style={{ color:'#67e8f9' }}>● CYAN = LEFT [D/F]</span>
          <span style={{ color:'#6b7280' }}>·</span>
          <span style={{ color:'#fb923c' }}>● ORANGE = RIGHT [J/K]</span>
        </div>
      </div>

      {/* ── 8-ZONE STATUS GRID ── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'4px', fontFamily:'monospace' }}>
        {ZONES.map(z => {
          const hand = getInstrumentHand(z.id, handedness, invertHands);
          const isRight = hand === 'RIGHT';
          const flash = flashes[z.id];
          const motion = motions[z.id] || 0;
          const hitCount = hits[z.id] || 0;
          return (
            <button
              key={z.id}
              onClick={() => fireStrike(z.id)}
              style={{
                display:'flex', flexDirection:'column', alignItems:'center', gap:'2px',
                padding:'4px', borderRadius:'6px', border:`1px solid ${flash ? '#fff' : isRight ? '#f9731688' : '#06b6d488'}`,
                background: flash ? '#fff' : isRight ? '#43140733' : '#08334433',
                color: flash ? '#000' : isRight ? '#fdba74' : '#67e8f9',
                cursor:'pointer', transition:'all 0.1s',
              }}
            >
              <span style={{ fontSize:'9px', fontWeight:700, textAlign:'center' }}>{z.label}</span>
              <div style={{ width:'100%', height:'3px', background:'#1e293b', borderRadius:'2px', overflow:'hidden' }}>
                <div style={{ width:`${motion}%`, height:'100%', background: isRight ? '#f97316' : '#22d3ee', transition:'width 70ms' }} />
              </div>
              <span style={{ fontSize:'8px', opacity:0.7 }}>{hitCount > 0 ? `${hitCount}×` : isRight ? 'RH' : 'LH'}</span>
            </button>
          );
        })}
      </div>

      {/* ── SENSITIVITY ── */}
      <div style={{ background:'#0f172a', border:'1px solid #1e293b', borderRadius:'8px', padding:'8px', display:'flex', flexDirection:'column', gap:'4px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', fontSize:'10px', fontFamily:'monospace', color:'#94a3b8' }}>
          <span>🎚 MOTION SENSITIVITY</span>
          <span style={{ color:'#22d3ee', fontWeight:700 }}>{sensitivity}%</span>
        </div>
        <input type="range" min={20} max={95} value={sensitivity} onChange={e => setSensitivity(+e.target.value)}
          style={{ width:'100%', accentColor:'#22d3ee', cursor:'pointer' }} />
        <div style={{ display:'flex', justifyContent:'space-between', fontSize:'9px', fontFamily:'monospace', color:'#475569' }}>
          <button onClick={() => setSensitivity(45)} style={{ background:'none', border:'none', color:'#475569', cursor:'pointer', fontSize:'9px' }}>Gentle (45%)</button>
          <button onClick={() => setSensitivity(65)} style={{ background:'none', border:'none', color:'#fbbf24', cursor:'pointer', fontSize:'9px', fontWeight:700 }}>Default (65%)</button>
          <button onClick={() => setSensitivity(85)} style={{ background:'none', border:'none', color:'#475569', cursor:'pointer', fontSize:'9px' }}>Ultra (85%)</button>
        </div>
      </div>
    </div>
  );
};

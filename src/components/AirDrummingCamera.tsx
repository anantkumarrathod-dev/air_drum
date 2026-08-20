import React, { useRef, useEffect, useState, useCallback } from 'react';
import { DrumInstrumentId, Hand, Handedness } from '../types/drum';
import { getInstrumentHand } from '../data/beatLibrary';

interface AirDrummingCameraProps {
  onAirStrike: (instrument: DrumInstrumentId, hand: Hand) => void;
  handedness?: Handedness;
  invertHands?: boolean;
}

const ZONES: Array<{
  id: DrumInstrumentId; label: string; sub: string; type: 'cymbal' | 'drum';
  x: string; y: string; w: string; h: string;
}> = [
  { id: 'crash',        label: 'CRASH',      sub: '16"',   type: 'cymbal', x:'2%',  y:'3%',  w:'22%', h:'28%' },
  { id: 'high_tom',     label: 'HI TOM',     sub: 'rack',  type: 'drum',   x:'26%', y:'3%',  w:'22%', h:'28%' },
  { id: 'mid_tom',      label: 'MID TOM',    sub: 'rack',  type: 'drum',   x:'52%', y:'3%',  w:'22%', h:'28%' },
  { id: 'ride',         label: 'RIDE',       sub: '20"',   type: 'cymbal', x:'76%', y:'3%',  w:'22%', h:'28%' },
  { id: 'hihat_closed', label: 'HI-HAT',     sub: '14"',   type: 'cymbal', x:'2%',  y:'35%', w:'22%', h:'29%' },
  { id: 'snare',        label: 'SNARE',      sub: '14"',   type: 'drum',   x:'26%', y:'35%', w:'22%', h:'29%' },
  { id: 'floor_tom',    label: 'FLOOR TOM',  sub: 'floor', type: 'drum',   x:'76%', y:'35%', w:'22%', h:'29%' },
  { id: 'bass',         label: 'BASS DRUM',  sub: '22"',   type: 'drum',   x:'33%', y:'67%', w:'34%', h:'30%' },
];

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
  const [flashes,     setFlashes]     = useState<Record<string, boolean>>({});
  const [motions,     setMotions]     = useState<Record<string, number>>({});
  const [hits,        setHits]        = useState<Record<string, number>>({});
  const [fps,         setFps]         = useState(0);
  const [resolution,  setResolution]  = useState('');
  const [deviceLabel, setDeviceLabel] = useState('');

  const videoRef    = useRef<HTMLVideoElement>(null);
  const procRef     = useRef<HTMLCanvasElement | null>(null);
  const streamRef   = useRef<MediaStream | null>(null);
  const prevFrame   = useRef<Uint8ClampedArray | null>(null);
  const lastHit     = useRef<Record<string, number>>({});
  const rafRef      = useRef<number>(0);
  const sensRef     = useRef(sensitivity);
  const activeRef   = useRef(false);
  sensRef.current   = sensitivity;
  activeRef.current = isActive;

  const log = (msg: string) => {
    const t = new Date().toLocaleTimeString();
    setDiagLogs(p => [`[${t}] ${msg}`, ...p.slice(0, 29)]);
  };

  // ── Strike ──────────────────────────────────────────────────────────────────
  const fireStrike = useCallback((id: DrumInstrumentId) => {
    const now = performance.now();
    if (now - (lastHit.current[id] || 0) < 180) return;
    lastHit.current[id] = now;
    setFlashes(p => ({ ...p, [id]: true }));
    setTimeout(() => setFlashes(p => ({ ...p, [id]: false })), 200);
    setHits(p => ({ ...p, [id]: (p[id] || 0) + 1 }));
    const hand = getInstrumentHand(id, handedness, invertHands);
    onAirStrike(id, hand);
  }, [onAirStrike, handedness, invertHands]);

  // ── Demo ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isDemoMode) return;
    const seq: DrumInstrumentId[] = ['hihat_closed','snare','hihat_closed','bass','crash','high_tom','mid_tom','floor_tom'];
    let i = 0;
    const t = setInterval(() => fireStrike(seq[i++ % seq.length]), 430);
    return () => clearInterval(t);
  }, [isDemoMode, fireStrike]);

  // ── Camera ──────────────────────────────────────────────────────────────────
  const startCamera = async () => {
    setCameraError(null); setIsStarting(true); setIsDemoMode(false);
    prevFrame.current = null;
    log('Requesting camera...');
    if (!navigator.mediaDevices?.getUserMedia) {
      const e = 'Camera API unavailable — needs HTTPS or localhost.';
      setCameraError(e); setIsStarting(false); return;
    }
    let stream: MediaStream | null = null;
    for (const c of [
      { video: { width:{ideal:640}, height:{ideal:480}, facingMode:'user' }, audio:false },
      { video: { facingMode:'user' }, audio:false },
      { video: true, audio:false },
    ] as MediaStreamConstraints[]) {
      try { stream = await navigator.mediaDevices.getUserMedia(c); if (stream) { log('Stream acquired'); break; } }
      catch(e) { log('Failed: ' + (e instanceof Error ? e.message : String(e))); }
    }
    if (!stream) {
      setCameraError('Camera blocked. Go to browser address bar → click the camera icon → Allow.');
      setIsStarting(false); return;
    }
    streamRef.current = stream;
    const track = stream.getVideoTracks()[0];
    if (track) { setDeviceLabel(track.label); log('Track: ' + track.label); }
    const v = videoRef.current!;
    v.srcObject = stream; v.muted = true; v.playsInline = true;
    v.onloadedmetadata = () => {
      v.play().catch(() => {});
      setResolution(`${v.videoWidth}×${v.videoHeight}`);
      log(`Video: ${v.videoWidth}×${v.videoHeight}`);
    };
    try { await v.play(); } catch(_) {}
    setIsActive(true); setIsStarting(false);
  };

  const stopCamera = () => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    prevFrame.current = null;
    setIsActive(false); setIsStarting(false); setIsDemoMode(false);
    setFps(0); setResolution(''); setMotions({});
    log('Camera stopped.');
  };

  useEffect(() => () => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach(t => t.stop());
  }, []);

  // ── Motion detection loop (runs only when camera active) ────────────────────
  useEffect(() => {
    if (!isActive) return;
    if (!procRef.current) {
      procRef.current = document.createElement('canvas');
      procRef.current.width = 160; procRef.current.height = 90;
    }
    const proc = procRef.current;
    let frames = 0, fpsTimer = performance.now();

    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);
      const v = videoRef.current;
      if (!v || v.readyState < 2 || v.videoWidth === 0) return;
      frames++;
      const now = performance.now();
      if (now - fpsTimer >= 1000) { setFps(frames); frames = 0; fpsTimer = now; }
      const pCtx = proc.getContext('2d', { willReadFrequently: true });
      if (!pCtx) return;
      pCtx.save(); pCtx.translate(160,0); pCtx.scale(-1,1);
      pCtx.drawImage(v, 0, 0, 160, 90); pCtx.restore();
      const frame = pCtx.getImageData(0,0,160,90).data;
      const prev  = prevFrame.current;
      if (prev && prev.length === frame.length) {
        const thr = 80 + (100 - sensRef.current) * 6;
        const nm: Record<string,number> = {};
        ZONES.forEach(z => {
          const x0 = Math.round(parseFloat(z.x)/100*160);
          const x1 = Math.round((parseFloat(z.x)+parseFloat(z.w))/100*160);
          const y0 = Math.round(parseFloat(z.y)/100*90);
          const y1 = Math.round((parseFloat(z.y)+parseFloat(z.h))/100*90);
          let s = 0;
          for (let py=y0; py<y1; py+=2)
            for (let px=x0; px<x1; px+=2) {
              const i=(py*160+px)*4;
              const d=Math.abs(frame[i]-prev[i])+Math.abs(frame[i+1]-prev[i+1])+Math.abs(frame[i+2]-prev[i+2]);
              if (d>20) s+=d;
            }
          nm[z.id] = Math.min(100, Math.round(s/thr*100));
          if (s >= thr) fireStrike(z.id as DrumInstrumentId);
        });
        setMotions(nm);
      }
      prevFrame.current = new Uint8ClampedArray(frame);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isActive, fireStrike]);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div
      onContextMenu={(e) => e.preventDefault()}
      style={{ fontFamily:'monospace', display:'flex', flexDirection:'column', gap:6,
        background:'#0a0f1e', border:'1px solid #1e293b', borderRadius:12, padding:10,
        height:'100%', boxSizing:'border-box' }}
    >

      {/* HEADER */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
        flexWrap:'wrap', gap:6, borderBottom:'1px solid #1e293b', paddingBottom:8 }}>
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <b style={{ fontSize:14, color:'#fff' }}>🥁 AIR DRUMMING — 8 ZONES</b>
            {isActive   && <span style={{ fontSize:10, padding:'1px 7px', borderRadius:99, background:'#022c22', border:'1px solid #10b981', color:'#6ee7b7' }}>● LIVE {resolution} · {fps}fps</span>}
            {isDemoMode && <span style={{ fontSize:10, padding:'1px 7px', borderRadius:99, background:'#3b0764', border:'1px solid #a855f7', color:'#c084fc' }}>✨ DEMO</span>}
            {!isActive && !isDemoMode && <span style={{ fontSize:10, padding:'1px 7px', borderRadius:99, background:'#1e293b', border:'1px solid #334155', color:'#64748b' }}>STANDBY</span>}
          </div>
          {deviceLabel && <div style={{ fontSize:10, color:'#475569', marginTop:2 }}>📷 {deviceLabel}</div>}
        </div>
        <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
          <button onClick={() => { if(isActive) stopCamera(); setIsDemoMode(p=>!p); }}
            style={{ padding:'5px 12px', borderRadius:6, border:'1px solid #7c3aed',
              background:isDemoMode?'#7c3aed':'transparent', color:isDemoMode?'#fff':'#c084fc',
              fontWeight:700, fontSize:11, cursor:'pointer' }}>
            ✨ {isDemoMode ? 'STOP DEMO' : 'DEMO MODE'}
          </button>
          {isActive
            ? <button onClick={stopCamera}
                style={{ padding:'5px 12px', borderRadius:6, border:'1px solid #ef4444',
                  background:'#450a0a', color:'#fca5a5', fontWeight:700, fontSize:11, cursor:'pointer' }}>
                ⏹ STOP CAMERA
              </button>
            : <button onClick={startCamera} disabled={isStarting}
                style={{ padding:'5px 14px', borderRadius:6, border:'none',
                  background:isStarting?'#374151':'linear-gradient(90deg,#059669,#0d9488)',
                  color:'#fff', fontWeight:900, fontSize:11, cursor:isStarting?'not-allowed':'pointer' }}>
                {isStarting ? '⏳ STARTING...' : '📷 START CAMERA'}
              </button>}
          <button onClick={() => {
              if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen().catch(() => {});
              } else {
                document.exitFullscreen().catch(() => {});
              }
            }}
            style={{ padding:'5px 10px', borderRadius:6, border:'1px solid #06b6d4',
              background:'rgba(6,182,212,0.15)', color:'#67e8f9', fontWeight:700, fontSize:11, cursor:'pointer' }}>
            ⛶ FULLSCREEN
          </button>
          <button onClick={() => setShowDiag(p=>!p)}
            style={{ padding:'5px 10px', borderRadius:6,
              border:`1px solid ${showDiag?'#f59e0b':'#334155'}`,
              background:showDiag?'#451a03':'transparent',
              color:showDiag?'#fcd34d':'#94a3b8', fontSize:11, cursor:'pointer' }}>
            🔍 LOGS
          </button>
        </div>
      </div>

      {/* ERROR */}
      {cameraError && (
        <div style={{ padding:10, borderRadius:8, background:'#450a0a', border:'1px solid #ef4444',
          color:'#fca5a5', fontSize:11 }}>
          ⚠️ {cameraError}
          <div style={{ marginTop:8, display:'flex', gap:8 }}>
            <button onClick={startCamera}
              style={{ padding:'3px 10px', borderRadius:4, background:'#7f1d1d', color:'#fff',
                border:'none', cursor:'pointer', fontSize:11, fontWeight:700 }}>🔄 Retry</button>
            <button onClick={() => { setCameraError(null); setIsDemoMode(true); }}
              style={{ padding:'3px 10px', borderRadius:4, background:'#3b0764', color:'#c084fc',
                border:'none', cursor:'pointer', fontSize:11, fontWeight:700 }}>✨ Try Demo</button>
          </div>
        </div>
      )}

      {/* DIAGNOSTICS */}
      {showDiag && (
        <div style={{ padding:8, background:'#000', border:'1px solid #f59e0b66',
          borderRadius:8, fontSize:10, color:'#fcd34d' }}>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
            <b>🔍 CAMERA DIAGNOSTICS</b>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={()=>setDiagLogs([])} style={{ background:'none',border:'none',color:'#94a3b8',cursor:'pointer',fontSize:10 }}>Clear</button>
              <button onClick={()=>setShowDiag(false)} style={{ background:'none',border:'none',color:'#fcd34d',cursor:'pointer',fontWeight:700 }}>✕</button>
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:4, fontSize:9, color:'#cbd5e1', marginBottom:6 }}>
            <span>HTTPS: <b style={{color:window.isSecureContext?'#34d399':'#f87171'}}>{window.isSecureContext?'YES ✓':'NO ✗'}</b></span>
            <span>Camera API: <b style={{color:navigator.mediaDevices?'#34d399':'#f87171'}}>{navigator.mediaDevices?'OK ✓':'MISSING ✗'}</b></span>
            <span>State: <b style={{color:'#fff'}}>{isActive?'ACTIVE':'IDLE'}</b></span>
            <span>Resolution: <b style={{color:'#fff'}}>{resolution||'N/A'}</b></span>
          </div>
          <div style={{ maxHeight:80, overflowY:'auto', background:'#0f172a', padding:4, borderRadius:4, color:'#94a3b8', fontSize:9 }}>
            {diagLogs.length===0 ? 'No logs yet.' : diagLogs.map((l,i)=><div key={i}>{l}</div>)}
          </div>
        </div>
      )}

      {/* ── VIEWPORT: pure HTML ── */}
      <div style={{ position:'relative', width:'100%', flex:1, minHeight:200,
        background:'#050810', border:'2px solid #1e293b',
        borderRadius:8, overflow:'hidden' }}>

        {/* Real video element — always visible, transform mirrors it */}
        <video ref={videoRef} autoPlay playsInline muted
          style={{ position:'absolute', inset:0, width:'100%', height:'100%',
            objectFit:'cover', transform:'scaleX(-1)',
            opacity: isActive ? 1 : 0, transition:'opacity 0.3s' }} />

        {/* Dark overlay tint when camera is off so zones pop */}
        {!isActive && (
          <div style={{ position:'absolute', inset:0, background:'#060b18' }} />
        )}

        {/* Grid lines (CSS only, no canvas) */}
        {!isActive && (
          <div style={{ position:'absolute', inset:0, 
            backgroundImage:'linear-gradient(rgba(255,255,255,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.04) 1px,transparent 1px)',
            backgroundSize:'40px 40px' }} />
        )}

        {/* 8 ZONE DIVS — always visible */}
        {ZONES.map(z => {
          const hand    = getInstrumentHand(z.id, handedness, invertHands);
          const isRight = hand === 'RIGHT';
          const col     = isRight ? '#FF6D00' : '#00E5FF';
          const flash   = flashes[z.id];
          const motion  = motions[z.id] || 0;
          return (
            <div
              key={z.id}
              onClick={() => fireStrike(z.id)}
              style={{
                position:'absolute',
                left:z.x, top:z.y, width:z.w, height:z.h,
                boxSizing:'border-box',
                border:`${flash?4:2}px solid ${flash?'#fff':col}`,
                background: flash ? col+'99' : isActive ? col+'28' : col+'18',
                cursor:'pointer',
                display:'flex', flexDirection:'column',
                alignItems:'flex-start', justifyContent:'flex-start',
                padding:'4px 6px',
                transition:'background 0.1s, border 0.1s',
                userSelect:'none',
              }}
            >
              {/* Corner bracket TL */}
              <div style={{ position:'absolute', top:0, left:0, width:10, height:10,
                borderTop:`3px solid ${flash?'#fff':col}`, borderLeft:`3px solid ${flash?'#fff':col}` }} />
              {/* Corner bracket TR */}
              <div style={{ position:'absolute', top:0, right:0, width:10, height:10,
                borderTop:`3px solid ${flash?'#fff':col}`, borderRight:`3px solid ${flash?'#fff':col}` }} />
              {/* Corner bracket BL */}
              <div style={{ position:'absolute', bottom:0, left:0, width:10, height:10,
                borderBottom:`3px solid ${flash?'#fff':col}`, borderLeft:`3px solid ${flash?'#fff':col}` }} />
              {/* Corner bracket BR */}
              <div style={{ position:'absolute', bottom:0, right:0, width:10, height:10,
                borderBottom:`3px solid ${flash?'#fff':col}`, borderRight:`3px solid ${flash?'#fff':col}` }} />

              {/* Labels */}
              <span style={{ fontSize:10, fontWeight:700, color: flash?'#fff':col, lineHeight:1.2, zIndex:1 }}>{z.label}</span>
              <span style={{ fontSize:8, color:'rgba(255,255,255,0.6)', zIndex:1 }}>{isRight?'RH':'LH'} · {z.sub}</span>

              {/* Motion bar */}
              {isActive && (
                <div style={{ position:'absolute', bottom:4, left:6, right:6, height:3,
                  background:'rgba(255,255,255,0.1)', borderRadius:2, overflow:'hidden' }}>
                  <div style={{ width:`${motion}%`, height:'100%', background:col,
                    transition:'width 80ms', borderRadius:2 }} />
                </div>
              )}

              {/* Hit count badge */}
              {(hits[z.id]||0) > 0 && (
                <div style={{ position:'absolute', top:3, right:4, background:col,
                  color:'#000', fontSize:8, fontWeight:700, padding:'1px 4px', borderRadius:3 }}>
                  {hits[z.id]}×
                </div>
              )}
            </div>
          );
        })}

        {/* Standby prompt */}
        {!isActive && !isDemoMode && (
          <div style={{ position:'absolute', bottom:10, left:'50%', transform:'translateX(-50%)',
            background:'rgba(0,0,0,0.75)', border:'1px solid #334155', borderRadius:6,
            padding:'4px 14px', color:'#64748b', fontSize:10, whiteSpace:'nowrap' }}>
            Click any zone · START CAMERA for motion · DEMO MODE to preview
          </div>
        )}

        {/* Legend */}
        <div style={{ position:'absolute', top:6, left:'50%', transform:'translateX(-50%)',
          background:'rgba(0,0,0,0.7)', border:'1px solid #1e293b', borderRadius:99,
          padding:'2px 12px', display:'flex', gap:8, fontSize:9, whiteSpace:'nowrap' }}>
          <span style={{ color:'#67e8f9' }}>● CYAN = LEFT HAND</span>
          <span style={{ color:'#475569' }}>|</span>
          <span style={{ color:'#fb923c' }}>● ORANGE = RIGHT HAND</span>
        </div>
      </div>

      {/* 8-ZONE BUTTON ROW */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:4 }}>
        {ZONES.map(z => {
          const hand    = getInstrumentHand(z.id, handedness, invertHands);
          const isRight = hand === 'RIGHT';
          const col     = isRight ? '#FF6D00' : '#00E5FF';
          const flash   = flashes[z.id];
          return (
            <button key={z.id} onClick={() => fireStrike(z.id)}
              style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:2,
                padding:'5px 2px', borderRadius:6, cursor:'pointer',
                border:`1px solid ${flash?col+'ff':col+'55'}`,
                background:flash?col+'33':'transparent',
                color:col, fontFamily:'monospace', fontSize:9 }}>
              <b>{z.label}</b>
              <span style={{ opacity:0.6 }}>{isRight?'RH':'LH'}</span>
            </button>
          );
        })}
      </div>

      {/* SENSITIVITY */}
      <div style={{ background:'#0f172a', border:'1px solid #1e293b', borderRadius:8, padding:8 }}>
        <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:'#94a3b8', marginBottom:4 }}>
          <span>🎚 MOTION SENSITIVITY</span>
          <b style={{ color:'#22d3ee' }}>{sensitivity}%</b>
        </div>
        <input type="range" min={20} max={90} value={sensitivity}
          onChange={e => { setSensitivity(+e.target.value); sensRef.current = +e.target.value; }}
          style={{ width:'100%', accentColor:'#22d3ee', cursor:'pointer' }} />
        <div style={{ display:'flex', justifyContent:'space-between', fontSize:9, color:'#475569', marginTop:4 }}>
          <button onClick={()=>setSensitivity(40)} style={{ background:'none',border:'none',color:'#475569',cursor:'pointer',fontSize:9 }}>Low (40%)</button>
          <button onClick={()=>setSensitivity(60)} style={{ background:'none',border:'none',color:'#fbbf24',cursor:'pointer',fontSize:9,fontWeight:700 }}>Default (60%)</button>
          <button onClick={()=>setSensitivity(80)} style={{ background:'none',border:'none',color:'#475569',cursor:'pointer',fontSize:9 }}>High (80%)</button>
        </div>
      </div>
    </div>
  );
};

import React from 'react';
import { FLOORS } from '../types';
import type { Choice, Player, SessionState } from '../types';

function badge(text: string) {
  return <span style={{ padding: '6px 10px', border: '1px solid #233253', borderRadius: 10, background: '#0b1424', color: '#c8d4f5', fontWeight: 700 }}>{text}</span>;
}
function btn(color: string, disabled = false) {
  return {
    background: disabled ? '#1b2438' : color,
    border: '1px solid rgba(255,255,255,.08)',
    color: '#0b1220',
    padding: '10px 14px',
    borderRadius: 12,
    fontWeight: 800,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? .6 : 1,
  } as React.CSSProperties;
}

export function RightPanel({
  me, setMe, session, players, canJoin, onStart, onPause, onReset, onFinish, current,
}:{
  me: { address:string|null; nick:string; deposit:number; choice:Choice; floor:number|null };
  setMe: (up:any)=>void;
  session: SessionState;
  setSession: (up:any)=>void;
  players: Player[];
  setPlayers: (up:any)=>void;
  canJoin: boolean;
  onStart: ()=>void;
  onPause: ()=>void;
  onReset: ()=>void;
  onFinish: ()=>void;
  current: number;
}) {
  const canStart = session.status==='WAITING' && players.length===FLOORS && me.floor!==null;
  const inGame = session.status==='RUNNING';

  return (
    <div style={{ padding:'22px 20px', display:'grid', gap:14 }}>
      <div style={{ fontSize:22, fontWeight:900 }}>The Platform</div>

      {/* nick */}
      <div>
        <div style={{ fontSize:12, fontWeight:700, color:'#7c8db5', textTransform:'uppercase' }}>Nickname</div>
        <input value={me.nick} onChange={e=>setMe((m:any)=>({...m, nick:e.target.value}))}
          placeholder="e.g. GreedyCat" style={inp()} />
      </div>

      {/* deposit */}
      <div>
        <div style={{ fontSize:12, fontWeight:700, color:'#7c8db5', textTransform:'uppercase' }}>Deposit (KEY)</div>
        <input type="number" value={me.deposit} onChange={e=>setMe((m:any)=>({...m, deposit: Number(e.target.value||0)}))}
          style={inp()} />
      </div>

      {/* choice */}
      <div>
        <div style={{ fontSize:12, fontWeight:700, color:'#7c8db5', textTransform:'uppercase' }}>Your choice</div>
        <div style={{ display:'flex', gap:10 }}>
          {(['GRAB','SKIM','HOLD'] as Choice[]).map(c=>(
            <button key={c} onClick={()=>setMe((m:any)=>({...m, choice:c}))}
              style={{ ...btn(c==='GRAB'?'#fb7185':c==='SKIM'?'#22c55e':'#60a5fa'), outline: me.choice===c?'3px solid rgba(255,255,255,.18)':'none' }}>{c}</button>
          ))}
        </div>
      </div>

      {/* join */}
      <button id="btn-join" disabled={!canJoin} style={{ ...btn('#223250', !canJoin), color:'#a9b8e6', textAlign:'left' }}>
        Join session
      </button>

      {/* status + your floor */}
      <div style={{ padding:'12px', border:'1px dashed #233253', borderRadius:12 }}>
        <div style={{ marginBottom:8 }}>{badge(`Status: ${session.status}`)}</div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          {badge(`Pool: ${session.pool.toFixed(2)}`)}
          {badge(`Treasury: ${session.treasury.toFixed(2)}`)}
          {badge(`NextPool: ${session.nextPool.toFixed(2)}`)}
        </div>
        <div style={{ marginTop:8, display:'flex', gap:8, flexWrap:'wrap' }}>
          {badge(`Floor ${current}/${FLOORS}`)}
          {badge(`Your floor: ${me.floor ? '#'+me.floor : '—'}`)}
        </div>
      </div>

      {/* controls */}
      <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
        <button onClick={onStart} style={btn('#22c55e', !canStart)}>Start</button>
        <button onClick={onPause} style={btn('#fbbf24', !inGame)}>Pause</button>
        <button onClick={onFinish} style={btn('#5ea4ff', session.status!=='RUNNING' && session.status!=='WAITING')}>Finish (show results)</button>
        <button onClick={onReset} style={btn('#94a3b8')}>Reset</button>
      </div>
    </div>
  );
}

function inp(): React.CSSProperties {
  return {
    width:'100%', padding:'12px 12px', borderRadius:14, border:'1px solid #233253',
    background:'#0b1220', color:'#e5ecff', fontWeight:800, outline:'none',
  };
}

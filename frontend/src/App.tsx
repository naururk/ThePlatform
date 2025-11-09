import React, { useEffect, useRef, useState } from 'react';
import { STOP_SECONDS, FLOORS } from './types';
import type { Choice, Player, SessionState } from './types';
import { TowerCanvas } from './components/Tower';
import { RightPanel } from './components/RightPanel';
import { ResultsView } from './components/ResultsView';
import { clamp, mulberry32, shuffle, strSeed, pseudoAddr, randomNick } from './engine/rng';
import { resolveAtFloor, finalizeSession } from './engine/sim';

type Fx = { id: string; floor: number; kind: 'grab' | 'skim'; t0: number };

export default function App() {
  const [me, setMe] = useState<{ address: string | null; nick: string; deposit: number; choice: Choice; floor: number | null }>({
    address: null, nick: '', deposit: 100, choice: 'NONE', floor: null,
  });

  const [session, setSession] = useState<SessionState>({
    id: String(Date.now()), status: 'WAITING',
    pool: 0, treasury: 0, nextPool: 0,
    successWindowGrab: 17, successWindowSkim: 40,
    holdStreak: Number(localStorage.getItem('holdStreak') || '0') || 0,
    claimed: false,
  });

  const [players, setPlayers] = useState<Player[]>([]);
  const playersRef = useRef<Player[]>([]);
  useEffect(() => { playersRef.current = players; }, [players]);

  // motion
  const [current, setCurrent] = useState(1);
  const [stopped, setStopped] = useState(false);
  const [towerY, setTowerY] = useState(0);
  const [mode, setMode] = useState<'auto' | 'free'>('auto');
  const [running, setRunning] = useState(false);
  const [scrollY, setScrollY] = useState(0);

  // мгновенное переключение на результаты (без изменения status до конца расчётов)
  const [forceDone, setForceDone] = useState(false);

  // per-floor render
  const [choices, setChoices] = useState<Record<number, Choice>>(() => { const o: Record<number, Choice> = {}; for (let i = 1; i <= FLOORS; i++) o[i] = 'NONE'; return o; });
  const [labels, setLabels] = useState<Record<number, { nick: string; addr: string; revealed: boolean }>>({});
  const [results, setResults] = useState<Record<number, { text: string; color: string; payout?: number } | undefined>>({});
  const [fx, setFx] = useState<Fx[]>([]); // эффекты

  const canJoin = me.nick.trim().length >= 2 && me.deposit > 0 && me.choice !== 'NONE' && session.status === 'WAITING' && me.floor === null;

  function floorY(i: number) { const idx = i - 1; return idx * (1.1 + 0.35); }

  // ===== Register
  useEffect(() => {
    const btn = document.getElementById('btn-join');
    if (!btn) return;
    btn.onclick = () => {
      if (!canJoin) return;

      const seed = strSeed((me.address || 'you') + '|' + session.id);
      const rnd = mulberry32(seed);
      const floors = shuffle(Array.from({ length: FLOORS }, (_, i) => i + 1), rnd);
      const myFloor = floors[0];

      const avg = me.deposit > 0 ? me.deposit : 100;
      const bots: Player[] = Array.from({ length: FLOORS - 1 }, (_, k) => {
        const dep = Math.max(5, Math.round((avg * (0.5 + rnd())) * 100) / 100);
        const r = rnd();
        const base: Choice = r < 0.25 ? 'GRAB' : r < 0.8 ? 'SKIM' : 'HOLD';
        return { id: 'bot#' + (k + 1), nick: randomNick(rnd), addr: pseudoAddr(rnd), isBot: true, floor: floors[k + 1], deposit: dep, baseChoice: base, finalChoice: 'NONE', revealed: false };
      });

      const you: Player = { id: me.address || 'you', nick: me.nick, addr: me.address || pseudoAddr(rnd), isBot: false, floor: myFloor, deposit: me.deposit, baseChoice: me.choice, finalChoice: 'NONE', revealed: false };
      const all = [you, ...bots].sort((a, b) => a.floor - b.floor);
      setPlayers(all);

      const total = all.reduce((s, p) => s + p.deposit, 0);
      setSession((s) => ({ ...s, pool: total, successWindowGrab: 17 + s.holdStreak, successWindowSkim: 40 + s.holdStreak }));
      setMe((m) => ({ ...m, floor: myFloor }));

      // visuals reset + подсветка своего этажа
      const initChoices: Record<number, Choice> = {};
      const initLabels: any = {};
      const initResults: any = {};
      for (let i = 1; i <= FLOORS; i++) { initChoices[i] = 'NONE'; initLabels[i] = { nick: '', addr: '', revealed: false }; initResults[i] = undefined; }
      initLabels[myFloor] = { nick: you.nick + ' (you)', addr: you.addr, revealed: true };

      setChoices(initChoices); setLabels(initLabels); setResults(initResults);
      setFx([]);
      setForceDone(false);
    };
  }, [canJoin, me, session.id]);

  // ===== Motion controller
  const targetYRef = useRef(0);
  const yRef = useRef(0);
  const stopEndRef = useRef<number | null>(null);
  useEffect(() => { targetYRef.current = -floorY(current); }, []);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const now = performance.now() / 1000;
      if (mode === 'free') {
        yRef.current = clamp(scrollY, -floorY(FLOORS), 0);
        setTowerY(yRef.current);
      } else {
        if (stopEndRef.current && now < stopEndRef.current) {
          setStopped(true); setTowerY(yRef.current); raf = requestAnimationFrame(loop); return;
        }
        if (stopEndRef.current && now >= stopEndRef.current && running) {
          setStopped(false); stopEndRef.current = null;
          if (current < FLOORS) { const next = current + 1; setCurrent(next); targetYRef.current = -floorY(next); }
        }
        if (running) {
          yRef.current += (targetYRef.current - yRef.current) * 0.1;
          if (!stopEndRef.current && Math.abs(yRef.current - targetYRef.current) < 0.002) {
            stopEndRef.current = now + STOP_SECONDS; setStopped(true); revealCurrent();
          }
          setTowerY(yRef.current);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [mode, running, current, scrollY]);

  // ===== Finish instantly (used by button and by last floor auto-finish)
  function finishNow() {
    // моментально выключаем анимацию и переключаем UI
    setRunning(false);
    setStopped(false);
    setMode('auto');
    setForceDone(true);

    // локальные копии
    let S: SessionState = { ...session, status: 'RUNNING' };
    let P: Player[] = playersRef.current.map(p => ({ ...p }));
    const order = [...P].sort((a, b) => a.floor - b.floor);

    const localSetSession = (updater: (s: SessionState) => SessionState) => { S = updater(S); };
    const patchPlayer = (idx: number, patch: Partial<Player>) => { P[idx] = { ...P[idx], ...patch }; };

    const allChoices: Record<number, Choice> = {};
    const allLabels: Record<number, { nick: string; addr: string; revealed: boolean }> = {};
    const allResults: Record<number, { text: string; color: string; payout?: number } | undefined> = {};

    for (const p of order) {
      const i = P.findIndex(x => x.id === p.id);
      allChoices[p.floor] = p.baseChoice;
      allLabels[p.floor] = { nick: p.nick, addr: p.addr, revealed: true };

      if (P[i].finalChoice === 'NONE') {
        resolveAtFloor(p.floor, P, S, localSetSession, patchPlayer, () => {});
      }

      const after = P[i];
      if (after.finalChoice === 'HOLD') {
        allResults[p.floor] = { text: 'HOLD', color: '#60a5fa' };
      } else if (after.success) {
        allResults[p.floor] = { text: `+${(after.payout || 0).toFixed(2)} KEY`, color: after.finalChoice === 'GRAB' ? '#fb7185' : '#22c55e', payout: after.payout || 0 };
      } else {
        allResults[p.floor] = undefined;
      }
    }

    finalizeSession(
      P,
      S,
      (up: any) => { S = typeof up === 'function' ? up(S) : up; },
      (idx, patch) => { P[idx] = { ...P[idx], ...patch }; }
    );

    setPlayers(P);
    setChoices(allChoices);
    setLabels(allLabels);
    setResults(allResults);
    setSession({ ...S, status: 'DONE' });
  }

  // ===== Reveal & resolve per floor
  const revealCurrent = () => {
    const idx = playersRef.current.findIndex((p) => p.floor === current);
    if (idx < 0) return;
    const p = playersRef.current[idx];

    setLabels((ls) => ({ ...ls, [p.floor]: { nick: p.nick, addr: p.addr, revealed: true } }));
    setChoices((cs) => ({ ...cs, [p.floor]: p.baseChoice }));

    if (p.baseChoice === 'GRAB' || p.baseChoice === 'SKIM') {
      const id = `${p.floor}-${Date.now()}`;
      setFx((list) => [...list, { id, floor: p.floor, kind: p.baseChoice === 'GRAB' ? 'grab' : 'skim', t0: performance.now() / 1000 }]);
      setTimeout(() => setFx((list) => list.filter((e) => e.id !== id)), 2200);
    }

    resolveAtFloor(
      current,
      playersRef.current,
      session,
      setSession,
      (i, patch) => { setPlayers((ps) => { const cp = [...ps]; cp[i] = { ...cp[i], ...patch }; return cp; }); },
      () => {}
    );

    setTimeout(() => {
      const who = playersRef.current.find((x) => x.floor === current) || p;
      if (who.finalChoice === 'HOLD') {
        setResults((r) => ({ ...r, [p.floor]: { text: 'HOLD', color: '#60a5fa' } }));
      } else if (who.success) {
        const color = who.finalChoice === 'GRAB' ? '#fb7185' : '#22c55e';
        setResults((r) => ({ ...r, [p.floor]: { text: `+${(who.payout || 0).toFixed(2)} KEY`, color, payout: who.payout || 0 } }));
      } else {
        setResults((r) => ({ ...r, [p.floor]: undefined }));
      }

      // если это последний этаж — сразу завершаем всю сессию мгновенно
      if (current === FLOORS) {
        finishNow();
      }
    }, 60);
  };

  // ===== Controls
  function start() {
    if (players.length !== FLOORS || session.status !== 'WAITING') return;
    setRunning(true); setMode('auto'); setCurrent(1); setStopped(false);
    setSession((s) => ({ ...s, status: 'RUNNING' }));
    setForceDone(false);
  }
  function pause() { setRunning(false); }
  function reset() {
    setRunning(false); setMode('auto'); setStopped(false);
    setCurrent(1); setScrollY(0); setTowerY(0); setPlayers([]);
    setSession((s) => ({
      id: String(Date.now()), status: 'WAITING', pool: 0, treasury: 0, nextPool: 0,
      successWindowGrab: 17, successWindowSkim: 40, holdStreak: s.holdStreak, claimed: false
    }));
    setChoices(() => { const o: any = {}; for (let i = 1; i <= FLOORS; i++) o[i] = 'NONE'; return o; });
    setLabels({}); setResults({}); setFx([]);
    setMe((m) => ({ ...m, floor: null, choice: 'NONE' }));
    setForceDone(false);
  }
  function claim() { setSession((s) => ({ ...s, claimed: true })); }

  const human = players.find((p) => !p.isBot) || null;

  // блокируем прокрутку при RUNNING
  const onWheel: React.WheelEventHandler<HTMLDivElement> = (e) => {
    if (running) { e.preventDefault(); return; }
    setMode('free'); setScrollY((y) => clamp(y - e.deltaY * 0.01, -((1.1 + 0.35) * (FLOORS - 1)), 0));
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (running) return;
      if (e.key === 'ArrowUp') { setMode('free'); setScrollY((y) => clamp(y + 0.5, -((1.1 + 0.35) * (FLOORS - 1)), 0)); }
      if (e.key === 'ArrowDown') { setMode('free'); setScrollY((y) => clamp(y - 0.5, -((1.1 + 0.35) * (FLOORS - 1)), 0)); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [running]);

  return (
    <div style={{ height: '100vh', width: '100vw', background: '#060a16', color: '#e5ecff', display: 'grid', gridTemplateColumns: 'minmax(340px,32vw) 1fr' }}>
      {/* Left: tower / results */}
      <div onWheel={onWheel} style={{ width: '100%', borderRight: '1px solid #142036', overflow: 'hidden' }}>
        {(forceDone || session.status === 'DONE')
          ? <ResultsView me={human} players={players} onClaim={claim} claimed={session.claimed} />
          : <TowerCanvas current={current} stopped={stopped} towerY={towerY} choices={choices} labels={labels} results={results} effects={fx} />
        }
      </div>

      {/* Right: control */}
      <div style={{ width: '100%', overflow: 'auto' }}>
        <RightPanel
          me={{ address: null, nick: me.nick, deposit: me.deposit, choice: me.choice, floor: me.floor }}
          setMe={setMe as any}
          session={session}
          setSession={setSession}
          players={players}
          setPlayers={setPlayers}
          canJoin={canJoin}
          onStart={start}
          onPause={pause}
          onReset={reset}
          onFinish={finishNow}
          current={current}
        />
      </div>
    </div>
  );
}

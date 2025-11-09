import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrthographicCamera, Text } from '@react-three/drei';
import type { Choice } from '../types';
import { FLOORS } from '../types';

/* --- constants / helpers --- */
const CELL_H = 1.1; const CELL_W = 1.6; const GAP_Y = 0.35;
const COLORS = {
  skyTop: '#0b1224', skyBot: '#070b16',
  wall: '#0e1626', glass: '#0f2038', frame: '#19253b', frameEdge: '#5ea4ff',
  grab: '#fb7185', skim: '#22c55e', hold: '#60a5fa', text:'#cbd5e1'
};
const floorY = (i: number) => (i - 1) * (CELL_H + GAP_Y);
const TOWER_H = floorY(FLOORS) + CELL_H;

const hexToRgb = (h: string) => {
  const r = parseInt(h.slice(1, 3), 16) / 255, g = parseInt(h.slice(3, 5), 16) / 255, b = parseInt(h.slice(5, 7), 16) / 255;
  return `${r.toFixed(3)}, ${g.toFixed(3)}, ${b.toFixed(3)}`;
};
const hexA = (h: string, a: number) => {
  const r = parseInt(h.slice(1, 3), 16), g = parseInt(h.slice(3, 5), 16), b = parseInt(h.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
};

type Fx = { id: string; floor: number; kind: 'grab' | 'skim'; t0: number };

export function TowerCanvas({
  current, stopped, towerY, choices, labels, results, effects,
}: {
  current: number;
  stopped: boolean;
  towerY: number;
  choices: Record<number, Choice>;
  labels: Record<number, { nick: string; addr: string; revealed: boolean }>;
  results: Record<number, { text: string; color: string; payout?: number } | undefined>;
  effects?: Fx[];
}) {
  return (
    <div style={{ height: '100vh', width: '100%', background: '#060a16' }}>
      <Canvas dpr={[1, 2]} shadows>
        <OrthographicCamera makeDefault position={[0, 0, 8]} zoom={90} />
        <ambientLight intensity={0.7} />
        <directionalLight position={[2, 3, 5]} intensity={0.8} color={'#bcd7ff'} />

        {/* gradient sky */}
        <mesh position={[0, 0, -5]}>
          <planeGeometry args={[8, 30]} />
          <shaderMaterial
            vertexShader={`varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`}
            fragmentShader={`varying vec2 vUv; void main(){ vec3 top=vec3(${hexToRgb(COLORS.skyTop)}); vec3 bot=vec3(${hexToRgb(COLORS.skyBot)}); vec3 col=mix(bot,top,smoothstep(0.0,1.0,vUv.y)); gl_FragColor=vec4(col,1.0); }`}
          />
        </mesh>

        {/* tower + effects */}
        <group position={[0, towerY, 0]}>
          <Tower choices={choices} labels={labels} results={results} current={current} />
          <EffectsGroup effects={effects || []} />
        </group>

        {/* fixed frame */}
        <group position={[0, 0, 0.25]}>
          <PlatformFrame stopped={stopped} />
        </group>
      </Canvas>
    </div>
  );
}

/* --- window choice --- */
function WindowBadge({ choice, highlight }: { choice: Choice; highlight: boolean }) {
  const panelW = CELL_W * 0.9;
  const panelH = Math.min(CELL_H * 0.45, 0.48);
  const color = choice === 'GRAB' ? COLORS.grab : choice === 'SKIM' ? COLORS.skim : choice === 'HOLD' ? COLORS.hold : '#475569';
  const label = choice === 'NONE' ? '—' : choice;
  return (
    <group position={[0, 0, 0.06]}>
      <mesh position={[0, 0, -0.001]}>
        <planeGeometry args={[panelW, panelH]} />
        <meshBasicMaterial color={highlight ? '#133623' : '#0b1424'} transparent opacity={highlight ? 0.35 : 0.22} />
      </mesh>
      <mesh>
        <planeGeometry args={[panelW - 0.04, panelH - 0.04]} />
        <meshBasicMaterial color={hexA(color, choice === 'NONE' ? 0.18 : 0.32)} transparent opacity={1} />
      </mesh>
      <Text position={[0, 0, 0.02]} fontSize={panelH * 0.42} color={choice === 'NONE' ? '#9fb4d6' : '#0b1220'} anchorX="center" anchorY="middle">
        {label}
      </Text>
    </group>
  );
}

/* --- payout pill (теперь ПОД ником) --- */
function PayoutPill({ amount }: { amount: number }) {
  const w = CELL_W * 0.6, h = 0.26;
  const txt = `+${amount.toFixed(2)} KEY`;
  return (
    <group position={[0, -CELL_H * 0.86, 0.1]}>
      <mesh>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial color={'#1a3a2a'} transparent opacity={0.65} />
      </mesh>
      <mesh position={[0, 0, 0.02]}>
        <planeGeometry args={[w - 0.04, h - 0.06]} />
        <meshBasicMaterial color={'#1f5138'} />
      </mesh>
      <Text position={[0, 0, 0.04]} fontSize={0.16} color={'#b7f3d2'} anchorX="center" anchorY="middle">{txt}</Text>
    </group>
  );
}

/* --- tower --- */
function Tower({
  choices, labels, results, current,
}: {
  choices: Record<number, Choice>;
  labels: Record<number, { nick: string; addr: string; revealed: boolean }>;
  results: Record<number, { text: string; color: string; payout?: number } | undefined>;
  current: number;
}) {
  return (
    <group>
      {/* back wall */}
      <mesh position={[0, (TOWER_H / 2 - CELL_H / 2), -0.3]}>
        <planeGeometry args={[CELL_W * 1.6, TOWER_H + 3]} />
        <meshStandardMaterial color={COLORS.wall} roughness={0.9} />
      </mesh>

      {Array.from({ length: FLOORS }, (_, k) => {
        const i = k + 1; const yy = floorY(i); const highlight = i === current;
        const res = results[i]; const lbl = labels[i];
        return (
          <group key={i} position={[0, yy, 0]}>
            <mesh>
              <boxGeometry args={[CELL_W, CELL_H, 0.05]} />
              <meshStandardMaterial color={COLORS.glass} roughness={0.6} metalness={0.08} />
            </mesh>

            <WindowBadge choice={choices[i] ?? 'NONE'} highlight={highlight} />

            {/* floor number */}
            <Text position={[CELL_W / 2 + 0.35, 0, 0.06]} fontSize={0.28} color="#9fb4d6" anchorX="left" anchorY="middle">{String(i)}</Text>

            {/* nickname (ниже окна) */}
            {lbl?.revealed ? (
              <group position={[0, -CELL_H * 0.58, 0.07]}>
                <Text fontSize={0.22} color="#a3b6d9" anchorX="center" anchorY="middle">
                  {lbl.nick} · {lbl.addr.slice(0, 6)}…{lbl.addr.slice(-4)}
                </Text>
              </group>
            ) : null}

            {/* payout под ником */}
            {res?.payout && res.payout > 0 ? <PayoutPill amount={res.payout} /> : null}
          </group>
        );
      })}
    </group>
  );
}

/* ====== FX (вернули из твоей версии) ====== */
function Sparks({ life = 1.0 }: { life?: number }) {
  const meshRef = useRef<THREE.InstancedMesh>(null!);
  const count = 28;
  const velocities = useMemo(() => Array.from({ length: count }, () => ({
    vx: (Math.random() - 0.5) * 2.2, vy: -Math.random() * 2.5 - 0.6,
  })), [count]);
  const matrices = useMemo(() => Array.from({ length: count }, () => new THREE.Matrix4()), [count]);
  const positions = useMemo(() => Array.from({ length: count }, () => new THREE.Vector3(0, 0, 0)), [count]);
  const t0 = useRef(performance.now() / 1000);

  useFrame((_, dt) => {
    const t = performance.now() / 1000 - t0.current;
    if (!meshRef.current) return;
    for (let i = 0; i < count; i++) {
      const p = positions[i]; const v = velocities[i];
      p.x += v.vx * dt * 2.5; p.y += v.vy * dt * 2.5;
      matrices[i].makeTranslation(p.x, p.y, 0);
      meshRef.current.setMatrixAt(i, matrices[i]);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
    if (t > life) { /* removal by parent */ }
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined as any, undefined as any, count]}>
      <sphereGeometry args={[0.035, 8, 8]} />
      <meshBasicMaterial color={COLORS.grab} />
    </instancedMesh>
  );
}

function JumpEffect({ kind }: { kind: 'grab' | 'skim' }) {
  const group = useRef<THREE.Group>(null!);
  const t0 = useRef(performance.now() / 1000);

  useFrame(() => {
    const t = performance.now() / 1000 - t0.current;
    const g = kind === 'grab' ? 3.2 : 1.1;
    const vx = kind === 'skim' ? 0.35 : 0.0;
    const x = 0 + vx * t;
    const y = 0 - 0.2 * t - 0.5 * g * t * t;
    group.current.position.set(x, y, 0.05);
  });

  return (
    <group ref={group}>
      <mesh>
        <sphereGeometry args={[0.08, 16, 16]} />
        <meshStandardMaterial
          color={kind === 'grab' ? COLORS.grab : COLORS.skim}
          emissive={kind === 'grab' ? COLORS.grab : COLORS.skim}
          emissiveIntensity={0.25}
        />
      </mesh>
      {kind === 'skim' ? (
        <mesh position={[0, 0.18, 0]}>
          <planeGeometry args={[0.36, 0.16]} />
          <meshStandardMaterial color={COLORS.skim} transparent opacity={0.35} />
        </mesh>
      ) : null}
      {kind === 'grab' ? <Sparks life={1.2} /> : null}
    </group>
  );
}

function EffectsGroup({ effects }: { effects: Fx[] }) {
  return (
    <group>
      {effects.map((e) => (
        <group key={e.id} position={[0, floorY(e.floor), 0]}>
          <EffectLife t0={e.t0} life={2.2}>
            <JumpEffect kind={e.kind} />
          </EffectLife>
        </group>
      ))}
    </group>
  );
}

function EffectLife({ t0, life, children }: { t0: number; life: number; children: React.ReactNode }) {
  const visible = useRef(true);
  const grp = useRef<THREE.Group>(null);
  useFrame(() => {
    const t = performance.now() / 1000 - t0;
    if (grp.current) grp.current.visible = t < life;
  });
  return <group ref={grp as any}>{children}</group>;
}

/* --- frame --- */
function PlatformFrame({ stopped }: { stopped: boolean }) {
  const w = CELL_W * 1.15, h = CELL_H * 1.15;
  return (
    <group>
      <mesh>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial color={COLORS.frame} transparent opacity={0.45} />
      </mesh>
      <mesh position={[0, 0, 0.05]}>
        <planeGeometry args={[w - 0.08, h - 0.08]} />
        <meshBasicMaterial color={stopped ? COLORS.skim : COLORS.frameEdge} transparent opacity={stopped ? 0.4 : 0.2} />
      </mesh>
    </group>
  );
}

import React from 'react';
import type { Player } from '../types';

type Props = {
  me: Player | null;
  players: Player[];
  onClaim: () => void;
  claimed: boolean;
};

const pill: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 10px',
  borderRadius: 999,
  border: '1px solid #1a2540',
  background: '#0b1426',
  color: '#cfe0ff',
  fontWeight: 800,
  fontSize: 13,
};

export function ResultsView({ me, players, onClaim, claimed }: Props) {
  const myPayout = (me?.payout ?? 0);
  const youDelta = myPayout - (me?.deposit ?? 0);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* header */}
      <div style={{ padding: 16, paddingBottom: 8 }}>
        <h2 style={{ margin: 0, color: '#e6eeff' }}>Session results</h2>
        <div style={{ marginTop: 10, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <div style={pill}>
            You: <span style={{ color: youDelta >= 0 ? '#22c55e' : '#ef4444' }}>
              {(youDelta >= 0 ? '+' : '') + youDelta.toFixed(2)} KEY
            </span>
          </div>
          <button
            onClick={onClaim}
            disabled={claimed || youDelta <= 0}
            style={{
              ...pill,
              background: claimed ? '#0f1a33' : 'linear-gradient(180deg,#12b886,#0ea372)',
              borderColor: '#0ea372',
              color: '#0b1220',
              cursor: claimed || youDelta <= 0 ? 'not-allowed' : 'pointer'
            }}
          >
            {claimed ? 'Claimed ✓' : 'Claim'}
          </button>
        </div>
      </div>

      {/* scrollable table */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 16px 16px 16px' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '80px 1fr 110px 120px 1fr',
            gap: 8,
            padding: '10px 12px',
            border: '1px dashed #132043',
            borderRadius: 12,
            color: '#a9bad6',
            fontWeight: 700
          }}
        >
          <div>Floor</div>
          <div>Nick</div>
          <div>Choice</div>
          <div>Payout</div>
          <div>Addr</div>
        </div>

        {players
          .slice()
          .sort((a, b) => a.floor - b.floor)
          .map((p) => {
            const color =
              p.finalChoice === 'HOLD'
                ? '#60a5fa'
                : p.success
                ? p.finalChoice === 'GRAB'
                  ? '#fb7185'
                  : '#22c55e'
                : '#a9bad6';
            return (
              <div
                key={p.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '80px 1fr 110px 120px 1fr',
                  gap: 8,
                  padding: '10px 12px',
                  borderBottom: '1px solid #0f1a33',
                  color: '#cfe0ff'
                }}
              >
                <div>#{p.floor}</div>
                <div>{p.nick}</div>
                <div style={{ color }}>{p.finalChoice}</div>
                <div style={{ color: p.success || p.finalChoice === 'HOLD' ? '#22c55e' : '#b6c3da' }}>
                  {(p.payout ?? 0).toFixed(2)}
                </div>
                <div>
                  {p.addr.slice(0, 8)}…{p.addr.slice(-4)}
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}

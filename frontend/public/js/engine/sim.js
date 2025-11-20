// public/js/engine/sim.js
//import { FLOORS } from "../types.js";

export function resolveAtFloor(
  floor,
  players,
  sess,
  setSess,
  update,
  pushEffect
) {
  const idx = players.findIndex((p) => p.floor === floor);
  if (idx < 0) return;
  const p = players[idx];
  if (p.revealed) return;

  const choice = p.baseChoice;
  update(idx, { finalChoice: choice, revealed: true });

  if (choice === "HOLD") return;

  const win = choice === "GRAB" ? sess.successWindowGrab : sess.successWindowSkim;
  const r = Math.random() * FLOORS;
  const success = r < win;

  if (choice === "GRAB") pushEffect("grab", floor);
  else pushEffect("skim", floor);

  if (success) {
    const mult = choice === "GRAB" ? 3.0 : 1.25;
    const gross = p.deposit * mult;
    const net = gross * 0.98; // 2%
    const feeHalf = (gross * 0.02) / 2;
    const payout = Math.min(net, sess.pool);

    const next = {
      ...sess,
      pool: Math.max(0, sess.pool - payout),
      treasury: sess.treasury + feeHalf,
      nextPool: sess.nextPool + feeHalf,
      successWindowGrab: choice === "GRAB" ? Math.max(0, sess.successWindowGrab - 0.5) : sess.successWindowGrab,
      successWindowSkim: Math.max(0, sess.successWindowSkim - 0.5),
    };
    setSess(next);
    update(idx, { success: true, payout });
  } else {
    update(idx, { success: false, payout: 0 });
  }
}

export function finalizeSession(players, sess, setSess, update) {
  const holders = players.filter((p) => p.finalChoice === "HOLD");
  const totalHold = holders.reduce((s, p) => s + p.deposit, 0);
  if (sess.pool > 0 && totalHold > 0) {
    for (let i = 0; i < players.length; i++) {
      const p = players[i];
      if (p.finalChoice === "HOLD") {
        const share = (p.deposit / totalHold) * sess.pool;
        update(i, { payout: (p.payout || 0) + share });
      }
    }
    setSess({ ...sess, pool: 0, status: "DONE" });
  } else {
    setSess({ ...sess, status: "DONE" });
  }
}

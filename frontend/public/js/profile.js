// public/js/profile.js
import React, { useEffect, useMemo, useState } from "https://esm.sh/react@18.2.0";
import { Interface, formatEther } from "https://cdn.jsdelivr.net/npm/ethers@6.15.0/+esm";

const h = React.createElement;

// токены
const T = {
  border: "rgba(15, 23, 42, 1)",
  textMain: "#e5e7eb",
  textSubtle: "#9ca3af",
  glowPanel: "rgba(56, 189, 248, 0.18)",
  concreteTop: "#1f2933",
  concreteBottom: "#020617",
  concreteBorderSoft: "rgba(31, 41, 55, 0.9)",
};
const panel = {
  border: `1px solid ${T.border}`,
  borderRadius: 18,
  background: `radial-gradient(circle at top center, rgba(56,189,248,0.14) 0, rgba(15,23,42,0.98) 36%, #020617 70%)`,
  boxShadow: `0 1px 0 rgba(15,23,42,0.9), 0 26px 60px rgba(0,0,0,0.9), 0 0 40px ${T.glowPanel}`,
  color: T.textMain,
};
const btnBase = (fontSize = 14) => ({
  position: "relative",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  minHeight: 46,
  padding: "10px 14px",
  borderRadius: 12,
  border: `1px solid ${T.concreteBorderSoft}`,
  background: `linear-gradient(to bottom, rgba(255,255,255,0.06), transparent 32%), linear-gradient(145deg, ${T.concreteTop}, ${T.concreteBottom})`,
  boxShadow: `0 0 0 1px rgba(15,23,42,0.9), 0 14px 30px rgba(0,0,0,0.75), 0 0 26px rgba(56,189,248,0.22)`,
  color: T.textMain,
  fontWeight: 800,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  cursor: "pointer",
  fontSize,
});
// нейтральная «бетонная» кнопка (как в образце)
const btnNeutral = (disabled = false) => ({
  ...btnBase(),
  opacity: disabled ? 0.6 : 1,
  cursor: disabled ? "not-allowed" : "pointer",
});
const HOVER_STYLE = {
  transform: "translateY(-1px)",
  boxShadow:
    "0 0 0 1px rgba(15,23,42,1), 0 14px 30px rgba(0,0,0,0.85), 0 0 26px rgba(56,189,248,0.35)",
  filter: "brightness(1.06)",
};

const CHOICES = /** @type {const} */ (["NONE", "GRAB", "SKIM", "HOLD"]);

function shortAddr(addr) {
  if (!addr || typeof addr !== "string") return "";
  const a = addr.startsWith("0x") ? addr.slice(2) : addr;
  return `0x${a.slice(0, 2)}…${addr.slice(-4).toLowerCase()}`;
}

export default function Profile({ me, onBack }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [rows, setRows] = useState([]); // { season, floor, deposit, choice, reward }
  const [hoverBack, setHoverBack] = useState(false);

  // NEW: пагинация (10 строк на страницу)
  const PAGE_SIZE = 10;
  const [page, setPage] = useState(1);

  const contract = useMemo(() => (window?.tp?.contract || null), []);
  const provider = useMemo(() => (window?.tp?.provider || null), []);
  const addr = me?.address || null;

  // Events
  const ifaceJoined = useMemo(
    () =>
      new Interface([
        "event Joined(address indexed player, uint64 indexed sessionId, bytes32 depositH, bytes32 choiceH, string nick)",
      ]),
    []
  );
  const ifaceFloor = useMemo(
    () =>
      new Interface([
        "event FloorAssigned(uint64 indexed sessionId, address indexed player, uint32 floor)",
      ]),
    []
  );

  const codeToChoice = (n) => {
    const i = Number(n || 0);
    return i >= 0 && i <= 3 ? CHOICES[i] : "—";
  };

  // Универсальные геттеры choice/payout
  async function tryChoice(c, sidNum, floorNum, player) {
    const sid = sidNum != null ? BigInt(sidNum) : null;
    const floor = floorNum != null ? BigInt(floorNum) : null;
    const calls = [
      async () => floor != null && c.choicePublicSeason?.(sid, floor),
      async () => floor != null && c.choicePublicAt?.(sid, floor),
      async () => floor != null && c.choicePublic?.(sid, floor),
      async () => floor != null && c.choicePublicByFloor?.(sid, floor),
      async () => floor != null && c.choiceOfFloor?.(sid, floor),
      async () => floor != null && c.choiceAt?.(sid, floor),
      async () => floor != null && c.choice?.(sid, floor),

      async () => c.choicePublicFor?.(sid, player),
      async () => c.choicePublic?.(sid, player),
      async () => c.choicePublicAt?.(sid, player),
      async () => c.choiceOf?.(sid, player),
      async () => c.getChoicePublic?.(sid, player),
      async () => c.getChoice?.(sid, player),
    ];
    for (const fn of calls) {
      try {
        const v = await fn();
        if (v !== undefined && v !== null) return Number(v);
      } catch {}
    }
    return null;
  }
  async function tryPayout(c, sid, player) {
    try {
      const v = await c.payoutPublic?.(BigInt(sid), player);
      return v ?? 0n;
    } catch {
      return 0n;
    }
  }

  // Основная загрузка истории (без текущего сезона)
  useEffect(() => {
    if (!contract || !provider || !addr) return;
    let aborted = false;

    async function load() {
      setBusy(true);
      setErr("");
      try {
        // Текущий сезон — исключаем его из таблицы
        let currentSidNum = null;
        try {
          const [sidNow] = await contract.currentSession();
          currentSidNum = Number(sidNow);
        } catch {}

        // 1) Все Joined для игрока
        const topicsJ = ifaceJoined.encodeFilterTopics("Joined", [
          addr,
          null,
          null,
          null,
          null,
        ]);
        const logsJ = await provider.getLogs({
          address: (await contract.getAddress?.()) || contract.target,
          fromBlock: 0,
          toBlock: "latest",
          topics: topicsJ,
        });

        // 2) Депозиты по сезонам (из tx.value)
        const bySeason = new Map(); // sid -> { depositWei, txHash }
        const txPromises = [];
        for (const lg of logsJ) {
          try {
            const p = ifaceJoined.parseLog(lg);
            const sid = Number(p.args.sessionId);
            txPromises.push(
              provider
                .getTransaction(lg.transactionHash)
                .then((tx) => {
                  const dep = tx?.value ? BigInt(tx.value) : 0n;
                  const e =
                    bySeason.get(sid) || { depositWei: 0n, txHash: lg.transactionHash };
                  e.depositWei = dep;
                  e.txHash = lg.transactionHash;
                  bySeason.set(sid, e);
                })
                .catch(() => {})
            );
          } catch {}
        }
        await Promise.all(txPromises);

        // 3) Этажи по сезонам
        const allSids = Array.from(bySeason.keys()).sort((a, b) => a - b);
        const floorsBySid = {};
        if (allSids.length) {
          const addrContract = (await contract.getAddress?.()) || contract.target;
          for (const sid of allSids) {
            const topicsF = ifaceFloor.encodeFilterTopics("FloorAssigned", [
              BigInt(sid),
              addr,
              null,
            ]);
            const logsF = await provider.getLogs({
              address: addrContract,
              fromBlock: 0,
              toBlock: "latest",
              topics: topicsF,
            });
            let floor = null;
            for (const lg of logsF) {
              try {
                const p = ifaceFloor.parseLog(lg);
                floor = Number(p.args.floor);
              } catch {}
            }
            floorsBySid[sid] = floor;
          }
        }

        // 4) Choice + Reward (исключая текущий сезон)
        const outRows = [];
        for (const sid of allSids) {
          if (currentSidNum !== null && sid === currentSidNum) continue;

          const base = bySeason.get(sid);
          const floor = floorsBySid[sid] ?? null;

          let choiceCode = null;
          try {
            choiceCode = await tryChoice(contract, sid, floor, addr);
          } catch {}
          const choiceText = codeToChoice(choiceCode);

          let rewardWei = 0n;
          try {
            rewardWei = await tryPayout(contract, sid, addr);
          } catch {}

          outRows.push({
            season: sid,
            floor: floor ? `#${floor}` : "—",
            deposit: Number(formatEther(base.depositWei || 0n)),
            choice: choiceText,
            reward: Number(formatEther(rewardWei || 0n)),
          });
        }

        if (!aborted) {
          outRows.sort((a, b) => b.season - a.season);
          setRows(outRows);
          setPage(1); // сбрасываем на первую страницу при новой загрузке
        }
      } catch (e) {
        if (!aborted) setErr(e?.message || "Failed to load profile history");
      } finally {
        if (!aborted) setBusy(false);
      }
    }

    load();
  }, [contract, provider, addr]);

  // ===== UI =====
  // обновлённые «чипы» по образцу (Nick / Address / Total rewards)
  const badge = {
    padding: "8px 14px",
    borderRadius: 14,
    border: "1px solid rgba(59, 91, 150, 0.85)",
    background:
      "linear-gradient(to bottom, rgba(255,255,255,0.05), transparent 28%), " +
      "radial-gradient(120% 80% at 50% 0%, rgba(56,189,248,0.08) 0, rgba(2,6,23,0) 60%), " +
      "#0b1424",
    boxShadow:
      "inset 0 1px 0 rgba(255,255,255,0.04), 0 0 0 1px rgba(12,20,36,0.65)",
    color: "#cfe0ff",
    fontWeight: 800,
    letterSpacing: "0.02em",
    whiteSpace: "nowrap",
  };

  const th = (t, w) =>
    h(
      "div",
      { style: { flex: w, fontSize: 12, opacity: 0.7, padding: "8px 10px", textAlign: "left" } },
      t
    );

  const td = (t, w, { mono = false, crop = true, title } = {}) =>
    h(
      "div",
      {
        title,
        style: {
          flex: w,
          padding: "10px 10px",
          fontFamily: mono
            ? "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace"
            : "inherit",
          whiteSpace: crop ? "nowrap" : "normal",
          overflow: crop ? "hidden" : "visible",
          textOverflow: crop ? "ellipsis" : "clip",
          textAlign: "left",
        },
      },
      t
    );

  const head = h(
    "div",
    {
      style: {
        display: "flex",
        borderBottom: `1px solid ${T.border}`,
        background: `linear-gradient(to bottom, rgba(255,255,255,0.03), transparent 32%), linear-gradient(145deg, ${T.concreteTop}, ${T.concreteBottom})`,
        borderRadius: "12px 12px 0 0",
      },
    },
    [th("Season", 1.0), th("Floor", 1.0), th("Deposit", 1.6), th("Choice", 1.2), th("Reward", 1.6)]
  );

  const row = (r, i) => {
    const depText = Number.isFinite(r.deposit) ? r.deposit.toFixed(5) : "0.00000";
    const rewText = Number.isFinite(r.reward) ? r.reward.toFixed(5) : "0.00000";
    return h(
      "div",
      {
        key: `r${i}`,
        style: {
          display: "flex",
          borderBottom: "1px solid rgba(20,32,54,.6)",
          background: "transparent",
        },
      },
      [
        td(`#${r.season}`, 1.0),
        td(r.floor, 1.0),
        td(depText, 1.6, { mono: true, crop: false, title: `${depText} ETH` }),
        td(r.choice || "—", 1.2),
        td(rewText, 1.6, { mono: true, crop: false, title: `${rewText} ETH` }),
      ]
    );
  };

  const totalReward = rows.reduce((s, r) => s + (Number.isFinite(r.reward) ? r.reward : 0), 0);

  // ── пагинация: вычисляем текущий срез
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageSafe = Math.min(Math.max(1, page), totalPages);
  const pageRows = rows.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  // кнопки пагинации
  const [pagerHoverPrev, setPagerHoverPrev] = useState(false);
  const [pagerHoverNext, setPagerHoverNext] = useState(false);

  return h("div", { style: { padding: "22px 20px", display: "grid", gap: 14 } }, [
    // header
    h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 } }, [
      h("div", { style: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" } }, [
        h("div", { style: { fontSize: 24, fontWeight: 900 } }, "Profile"),
        h("span", { style: badge }, me?.nick?.trim() ? `Nick: ${me.nick.trim()}` : `Nick: —`),
        h("span", { style: badge }, `Address: ${shortAddr(addr)}`),
        h("span", { style: badge }, `Total rewards: ${totalReward.toFixed(5)} ETH`),
      ]),
      h(
        "button",
        {
          onClick: onBack,
          onMouseEnter: () => setHoverBack(true),
          onMouseLeave: () => setHoverBack(false),
          style: { ...btnNeutral(false), ...(hoverBack ? HOVER_STYLE : null) },
        },
        "Back"
      ),
    ]),

    // error / loader
    err && h("div", { style: { color: "#ffb7c7" } }, err),
    busy && h("div", { style: { opacity: 0.8 } }, "Loading history…"),

    // подпись
    h("div", { style: { fontSize: 22, fontWeight: 900, marginTop: 30 } }, "Season history (previous seasons only)"),

    // table in panel
    h(
      "div",
      { style: { ...panel, marginTop: 6, borderRadius: 12, overflow: "hidden" } },
      [
        head,
        ...(pageRows.length
          ? pageRows.map(row)
          : [h("div", { key: "empty", style: { padding: 16, opacity: 0.7 } }, busy ? "…" : "No entries yet")]),
      ]
    ),

    // пагинация под таблицей (как в истории)
    h(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          paddingTop: 6,
        },
      },
      [
        h(
          "button",
          {
            onClick: () => setPage((p) => Math.max(1, p - 1)),
            disabled: pageSafe <= 1 || busy,
            onMouseEnter: () => setPagerHoverPrev(true),
            onMouseLeave: () => setPagerHoverPrev(false),
            style: {
              ...btnNeutral(pageSafe <= 1 || busy),
              ...(pageSafe > 1 && !busy && pagerHoverPrev ? HOVER_STYLE : null),
            },
          },
          "← Prev"
        ),
        h("div", { style: { fontSize: 12, opacity: 0.8 } }, `Page ${pageSafe} of ${totalPages}`),
        h(
          "button",
          {
            onClick: () => setPage((p) => Math.min(totalPages, p + 1)),
            disabled: pageSafe >= totalPages || busy,
            onMouseEnter: () => setPagerHoverNext(true),
            onMouseLeave: () => setPagerHoverNext(false),
            style: {
              ...btnNeutral(pageSafe >= totalPages || busy),
              ...(pageSafe < totalPages && !busy && pagerHoverNext ? HOVER_STYLE : null),
            },
          },
          "Next →"
        ),
      ]
    ),
  ]);
}

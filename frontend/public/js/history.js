// public/js/history.js
import React, { useEffect, useMemo, useState } from "https://esm.sh/react@18.2.0";
import ResultsView from "/js/components/ResultsView.js";
import { Interface, formatEther } from "https://cdn.jsdelivr.net/npm/ethers@6.15.0/+esm";

const h = React.createElement;

/* ====== Токены / базовые стили ====== */
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
  transition:
    "transform 140ms ease, box-shadow 140ms ease, filter 140ms ease, background 140ms ease, color 140ms ease, opacity 140ms ease, outline-color 140ms ease",
});
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
function useHoverableStyle(base, disabled = false) {
  const [hover, setHover] = useState(false);
  return [
    { ...(base || {}), ...(hover && !disabled ? HOVER_STYLE : null) },
    { onMouseEnter: () => setHover(true), onMouseLeave: () => setHover(false) },
  ];
}

function shortAddr(addr) {
  if (!addr || typeof addr !== "string") return "";
  const a = addr.startsWith("0x") ? addr.slice(2) : addr;
  return `0x${a.slice(0, 2)}…${addr.slice(-4).toLowerCase()}`;
}

/* ====== ABI fallbacks ====== */
const CHOICES = /** @type {const} */ (["NONE", "GRAB", "SKIM", "HOLD"]);
function codeToChoice(n) {
  const i = Number(n || 0);
  return i >= 0 && i <= 3 ? CHOICES[i] : "—";
}
async function tryDeposit(c, sidNum, floorNum, player) {
  const sid = sidNum != null ? BigInt(sidNum) : null;
  const floor = floorNum != null ? BigInt(floorNum) : null;
  const calls = [
    async () => (floor != null) && c.depositPublicAt?.(sid, floor),
    async () => (floor != null) && c.depositPublic?.(sid, floor),
    async () => (floor != null) && c.depositAt?.(sid, floor),
    async () => (floor != null) && c.depositOfFloor?.(sid, floor),

    async () => c.depositPublicFor?.(sid, player),
    async () => c.depositPublic?.(sid, player),
    async () => c.depositOf?.(sid, player),
    async () => c.getDepositPublic?.(sid, player),
    async () => c.getDeposit?.(sid, player),
  ];
  for (const fn of calls) {
    try {
      const v = await fn();
      if (v !== undefined && v !== null) return BigInt(v);
    } catch {}
  }
  return 0n;
}
async function tryChoice(c, sidNum, floorNum, player) {
  const sid = sidNum != null ? BigInt(sidNum) : null;
  const floor = floorNum != null ? BigInt(floorNum) : null;
  const calls = [
    async () => (floor != null) && c.choicePublicSeason?.(sid, floor),
    async () => (floor != null) && c.choicePublicAt?.(sid, floor),
    async () => (floor != null) && c.choicePublic?.(sid, floor),
    async () => (floor != null) && c.choicePublicByFloor?.(sid, floor),
    async () => (floor != null) && c.choiceOfFloor?.(sid, floor),
    async () => (floor != null) && c.choiceAt?.(sid, floor),
    async () => (floor != null) && c.choice?.(sid, floor),

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
async function tryPayout(c, sidNum, player) {
  try {
    const v = await c.payoutPublic?.(BigInt(sidNum), player);
    return v ?? 0n;
  } catch { return 0n; }
}

/* ====== Компонент истории ====== */
export default function History({ onBack }) {
  const contract = useMemo(() => (window?.tp?.contract || null), []);
  const provider = useMemo(() => (window?.tp?.provider || null), []);
  const [signerAddr, setSignerAddr] = useState(null);

  useEffect(() => {
    (async () => { try { setSignerAddr(await window?.tp?.signer?.getAddress?.()); } catch {} })();
  }, []);

  const [latestSeason, setLatestSeason] = useState(null);
  const [seasonList, setSeasonList] = useState([]); // все сезоны кроме текущего (desc)
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  const [mode, setMode] = useState("pick"); // 'pick' | 'table'
  const [busy, setBusy] = useState(false);
  const [loadingSid, setLoadingSid] = useState(null); // ← какая кнопка "Loading…"
  const [err, setErr] = useState("");
  const [rows, setRows] = useState([]);
  const [shownSeason, setShownSeason] = useState(null);

  const [backStyle, backHover] = useHoverableStyle(btnNeutral(false), false);

  // Получаем последний сезон и строим список: ВСЕ, КРОМЕ ТЕКУЩЕГО
  useEffect(() => {
    (async () => {
      if (!contract) return;
      try {
        const cs = await contract.currentSession?.();
        const sidNow = Number(cs?.[0] ?? 0);
        setLatestSeason(sidNow || null);

        // все сезоны [sidNow-1 … 1]
        const arr = [];
        for (let s = Math.max(1, sidNow - 1); s >= 1; s--) arr.push(s);
        setSeasonList(arr);
        setPage(1);
      } catch {}
    })();
  }, [contract]);

  const totalPages = Math.max(1, Math.ceil(seasonList.length / PAGE_SIZE));
  const pageItems = seasonList.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // целенаправленно удаляем только чип "Your rewards"
  useEffect(() => {
    if (mode !== "table") return;
    const stripRewards = () => {
      try {
        const nodes = Array.from(document.querySelectorAll("div"));
        const el = nodes.find(n => (n.textContent || "").trim().startsWith("Your rewards"));
        if (el) {
          // удаляем внутренний текст, не скрывая контейнер заголовка
          el.textContent = "";
        }
      } catch {}
    };
    stripRewards();
    const t1 = setTimeout(stripRewards, 30);
    const t2 = setTimeout(stripRewards, 120);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [mode, shownSeason]);

  async function loadSeason(seasonId) {
    if (!contract || !provider) return;
    setBusy(true);
    setLoadingSid(seasonId);
    setErr("");
    try {
      const sid = BigInt(seasonId);

      // адреса игроков по этажам
      const ifaceFA = new Interface([
        "event FloorAssigned(uint64 indexed sessionId, address indexed player, uint32 floor)",
      ]);
      const topicsFA = ifaceFA.encodeFilterTopics("FloorAssigned", [sid, null, null]);
      const logsFA = await provider.getLogs({
        address: (await contract.getAddress?.()) || contract.target,
        fromBlock: 0,
        toBlock: "latest",
        topics: topicsFA,
      });
      const floorToAddr = {};
      for (const lg of logsFA) {
        try {
          const p = ifaceFA.parseLog(lg);
          if (BigInt(p.args.sessionId) !== sid) continue;
          floorToAddr[Number(p.args.floor)] = p.args.player;
        } catch {}
      }

      // читаем 50 этажей
      const rowsTmp = [];
      let totalDeposWei = 0n;

      for (let f = 1; f <= 50; f++) {
        const addr = floorToAddr[f] || "";
        if (addr) {
          const depWei = await tryDeposit(contract, seasonId, f, addr);
          const choiceCode = await tryChoice(contract, seasonId, f, addr);
          const payoutWei = await tryPayout(contract, seasonId, addr);
          totalDeposWei += BigInt(depWei || 0n);

          let nick = "";
          try { nick = await contract.nickOf?.(addr); } catch {}

          const depStr = formatEther(depWei || 0n);
          const payStr = formatEther(payoutWei || 0n);

          rowsTmp.push({
            floor: f,
            nick,
            deposit: Number(depStr),
            depositFull: depStr,
            choice: codeToChoice(choiceCode),
            payout: Number(payStr),
            payoutFull: payStr,
            addr,
            isMe: signerAddr && addr && signerAddr.toLowerCase() === addr.toLowerCase(),
          });
        } else {
          rowsTmp.push({
            floor: f,
            nick: "",
            deposit: 0,
            depositFull: "0",
            choice: "—",
            payout: 0,
            payoutFull: "0",
            addr: "",
            isMe: false,
          });
        }
      }

      // carried-in для ЭТОГО сезона (событие CarryOver(newSid == seasonId))
      let carriedWei = 0n;
      try {
        const ifaceCO = new Interface(["event CarryOver(uint64 indexed newSid, uint256 amount)"]);
        const topicsCO = ifaceCO.encodeFilterTopics("CarryOver", [sid, null]);
        const logsCO = await provider.getLogs({
          address: (await contract.getAddress?.()) || contract.target,
          fromBlock: 0,
          toBlock: "latest",
          topics: topicsCO,
        });
        if (logsCO.length) {
          const p = ifaceCO.parseLog(logsCO[logsCO.length - 1]);
          carriedWei = BigInt(p.args.amount || 0n);
        }
      } catch {}

      // агрегаты по формуле: base = deposits + carried, затем -2%
      const baseWei = totalDeposWei + carriedWei;
      const treasuryWei = baseWei / 100n;
      const nextPoolWei = baseWei / 100n;
      const poolNetWei = baseWei - treasuryWei - nextPoolWei;

      // НЕ показываем «Your rewards» в истории
      rowsTmp.__meReward = undefined;

      rowsTmp.__treasury = Number(formatEther(treasuryWei) || "0").toFixed(5);
      rowsTmp.__nextPool = Number(formatEther(nextPoolWei) || "0").toFixed(5);
      rowsTmp.__poolNet  = Number(formatEther(poolNetWei)  || "0").toFixed(5);

      setRows(rowsTmp);
      setShownSeason(seasonId);
      setMode("table");
    } catch (e) {
      setErr(e?.message || "Failed to load season data");
    } finally {
      setBusy(false);
      setLoadingSid(null);
    }
  }

  // Табличные элементы для страницы выбора сезона
  const th = (t, w) =>
    h("div", { style: { flex: w, fontSize: 12, opacity: 0.7, padding: "8px 10px", textAlign: "left" } }, t);
  const td = (t, w, extra = {}) =>
    h("div", {
      style: {
        flex: w,
        padding: "10px 10px",
        whiteSpace: extra.crop === false ? "normal" : "nowrap",
        overflow: extra.crop === false ? "visible" : "hidden",
        textOverflow: extra.crop === false ? "clip" : "ellipsis",
        textAlign: "left",
      },
    }, t);

  const [viewBtnStyle, viewBtnHover] = useHoverableStyle(btnNeutral(false), false);
  const [pagerBtnStyle, pagerBtnHover] = useHoverableStyle(btnNeutral(false), false);

  // Header
  const header = h("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 } }, [
    h("div", { style: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" } }, [
      h("div", { style: { fontSize: 24, fontWeight: 900 } }, "Season History"),
      latestSeason != null && h("span", { style: { fontSize: 12, opacity: 0.8 } }, `(current: #${latestSeason})`),
    ]),
    h("button", { onClick: onBack, style: backStyle, ...backHover }, "Back"),
  ]);

  // Таблица выбора сезонов (все кроме текущего)
  const pickerTable =
    seasonList.length === 0
      ? h("div", { style: { ...panel, padding: 16 } }, "No past seasons yet")
      : h("div", { style: { ...panel, overflow: "hidden", padding: 0 } }, [
          h(
            "div",
            {
              style: {
                display: "flex",
                borderBottom: `1px solid ${T.border}`,
                background: `linear-gradient(to bottom, rgba(255,255,255,0.03), transparent 32%), linear-gradient(145deg, ${T.concreteTop}, ${T.concreteBottom})`,
                borderRadius: "12px 12px 0 0",
              },
            },
            [th("Season", 1), th("Action", 1)]
          ),
          ...pageItems.map((sid) =>
            h(
              "div",
              { key: `s${sid}`, style: { display: "flex", borderBottom: "1px solid rgba(20,32,54,.6)" } },
              [
                td(`#${sid}`, 1),
                td(
                  h(
                    "button",
                    {
                      onClick: () => loadSeason(sid),
                      disabled: !!loadingSid,
                      style: { ...viewBtnStyle, opacity: !!loadingSid ? 0.6 : 1, cursor: !!loadingSid ? "not-allowed" : "pointer" },
                      ...viewBtnHover,
                    },
                    loadingSid === sid ? "Loading…" : "View results"
                  ),
                  1,
                  { crop: false }
                ),
              ]
            )
          ),
          // Пагинация
          h(
            "div",
            {
              style: {
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                padding: 12,
              },
            },
            [
              h(
                "button",
                {
                  onClick: () => setPage((p) => Math.max(1, p - 1)),
                  disabled: page <= 1 || !!loadingSid,
                  style: {
                    ...pagerBtnStyle,
                    opacity: page <= 1 || !!loadingSid ? 0.6 : 1,
                    cursor: page <= 1 || !!loadingSid ? "not-allowed" : "pointer",
                  },
                  ...pagerBtnHover,
                },
                "← Prev"
              ),
              h("div", { style: { fontSize: 12, opacity: 0.8 } }, `Page ${page} of ${totalPages}`),
              h(
                "button",
                {
                  onClick: () => setPage((p) => Math.min(totalPages, p + 1)),
                  disabled: page >= totalPages || !!loadingSid,
                  style: {
                    ...pagerBtnStyle,
                    opacity: page >= totalPages || !!loadingSid ? 0.6 : 1,
                    cursor: page >= totalPages || !!loadingSid ? "not-allowed" : "pointer",
                  },
                  ...pagerBtnHover,
                },
                "Next →"
              ),
            ]
          ),
        ]);

  // Правильные агрегаты — свой компактный блок над таблицей
  const poolSummary = (rows && rows.__poolNet != null) &&
    h("div", {
      style: {
        display: "flex",
        justifyContent: "flex-end",
        gap: 18,
        padding: "6px 6px 8px",
        fontSize: 12,
        color: T.textMain,
        opacity: 0.95,
      }
    }, [
      h("span", null, `Pool: ${rows.__poolNet} ETH`),
      h("span", null, `Treasury(1% of pool): ${rows.__treasury} ETH`),
      h("span", null, `Next pool(1% of pool): ${rows.__nextPool} ETH`),
    ]);

  // Состояние таблицы результатов одного сезона
  const seasonTable =
    h("div", { style: { display: "grid", gap: 6 } }, [
      h(
        "div",
        { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
        [
          h("div"),
          h(
            "button",
            {
              onClick: () => setMode("pick"),
              style: btnNeutral(false),
            },
            "← Back to seasons"
          ),
        ]
      ),
      poolSummary,
      h("div", { style: { ...panel, padding: 0 } }, h(ResultsView, { rows, seasonId: shownSeason })),
    ]);

  return h("div", { style: { padding: "22px 20px", display: "grid", gap: 14 } }, [
    header,
    err && h("div", { style: { color: "#ffb7c7" } }, err),
    mode === "pick" ? pickerTable : seasonTable,
  ]);
}

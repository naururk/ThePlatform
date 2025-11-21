// public/js/components/LeftPanel.js
import React from "https://esm.sh/react@18.2.0";
import ResultsView from "/js/components/ResultsView.js";
import TowerCanvas from "/js/components/Tower.js";

// логотип просто из /public
const logoUrl = "/logo/logo.png";

const h = React.createElement;

// токены под стиль
const T = {
  pageBg: "#020617",
  border: "rgba(15, 23, 42, 1)",
  textMain: "#e5e7eb",
  textSubtle: "#9ca3af",
  glowPanel: "rgba(56,189,248,0.18)",
  concreteTop: "#1f2933",
  concreteBottom: "#020617",
  concreteBorderSoft: "rgba(31,41,55,0.9)",
};
const panel = {
  border: `1px solid ${T.border}`,
  background: `radial-gradient(circle at top center, rgba(56,189,248,0.14) 0, rgba(15,23,42,0.98) 36%, #020617 70%)`,
  color: T.textMain,
  borderRadius: 18,
  padding: 16,
  boxShadow: `0 1px 0 rgba(15,23,42,0.9), 0 26px 60px rgba(0,0,0,0.9), 0 0 40px ${T.glowPanel}`,
};

const btnBase = (fs=14)=>({
  position:"relative", display:"inline-flex", alignItems:"center", justifyContent:"center", gap:8,
  minHeight:46, padding:"12px 16px", borderRadius:12,
  border:`1px solid ${T.concreteBorderSoft}`,
  background:`linear-gradient(to bottom, rgba(255,255,255,0.06), transparent 32%), linear-gradient(145deg, ${T.concreteTop}, ${T.concreteBottom})`,
  boxShadow:`0 0 0 1px rgba(15,23,42,0.9), 0 14px 30px rgba(0,0,0,0.75), 0 0 26px rgba(56,189,248,0.22)`,
  color:T.textMain, fontWeight:800, letterSpacing:"0.06em", textTransform:"uppercase", cursor:"pointer", fontSize:fs
});

export default function LeftPanel(props) {
  const {
    status = "WAITING",
    seasonId = "—",
    showResults = false,
    resultsStatus = "",
    resultsBusy = false,
    onViewResults = () => {},
    onFetchResultsSilent = null,
    rows = [],
    towerProps = {},
  } = props;

  // локальный флаг показа визуализации
  const [showViz, setShowViz] = React.useState(false);

  const STATUS_LABEL = {
    WAITING: "Registration in progress",
    RUNNING: "Processing…",
    DONE: "Season complete",
  };

  function LogoBlock() {
    return h(
      "div",
      { style: { display: "grid", placeItems: "center", marginBottom: 4 } },
      h("img", {
        src: logoUrl,
        alt: "The Platform",
        style: {
          width: "100%",
          
          height: "auto",
          objectFit: "contain",
          filter: "drop-shadow(0 10px 30px rgba(37,83,230,.18))",
        },
      })
    );
  }

  function PanelLayout({ children, grow = false, suppressWheel = true }) {
    return h(
      "div",
      {
        style: {
          height: "100%",
          padding: 20,
          display: "flex",
          flexDirection: "column",
          gap: 14,
          background: T.pageBg,
        },
      },
      [
        h(LogoBlock),
        h(
          "div",
          {
            style: {
              ...(grow ? { flex: 1, minHeight: 0, display: "flex", flexDirection: "column" } : {}),
            },
            onWheel: suppressWheel ? (e) => e.stopPropagation() : undefined,
          },
          children
        ),
      ]
    );
  }

  const Card = (children, extra = {}) =>
    h(
      "div",
      { style: { ...panel, ...extra } },
      children
    );

 // ↓ замените существующий Bullet на этот компактный
// === COMPACT Bullet ===
const Bullet = (t) =>
  h(
    "div",
    {
      style: {
        display: "flex",
        gap: 6,
        marginBottom: 0,      // меньше отступ между пунктами
        lineHeight: 1.22,     // плотнее строки
        fontSize: 11,         // компактнее текст
      },
    },
    [
      h("div", {
        style: {
          width: 4, height: 4, marginTop: 5, borderRadius: 5,
          background: "#606162ff", flex: "0 0 auto",
        },
      }),
      h("div", null, t),
    ]
  );

// === COMPACT WaitingPane ===
function WaitingPane() {
  const Steel = (text) =>
    h("span", {
      style: {
        fontWeight: 900,
        background: "linear-gradient(180deg,#e7eef9,#96a7bf 60%,#7f90a8)",
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        color: "transparent",
        textShadow: "0 1px 0 rgba(255,255,255,0.18)",
        letterSpacing: "0.02em",
      }
    }, text);

  // компактные заголовки секций — меньше кегль и отступы
  const head = (txt, mt = 4) =>
    h("div", { style: { fontWeight: 900, fontSize: 12, margin: `${mt}px 0 2px` } }, txt);

  return h(
    PanelLayout,
    null,
    // ужимаем карточку + слегка меньше внутренний паддинг
    Card([
      head("How it works", 2),
      Bullet("Deposit ETH into a shared pool. Make a hidden choice (encrypted on-chain while the season is open)."),

      head("Floors & order", 6),
      Bullet("There are 50 floors; each player is assigned a random floor. The platform resolves floor by floor from 1 → 50."),

      head("Choices", 6),
      Bullet(h("span", null, [Steel("GRAB"), " — 3× deposit if your floor is within the current GRAB window."])),
      Bullet(h("span", null, [Steel("SKIM"), " — 1.25× deposit if your floor is within the current SKIM window."])),
      Bullet(h("span", null, [Steel("HOLD"), " — if any pool remains after floor 50, it’s split among HOLDs pro-rata."])),

      head("Success windows", 6),
      Bullet("Initially: GRAB ≤ 26 floors, SKIM ≤ 50 floors. After each successful event: a successful GRAB reduces both windows by 1.0 floor; a successful SKIM reduces both windows by 0.5 floor."),

      head("Outcomes", 6),
      Bullet("At each floor: GRAB pays up to 3× deposit (capped by the remaining pool). SKIM pays up to 1.25× (capped by the pool)."),
      Bullet("After floor 50: any remainder is split proportionally among HOLDs; if no remainder, no further payouts."),
      Bullet("From the total pool, 1% goes to Treasury and 1% rolls into the next season’s pool."),

      // финальный слоган — ещё компактнее
      h("div", {
        style: {
          marginTop: 6,
          fontSize: 10.5,
          fontWeight: 900,
          letterSpacing: ".06em",
          textTransform: "uppercase",
          opacity: 0.95
        }
      }, "A social experiment in greed, risk, and trust. Pick your strategy and play: go bold, skim safely, or hunt the remainder.")
    ], { maxWidth: 520, margin: "0 auto", padding: 12 }) // ключ: меньше ширина и паддинг
  );
}





  function DoneGate() {
    return h(
      PanelLayout,
      null,
      h(
        "div",
        {
          style: {
            ...panel,
            textAlign: "center",
            width: "100%",
            maxWidth: 520,
            margin: "0 auto",
            display: "grid",
            gap: 10,
          },
        },
        [
          h("div", { style: { fontSize: 18, fontWeight: 900, marginBottom: 6 } }, `Season ${seasonId} — DONE!`),
          resultsStatus && h("div", { style: { fontSize: 12, opacity: 0.75, marginBottom: 2 } }, resultsStatus),

          // «тихо» подгружаем результаты, затем показываем визуализацию
          h(
            "button",
            {
              onClick: async () => {
                try { if (onFetchResultsSilent) await onFetchResultsSilent(); }
                finally { setShowViz(true); }
              },
              disabled: resultsBusy,
              style: { ...btnBase(14), width: "100%" },
            },
            resultsBusy ? "Loading…" : "Platform visualization"
          ),
        ]
      )
    );
  }

  if (status === "WAITING" || status === "RUNNING") return h(WaitingPane);

  if (status === "DONE" && !showResults && showViz) {
    return h(
      PanelLayout,
      { grow: true, suppressWheel: false },
      h(
        "div",
        { style: { flex: 1, minHeight: 0, display: "flex", flexDirection: "column" } },
        h(TowerCanvas, {
          seasonId,
          onOpenResults: onViewResults,   // ← обработчик кнопки “Results table”
          rows,
          ...towerProps,
        })
      )
    );
  }

  if (status === "DONE" && !showResults) return h(DoneGate);

  if (status === "DONE" && showResults) {
    return h(
      PanelLayout,
      { grow: true, suppressWheel: true },
      h(
        "div",
        { style: { flex: 1, minHeight: 0, display: "flex", flexDirection: "column" } },
        h(ResultsView, { rows, seasonId })
      )
    );
  }

  return h(
    PanelLayout,
    { grow: true, suppressWheel: false },
    h(
      "div",
      { style: { flex: 1, minHeight: 0, display: "flex", flexDirection: "column" } },
      h(TowerCanvas, { rows, onOpenResults: onViewResults, ...towerProps })
    )
  );
}

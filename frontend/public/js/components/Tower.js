// public/js/components/Tower.js
import React from "https://esm.sh/react@18.2.0";

const h = React.createElement;

const T = {
  border: "rgba(15, 23, 42, 1)",
  glowPanel: "rgba(56,189,248,0.18)",
  textMain: "#e7f2ff",
};

/* ======= ПАРАМЕТРЫ ДИЗАЙНА (для быстрых правок) ======= */
const FLOORS = 50;
const IMG_WIDTH = "68%";              // ширина «колонны» этажей
const BOTTOM_SPACER_PX = 100;         // хвост снизу

// Позиция/ширина блока данных на этаже (проценты от ширины картинки)
const DATA_LEFT = "14%";
const DATA_RIGHT = "14%";
const DATA_TOP = "35%";               // центр по вертикали

// Доля высоты картинки, занимаемая блоком данных (0..1)
const DATA_BOX_HEIGHT_RATIO = 0.68;

// Оформление панели на этаже
const PANEL_BG = "transparent";
const PANEL_INSET_SHADOW = "none";
const PANEL_RADIUS = 12;

const TEXT_COLOR = T.textMain;

/** Длительность анимации перемещения лифта (должна совпадать с CSS transition) */
const TRANSITION_MS = 600;

/** СМЕЩЕНИЕ БАШНИ ВПРАВО (px) */
const TOWER_SHIFT_PX = 10;
/* ====================================================== */

export default function TowerCanvas(props) {
  const { rows: rowsProp = [], seasonId = "—", onOpenResults } = props;

  const floors = Array.from({ length: FLOORS }, (_, i) => i + 1);

  // измерение высоты «этажа»
  const [floorH, setFloorH] = React.useState(0);
  const firstImgRef = React.useRef(null);
  const scrollRef = React.useRef(null);

  React.useEffect(() => {
    const measure = () => {
      const el = firstImgRef.current;
      if (el) setFloorH(el.clientHeight || 0);
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (firstImgRef.current) ro.observe(firstImgRef.current);
    window.addEventListener("resize", measure);
    return () => { try { ro.disconnect(); } catch {} window.removeEventListener("resize", measure); };
  }, []);

  // ===== мой адрес (для подсветки «(you)») =====
  const [myAddr, setMyAddr] = React.useState(
    rowsProp && rowsProp.__meAddr ? String(rowsProp.__meAddr) : ""
  );
  React.useEffect(() => {
    if (rowsProp && rowsProp.__meAddr) {
      setMyAddr(String(rowsProp.__meAddr));
      return;
    }
    let alive = true;
    (async () => {
      try {
        if (!myAddr && window.tp?.signer?.getAddress) {
          const a = await window.tp.signer.getAddress();
          if (alive && a) setMyAddr(String(a));
        }
      } catch {}
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowsProp]);

  const isMe = (r) => {
    if (!r) return false;
    const a = (r.addr || "").toLowerCase();
    const b = (myAddr || "").toLowerCase();
    return a && b && a === b;
  };

  // ===== лифт =====
  const [floor, setFloor] = React.useState(1);
  const [paused, setPaused] = React.useState(false);

  // ПОКАЗ ДАННЫХ ТОЛЬКО ПОСЛЕ ПРИБЫТИЯ:
  const [revealedUpTo, setRevealedUpTo] = React.useState(1);

  // шаг каждые 2 сек (если не пауза)
  React.useEffect(() => {
    if (paused || floor >= FLOORS) return;
    const id = setTimeout(() => setFloor((f) => Math.min(FLOORS, f + 1)), 2000);
    return () => clearTimeout(id);
  }, [floor, paused]);

  // автопрокрутка — держим текущий этаж по центру
  React.useEffect(() => {
    const sc = scrollRef.current;
    if (!sc || !floorH) return;
    const y = (floor - 0) * floorH;
    const desired = Math.max(0, Math.min(y - (sc.clientHeight - floorH) / 2, sc.scrollHeight - sc.clientHeight));
    sc.scrollTo({ top: desired, behavior: "smooth" });
  }, [floor, floorH]);

  // когда этаж сменился — "раскрываем" данные после окончания анимации
  React.useEffect(() => {
    let t = setTimeout(() => {
      setRevealedUpTo((r) => Math.max(r, floor));
    }, TRANSITION_MS);
    return () => clearTimeout(t);
  }, [floor]);

  const stopWheel = (e) => e.stopPropagation();

  const imgStyle = {
    width: "100%", height: "auto", display: "block",
    margin: 0, padding: 0, userSelect: "none", pointerEvents: "none",
    filter: "drop-shadow(0 26px 60px rgba(0,0,0,0.9)) drop-shadow(0 0 40px rgba(56,189,248,0.18))",
  };
  const offsetY = floorH > 0 ? (floor - 1) * floorH : 0;

  const [rows, setRows] = React.useState(() => (Array.isArray(rowsProp) ? rowsProp : []));
  React.useEffect(() => { if (rowsProp && rowsProp.length) setRows(rowsProp); }, [rowsProp]);

  const rowsByFloor = React.useMemo(() => {
    const m = {}; (rows || []).forEach((r) => { if (r && r.floor) m[r.floor] = r; }); return m;
  }, [rows]);

  const shortAddr = (addr) => {
    if (!addr) return "";
    const a = addr.startsWith("0x") ? addr.slice(2) : addr;
    return `0x${a.slice(0, 6)}…${addr.slice(-4).toLowerCase()}`;
  };
  const f5 = (n) => (Number.isFinite(n) ? Number(n).toFixed(5) : "0.00000");

  // ====== сводка сезона ======
  const summary = React.useMemo(() => {
    const s = {
      me: rows?.__meReward ?? "0.00",
      pool: rows?.__poolNet ?? "0.00",
      treasury: rows?.__treasury ?? "0.00",
      nextPool: rows?.__nextPool ?? "0.00",
    };
    const fmt = (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? n.toFixed(5) : String(v || "0.00000");
    };
    return {
      me: fmt(s.me),
      pool: fmt(s.pool),
      treasury: fmt(s.treasury),
      nextPool: fmt(s.nextPool),
    };
  }, [rows]);

  const [showResultsBtn, setShowResultsBtn] = React.useState(false);
  React.useEffect(() => {
    const id = setTimeout(() => setShowResultsBtn(true), 7000);
    return () => clearTimeout(id);
  }, []);

  return h(
    "div",
    { style: { position: "relative", width: "100%", height: "100%", display: "flex", flexDirection: "column" } },
    [
      h(
        "div",
        {
          ref: scrollRef,
          onWheel: stopWheel,
          tabIndex: 0,
          style: {
            flex: 1, minHeight: 0, overflow: "auto", overscrollBehavior: "contain",
            border: `1px solid ${T.border}`, borderRadius: 12, background: "transparent", padding: 12, position: "relative",
            boxShadow: `0 26px 60px rgba(0,0,0,0.9), 0 0 40px ${T.glowPanel}`,
          },
        },
        [
          // ======= СВОДКА =======
          h(
            "div",
            {
              key: "tower-summary",
              style: {
                width: "100%",
                display: "grid",
                gridTemplateColumns: "1fr",
                justifyItems: "stretch",
                gap: 12,
                margin: "6px 0 14px",
                color: T.textMain,
              },
            },
            [
              h(
                "div",
                {
                  style: {
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "0 8px",
                  },
                },
                [
                  h("div", { style: { fontSize: 20, fontWeight: 900 } }, `Season ${seasonId} results`),
                  h(
                    "div",
                    {
                      style: {
                        fontSize: 14,
                        background: "#0d2a12",
                        color: "#7ef29a",
                        padding: "6px 10px",
                        borderRadius: 10,
                        display: "inline-block",
                        border: "1px solid rgba(34,197,94,.25)",
                      },
                    },
                    `Your rewards: ${summary.me} ETH`
                  ),
                ]
              ),
              h(
                "div",
                { style: { textAlign: "right", padding: "0 8px" } },
                [
                  h("div", { style: { fontSize: 14, opacity: 0.85 } }, `Pool: ${summary.pool} ETH`),
                  h("div", { style: { fontSize: 14, opacity: 0.8 } }, `Treasury(1% of pool): ${summary.treasury} ETH`),
                  h("div", { style: { fontSize: 14, opacity: 0.8 } }, `Next pool(1% of pool): ${summary.nextPool} ETH`),
                ]
              ),
            ]
          ),

          // ======= КОЛОННА БАШНИ =======
          h(
            "div",
            { style: { width: "100%", display: "flex", flexDirection: "column", alignItems: "center", gap: 0, position: "relative" } },
            [
              ...floors.map((n) =>
                h(
                  "div",
                  {
                    key: `row-${n}`,
                    style: {
                      width: IMG_WIDTH,
                      position: "relative",
                      margin: "0 auto",
                      transform: `translateX(${TOWER_SHIFT_PX}px)`,
                    },
                  },
                  [
                    // номер этажа слева
                    h("div", {
                      style: {
                        position: "absolute", left: "-60px", top: "50%", transform: "translateY(-50%)",
                        width: 40, textAlign: "right", fontSize: 26, fontWeight: 900, color: "#9fb4d6", userSelect: "none",
                        textShadow: "0 0 24px rgba(56,189,248,0.35)",
                      },
                    }, "#" + String(n)),

                    // картинка этажа
                    h("img", { ref: n === 1 ? firstImgRef : null, src: "/logo/b1.png", alt: `Floor ${n}`, style: imgStyle, draggable: false }),

                    // ОБЛАСТЬ ДАННЫХ
                    (() => {
                      const r = rowsByFloor[n];
                      const visible = n <= revealedUpTo;
                      if (!visible) return null;

                      const hasData =
                        !!r &&
                        (
                          (r.nick && r.nick.trim()) ||
                          (r.addr && r.addr.trim()) ||
                          (r.choice && r.choice !== "—") ||
                          (Number(r.deposit) > 0) ||
                          (Number(r.payout) > 0)
                        );

                      const boxH = Math.max(40, Math.round(floorH * DATA_BOX_HEIGHT_RATIO));
                      const baseFS = Math.max(12, Math.round(boxH * 0.22));
                      const choiceFS = Math.max(18, Math.round(baseFS * 1.5));

                      // общий контейнер для пустого/непустого состояния
                      const makeContainerStyle = (extra = {}) => ({
                        position: "absolute",
                        left: DATA_LEFT, right: DATA_RIGHT,
                        top: DATA_TOP, transform: "translateY(-50%)",
                        height: boxH + "px",
                        background: PANEL_BG,
                        borderRadius: PANEL_RADIUS,
                        boxShadow: PANEL_INSET_SHADOW,
                        color: TEXT_COLOR,
                        pointerEvents: "none",
                        display: "grid",
                        alignContent: "center",
                        justifyItems: "center",
                        padding: "6px 10px",
                        overflow: "hidden",
                        ...extra,
                      });

                      if (!hasData) {
                        return h("div",
                          { style: makeContainerStyle() },
                          h("div", { style: { fontSize: baseFS + "px", fontWeight: 800 } }, "—")
                        );
                      }

                      const mine = isMe(r);
                      const nickRaw = r?.nick?.trim() || (r?.addr ? shortAddr(r.addr) : "");
                      const nick = mine ? `${nickRaw} (you)` : nickRaw;
                      const choice = (r?.choice || "—").toUpperCase();
                      const payout = Number(r?.payout || 0);
                      const rewardText = (payout > 0 ? "+" : "") + f5(payout) + " ETH";

                      // стили подсветки для "моего" этажа
                      const mineExtra = mine ? {
                        background: "linear-gradient(180deg, rgba(21,128,61,0.18), rgba(21,128,61,0.06) 70%)",
                        boxShadow:
                          "0 0 0 1px rgba(34,197,94,.35), 0 0 26px rgba(34,197,94,.20), inset 0 0 32px rgba(34,197,94,.12)",
                        border: "1px solid rgba(34,197,94,.35)",
                      } : null;

                      return h("div", { style: makeContainerStyle(mineExtra || {}) }, [
                        h("div", {
                          style: {
                            fontSize: baseFS + "px",
                            fontWeight: 800,
                            lineHeight: 1.05,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            textAlign: "center",
                            maxWidth: "100%",
                            textShadow: mine
                              ? "0 0 18px rgba(34,197,94,.30)"
                              : "0 0 18px rgba(56,189,248,0.28)",
                            color: mine ? "#cbf7d4" : TEXT_COLOR,
                          },
                        }, nick),

                        h("div", {
                          style: {
                            fontSize: choiceFS + "px",
                            fontWeight: 900,
                            lineHeight: 1.05,
                            textTransform: "uppercase",
                            letterSpacing: "0.5px",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            textAlign: "center",
                            maxWidth: "100%",
                            textShadow: mine
                              ? "0 0 22px rgba(34,197,94,.35)"
                              : "0 0 22px rgba(56,189,248,0.35)",
                            color: mine ? "#a7f3d0" : TEXT_COLOR,
                          },
                        }, choice),

                        h("div", {
                          style: {
                            fontSize: baseFS + "px",
                            fontWeight: 800,
                            lineHeight: 1.05,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            textAlign: "center",
                            maxWidth: "100%",
                            textShadow: mine
                              ? "0 0 18px rgba(34,197,94,.30)"
                              : "0 0 18px rgba(56,189,248,0.28)",
                            color: mine ? "#d1fae5" : TEXT_COLOR,
                          },
                        }, rewardText),
                      ]);
                    })(),
                  ]
                )
              ),

              // хвост
              h("div", { key: "bottom-spacer", style: { height: `${BOTTOM_SPACER_PX}px`, width: IMG_WIDTH, transform: `translateX(${TOWER_SHIFT_PX}px)` } }),

              // ЛИФТ (b2)
              h("img", {
                key: "overlay-b2",
                src: "/logo/b2.png",
                alt: "Elevator",
                style: {
                  width: IMG_WIDTH, height: "auto",
                  position: "absolute",
                  left: `calc(50% + ${TOWER_SHIFT_PX}px)`,
                  top: 0,
                  transform: `translate(-50%, ${offsetY}px)`,
                  transition: `transform ${TRANSITION_MS}ms ease-in-out`,
                  zIndex: 5, pointerEvents: "none",
                  filter: "drop-shadow(0 0 26px rgba(56,189,248,0.18))",
                },
                draggable: false,
              }),
            ]
          ),
        ]
      ),

      // Кнопка Pause / Play (fixed к контейнеру)
      h("div", { style: { position: "absolute", right: 18, bottom: 18, zIndex: 10 } },
        h("button", {
          onClick: () => setPaused((p) => !p),
          style: {
            position:"relative", display:"inline-flex", alignItems:"center", justifyContent:"center",
            minHeight:46, padding:"10px 14px", borderRadius:12,
            border:`1px solid rgba(31,41,55,0.9)`,
            background:`linear-gradient(to bottom, rgba(255,255,255,0.06), transparent 32%), linear-gradient(145deg, #1f2933, #020617)`,
            boxShadow:`0 0 0 1px rgba(15,23,42,0.9), 0 14px 30px rgba(0,0,0,0.75), 0 0 26px rgba(56,189,248,0.22)`,
            color:"#e5e7eb", fontWeight:800, letterSpacing:"0.06em", textTransform:"uppercase", cursor:"pointer",
            minWidth: 88, fontSize: 14
          },
        }, paused ? "Play" : "|| Pause")
      ),

      // Кнопка “Results table”
      showResultsBtn && h("div", { style: { position: "absolute", left: 18, bottom: 18, zIndex: 10 } },
        h("button", {
          onClick: () => onOpenResults && onOpenResults(),
          style: {
            position:"relative", display:"inline-flex", alignItems:"center", justifyContent:"center",
            minHeight:46, padding:"10px 14px", borderRadius:12,
            border:`1px solid rgba(31,41,55,0.9)`,
            background:`linear-gradient(to bottom, rgba(255,255,255,0.06), transparent 32%), linear-gradient(145deg, #1f2933, #020617)`,
            boxShadow:`0 0 0 1px rgba(15,23,42,0.9), 0 14px 30px rgba(0,0,0,0.75), 0 0 26px rgba(56,189,248,0.22)`,
            color:"#e5e7eb", fontWeight:800, letterSpacing:"0.06em", textTransform:"uppercase", cursor:"pointer",
            minWidth: 130, fontSize: 14
          },
        }, "To Results table")
      ),
    ]
  );
}

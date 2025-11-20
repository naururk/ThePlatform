// public/js/components/ResultsView.js
import React from "https://esm.sh/react@18.2.0";
const h = React.createElement;

const T = {
  border: "rgba(15, 23, 42, 1)",
  textMain: "#e5e7eb",
  concreteTop: "#1f2933",
  concreteBottom: "#020617",
  concreteBorderSoft: "rgba(31,41,55,0.9)",
};

function shortAddr(addr) {
  if (!addr || typeof addr !== "string") return "";
  const a = addr.startsWith("0x") ? addr.slice(2) : addr;
  return `0x${a.slice(0, 2)}…${addr.slice(-4).toLowerCase()}`;
}

/** Формат без округления: оставляет dec знаков после точки, лишнее отбрасывает */
function formatTrunc(n, dec = 4) {
  if (!Number.isFinite(n)) return dec === 4 ? "0.0000" : "0.00000";
  const f = 10 ** dec;
  // усечение (для отрицательных — к нулю)
  const t = n >= 0 ? Math.floor(n * f) : Math.ceil(n * f);
  return (t / f).toFixed(dec);
}

/**
 * Рендер результатов сезона (без JSX).
 * Ожидает:
 *  - rows: массив строк с полями {floor, nick, deposit, depositFull, choice, payout, payoutFull, addr, isMe}
 *  - seasonId: номер сезона
 *  - onClaim?: опциональный обработчик клика на кнопку Claim
 */
export default function ResultsView({ rows, seasonId, onClaim }) {
  const th = (t, w) =>
    h(
      "div",
      {
        style: {
          flex: w,
          fontSize: 12,
          opacity: 0.7,
          padding: "8px 10px",
          textAlign: "left",
        },
      },
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
    [th("Floor", 1.0), th("Nick", 1.7), th("Deposit", 1.6), th("Choice", 1.2), th("Payout", 1.6), th("Addr", 2.0)]
  );

  const row = (r, i) => {
    // ⬇️ было toFixed(4) — заменили на усечение без округления
    const depText = Number.isFinite(r.deposit) ? formatTrunc(r.deposit, 4) : "0.0000";
    const depTitle = r.depositFull || depText;
    const payoutText = Number.isFinite(r.payout) ? formatTrunc(r.payout, 4) : "0.0000";
    const payoutTitle = r.payoutFull || payoutText;

    const bg = r.isMe ? "rgba(34,197,94,.12)" : "transparent";
    const nickText = r.isMe && r.nick ? `${r.nick} (you)` : r.nick || "";

    return h(
      "div",
      {
        key: `r${i}`,
        style: {
          display: "flex",
          borderBottom: "1px solid rgba(20,32,54,.6)",
          background: bg,
        },
      },
      [
        td(`#${r.floor}`, 1.0),
        td(nickText, 1.7),
        td(depText, 1.6, { mono: true, crop: false, title: `${depTitle} ETH` }),
        td(r.choice || "—", 1.2),
        td(payoutText, 1.6, { mono: true, crop: false, title: `${payoutTitle} ETH` }),
        td(r.addr ? shortAddr(r.addr) : "…", 2.0, { mono: true, crop: true, title: r.addr || "" }),
      ]
    );
  };

  return h("div", { style: { height: "100%", overflow: "auto" } }, [
    h(
      "div",
      {
        style: {
          padding: "12px 14px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          justifyContent: "space-between",
        },
      },
      [
        h("div", { style: { display: "flex", alignItems: "center", gap: 10 } }, [
          h("div", { style: { fontSize: 20, fontWeight: 900 } }, `Season ${seasonId} results`),
        ]),
        h("div", { style: { textAlign: "right" } }, [
          h(
            "div",
            {
              style: {
                fontSize: 14,
                background: "#0d2a12",
                color: "#7ef29a",
                padding: "4px 8px",
                borderRadius: 10,
                display: "inline-block",
              },
            },
            `Your rewards: ${rows.__meReward || "0.00"} ETH`
          ),

          rows.__treasury != null &&
            rows.__nextPool != null && [
              h(
                "div",
                {
                  key: "t3",
                  style: { marginTop: 6, fontSize: 14, opacity: 0.8, textAlign: "right" },
                },
                `Pool: ${rows.__poolNet} ETH`
              ),
              h(
                "div",
                { key: "t1", style: { marginTop: 0, fontSize: 14, opacity: 0.8, textAlign: "right" } },
                `Treasury(1% of pool): ${rows.__treasury} ETH`
              ),
              h(
                "div",
                { key: "t2", style: { fontSize: 14, opacity: 0.8, textAlign: "right" } },
                `Next pool(1% of pool): ${rows.__nextPool} ETH`
              ),
            ],
        ]),
      ]
    ),
    h(
      "div",
      {
        style: {
          margin: "0 12px",
          border: `1px solid ${T.border}`,
          borderRadius: 12,
          overflow: "hidden",
        },
      },
      [head, ...(rows || []).map(row)]
    ),
  ]);
}

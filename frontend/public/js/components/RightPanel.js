// public/js/components/RightPanel.js
import React from "https://esm.sh/react@18.2.0";

const T = {
  border: "rgba(15, 23, 42, 1)",
  textMain: "#e5e7eb",
  textSubtle: "#9ca3af",
  glowPanel: "rgba(56,189,248,0.18)",
  concreteTop: "#1f2933",
  concreteBottom: "#020617",
  concreteBorderSoft: "rgba(31,41,55,0.9)",
};

// ====== базовые блоки ======
const panel = {
  border: `1px solid ${T.border}`,
  background: `radial-gradient(circle at top center, rgba(56,189,248,0.14) 0, rgba(15,23,42,0.98) 36%, #020617 70%)`,
  color: T.textMain,
  borderRadius: 18,
  textAlign: "center",
  padding: 16,
  boxShadow: `0 1px 0 rgba(15,23,42,0.9), 0 26px 60px rgba(0,0,0,0.9), 0 0 40px ${T.glowPanel}`,
};

const btnBase = (fs = 14) => ({
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
  fontSize: fs,
  transition:
    "transform 140ms ease, box-shadow 140ms ease, filter 140ms ease, background 140ms ease, color 140ms ease, opacity 140ms ease, outline-color 140ms ease",
});

const btn = (color, disabled) => ({
  ...btnBase(),
  background: disabled
    ? `linear-gradient(to bottom, rgba(255,255,255,0.03), transparent 32%), linear-gradient(145deg, ${T.concreteTop}, ${T.concreteBottom})`
    : color,
  opacity: disabled ? 0.6 : 1,
  cursor: disabled ? "not-allowed" : "pointer",
});

const btnNeutral = (disabled) => ({
  ...btnBase(),
  opacity: disabled ? 0.6 : 1,
  cursor: disabled ? "not-allowed" : "pointer",
});

// единый hover-эффект «как в образце»
const HOVER_STYLE = {
  transform: "translateY(-1px)",
  boxShadow:
    "0 0 0 1px rgba(15,23,42,1), 0 18px 40px rgba(0,0,0,0.85), 0 0 30px rgba(56,189,248,0.35)",
  filter: "brightness(1.06)",
};

function HoverBtn({ style, disabled, onClick, children }) {
  const [hover, setHover] = React.useState(false);
  const merged = {
    ...style,
    ...(hover && !disabled ? HOVER_STYLE : null),
  };
  return React.createElement(
    "button",
    {
      onClick,
      disabled,
      style: merged,
      onMouseEnter: () => setHover(true),
      onMouseLeave: () => setHover(false),
    },
    children
  );
}

const badge = {
  padding: "6px 10px",
  border: `1px solid ${T.concreteBorderSoft}`,
  borderRadius: 10,
  background: `linear-gradient(to bottom, rgba(255,255,255,0.03), transparent 32%), linear-gradient(145deg, ${T.concreteTop}, ${T.concreteBottom})`,
  color: "#c8d4f5",
  fontWeight: 700,
  whiteSpace: "nowrap",
};

export default function RightPanel(props) {
  const {
    seasonId,
    status,
    playersCount,
    myFloor,
    poolNetEth,
    me,
    setMe,
    isRegistered,
    joining = false,
    onJoin,
    onRefresh,
    seasonFull = false,
    maxPlayersLimit = 50,
    myRewardsEth = "0.00000",
    onClaimRewards = () => {},
    claimBusy = false,
  } = props;

  const STATUS_LABEL = {
    WAITING: "Registration in progress",
    RUNNING: "Processing…",
    DONE: "Season complete",
  };

  // ===== inline-таймер (перенесено из TimerPanel, цифры в 2 раза меньше)
  const [display, setDisplay] = React.useState("00:00:00");
  React.useEffect(() => {
    let raf = 0;
    let lastSec = -1;
    const tick = () => {
      const now = Date.now();
      const nextHour = new Date(now);
      nextHour.setMinutes(60, 0, 0);
      const remainingMs = Math.max(0, nextHour.getTime() - now);
      const totalSeconds = Math.floor(remainingMs / 1000);
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;
      if (seconds !== lastSec) {
        const pad = (n) => String(n).padStart(2, "0");
        setDisplay(`${pad(hours)}:${pad(minutes)}:${pad(seconds)}`);
        lastSec = seconds;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const timerBox = {
    border: `1px solid ${T.concreteBorderSoft}`,
    borderRadius: 12,
    padding: "6px 10px",
    background:
      "linear-gradient(to bottom, rgba(255,255,255,0.03), transparent 32%), linear-gradient(145deg, #141b24, #020617)",
    color: T.textMain,
    display: "grid",
    justifyItems: "end",
    gap: 2,
  };
  const timerHeading = {
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: "#7c8db5",
  };
  const timerDigits = {
    fontSize: 24, // было 48 → вдвое меньше
    lineHeight: 1,
    fontWeight: 900,
    letterSpacing: 1,
    textShadow: "0 0 10px rgba(94,164,255,.10)",
  };

  const inp = {
    width: "100%",
    padding: "12px 12px",
    borderRadius: 14,
    border: `1px solid ${T.concreteBorderSoft}`,
    background: "#0b1220",
    color: "#e5ecff",
    fontWeight: 800,
    outline: "none",
  };

  const inputsDisabled = isRegistered || status !== "WAITING";
  const joinDisabled =
    joining ||
    isRegistered ||
    status !== "WAITING" ||
    !me.nick.trim() ||
    !(me.deposit && /^\d*([.]\d{0,18})?$/.test(me.deposit)) ||
    me.choice === "NONE";

  const joinLabel =
    isRegistered ? "JOINED ✓" : status !== "WAITING" ? "SEASON IS NOT OPEN" : "JOIN SEASON";

  const onChangeNick = (e) => setMe({ ...me, nick: e.target.value });
  const onChangeDeposit = (e) => {
    const raw = e.target.value.replace(",", ".");
    if (/^\d*([.]\d{0,18})?$/.test(raw) || raw === "") {
      setMe({ ...me, deposit: raw });
    }
  };

  // ——— увеличенный размер кнопок выбора ———
  const CHOICE_SIZE = {
    padding: "28px 36px",
    borderRadius: 20,
    fontSize: 22,
    lineHeight: 1,
    minWidth: 160,
    letterSpacing: 0.5,
  };

  const CHOICE_ROW_STYLE = {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 14,
    alignItems: "stretch",
  };

  // кнопки выбора — без смены цвета при активации
  const ChoiceButton = (value, label) => {
    const active = me.choice === value;
    const disabled = inputsDisabled;
    const baseStyle = {
      ...btnBase(22),
      ...CHOICE_SIZE,
      width: "100%",
      outline: active ? "2px solid rgba(148,163,184,0.9)" : "none",
      boxShadow: active
        ? `0 0 0 1px rgba(15,23,42,1), 0 22px 46px rgba(0,0,0,0.98), 0 0 42px rgba(56,189,248,0.35)`
        : `0 0 0 1px rgba(15,23,42,0.9), 0 10px 22px rgba(0,0,0,0.7), 0 0 20px rgba(56,189,248,0.22)`,
      color: T.textMain,
      opacity: disabled ? 0.6 : 1,
      cursor: disabled ? "not-allowed" : "pointer",
    };

    return React.createElement(HoverBtn, {
      onClick: () => !disabled && setMe({ ...me, choice: value }),
      disabled,
      style: baseStyle,
      children: label,
    });
  };

  // ===== Header badges =====
  const header = React.createElement(
    "div",
    {
      style: {
        ...panel,
        padding: 12,
        display: "flex",
        gap: 10,
        alignItems: "center",
        flexWrap: "wrap",
      },
    },
    [
      React.createElement("span", { key: "s", style: badge }, `Season: ${String(seasonId || "—")}`),
      React.createElement("span", { key: "st", style: badge }, `Status: ${STATUS_LABEL[status] || status}`),
      React.createElement("span", { key: "p", style: badge }, `Players: ${playersCount}/${maxPlayersLimit}`),
      React.createElement("span", { key: "pool", style: badge }, `Pool: ${poolNetEth || "0.00000"} ETH`),
      React.createElement(
        HoverBtn,
        { key: "r", onClick: onRefresh, style: { ...btnNeutral(false), color: "#cfe0ff" } },
        "Refresh"
      ),
    ]
  );

  // ===== Gates =====
  const showFullGate = seasonFull && !isRegistered && status === "WAITING";
  const showRunningGate = !isRegistered && status === "RUNNING";
  const showDoneGate = !isRegistered && status === "DONE";

  if (showFullGate || showRunningGate || showDoneGate) {
    const title = showFullGate
      ? `Season ${seasonId} — all spots are taken!`
      : showRunningGate
      ? `Season ${seasonId} — session in progress.`
      : `Season ${seasonId} — complete!`;

    const body = showFullGate
      ? `We've reached the player cap (${playersCount}/${maxPlayersLimit}). Registration is temporarily closed. Please wait for the next season or for the admin to start this one.`
      : showRunningGate
      ? `This season is currently running. Registration is closed while the game is in progress. Please check back once results are published or when the next season opens.`
      : `This season has ended. Registration is closed. Please return when the next season opens.`;

    return React.createElement(
      "div",
      { style: { padding: "22px 20px", display: "grid", gap: 14 } },
      [
        // заголовок + таймер в одной строке
        React.createElement(
          "div",
          {
            key: "titleTimer",
            style: {
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            },
          },
          [
            React.createElement("div", { key: "t", style: { fontSize: 22, fontWeight: 900 } }, "Player • Registration"),
            React.createElement(
              "div",
              { key: "timer", style: timerBox },
              [
                React.createElement("div", { key: "h", style: timerHeading }, "Next season"),
                React.createElement("div", { key: "d", style: timerDigits }, display),
              ]
            ),
          ]
        ),
        header,
        React.createElement(
          "div",
          { key: "gate", style: { ...panel } },
          [
            React.createElement("div", { key: "h", style: { fontSize: 40, fontWeight: 900, marginBottom: 6 } }, title),
            React.createElement(
              "div",
              { key: "p", style: { fontSize: 18, opacity: 1, marginBottom: 10, lineHeight: 1.4 } },
              body
            ),
          ]
        ),
      ]
    );
  }

  // ===== Обычная форма регистрации + блок наград =====
  const claimDisabled = claimBusy || !Number(myRewardsEth) || Number(myRewardsEth) <= 0;

  return React.createElement(
    "div",
    { style: { padding: "22px 20px", display: "grid", gap: 14 } },
    [
      // заголовок + таймер в одной строке (таймер справа)
      React.createElement(
        "div",
        {
          key: "titleTimer",
          style: {
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          },
        },
        [
          React.createElement("div", { key: "t", style: { fontSize: 22, fontWeight: 900 } }, "Player • Registration"),
          React.createElement(
            "div",
            { key: "timer", style: timerBox },
            [
              React.createElement("div", { key: "h", style: timerHeading }, "Next season"),
              React.createElement("div", { key: "d", style: timerDigits }, display),
            ]
          ),
        ]
      ),

      header,

      // Rewards
      React.createElement(
        "div",
        {
          key: "rewards",
          style: {
            ...panel,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          },
        },
        [
          React.createElement(
            "div",
            { key: "l" },
            React.createElement("div", { style: { fontSize: 12, opacity: 0.8, marginBottom: 2 } }, "Your rewards (accumulated)"),
            React.createElement("div", { style: { fontSize: 20, fontWeight: 900 } }, `${myRewardsEth} ETH`)
          ),
          React.createElement(
            HoverBtn,
            { key: "c", onClick: onClaimRewards, disabled: claimDisabled, style: { ...btnNeutral(claimDisabled) } },
            claimBusy ? "Claiming…" : "Claim"
          ),
        ]
      ),

      React.createElement(
        "div",
        { key: "nick", style: panel },
        React.createElement(
          "div",
          { style: { fontSize: 12, fontWeight: 700, color: "#7c8db5", textTransform: "uppercase" } },
          "Nickname"
        ),
        React.createElement("input", {
          value: me.nick,
          onChange: onChangeNick,
          placeholder: "e.g. GreedyCat",
          style: inp,
          disabled: isRegistered || status !== "WAITING",
        })
      ),

      React.createElement(
        "div",
        { key: "dep", style: panel },
        React.createElement(
          "div",
          { style: { fontSize: 12, fontWeight: 700, color: "#7c8db5", textTransform: "uppercase" } },
          "Deposit (ETH)"
        ),
        React.createElement("input", {
          type: "text",
          inputMode: "decimal",
          value: me.deposit,
          onChange: onChangeDeposit,
          placeholder: "e.g. 0.001",
          style: inp,
          disabled: isRegistered || status !== "WAITING",
        })
      ),

      React.createElement(
        "div",
        { key: "choice", style: panel },
        React.createElement(
          "div",
          { style: { fontSize: 14, marginBottom: 8, fontWeight: 700, color: "#7c8db5", textTransform: "uppercase" } },
          "Your choice"
        ),
        React.createElement(
          "div",
          { style: CHOICE_ROW_STYLE },
          [
            ChoiceButton("GRAB", "GRAB(x3)"),
            ChoiceButton("SKIM", "SKIM(x1.25)"),
            ChoiceButton("HOLD", "HOLD"),
          ]
        )
      ),

      // JOIN
      React.createElement(
        HoverBtn,
        {
          key: "join",
          onClick: onJoin,
          disabled: joinDisabled,
          style: {
            ...btnNeutral(joinDisabled),
            color: joinDisabled ? "rgba(255,255,255,.6)" : "#e5e7eb",
            fontWeight: 900,
            fontSize: 20,
            textAlign: "center",
            width: "100%",
          },
        },
        joining ? "Joining…" : joinLabel
      ),

      React.createElement(
        "div",
        { key: "floor", style: { ...panel } },
        React.createElement(
          "div",
          { style: { display: "flex", alignItems: "center", justifyContent: "flex-start", gap: 12, flexWrap: "wrap" } },
          React.createElement("span", { style: badge }, `Your floor: ${myFloor ? `#${myFloor}` : "—"}`),
          React.createElement(
            "span",
            { style: { fontSize: 12, color: "#9db1e8", opacity: 0.85 } },
            "Your floor appears when the session starts and stays locked for this season."
          )
        )
      ),
    ]
  );
}

// public/js/components/TimerPanel.js
import React, { useEffect, useState } from "https://esm.sh/react@18.2.0";

const h = React.createElement;

const T = {
  border: "rgba(15, 23, 42, 1)",
  textMain: "#e5e7eb",
  glowPanel: "rgba(56,189,248,0.18)",
};

export default function TimerPanel({ title = "Next season starts in" }) {
  const [display, setDisplay] = useState("00:00:00");

  useEffect(() => {
    let raf = 0;
    let lastSec = -1;

    const tick = () => {
      const now = Date.now();
      const nextHour = new Date(now);
      nextHour.setMinutes(60, 0, 0); // к началу следующего часа

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

  const box = {
    marginTop: 12,
    padding: 16,
    borderRadius: 18,
    border: `1px solid ${T.border}`,
    background: `radial-gradient(circle at top center, rgba(56,189,248,0.14) 0, rgba(15,23,42,0.98) 36%, #020617 70%)`,
    color: T.textMain,
    display: "grid",
    gap: 10,
    alignItems: "center",
    justifyItems: "center",
    boxShadow: `0 1px 0 rgba(15,23,42,0.9), 0 26px 60px rgba(0,0,0,0.9), 0 0 40px ${T.glowPanel}`,
  };

  const heading = {
    fontSize: 12,
    fontWeight: 800,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: "#9ca3af",
  };

  const time = {
    fontSize: 48, // ← исходный размер
    lineHeight: 1,
    fontWeight: 900,
    letterSpacing: 2,
    color: "#e5ecff",
    textShadow: "0 0 14px rgba(94,164,255,.12)",
  };

  return h("div", { style: box }, [
    h("div", { key: "t", style: heading }, title),
    h("div", { key: "v", style: time }, display),
  ]);
}

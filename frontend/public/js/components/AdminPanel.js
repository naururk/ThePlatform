// public/js/components/AdminPanel.js
import React from "https://esm.sh/react@18.2.0";
import { BrowserProvider, formatEther, Interface } from "https://cdn.jsdelivr.net/npm/ethers@6.15.0/+esm";
import { loadRelayerSdk } from "../web3/relayer.js";
import { CONTRACT_ADDRESS, RELAYER_URL, GATEWAY_URL } from "../config.js";

const FLOORS = 50;

// ===== UI tokens =====
const T = {
  border: "rgba(15, 23, 42, 1)",
  concreteTop: "#1f2933",
  concreteBottom: "#020617",
  glowPanel: "rgba(56,189,248,0.18)",
  textMain: "#e5e7eb",
  textSubtle: "#9ca3af",
};

const panel = {
  padding: 16,
  borderRadius: 18,
  border: `1px solid ${T.border}`,
  background:
    `radial-gradient(circle at top center, rgba(56,189,248,0.14) 0, rgba(15,23,42,0.98) 36%, #020617 70%)`,
  color: T.textMain,
  boxShadow: `0 1px 0 rgba(15,23,42,0.9), 0 26px 60px rgba(0,0,0,0.9), 0 0 40px ${T.glowPanel}`,
};

const btnBase = {
  position: "relative",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  minHeight: 46,
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid transparent",
  background:
    `linear-gradient(to bottom, rgba(255,255,255,0.04), transparent 32%), ` +
    `linear-gradient(145deg, ${T.concreteTop}, ${T.concreteBottom})`,
  boxShadow: `0 10px 22px rgba(0,0,0,.55)`,
  color: T.textMain,
  fontWeight: 800,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  cursor: "pointer",
  fontSize: 14,
  outline: "none",
  userSelect: "none",
  transition: "box-shadow .18s ease, border-color .18s ease, background .18s ease, transform .08s ease",
};

const btnDisabled = {
  opacity: 0.38,
  cursor: "not-allowed",
  boxShadow: `0 8px 16px rgba(0,0,0,.45)`,
  borderColor: "transparent",
};

function HoverStyles() {
  const css = `
  [data-adminpanel] .ap-btn{border:1px solid transparent;outline:none!important;-webkit-tap-highlight-color:transparent;overflow:hidden;}
  [data-adminpanel] .ap-btn::before{content:"";position:absolute;inset:-1px;border-radius:inherit;pointer-events:none;background:radial-gradient(120% 180% at 50% -20%, rgba(94,164,255,.14), transparent 55%);opacity:0;transition:opacity .18s ease;}
  [data-adminpanel] .ap-btn:hover:not(:disabled){border-color:rgba(202,220,255,.95);box-shadow:0 0 0 1px rgba(202,220,255,.9),0 18px 36px rgba(0,0,0,.9),0 0 44px rgba(56,189,248,.35);background:linear-gradient(to bottom, rgba(255,255,255,0.07), transparent 40%),linear-gradient(145deg,#2a3642,#020617);transform:translateY(-1px);}
  [data-adminpanel] .ap-btn:hover:not(:disabled)::before{opacity:1;}
  [data-adminpanel] .ap-btn:focus,[data-adminpanel] .ap-btn:focus-visible,[data-adminpanel] .ap-btn:active{outline:none!important;border-color:transparent!important;box-shadow:0 10px 22px rgba(0,0,0,.55)!important;background:linear-gradient(to bottom, rgba(255,255,255,0.04), transparent 32%),linear-gradient(145deg, ${T.concreteTop}, ${T.concreteBottom})!important;transform:none!important;}
  [data-adminpanel] .ap-btn:disabled::before{opacity:0!important;}
  `;
  return React.createElement("style", { dangerouslySetInnerHTML: { __html: css } });
}

// ==== utils ====

// Универсальный picker из ответа релайера
function buildValuePicker(out, pairs) {
  let map = {};

  const cv = out && out.clearValues;
  if (cv) {
    if (Array.isArray(cv)) {
      pairs.forEach((p, i) => {
        const h = (p.handle || p).toLowerCase();
        map[h] = cv[i];
      });
    } else if (typeof cv === "object") {
      map = cv;
    }
  }

  if (!Object.keys(map).length && typeof out?.abiEncodedClearValues === "string") {
    const hex = out.abiEncodedClearValues.startsWith("0x")
      ? out.abiEncodedClearValues.slice(2)
      : out.abiEncodedClearValues;
    const words = [];
    for (let i = 0; i + 64 <= hex.length; i += 64) {
      const chunk = "0x" + hex.slice(i, i + 64);
      try { words.push(BigInt(chunk)); } catch { words.push(0n); }
    }
    pairs.forEach((p, i) => {
      const h = (p.handle || p).toLowerCase();
      map[h] = words[i] ?? 0n;
    });
  }

  if (!Object.keys(map).length) {
    if (Array.isArray(out)) {
      pairs.forEach((p, i) => { map[(p.handle || p).toLowerCase()] = out[i]; });
    } else if (out && typeof out === "object") {
      map = out;
    }
  }

  return (handle) => {
    if (!handle) return null;
    const k1 = String(handle), k2 = k1.toLowerCase();
    let val = map[k1] ?? map[k2];
    if (val == null) return null;
    try {
      if (typeof val === "bigint") return val;
      if (typeof val === "number") return BigInt(Math.floor(val));
      if (typeof val === "string") return val.startsWith("0x") ? BigInt(val) : BigInt(val);
      return BigInt(val.toString());
    } catch { return 0n; }
  };
}

function pickRelayerConfig(sdk) {
  const z = sdk?.ZamaEthereumConfig;
  if (z && z.Sepolia) return z.Sepolia;
  if (z && !z.Sepolia) return z;
  if (sdk?.SepoliaConfig) return sdk.SepoliaConfig;
  if (sdk?.NETWORK_CONFIG?.Sepolia) return sdk.NETWORK_CONFIG.Sepolia;
  return null;
}

export default function AdminPanel({ visible, contract, onRefresh }) {
  const [starting, setStarting] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [status, setStatus] = React.useState("");

  const [treasuryEth, setTreasuryEth] = React.useState("0.00000");
  const [treBusy, setTreBusy] = React.useState(false);

  const [canForceRepublish, setCanForceRepublish] = React.useState(false);
  const [forceRepublish, setForceRepublish] = React.useState(false);

  React.useEffect(() => { refreshTreasury().catch(() => {}); }, [contract, visible]);

  React.useEffect(() => {
    try {
      const ok = !!contract?.interface?.getFunction?.("republishResults(address[],uint8[],uint256[],uint256[],uint256,uint256,uint256)");
      setCanForceRepublish(Boolean(ok));
    } catch { setCanForceRepublish(false); }
  }, [contract]);

  async function refreshTreasury() {
    if (!visible || !contract) return;
    try {
      const t = await contract.treasuryPublic();
      setTreasuryEth(Number(formatEther(t || 0n)).toFixed(5));
    } catch {}
  }

  if (!visible) return null;

  // START → RUNNING
  async function startSession() {
    if (!contract) return alert("Contract not ready");
    try {
      setStarting(true);
      const tx = await contract.startSession();
      await tx.wait();
      onRefresh && onRefresh();
      alert("Session started (RUNNING)");
    } catch (e) {
      alert(e?.reason || e?.message || String(e));
    } finally {
      setStarting(false);
    }
  }

  async function buildResultsPayload() {
    if (!contract) throw new Error("Contract not ready");
    if (!window.ethereum) throw new Error("No wallet");

    const ZERO = "0x" + "0".repeat(64);

    setStatus("Reading session state…");
    const cs = await contract.currentSession();
    const sessionId = cs[0];
    const statusNum = Number(cs[1]);
    if (statusNum !== 1 && statusNum !== 2) throw new Error("Need RUNNING or DONE");

    // === НОВАЯ МОДЕЛЬ ОКОН ===
    // Игнорируем контрактные поля окна и задаём фиксированные локальные:
    // GRAB: 26 этажей → 52 полушага; SKIM: 50 этажей → 100 полушагов.
    let grab2 = 26 * 2;  // полушаги
    let skim2 = 50 * 2;  // полушаги

    // floors
    let floors = [];
    try {
      floors = await contract.getOccupiedFloors();
      floors = (floors || []).map((n) => Number(n));
    } catch {
      const provider = new BrowserProvider(window.ethereum);
      const iface = new Interface([
        "event FloorAssigned(uint64 indexed sessionId, address indexed player, uint32 floor)",
      ]);
      const latest = await provider.getBlockNumber();
      const MAX_SPAN = 9000;
      let toBlk = latest;
      const set = new Set();
      const topics = iface.encodeFilterTopics("FloorAssigned", [sessionId, null, null]);
      while (toBlk >= 0) {
        const fromBlk = Math.max(0, toBlk - MAX_SPAN);
        try {
          const logs = await provider.getLogs({ address: CONTRACT_ADDRESS, fromBlock: fromBlk, toBlock: toBlk, topics });
          for (const lg of logs) {
            try {
              const p = iface.parseLog(lg);
              if (Number(p.args.sessionId) === Number(sessionId)) set.add(Number(p.args.floor));
            } catch {}
          }
        } catch (e) {
          if (e?.code === -32603) {
            toBlk = Math.max(0, fromBlk - Math.ceil(MAX_SPAN / 3));
            continue;
          }
          throw e;
        }
        toBlk = fromBlk - 1;
      }
      floors = Array.from(set).sort((a, b) => a - b);
      if (!floors.length) {
        for (let f = 1; f <= FLOORS; f++) {
          const [depH, choiceH] = (await contract.getPlayerHandles(f)).slice(0, 2);
          if ((depH && depH !== ZERO) || (choiceH && choiceH !== ZERO)) floors.push(f);
        }
      }
    }
    if (!floors.length) throw new Error("No occupied floors");

    // handles per floor
    setStatus("Reading FHE handles…");
    const floorsData = [];
    for (const f of floors) {
      const [depH, choiceH] = (await contract.getPlayerHandles(f)).slice(0, 2);
      floorsData.push({ floor: f, depH, choiceH });
    }

    // relayer
    setStatus("Init relayer…");
    const provider = new BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();

    let relayer = window.tp?.relayer || null;
    if (!relayer) {
      const sdk = await loadRelayerSdk();
      const { initSDK, createInstance } = sdk || {};
      await initSDK();
      const picked = pickRelayerConfig(sdk);
      if (!picked) throw new Error("Relayer network config is missing");
      relayer = await createInstance({
        ...(picked || {}),
        relayerUrl: RELAYER_URL,
        gatewayUrl: GATEWAY_URL,
        network: window.ethereum,
        debug: true,
      });
      window.tp = Object.assign(window.tp || {}, { relayer, relayerSdk: sdk });
    }

    // decrypt (robust public → public(simple) → user)
    setStatus("Decrypting (public / fallback user)…");
    const pairs = [];
    const handlesOnly = [];
    for (const r of floorsData) {
      if (r.depH && r.depH !== ZERO) {
        pairs.push({ handle: r.depH, contractAddress: CONTRACT_ADDRESS });
        handlesOnly.push(r.depH);
      }
      if (r.choiceH && r.choiceH !== ZERO) {
        pairs.push({ handle: r.choiceH, contractAddress: CONTRACT_ADDRESS });
        handlesOnly.push(r.choiceH);
      }
    }

    let out;
    try {
      out = await relayer.publicDecrypt(pairs);
    } catch {
      try {
        out = await relayer.publicDecrypt(handlesOnly);
      } catch {
        const kp = await window.tp.relayerSdk.generateKeypair();
        const startTs = Math.floor(Date.now() / 1000).toString();
        const daysValid = "7";
        const eip = relayer.createEIP712(kp.publicKey, [CONTRACT_ADDRESS], startTs, daysValid);
        const sig = await signer.signTypedData(
          eip.domain,
          { UserDecryptRequestVerification: eip.types.UserDecryptRequestVerification },
          eip.message
        );
        const signerAddr = await signer.getAddress();
        out = await relayer.userDecrypt(
          pairs,
          kp.privateKey,
          kp.publicKey,
          sig.replace("0x", ""),
          [CONTRACT_ADDRESS],
          signerAddr,
          startTs,
          daysValid
        );
      }
    }

    const pickVal = buildValuePicker(out, pairs);

    // collect players
    const Choice = { NONE: 0, GRAB: 1, SKIM: 2, HOLD: 3 };
    const rows = [];
    let totalDeposits = 0n, holdDeposits = 0n;

    for (const r of floorsData) {
      const depVal = pickVal(r.depH);
      const chVal  = pickVal(r.choiceH);
      const depositWei = depVal ?? 0n;
      const choiceCode = chVal != null ? Number(chVal) : 0;
      totalDeposits += depositWei;
      if (choiceCode === Choice.HOLD) holdDeposits += depositWei;
      rows.push({ floor: r.floor, depositWei, choiceCode, addr: "" });
    }

    // resolve addresses
    setStatus("Resolving addresses…");
    {
      const iface = new Interface(["event FloorAssigned(uint64 indexed sessionId, address indexed player, uint32 floor)"]);
      const latest = await provider.getBlockNumber();
      const MAX_SPAN = 9000;
      let toBlk = latest;
      const map = {};
      const topics = iface.encodeFilterTopics("FloorAssigned", [sessionId, null, null]);
      while (toBlk >= 0 && Object.keys(map).length < floors.length) {
        const fromBlk = Math.max(0, toBlk - MAX_SPAN);
        try {
          const logs = await provider.getLogs({ address: CONTRACT_ADDRESS, fromBlock: fromBlk, toBlock: toBlk, topics });
          for (const lg of logs) {
            try {
              const p = iface.parseLog(lg);
              if (Number(p.args.sessionId) === Number(sessionId)) map[Number(p.args.floor)] = p.args.player;
            } catch {}
          }
        } catch (e) {
          if (e?.code === -32603) {
            toBlk = Math.max(0, fromBlk - Math.ceil(MAX_SPAN / 3));
            continue;
          }
          throw e;
        }
        toBlk = fromBlk - 1;
      }
      for (const r of rows) r.addr = map[r.floor] || "";
    }

    // compute payouts (депозиты + перенос из прошлого сезона)
    setStatus("Computing payouts…");

    // перенос (nextPool + remainder прошлого сезона)
    let carriedWei = 0n;
    try { carriedWei = await contract.carriedInPublic(); } catch { carriedWei = 0n; }

    // общая база сезона
    const baseWei = totalDeposits + carriedWei;

    // снимаем 2% с общей базы (1% казна, 1% в следующий сезон)
    let treasuryWei = baseWei / 100n; // 1%
    let nextPoolWei = baseWei / 100n; // 1%

    // net-пул для выплат этого сезона (98%)
    let pool = baseWei - treasuryWei - nextPoolWei;

    rows.sort((a, b) => a.floor - b.floor);
    const payoutsByAddr = new Map();

    for (const r of rows) {
      if (!r.addr) continue;

      let success = false, gross = 0n;

      if (r.choiceCode === Choice.GRAB) {
        // Успех, если текущий этаж попадает в окно (в полушагах)
        success = (r.floor * 2) <= grab2;
        if (success) {
          gross = r.depositWei * 3n;
          // успешный GRAB: окна уменьшаются на 1 этаж = 2 полушага
          grab2 = Math.max(0, grab2 - 2);
          skim2 = Math.max(0, skim2 - 2);
        }
      } else if (r.choiceCode === Choice.SKIM) {
        success = (r.floor * 2) <= skim2;
        if (success) {
          gross = (r.depositWei * 125n) / 100n;
          // успешный SKIM: окна уменьшаются на 0.5 этажа = 1 полушаг
          grab2 = Math.max(0, grab2 - 1);
          skim2 = Math.max(0, skim2 - 1);
        }
      }

      if (success) {
        const payout = gross <= pool ? gross : pool;
        if (payout > 0n) {
          payoutsByAddr.set(r.addr, (payoutsByAddr.get(r.addr) || 0n) + payout);
          pool -= payout;
        }
      }
    }

    if (pool > 0n && holdDeposits > 0n) {
      for (const r of rows) {
        if (!r.addr || r.choiceCode !== Choice.HOLD) continue;
        const share = (pool * r.depositWei) / holdDeposits;
        if (share > 0n) payoutsByAddr.set(r.addr, (payoutsByAddr.get(r.addr) || 0n) + share);
      }
      pool = 0n;
    }

    const addrs = [], choices = [], deposits = [], payouts = [];
    for (const r of rows) {
      if (!r.addr) continue;
      addrs.push(r.addr);
      choices.push(r.choiceCode);
      deposits.push(r.depositWei);
      payouts.push(payoutsByAddr.get(r.addr) || 0n);
    }

    const remainderWei = pool;

    console.table(rows.map(r => ({
      floor: r.floor, addr: r.addr || "—",
      dep_wei: r.depositWei.toString(),
      choice: r.choiceCode
    })));

    return { addrs, choices, deposits, payouts, treasuryWei, nextPoolWei, remainderWei };
  }

  async function publishResultsPayload(payload) {
    if (!contract) throw new Error("Contract not ready");
    const { addrs, choices, deposits, payouts, treasuryWei, nextPoolWei, remainderWei } = payload;

    setStatus(
      `Publishing ${addrs.length} entries • treasury ${formatEther(treasuryWei)} • nextPool ${formatEther(
        nextPoolWei
      )} • remainder ${formatEther(remainderWei)}…`
    );

    try {
      if (forceRepublish && canForceRepublish && contract.interface.getFunction) {
        const tx = await contract.republishResults(addrs, choices, deposits, payouts, treasuryWei, nextPoolWei, remainderWei);
        await tx.wait();
      } else {
        const tx = await contract.publishResults(addrs, choices, deposits, payouts, treasuryWei, nextPoolWei, remainderWei);
        await tx.wait();
      }
    } catch (e) {
      const reason = e?.reason || e?.shortMessage || e?.message || "";
      if (/already published/i.test(reason)) {
        throw new Error(
          canForceRepublish
            ? "already published — включи «Force republish (if available)» и повтори."
            : "already published — контракт не позволяет перезапись. Нужен метод republish или новый сезон."
        );
      }
      throw e;
    }
  }

  async function computeAndPublish() {
    try {
      setBusy(true);
      setStatus("Starting…");
      const payload = await buildResultsPayload();
      if (!payload.addrs.length) {
        setStatus("");
        alert("No players resolved — nothing to publish.");
        return;
      }
      await publishResultsPayload(payload);
      onRefresh && onRefresh();
      await refreshTreasury();
      setStatus("");
      alert(forceRepublish ? "Results force-republished ✓" : "Results computed & published ✓ (status: DONE)");
    } catch (e) {
      console.error(e);
      setStatus("");
      alert(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function startNextSeason() {
    if (!contract) return alert("Contract not ready");
    try {
      const cs = await contract.currentSession();
      const s = Number(cs[1]);
      if (s !== 2) return alert(`Cannot start: status is ${["WAITING", "RUNNING", "DONE"][s]}`);
      const tx = await contract.startNextSeason(0);
      await tx.wait();
      onRefresh && onRefresh();
      alert("New season started (WAITING)");
    } catch (e) {
      alert(e?.reason || e?.message || String(e));
    }
  }

  async function claimTreasuryAll() {
    if (!contract) return alert("Contract not ready");
    try {
      setTreBusy(true);
      const amt = await contract.treasuryPublic();
      if (amt <= 0n) {
        alert("Nothing to claim");
        return;
      }
      const tx = await contract.claimTreasury(amt);
      await tx.wait();
      await refreshTreasury();
      onRefresh && onRefresh();
      alert("Treasury claimed ✓");
    } catch (e) {
      alert(e?.reason || e?.message || String(e));
    } finally {
      setTreBusy(false);
    }
  }

  return React.createElement(
    "div",
    { "data-adminpanel": "1", style: { ...panel, marginTop: 12 } },
    React.createElement(HoverStyles, null),

    React.createElement("div", { style: { fontWeight: 900, marginBottom: 6, color: T.textMain } }, "Admin (owner only)"),

    React.createElement(
      "div",
      { style: { display: "grid", gap: 10, marginTop: 8 } },
      React.createElement("button", {
        className: "ap-btn",
        onClick: startSession,
        disabled: starting,
        style: { ...btnBase, ...(starting ? btnDisabled : null) }
      }, starting ? "Starting…" : "Run session → RUNNING")
    ),

    React.createElement(
      "div",
      { style: { display: "grid", gap: 10, marginTop: 12 } },
      React.createElement("div", { style: { fontSize: 12, color: T.textSubtle } },
        "One step: off-chain decrypt + payout calculation → publishResults (the contract sets DONE automatically)."
      ),
      (function () {
        try {
          const ok = !!contract?.interface?.getFunction?.("republishResults(address[],uint8[],uint256[],uint256[],uint256,uint256,uint256)");
          return ok && React.createElement(
            "label",
            { style: { display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: T.textSubtle } },
            React.createElement("input", {
              type: "checkbox",
              checked: forceRepublish,
              onChange: e => setForceRepublish(e.target.checked)
            }),
            "Force republish (if available)"
          );
        } catch { return null; }
      })(),
      React.createElement("button", {
        className: "ap-btn",
        onClick: computeAndPublish,
        disabled: busy,
        style: { ...btnBase, ...(busy ? btnDisabled : null) }
      }, busy ? "Working…" : "Compute & publish results (off-chain → on-chain)"),
      status && React.createElement("div", { style: { fontSize: 11, opacity: .75, marginTop: 4, whiteSpace: "pre-line" } }, status)
    ),

    React.createElement(
      "div",
      { style: { display: "grid", gap: 8, marginTop: 12, borderTop: `1px dashed ${T.border}`, paddingTop: 12 } },
      React.createElement("div", { style: { fontSize: 12, color: T.textSubtle } }, "Treasury (accumulated, ~1% of each pool)"),
      React.createElement("div", { style: { fontSize: 20, fontWeight: 900 } }, `${treasuryEth} ETH`),
      React.createElement(
        "div",
        { style: { display: "flex", gap: 8, flexWrap: "wrap" } },
        React.createElement("button", {
          className: "ap-btn",
          onClick: claimTreasuryAll,
          disabled: treBusy,
          style: { ...btnBase, ...(treBusy ? btnDisabled : null) }
        }, treBusy ? "Claiming…" : "Claim Treasury"),
        React.createElement("button", {
          className: "ap-btn",
          onClick: () => { refreshTreasury(); onRefresh && onRefresh(); },
          style: btnBase
        }, "Refresh")
      )
    ),

    React.createElement(
      "div",
      { style: { display: "grid", gap: 10, marginTop: 16 } },
      React.createElement("button", {
        className: "ap-btn",
        onClick: startNextSeason,
        style: btnBase
      }, "Start next season (WAITING)")
    ),
  );
}

import React, { useEffect, useRef, useState } from "https://esm.sh/react@18.2.0";
import { BrowserProvider, Contract, parseEther, formatEther, Interface } from "https://cdn.jsdelivr.net/npm/ethers@6.15.0/+esm";

import { CONTRACT_ADDRESS, CHAIN_ID, CHAIN_ID_HEX, RELAYER_URL, GATEWAY_URL } from "./config.js";
import { THE_PLATFORM_ABI } from "./web3/abi.js";
import { loadRelayerSdk } from "./web3/relayer.js";

// 3D/UI компоненты (без JSX)
import RightPanel from "./components/RightPanel.js";
import AdminPanel from "./components/AdminPanel.js";
import LeftPanel from "./components/LeftPanel.js";
import Profile from "./profile.js";
import History from "./history.js"; // ⬅️ NEW

// import TimerPanel from "./components/TimerPanel.js";

import { clamp } from "./engine/rng.js";

const h = React.createElement;

// ===== визуал =====
const FLOORS = 50;
// ===== демо-лимит игроков =====
const MAX_PLAYERS_LIMIT = 50;

const CHOICES = /** @type {const} */ (["NONE", "GRAB", "SKIM", "HOLD"]);

// ===== общие токены для «бетонных» кнопок в топбаре =====
const TTOP = {
  textMain: "#e5e7eb",
  concreteTop: "#1f2933",
  concreteBottom: "#020617",
  concreteBorderSoft: "rgba(31,41,55,0.9)",
  glowBtn: "rgba(56,189,248,0.22)",
};

const btnBaseTop = (fs = 14) => ({
  position: "relative",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  minHeight: 34,
  padding: "8px 12px",
  borderRadius: 12,
  border: `1px solid ${TTOP.concreteBorderSoft}`,
  background: `linear-gradient(to bottom, rgba(255,255,255,0.06), transparent 32%), linear-gradient(145deg, ${TTOP.concreteTop}, ${TTOP.concreteBottom})`,
  boxShadow: `0 0 0 1px rgba(15,23,42,0.9), 0 10px 22px rgba(0,0,0,0.7), 0 0 20px ${TTOP.glowBtn}`,
  color: TTOP.textMain,
  fontWeight: 800,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  cursor: "pointer",
  fontSize: fs,
  transition:
    "transform 140ms ease, box-shadow 140ms ease, filter 140ms ease, background 140ms ease, color 140ms ease, opacity 140ms ease, outline-color 140ms ease",
});

const btnNeutralTop = (disabled) => ({
  ...btnBaseTop(),
  opacity: disabled ? 0.6 : 1,
  cursor: disabled ? "not-allowed" : "pointer",
});

const badgeTop = {
  padding: "6px 10px",
  borderRadius: 10,
  border: `1px solid ${TTOP.concreteBorderSoft}`,
  background: `linear-gradient(to bottom, rgba(255,255,255,0.03), transparent 32%), linear-gradient(145deg, ${TTOP.concreteTop}, ${TTOP.concreteBottom})`,
  color: "#cfe0ff",
  fontWeight: 800,
  whiteSpace: "nowrap",
};

const HOVER_STYLE_TOP = {
  transform: "translateY(-1px)",
  boxShadow:
    "0 0 0 1px rgba(15,23,42,1), 0 14px 30px rgba(0,0,0,0.85), 0 0 26px rgba(56,189,248,0.35)",
  filter: "brightness(1.06)",
};

// универсальная кнопка с hover для топбара
function HoverBtnTop({ style, disabled, onClick, children }) {
  const [hover, setHover] = useState(false);
  const merged = { ...style, ...(hover && !disabled ? HOVER_STYLE_TOP : null) };
  return h(
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

// ===== логи =====
const tstamp = () => new Date().toISOString().replace("T", " ").replace("Z", "");
const log = {
  info: (...a) => console.log(`[%s]`, tstamp(), ...a),
  ok:   (...a) => console.log(`%c[${tstamp()}]`, "color:#4ade80", ...a),
  warn: (...a) => console.warn(`%c[${tstamp()}]`, "color:#fbbf24", ...a),
  err:  (...a) => console.error(`%c[${tstamp()}]`, "color:#f87171", ...a),
};

function selectorOf(e) {
  const data = e?.data ?? e?.error?.data ?? e?.error?.data?.originalError?.data;
  if (!data || typeof data !== "string" || !data.startsWith("0x") || data.length < 10) return null;
  return data.slice(0, 10);
}

export default function App() {
  // ---- user / session ----
  const [me, setMe] = useState({ address: null, nick: "", deposit: "", choice: "NONE", floor: null });

  const [session, setSession] = useState({
    id: "—",
    status: "WAITING",
    pool: 0,
    treasury: 0,
    nextPool: 0,
    successWindowGrab: 17,
    successWindowSkim: 40,
    holdStreak: Number(localStorage.getItem("holdStreak") || "0") || 0,
    claimed: false,
  });

  const [playersCountOnchain, setPlayersCountOnchain] = useState(0);

  // ---- визуал ----
  const [players, setPlayers] = useState([]);
  const [current, setCurrent] = useState(1);
  const [stopped, setStopped] = useState(false);
  const [towerY, setTowerY] = useState(0);
  const [mode, setMode] = useState("auto");
  const [running, setRunning] = useState(false);
  const [scrollY, setScrollY] = useState(0);
  const [choices] = useState(() => {
    const o = {};
    for (let i = 1; i <= FLOORS; i++) o[i] = "NONE";
    return o;
  });
  const [labels] = useState({});
  const [results] = useState({});
  const [fx] = useState([]);

  // ---- web3 / relayer ----
  const providerRef = useRef(null);
  const signerRef   = useRef(null);
  const contractRef = useRef(null);
  const historyApiRef = useRef(null); // ← для управления History из топбара
  const [isOwner, setIsOwner] = useState(false);
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);

  const [relayerState, setRelayerState] = useState({ relayer: null, sdk: null });

  // ленивый показ результатов
  const [showResults, setShowResults] = useState(false);
  const [resultsBusy, setResultsBusy] = useState(false);
  const [resultsStatus, setResultsStatus] = useState("");

  // «чистый» пул (минус 2%)
  const [poolNetEth, setPoolNetEth] = useState("0.00000");

  // профиль / история
  const [showProfile, setShowProfile] = useState(false);
  const [showHistory, setShowHistory] = useState(false); // ⬅️ NEW

  // NEW: суммарные (накопительные) награды игрока
  const [myRewardsEth, setMyRewardsEth] = useState("0.00000");
  const [claimBusy, setClaimBusy] = useState(false);

  // вычисляем флаг «сезон заполнен» (только пока WAITING)
  const seasonFull = session.status === "WAITING" && playersCountOnchain >= MAX_PLAYERS_LIMIT;

  function codeToChoice(n) {
    return n === 1 ? "GRAB" : n === 2 ? "SKIM" : n === 3 ? "HOLD" : "NONE";
  }

  async function hydratePlayerFromChain(addr) {
    const c = contractRef.current;
    if (!c || !addr) return { joined: false };
    let j = false;

    try {
      const r = await c.getPlayerPublic(addr);
      j = Boolean(r[0]);
      const f = Number(r[1] || 0);
      const nick = r[2] || "";
      setJoined(j);
      setMe((m) => ({ ...m, floor: f > 0 ? f : null, nick: m.nick?.trim() ? m.nick : nick || m.nick }));
      return { joined: j };
    } catch {}

    try {
      const rj = await c.joinedInCurrent(addr);
      j = Boolean(rj);
      setJoined(j);
    } catch {}
    try {
      const f = await c.playerFloor(addr);
      setMe((m) => ({ ...m, floor: Number(f || 0) || null }));
    } catch {}
    try {
      const onick = await c.nickOf(addr);
      setMe((m) => ({ ...m, nick: m.nick?.trim() ? m.nick : onick || m.nick }));
    } catch {}

    return { joined: j };
  }

  // ===== помощник: прочитать суммарные награды адреса =====
  async function refreshMyRewards() {
    const c = contractRef.current;
    const signer = signerRef.current;
    if (!c || !signer) { setMyRewardsEth("0.00000"); return; }
    try {
      const addr = await signer.getAddress();
      const v = await c.unclaimedTotal(addr);
      setMyRewardsEth(Number(formatEther(v||0n)).toFixed(5));
    } catch {
      setMyRewardsEth("0.00000");
    }
  }

  // ===== ядро расчёта результатов (общая функция) =====
  async function computeResultsCore() {
    const c    = contractRef.current;
    const prov = providerRef.current;
    if (!c || !prov) throw new Error("App not ready");

    // helpers
    const iface = new Interface(["event FloorAssigned(uint64 indexed sessionId, address indexed player, uint32 floor)"]);
    const MAX_SPAN = 9000;

    async function estimateFromBlockByTs(startTsSec) {
      const latest = await prov.getBlock("latest");
      const avg = 12;
      const diffSec = Math.max(0, Number(latest.timestamp) - Number(startTsSec));
      const approx = Math.floor(diffSec / avg) + 2000;
      return Math.max(0, Number(latest.number) - approx);
    }

    async function fetchFloorAddrsChunked(contractAddr, sid, fromBlk, toBlk) {
      const floorToAddr = {};
      const topics = iface.encodeFilterTopics("FloorAssigned", [sid, null, null]);

      let to = toBlk;
      while (to >= fromBlk) {
        const from = Math.max(fromBlk, to - MAX_SPAN);
        try {
          const logs = await prov.getLogs({ address: contractAddr, fromBlock: from, toBlock: to, topics });
          for (const lg of logs) {
            try {
              const p = iface.parseLog(lg);
              if (Number(p.args.sessionId) !== Number(sid)) continue;
              floorToAddr[ Number(p.args.floor) ] = p.args.player;
            } catch {}
          }
        } catch (e) {
          if (e?.code === -32603) {
            to = Math.max(from - 1, fromBlk);
            continue;
          }
          throw e;
        }
        to = from - 1;
      }
      return floorToAddr;
    }

    const [sid, statusRaw, , , , startTs] = await c.currentSession();
    if (Number(statusRaw) !== 2) throw new Error("Session is not DONE");

    const caddr  = (await c.getAddress?.()) || c.target;

    // 1) Занятые этажи
    let floors = [];
    try {
      floors = await c.getOccupiedFloors();
      floors = (floors || []).map((n) => Number(n));
    } catch {
      floors = Array.from({ length: FLOORS }, (_, i) => i + 1);
    }

    // 2) Адреса по событиям
    const latest   = await prov.getBlockNumber();
    const fromBlk  = await estimateFromBlockByTs(startTs);
    const floorToAddr = await fetchFloorAddrsChunked(caddr, sid, fromBlk, latest);

    // 3) Параллельные чтения
    const depositsP = floors.map((f) => c.depositPublicCurrent(f).catch(() => 0n));
    const choicesP  = floors.map((f) => c.choicePublicCurrent(f).catch(() => 0));
    const payoutsP  = floors.map((f) => c.payoutPublicCurrent(f).catch(() => 0n));
    const [deposArr, choiceArr, payoutArr] = await Promise.all([
      Promise.all(depositsP),
      Promise.all(choicesP),
      Promise.all(payoutsP),
    ]);

    // 4) Агрегаты (мой payout)
    let myAddr = null;
    try { myAddr = await signerRef.current?.getAddress?.(); } catch {}
    let myReward = "0.00";
    if (myAddr) {
      try { myReward = formatEther(await c.payoutPublic(Number(sid), myAddr)); } catch {}
    }

    // === БАЗА СЕЗОНА: ДЕПОЗИТЫ + CARRIED-IN ===
    const totalDeposWei = (deposArr || []).reduce((acc, v) => acc + (v || 0n), 0n);

    // перенос из прошлого сезона (nextPool + remainder), хранится в контракте
    let carriedWei = 0n;
    try { carriedWei = await c.carriedInPublic(); } catch { carriedWei = 0n; }

    const baseWei = totalDeposWei + carriedWei;

    // снимаем 2% с общей базы (1% казна, 1% в следующий сезон)
    const treasuryWei = baseWei / 100n;      // 1%
    const nextPoolWei = baseWei / 100n;      // 1%
    const poolNetWei  = baseWei - treasuryWei - nextPoolWei; // 98%

    // 5) ники
    const addrList  = floors.map((f) => floorToAddr[f] || "");
    const uniqAddrs = Array.from(new Set(addrList.filter(Boolean)));
    const nickMap = {};
    if (uniqAddrs.length) {
      const nickReads = uniqAddrs.map((a) =>
        c.nickOf(a).then((n) => (nickMap[a.toLowerCase()] = n)).catch(() => {})
      );
      await Promise.all(nickReads);
    }

    // 6) строки
    const rows = [];
    for (let i = 0; i < floors.length; i++) {
      const f = floors[i];
      const addr = floorToAddr[f] || "";
      const depStr = formatEther(deposArr[i] || 0n);
      const payStr = formatEther(payoutArr[i] || 0n);
      const code   = Number(choiceArr[i] || 0);
      const choiceText = code >= 0 && code <= 3 ? CHOICES[code] : "—";
      const nick = addr ? nickMap[addr.toLowerCase()] || "" : "";

      rows.push({
        floor: f,
        nick,
        deposit: Number(depStr || "0"),
        depositFull: depStr,
        choice: choiceText,
        payout: Number(payStr || "0"),
        payoutFull: payStr,
        addr,
        isMe: myAddr && addr && myAddr.toLowerCase() === addr.toLowerCase(),
      });
    }

    if (floors.length < FLOORS) {
      const present = new Set(floors);
      for (let f = 1; f <= FLOORS; f++) {
        if (present.has(f)) continue;
        rows.push({ floor:f, nick:"", deposit:0, depositFull:"0", choice:"—", payout:0, payoutFull:"0", addr:"", isMe:false });
      }
    }

    rows.sort((a,b)=>a.floor-b.floor);

    rows.__meReward = Number(myReward || "0").toFixed(5);
    rows.__treasury = Number(formatEther(treasuryWei) || "0").toFixed(5);
    rows.__nextPool = Number(formatEther(nextPoolWei)   || "0").toFixed(5);
    rows.__poolNet  = Number(formatEther(poolNetWei)    || "0").toFixed(5);

    return rows;
  }

  // ====== ленивый ончейн-результат («View results») — ОТКРЫВАЕТ таблицу ======
  async function computeAndShowResults() {
    if (resultsBusy) return;
    try {
      setResultsBusy(true);
      setResultsStatus("Loading on-chain results…");
      const rows = await computeResultsCore();
      setPlayers(rows);
      setShowResults(true);          // ← таблица
      setResultsStatus("");
    } catch (e) {
      console.error(e);
      alert(e?.message || "Failed to compute results");
    } finally {
      setResultsBusy(false);
    }
  }

  // ====== «тихо» для визуализации — НЕ открывает таблицу ======
  async function computeResultsForViz() {
    if (resultsBusy) return;
    try {
      setResultsBusy(true);
      const rows = await computeResultsCore();
      setPlayers(rows);              // только данные
    } catch (e) {
      console.warn("computeResultsForViz:", e?.message || e);
    } finally {
      setResultsBusy(false);
    }
  }

  // ===== текущий пул (перенос + 98% депозитов этого сезона) =====
  async function calcCurrentPoolNet() {
    try {
      const c = contractRef.current;
      const prov = providerRef.current;
      if (!c || !prov) return;

      const [sid] = await c.currentSession();
      const caddr = (await c.getAddress?.()) || c.target;

      // (1) Перенесённая сумма (carried-in) из контракта
      let carried = 0n;
      try {
        const v = await c.carriedInPublic();
        carried = BigInt(v || 0n);
      } catch {
        carried = 0n;
      }

      // (2) Находим блок, где создан текущий сезон
      const ifaceSC = new Interface(["event SeasonCreated(uint64 indexed sessionId)"]);
      const topicsSC = ifaceSC.encodeFilterTopics("SeasonCreated", [sid]);
      const scLogs = await prov.getLogs({ address: caddr, fromBlock: 0, toBlock: "latest", topics: topicsSC });
      const fromBlk = scLogs.length ? scLogs[scLogs.length - 1].blockNumber : 0;

      // (3) Все join этого сезона
      const ifaceJ = new Interface([
        "event Joined(address indexed player, uint64 indexed sessionId, bytes32 depositH, bytes32 choiceH, string nick)",
      ]);
      const topicsJ = ifaceJ.encodeFilterTopics("Joined", [null, sid]); // indexed: player, sessionId
      const jLogs = await prov.getLogs({ address: caddr, fromBlock: fromBlk, toBlock: "latest", topics: topicsJ });

      const txs = await Promise.all(jLogs.map((lg) => prov.getTransaction(lg.transactionHash).catch(() => null)));
      let totalWei = 0n;
      for (const tx of txs) if (tx?.value != null) totalWei += BigInt(tx.value);

      // (4) Net-пул = 98% от (депозиты + перенос)
      const baseWei = carried + totalWei;
      const netWei  = (baseWei * 98n) / 100n;
      setPoolNetEth(Number(formatEther(netWei)).toFixed(5));
    } catch (e) {
      console.warn("calcCurrentPoolNet failed:", e?.message || e);
    }
  }

  // ===== pending decrypt helpers =====
  async function prefillFromPendingEncrypted() {
    const c = contractRef.current;
    const relayer = relayerState.relayer;
    const sdk = relayerState.sdk;
    const signer = signerRef.current;
    if (!c || !relayer || !sdk || !signer) return;

    let depH, chH;
    try {
      const res = await c.getMyPendingHandles();
      depH = res[0];
      chH = res[1];
    } catch {
      return;
    }

    const ZERO = "0x" + "0".repeat(64);
    if ((!depH || depH === ZERO) && (!chH || chH === ZERO)) return;

    const keypair = await sdk.generateKeypair();
    const startTs = Math.floor(Date.now() / 1000).toString();
    const daysValid = "7";
    const eip = relayer.createEIP712(keypair.publicKey, [CONTRACT_ADDRESS], startTs, daysValid);
    const sig = await signer.signTypedData(
      eip.domain,
      { UserDecryptRequestVerification: eip.types.UserDecryptRequestVerification },
      eip.message
    );
    const account = await signer.getAddress();

    const pairs = [];
    if (depH && depH !== ZERO) pairs.push({ handle: depH, contractAddress: CONTRACT_ADDRESS });
    if (chH && chH !== ZERO) pairs.push({ handle: chH, contractAddress: CONTRACT_ADDRESS });

    try {
      const out = await relayer.userDecrypt(
        pairs,
        keypair.privateKey,
        keypair.publicKey,
        sig.replace("0x",""),
        [CONTRACT_ADDRESS],
        account,
        startTs,
        daysValid
      );
      const pick = (h)=>{ const k=Object.keys(out).find(k=>k.toLowerCase()===String(h).toLowerCase()); return k?out[k]:undefined; };
      const depVal = depH ? pick(depH) : undefined;
      const chVal  = chH ? pick(chH) : undefined;

      const update = {};
      if (depVal !== undefined) {
        try { update.deposit = formatEther(BigInt(depVal)); } catch { update.deposit = String(depVal); }
      }
      if (chVal !== undefined) {
        update.choice = codeToChoice(Number(chVal));
      }

      if (Object.keys(update).length) {
        setMe((m)=>({ ...m, ...update }));
        log.ok("Prefilled from pending:", update);
      }
    } catch (e) {
      log.warn("userDecrypt (pending) failed:", e);
    }
  }

  async function prefillFromHandlesFallback() {
    const c = contractRef.current;
    const relayer = relayerState.relayer;
    const sdk = relayerState.sdk;
    const signer = signerRef.current;
    if (!c || !relayer || !signer || !sdk) return;

    try {
      const addr   = await signer.getAddress();
      const pub    = await c.getPlayerPublic(addr);
      const joined = Boolean(pub[0]);
      const floor  = Number(pub[1] || 0);
      if (!joined || !floor) return;

      const [depH, choiceH] = (await c.getPlayerHandles(floor)).slice(0, 2);
      const ZERO = "0x" + "0".repeat(64);
      const pairs = [];
      if (depH    && depH    !== ZERO) pairs.push({ handle: depH,    contractAddress: CONTRACT_ADDRESS });
      if (choiceH && choiceH !== ZERO) pairs.push({ handle: choiceH, contractAddress: CONTRACT_ADDRESS });
      if (!pairs.length) return;

      let out;
      try {
        out = await relayer.publicDecrypt(pairs);
      } catch {
        const kp        = await sdk.generateKeypair();
        const startTs   = Math.floor(Date.now()/1000).toString();
        const daysValid = "7";
        const eip = relayer.createEIP712(kp.publicKey,[CONTRACT_ADDRESS],startTs,daysValid);
        const sig = await signer.signTypedData(
          eip.domain,
          { UserDecryptRequestVerification: eip.types.UserDecryptRequestVerification },
          eip.message
        );
        out = await relayer.userDecrypt(
          pairs,
          kp.privateKey,
          kp.publicKey,
          sig.replace("0x",""),
          [CONTRACT_ADDRESS],
          addr,
          startTs,
          daysValid
        );
      }

      const pick = (h)=>{ const k=Object.keys(out||{}).find(k=>k.toLowerCase()===String(h).toLowerCase()); return k?out[k]:undefined; };
      const depVal = depH ? pick(depH) : undefined;
      const chVal  = choiceH ? pick(choiceH) : undefined;

      const update = {};
      if (depVal !== undefined) {
        try { update.deposit = formatEther(BigInt(depVal)); } catch { update.deposit = String(depVal); }
      }
      if (chVal !== undefined) {
        const n = Number(chVal);
        update.choice = n === 1 ? "GRAB" : n === 2 ? "SKIM" : n === 3 ? "HOLD" : "NONE";
      }
      if (Object.keys(update).length) setMe((m)=>({ ...m, ...update }));
    } catch (e) {
      log.warn("prefillFromHandlesFallback failed:", e);
    }
  }

  // ===== refresh / connect / join =====
  async function refreshOnchain() {
    const c = contractRef.current;
    if (!c) return;
    try {
      const [id, statusRaw, pc, grab2, skim2] = await c.currentSession();
      const statusMap = ["WAITING", "RUNNING", "DONE"];
      const newStatus = statusMap[Number(statusRaw)];
      setSession((s) => ({
        ...s,
        id: String(id),
        status: newStatus,
        successWindowGrab: Math.floor(Number(grab2) / 2),
        successWindowSkim: Math.floor(Number(skim2) / 2),
      }));
      setPlayersCountOnchain(Number(pc));

      if (signerRef.current) {
        const addr = await signerRef.current.getAddress();
        await hydratePlayerFromChain(addr);
      }

      // ⬇️ авто-подтяжка скрытых данных (может попросить подпись)
      await prefillFromPendingEncrypted();
      await prefillFromHandlesFallback();

      if (newStatus === "DONE") setShowResults(false);

      const skeleton=[];
      for (let f=1; f<=FLOORS; f++)
        skeleton.push({ floor:f, nick:"", deposit:0, depositFull:"0", choice:"—", payout:0, payoutFull:"0", addr:"" });
      setPlayers(skeleton);

      await calcCurrentPoolNet();
      await refreshMyRewards();
    } catch (e) {
      log.warn("refreshOnchain failed:", e);
    }
  }

  async function refreshPlayerOnly() {
    const c = contractRef.current;
    if (!c) return;
    try {
      const [id, statusRaw, pc, grab2, skim2] = await c.currentSession();
      const statusMap = ["WAITING", "RUNNING", "DONE"];
      setSession((s) => ({
        ...s,
        id: String(id),
        status: statusMap[Number(statusRaw)],
        successWindowGrab: Math.floor(Number(grab2) / 2),
        successWindowSkim: Math.floor(Number(skim2) / 2),
      }));
      setPlayersCountOnchain(Number(pc));

      if (signerRef.current) {
        const addr = await signerRef.current.getAddress();
        await hydratePlayerFromChain(addr);
      }

      await prefillFromPendingEncrypted();
      await prefillFromHandlesFallback();

      await calcCurrentPoolNet();
      await refreshMyRewards();
    } catch (e) {
      log.warn("refreshPlayerOnly failed:", e);
    }
  }

  async function connectWallet() {
    log.info("[Connect wallet]");
    if (!window.ethereum) {
      alert("Please install MetaMask");
      return;
    }

    try {
      window.ethereum?.removeAllListeners?.("accountsChanged");
      window.ethereum?.removeAllListeners?.("chainChanged");
      window.ethereum?.on?.("accountsChanged", () => location.reload());
      window.ethereum?.on?.("chainChanged",   () => location.reload());
    } catch {}

    const provider = new BrowserProvider(window.ethereum);
    providerRef.current = provider;

    await provider.send("eth_requestAccounts", []);
    const net1 = await provider.getNetwork();
    if (net1.chainId !== CHAIN_ID) {
      await provider.send("wallet_switchEthereumChain", [{ chainId: CHAIN_ID_HEX }]);
    }

    const signer = await provider.getSigner();
    signerRef.current = signer;
    const addr = await signer.getAddress();

    const contract = new Contract(CONTRACT_ADDRESS, THE_PLATFORM_ABI, signer);
    contractRef.current = contract;

    try {
      const owner = await contract.owner();
      setIsOwner(owner.toLowerCase() === addr.toLowerCase());
    } catch { setIsOwner(false); }

    setMe((m) => ({ ...m, address: addr }));
    localStorage.setItem("tp_last_addr", addr);

    try {
      const sdk = await loadRelayerSdk();
      const { initSDK, createInstance, SepoliaConfig, generateKeypair } = sdk;
      await initSDK();
      const relayer = await createInstance({
        ...SepoliaConfig,
        relayerUrl: RELAYER_URL,
        gatewayUrl: GATEWAY_URL,
        network: window.ethereum,
        debug: true,
      });
      setRelayerState({ relayer, sdk });

      window.tp = {
        provider, signer, contract, relayer,
        get contractAddress(){ return contract.target || CONTRACT_ADDRESS; },
      };
      log.ok("[TP] debug attached -> window.tp:", { provider:true, signer:true, contract:true, relayer:true });
    } catch (e) {
      console.error(e);
      alert("Failed to initialize FHE Relayer SDK.");
    }

    await refreshOnchain();
    await calcCurrentPoolNet();
    await refreshMyRewards();
  }

  function disconnectWallet() {
    providerRef.current = null;
    signerRef.current   = null;
    contractRef.current = null;
    setIsOwner(false);
    setJoined(false);
    setRelayerState({ relayer: null, sdk: null });
    setShowProfile(false);
    setShowHistory(false); // ⬅️ NEW
    setMe({ address: null, nick: "", deposit: "", choice: "NONE", floor: null });
    setMyRewardsEth("0.00000");
  }

  // автоконнект по сохраненному адресу
  useEffect(()=>{ const last=localStorage.getItem("tp_last_addr"); if (last && window.ethereum) connectWallet().catch(()=>{}); }, []);

  // как только relayer/подписант/контракт готовы — пробуем сразу расшифровать (без кнопки Refresh)
  useEffect(() => {
    (async () => {
      if (relayerState.relayer && signerRef.current && contractRef.current) {
        try {
          await prefillFromPendingEncrypted();
          await prefillFromHandlesFallback();
        } catch {}
      }
    })();
  }, [relayerState]);

  async function tryStaticJoin(contract, args, valueWei) {
    try { await contract.join.staticCall(...args,{ value:valueWei }); log.ok("staticCall.join ✓"); return true; }
    catch(e){ const sel = selectorOf(e); log.warn("callStatic.join reverted", e, "selector:", sel || "(n/a)"); return false; }
  }

  async function doJoinOnce() {
    try {
      const contract = contractRef.current;
      const signer   = signerRef.current;
      const relayer  = relayerState.relayer;
      if (!contract || !signer) throw new Error("Connect wallet first");
      if (!relayer)             throw new Error("Relayer is not ready yet");
      if (session.status !== "WAITING") throw new Error("Season is not open");

      // ⬇️ Блокируем, если сезон заполнен
      if (playersCountOnchain >= MAX_PLAYERS_LIMIT) {
        throw new Error("Season is full — wait for the next one");
      }

      if (!me.nick?.trim()) throw new Error("Enter nickname");
      if (me.choice === "NONE") throw new Error("Choose GRAB / SKIM / HOLD");

      const addrSend = await signer.getAddress();
      try {
        const r = await contract.getPlayerPublic(addrSend);
        if (Boolean(r[0])) { setJoined(true); throw new Error("Already joined"); }
      } catch {}

      const v = (me.deposit || "").trim().replace(",", "."),
            valueWei = parseEther(v || "0");
      if (valueWei <= 0n) throw new Error("Enter positive deposit");

      const buf = relayer.createEncryptedInput(CONTRACT_ADDRESS, addrSend);
      buf.add64(valueWei);
      buf.add8(me.choice === "GRAB" ? 1 : me.choice === "SKIM" ? 2 : me.choice === "HOLD" ? 3 : 0);
      const { handles, inputProof } = await buf.encrypt();

      const args = [me.nick, handles[0], handles[1], inputProof];
      const okStatic = await tryStaticJoin(contract, args, valueWei);
      if (!okStatic) throw new Error("Join reverted in static call.");

      const tx = await contract.join(...args, { value: valueWei });
      await tx.wait();
      await refreshOnchain();
      await calcCurrentPoolNet();
      await refreshMyRewards();
      setJoined(true);
      alert("Joined ✓");
    } catch (e) {
      alert(e?.message || "Join failed");
    }
  }

  async function handleJoinOnchain(){ setJoining(true); try{ await doJoinOnce(); } finally{ setJoining(false);} }

  // NEW: Claim rewards (вся накопленная сумма)
  async function handleClaimRewards() {
    const c = contractRef.current;
    if (!c) return;
    try {
      setClaimBusy(true);
      const addr = await signerRef.current.getAddress();
      const v = await c.unclaimedTotal(addr);
      if (v <= 0n) { alert("Nothing to claim"); return; }
      const tx = await c.claimUnclaimed();
      await tx.wait();
      await refreshMyRewards();
      alert("Rewards claimed ✓");
    } catch (e) {
      alert(e?.reason || e?.message || String(e));
    } finally {
      setClaimBusy(false);
    }
  }

  // ========= ВИЗУАЛКА =========
  const targetYRef = useRef(0);
  const yRef = useRef(0);
  const stopEndRef = useRef(null);

  useEffect(()=>{ targetYRef.current = -((1.1 + 0.35) * (current - 1)); },[]);
  useEffect(()=>{
    let raf=0;
    const loop=()=>{
      const now=performance.now()/1000;
      if (mode==="free"){
        yRef.current = clamp(scrollY, -((1.1 + 0.35) * (50 - 1)), 0);
        setTowerY(yRef.current);
      } else {
        if (stopEndRef.current && now < stopEndRef.current) {
          setStopped(true); setTowerY(yRef.current);
          raf = requestAnimationFrame(loop); return;
        }
        if (stopEndRef.current && now >= stopEndRef.current && running) {
          setStopped(false); stopEndRef.current=null;
          if (current < 50) { const next=current+1; setCurrent(next); targetYRef.current = -((1.1 + 0.35) * (next - 1)); }
        }
        if (running) {
          yRef.current += (targetYRef.current - yRef.current) * 0.1;
          if (!stopEndRef.current && Math.abs(yRef.current - targetYRef.current) < 0.002) {
            stopEndRef.current = now + 2; setStopped(true);
          }
          setTowerY(yRef.current);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return ()=>cancelAnimationFrame(raf);
  },[mode,running,current,scrollY]);

  const onWheel = (e) => {
    if (running){ e.preventDefault(); return; }
    setMode("free");
    setScrollY((y) => clamp(y - e.deltaY * 0.01, -((1.1 + 0.35) * (50 - 1)), 0));
  };

  // ———— LEFT PANE ————
  const leftPane = h(LeftPanel, {
    status: session.status,
    seasonId: session.id,
    showResults,
    resultsStatus,
    resultsBusy,
    onViewResults: computeAndShowResults,     // таблица
    onFetchResultsSilent: computeResultsForViz, // ← для визуализации
    rows: players,
    towerProps: { current, stopped, towerY, choices, labels, results, effects: fx },
  });

  // ———— UI ————
  const topBar = h(
    "div",
    {
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "8px 12px",
        borderBottom: "1px solid #142036",
        background: "#0a1222",
      },
    },
    [
      h("div", { style: { display: "flex", gap: 14, alignItems: "center" } }, [
        h("div", { style: { fontWeight: 900 } }, "The Platform"),
        h("div", { style: { fontSize: 12, opacity: 0.7 } }, "FHEVM • Sepolia"),
        h("div", { style: { fontSize: 12, opacity: 0.7 } }, `Contract: ${CONTRACT_ADDRESS.slice(0, 6)}…${CONTRACT_ADDRESS.slice(-4)}`),
        me.address && h(HoverBtnTop, {
          style: { ...btnNeutralTop(false) },
          onClick: () => {
            // всегда открываем экран истории
            setShowProfile(false);
            setShowHistory(true);
            // если уже открыта история, вернуть в список сезонов
            try { historyApiRef.current?.goToPicker?.(); } catch {}
          },
          children: "Seasons History",
        }),
      ]),
      h(
        "div",
        { style: { display: "flex", gap: 8, alignItems: "center" } },
        me.address
          ? [
              // Profile
              (() => {
                const hasNick = Boolean(me.nick && me.nick.trim());
                const enabled = hasNick;
                const label = `Profile: ${hasNick ? me.nick.trim() : "-"}`;
                return h(HoverBtnTop, {
                  onClick: () => { if (enabled){ setShowHistory(false); setShowProfile(true);} },
                  disabled: !enabled,
                  style: { ...btnNeutralTop(!enabled) },
                  children: label,
                });
              })(),
              
              // Address badge (owner without green)
              h(
                "div",
                { style: badgeTop },
                [
                  `${me.address.slice(0, 6)}…${me.address.slice(-4)} `,
                  isOwner && h("span", { style: { opacity: 0.85, marginLeft: 4 } }, "(owner)"),
                ]
              ),
              // Disconnect
              h(HoverBtnTop, {
                onClick: () => { setShowProfile(false); setShowHistory(false); disconnectWallet(); },
                style: { ...btnNeutralTop(false) },
                children: "Disconnect",
              }),
            ]
          : [
              // Connect
              h(HoverBtnTop, {
                onClick: () => { setShowProfile(false); setShowHistory(false); connectWallet(); },
                style: { ...btnNeutralTop(false) },
                children: "Connect",
              }),
            ]
      ),
    ]
  );

  const rightPane = h("div", { style: { width: "100%", overflow: "auto" } }, [
    showProfile
      ? h(Profile, {
          me,
          onBack: () => setShowProfile(false),
        })
      : showHistory
        ? h(History, {
            onBack: () => setShowHistory(false),
            // ← позовёт setHistoryApi и даст нам метод goToPicker
            bindApi: (api) => (historyApiRef.current = api),
          })
        : h(RightPanel, {
            seasonId: session.id,
            status: session.status,
            playersCount: playersCountOnchain,
            poolNetEth,
            myFloor: me.floor,
            me: { address: me.address, nick: me.nick, deposit: me.deposit, choice: me.choice, floor: me.floor },
            setMe,
            isRegistered: joined,
            joining,
            seasonFull,
            maxPlayersLimit: MAX_PLAYERS_LIMIT,
            // NEW:
            myRewardsEth,
            onClaimRewards: handleClaimRewards,
            claimBusy,
            onJoin: async () => { await handleJoinOnchain(); },
            onRefresh: async () => { await refreshPlayerOnly(); },
          }),

    !showProfile && !showHistory && h("div", { style: { padding: "0 20px 20px" } },
      h(AdminPanel, { visible: isOwner, contract: contractRef.current, onRefresh: async () => { await refreshOnchain(); await refreshMyRewards(); } })
    ),

  ]);

  const bodyGrid = h(
    "div",
    { style: { display: "grid", gridTemplateColumns: "minmax(340px,32vw) 1fr", height: "calc(100vh - 46px)" } },
    [h("div", { onWheel, style: { width: "100%", borderRight: "1px solid #142036", overflow: "hidden" } }, leftPane), rightPane]
  );

  return h("div", { style: { height: "100vh", width: "100vw", background: "#060a16", color: "#e5ecff", display: "grid", gridTemplateRows: "46px 1fr" } }, [topBar, bodyGrid]);
}

# The Platform — an FHE‑encrypted social experiment (Sepolia, FHEVM)

A game & social experiment about greed, risk, and trust. **Deposit** ETH → make a **blind choice** (**GRAB / SKIM / HOLD**) → watch the **tower** resolve floor by floor. Choices and deposits stay private during registration thanks to **Fully Homomorphic Encryption (FHE)** on **FHEVM**, and are revealed for result computation only after the session starts/finishes.

<img width="1194" height="628" alt="image" src="https://github.com/user-attachments/assets/4958276b-f546-41c9-b1a6-fe3108b22b2c" />

---

## Table of contents

* [Concept](#concept)
* [How winnings are calculated](#how-winnings-are-calculated)

  * [Lifecycle](#lifecycle)
  * [Success windows](#success-windows)
  * [Payout math](#payout-math)
* [Interface & usage](#interface--usage)

  * [Landing](#landing)
  * [Top bar](#top-bar)
  * [Right panel — Registration & Rewards](#right-panel--registration--rewards)
  * [Left panel — Visualization & Results](#left-panel--visualization--results)
  * [Profile](#profile)
  * [Seasons History](#seasons-history)
  * [Admin panel](#admin-panel)
* [Architecture](#architecture)
* [Tech stack](#tech-stack)
* [Why FHE](#why-fhe)
* [Project structure](#project-structure)
* [Configuration](#configuration)
* [Run locally](#run-locally)
* [Security & privacy notes](#security--privacy-notes)
* [Limitations / known issues](#limitations--known-issues)
* [Judging checklist](#judging-checklist)
* [License](#license)

---

## Concept

* **FHE‑encrypted game mechanics** on Sepolia using an FHEVM‑compatible contract.
* Players join a **season**, deposit ETH, and pick a hidden action. Floors (1..50) are assigned randomly and the platform resolves from floor **1 → 50**.
* The twist: during **WAITING** (registration) players’ **deposit** and **choice** are encrypted on‑chain. They become publicly decryptable for result calculation only after the session transitions to **RUNNING/DONE**.

This is *intentionally* a **game / social experiment**—testing patience vs. greed under partial information.

---

## How winnings are calculated

### Lifecycle

1. **WAITING** — registration is open. Players call `join(nick, encDeposit, encChoice, proof)` and send ETH. Data is encrypted via Relayer SDK and stored as FHE handles.
2. **RUNNING** — owner starts the session. Floors are randomly assigned and materialized. Encrypted values become publicly decryptable for off‑chain processing.
3. **DONE** — results are computed off‑chain and **published on‑chain** via `publishResults(...)` (or `PayoutsPublished`/`ResultsPublished` events).

### Success windows

* There are **50 floors**. Each floor has a chance window for **GRAB** and **SKIM**:

  * **Initial windows:** **GRAB ≤ 26**, **SKIM ≤ 50** (expressed as half‑steps on‑chain).
  * **After each successful event:**

    * successful **GRAB** → **both** windows decrease by **1.0** floor
    * successful **SKIM** → **both** windows decrease by **0.5** floor

### Payout math

Let `deposit` be a player’s deposit.

* **GRAB** (if within GRAB window): gross = `3 × deposit` (capped by current pool).
* **SKIM** (if within SKIM window): gross = `1.25 × deposit` (capped by current pool).
* **HOLD**: after floor 50, if any pool **remainder** exists, it is split **pro‑rata** among HOLD deposits. If no remainder, no HOLD payouts.

**Fees & carry:** From the season’s **base** (sum of this season’s deposits + **carried-in** from previous season) the contract takes **2%** upfront:

* **1%** to **Treasury** (accumulates across seasons, owner‑claimable)
* **1%** to **Next pool** (seed for the next season)
* The remaining **98%** is the **net pool** used for payouts in this season.

**Carry between seasons:** At `startNextSeason` the contract moves `nextPoolPublic + remainderToCarryPublic` to the new season as `carriedInPublic`.

---

## Interface & usage

### Landing

* Connect your wallet (MetaMask or any EVM wallet). The dApp enforces **Sepolia**.
* If not on Sepolia, the app requests a network switch.

### Top bar

* Shows app name, network, short contract address.
* Buttons: **Seasons History**, **Profile** (enabled once nick is set), **Connect/Disconnect**.

### Right panel — Registration & Rewards

* **Status badges**: Season ID, Status (WAITING/RUNNING/DONE), Players count, Pool (net 98%).
* **Nickname** input (required to enable Profile).
* **Deposit (ETH)** input.
* **Choice** buttons: GRAB / SKIM / HOLD.
* **Join** (enabled only in WAITING, when nick/deposit/choice are valid). Joining encrypts your deposit & choice via Relayer SDK and submits on‑chain.
* **Your rewards (accumulated)** + **Claim** button to withdraw your unclaimed payouts across seasons.

### Left panel — Visualization & Results

* While a season is **DONE**, you can open the **Platform visualization**: a tower animation reveals each floor (1..50) with nick/choice/payout once results are available.
* The **Results table** lists Floor, Nick, Deposit, Choice, Payout, Address. Your row is highlighted.

### Profile

* Personal summary: **Nick**, **Address**, **Total rewards**.
* **Season history** for your address (previous seasons only), with a table of:

  * Season, Floor, Deposit, Choice, Reward.
* **Pagination:** **10 rows per page** (like in Seasons History).

### Seasons History

* Season picker shows all **past** seasons (excludes current) with **pagination: 10 seasons per page**.
* “View results” opens the Results table for that season.
* Above the table, a compact **Pool / Treasury / Next pool** summary (based on deposits + carried‑in minus 2%).

### Admin panel

> Visible only to the **owner**.

* **Run session → RUNNING**: assigns floors and opens decryptability for off‑chain processing.
* **Compute & publish results**: the dApp decrypts public FHE handles via the Relayer, computes payouts off‑chain, and calls `publishResults(...)`.
* **Treasury**: view accumulated 1% and **Claim Treasury**.
* **Start next season (WAITING)**: closes the old season, carries `nextPool + remainder` into the new season and resets state.

---

## Architecture

**High‑level flow:**

1. **Frontend (SPA, ES Modules)** collects inputs and encrypts them with **Zama Relayer SDK** → submits FHE handles to the contract via `join(...)`.
2. **Smart contract (FHEVM‑compatible)** stores encrypted handles during **WAITING** and exposes public getters for decryption after **RUNNING** begins.
3. **Relayer** provides:

   * `createEncryptedInput(...)` for client‑side encryption
   * `publicDecrypt(...)` (and `userDecrypt` fallback) once the session allows it
4. **Off‑chain compute** (inside Admin panel) aggregates deposits, applies **success window** rules and payout math, then calls `publishResults(...)` with per‑player deposits/choices/payouts plus global **treasury / next pool / remainder**.
5. **On‑chain state** becomes the single source of truth for **claims** and **history**.

**Data privacy model:** deposits & choices are hidden during **WAITING**; only FHE handles are on‑chain. Clear values are revealed for computation **after** RUNNING/DONE via public decrypt.

---

## Tech stack

* **Solidity / FHEVM‑compatible contract**
* **Zama Relayer SDK** (browser, CDN) for client‑side FHE encryption & public decrypt
* **Ethers v6** for RPC, events, and publishing results
* **Pure ES Modules** (no build step), React 18 (via ESM) for UI
* **MetaMask / EVM wallets** on **Sepolia**

---

## Why FHE

* **Private commitments**: deposits and choices remain confidential during registration, preventing copy‑cat or sniping strategies.
* **Fair resolution**: only after the session starts, the game reveals clear values to compute payouts.
* **On‑chain verifiability**: final results (including per‑player payouts and global accounting) are published on‑chain.

---

## Project structure

```
public/
  index.html                 # Entry (no build system, pure ES modules)
  css/app.css                # Minor global styles used by App.js
  logo/                      # Logo & tower images (b1.png, b2.png)
  js/
    App.js                   # Main SPA logic (wallet connect, relayer init, views)
    config.js                # Single source of network/contract/relayer config
    web3/
      abi.js                 # Contract ABI (view/mutation/events)
      relayer.js             # Robust CDN loader for Zama Relayer SDK
    components/
      RightPanel.js          # Registration form, rewards, badges, claim
      LeftPanel.js           # Visualization gate & results flow
      ResultsView.js         # Reusable results table (floor/nick/deposit/choice/payout)
      AdminPanel.js          # Owner tools: start, compute & publish, treasury, next season
      Tower.js               # Floor‑by‑floor tower visualization
    profile.js               # Profile page (10‑row pagination)
    history.js               # Seasons History (10 per page) + season table
    engine/
      rng.js                 # Helper RNG utilities (UI/demo only)
      sim.js                 # Local visualization math (UI/demo only)
```

> `rng.js` and `sim.js` are **helper modules for visuals/demo** only. They do **not** affect on‑chain logic.

---

## Configuration

All key settings live in **`public/js/config.js`**:

```js
export const CONTRACT_ADDRESS = "0x9010265316777018900556E6BE523786733f2bf2"; // ← set your deployed contract
export const CHAIN_ID        = 11155111n;  // Sepolia (BigInt)
export const CHAIN_ID_HEX    = "0xaa36a7";
export const RELAYER_URL     = "https://relayer.testnet.zama.org";
export const GATEWAY_URL     = "https://gateway.testnet.zama.org";
```

* **CONTRACT_ADDRESS**: your deployed `ThePlatformFHE` address on Sepolia.
* **RELAYER_URL / GATEWAY_URL**: Zama relayer endpoints. `relayer.js` tries multiple CDNs and a local fallback.
* Optionally you can override these via `window.__APP_CONFIG__` **before** the app mounts (e.g. injected by your hosting). If you don’t need runtime overrides, keep `config.js` as is.

---

## Run locally

No bundler. The app uses native browser ES modules.

1. Serve the `public/` folder with any static server (CORS‑friendly):

   ```bash
   npx http-server public -p 5173 --cors
   # or python3 -m http.server 5173 --directory public
   ```
2. Open `http://localhost:5173`.
3. Have **MetaMask** installed and switch to **Sepolia**.
4. Connect wallet, set a nickname, enter a deposit, choose **GRAB/SKIM/HOLD**, and **Join** while status is **WAITING**.

> Owner‑only: use **Admin panel** to start the session, compute & publish results, claim treasury, and start the next season.

---

## Security & privacy notes

* During **WAITING**, deposits and choices are stored as **FHE ciphertext handles**. The app uses Zama’s **Relayer SDK** to encrypt inputs and later decrypt **publicly** once the session allows it.
* Off‑chain computation is transparent: results are published on‑chain via `publishResults(...)` with per‑player deposit, choice code, and payout, plus global **treasury / next pool / remainder** fields.
* Claims use `claimUnclaimed()` (aggregate) or `claim(sessionId, amount)`.

---

## Limitations / known issues

* The visualization (tower) is a UI layer; it does not influence payouts.
* Public decrypt availability depends on Relayer configuration; in restricted setups, an owner may need user‑authorized decrypt for some handles.
* Gas/provider rate limits can affect log scans (chunked queries are implemented to mitigate).

---

## Judging checklist

* **Deployed & working** on Sepolia (connect, join with encrypted inputs, compute & publish results, claim).
* **Clear FHE story**: encrypted inputs during WAITING, public decrypt only after RUNNING/DONE, on‑chain publishing of final results.
* **Innovation & gameplay**: success‑window mechanic with dynamic shrink (GRAB −1.0, SKIM −0.5) and three strategies (GRAB/SKIM/HOLD).
* **UX & performance**: no‑build SPA, responsive UI, results table & history with pagination, profile view.
* **Security & transparency**: auditable on‑chain outputs; treasury/next‑pool/remainder accounting; claimable rewards.
* **Documentation**: this README explains rules, architecture, tech stack, setup, and review steps.
* **Reproducibility**: run locally with a static server; config is in a single file.

> Reviewer quick‑path: open app → connect MetaMask on Sepolia → set nick + deposit + choice → join (WAITING) → owner starts RUNNING → compute & publish → check results/history → claim rewards.

---

## License

MIT

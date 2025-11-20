# The Platform — an FHE‑encrypted social experiment (Sepolia, FHEVM)

A game & social experiment about greed, risk, and trust. **Deposit** ETH → make a **blind choice** (**GRAB / SKIM / HOLD**) → watch the **tower** resolve floor by floor. Choices and deposits stay private during registration thanks to **Fully Homomorphic Encryption (FHE)** on **FHEVM**, and are revealed for result computation only after the session starts/finishes.

<img width="1464" height="730" alt="image" src="https://github.com/user-attachments/assets/0d583897-bbee-4838-8681-6413f80c4edd" />

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
* [Project structure](#project-structure)
* [Configuration](#configuration)
* [Run locally](#run-locally)
* [Security & privacy notes](#security--privacy-notes)
* [Limitations / known issues](#limitations--known-issues)
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

  * Initial windows: **GRAB ≤ 17**, **SKIM ≤ 40** (in half‑steps on‑chain).
  * Each *successful* GRAB reduces GRAB window by **0.5**; each *successful* SKIM reduces SKIM window by **0.5**.

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

<img width="1279" height="718" alt="image" src="https://github.com/user-attachments/assets/2e4bdc34-8578-4b2e-b3de-a1b2dc43ffdd" />


### Left panel — Visualization & Results

* While a season is **DONE**, you can open the **Platform visualization**: a tower animation reveals each floor (1..50) with nick/choice/payout once results are available.
* The **Results table** lists Floor, Nick, Deposit, Choice, Payout, Address. Your row is highlighted.

<img width="589" height="571" alt="image" src="https://github.com/user-attachments/assets/c11b4c22-aaa5-4525-be59-ba36c55e31d7" />
<img width="582" height="558" alt="image" src="https://github.com/user-attachments/assets/d0c6bb61-bbf0-474c-9e04-e4a2b14700ea" />

### Profile

* Personal summary: **Nick**, **Address**, **Total rewards**.
* **Season history** for your address (previous seasons only), with a table of:

  * Season, Floor, Deposit, Choice, Reward.
* **Pagination:** **10 rows per page** (like in Seasons History).

<img width="1300" height="785" alt="image" src="https://github.com/user-attachments/assets/c8ed5d9e-c48c-4886-95c1-cb7413994886" />


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

<img width="1263" height="436" alt="image" src="https://github.com/user-attachments/assets/7aa804b6-689a-4db0-8c4b-1ebcc023688a" />

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

## License

MIT


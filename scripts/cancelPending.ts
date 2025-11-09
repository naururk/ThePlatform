// scripts/cancelPending.ts
// Speed-up (replacement) OR cancel a pending tx by sending a 0-value tx
// to self with the SAME nonce and a higher fee.
//
// Usage:
//   npx hardhat run scripts/cancelPending.ts --network sepolia
//   # опционально можно передать хэш через CLI:
//   npx hardhat run scripts/cancelPending.ts --network sepolia 0xYOUR_TX_HASH
//   # или через env: CANCEL_TX=0xYOUR_TX_HASH npx hardhat run ...
//
// По умолчанию берём последний известный хэш из лога:
import { ethers } from "hardhat";
import type { BigNumber, BigNumberish } from "ethers";

const DEFAULT_TX_HASH =
  "0xefe1bbc33bcd3a16ba4cc1f96bbf231b1899a40abf6a484ea1a414d57fa3cf1a";

function BN(x?: BigNumberish | null, fallback?: BigNumberish): ethers.BigNumber {
  const { BigNumber } = ethers;
  if (x == null) {
    if (fallback == null) throw new Error("No value and no fallback for BN()");
    return BigNumber.from(fallback);
  }
  try {
    return BigNumber.from(x as any);
  } catch {
    // На случай, если прилетит bigint
    if (typeof x === "bigint") return BigNumber.from(x.toString());
    if (fallback !== undefined) return BigNumber.from(fallback);
    throw new Error(`Cannot BigNumber.from(${String(x)})`);
  }
}

function toGwei(v: BigNumber) {
  return Number(ethers.utils.formatUnits(v, "gwei")).toFixed(3);
}

function isUnderpriced(e: any): boolean {
  const msg = (e?.error?.message || e?.message || String(e)).toLowerCase();
  return (
    msg.includes("replacement transaction underpriced") ||
    msg.includes("replacement fee too low") ||
    msg.includes("transaction underpriced") ||
    e?.code === "REPLACEMENT_UNDERPRICED" ||
    e?.error?.code === -32000
  );
}

async function main() {
  const [signer] = await ethers.getSigners();
  const me = await signer.getAddress();

  const hash = process.env.CANCEL_TX ?? process.argv[2] ?? DEFAULT_TX_HASH;
  const pending = await ethers.provider.getTransaction(hash);
  if (!pending) throw new Error(`Tx not found by hash: ${hash}`);
  if (pending.blockNumber != null) {
    console.log("Tx already mined, nothing to do.");
    return;
  }
  if (pending.from.toLowerCase() !== me.toLowerCase()) {
    throw new Error(`Tx sender ${pending.from} != your signer ${me}`);
  }

  // Определяем формат комиссии: legacy (gasPrice) или EIP-1559 (maxFee/maxPriority)
  const is1559 = pending.maxFeePerGas != null || pending.maxPriorityFeePerGas != null;
  const feeData = await ethers.provider.getFeeData();

  const maxAttempts = 8;
  let attempt = 0;

  if (!is1559) {
    // LEGACY replacement: повышаем gasPrice
    let gasPrice = BN(
      pending.gasPrice,
      feeData.gasPrice ?? ethers.utils.parseUnits("10", "gwei")
    )
      .mul(13)
      .div(10); // +30%

    while (true) {
      attempt++;
      console.log(
        `Attempt #${attempt} LEGACY cancel: gasPrice=${toGwei(gasPrice)} gwei, nonce=${pending.nonce}`
      );
      try {
        const tx = await signer.sendTransaction({
          to: me,
          value: 0,
          nonce: pending.nonce, // тот же nonce!
          gasLimit: 21000,
          gasPrice, // legacy поле
        });
        console.log("cancel sent:", tx.hash);
        await tx.wait();
        console.log("✅ canceled / replaced. Nonce freed:", pending.nonce);
        break;
      } catch (e: any) {
        if (isUnderpriced(e) && attempt < maxAttempts) {
          const fresh = BN((await ethers.provider.getFeeData()).gasPrice, gasPrice);
          // Возьмём максимум из старого/рыночного и ещё на 30% вверх
          gasPrice = (gasPrice.gt(fresh) ? gasPrice : fresh).mul(13).div(10);
          console.log(
            `(bump) underpriced → gasPrice -> ${toGwei(gasPrice)} gwei, retrying...`
          );
          continue;
        }
        console.error("❌ send failed:", e);
        throw e;
      }
    }
  } else {
    // EIP-1559 replacement: повышаем maxFeePerGas и maxPriorityFeePerGas
    let baseFee = BN(feeData.lastBaseFeePerGas ?? 0);
    let maxPrio = BN(
      pending.maxPriorityFeePerGas,
      feeData.maxPriorityFeePerGas ?? ethers.utils.parseUnits("2", "gwei")
    );
    let maxFee = BN(
      pending.maxFeePerGas,
      baseFee.mul(2).add(maxPrio) // минимум
    );

    // Первичный bump
    maxPrio = maxPrio.mul(13).div(10);
    maxFee = maxFee.mul(13).div(10);
    let minFee = baseFee.mul(2).add(maxPrio);
    if (maxFee.lt(minFee)) maxFee = minFee;

    while (true) {
      attempt++;
      console.log(
        `Attempt #${attempt} 1559 cancel: maxFee=${toGwei(maxFee)} gwei, priority=${toGwei(
          maxPrio
        )} gwei, nonce=${pending.nonce}`
      );
      try {
        const tx = await signer.sendTransaction({
          to: me,
          value: 0,
          nonce: pending.nonce,
          gasLimit: 21000,
          type: 2,
          maxFeePerGas: maxFee,
          maxPriorityFeePerGas: maxPrio,
        });
        console.log("cancel sent:", tx.hash);
        await tx.wait();
        console.log("✅ canceled / replaced. Nonce freed:", pending.nonce);
        break;
      } catch (e: any) {
        if (isUnderpriced(e) && attempt < maxAttempts) {
          const fresh = await ethers.provider.getFeeData();
          baseFee = BN(fresh.lastBaseFeePerGas ?? baseFee);
          maxPrio = maxPrio.mul(13).div(10);
          maxFee = maxFee.mul(13).div(10);
          minFee = baseFee.mul(2).add(maxPrio);
          if (maxFee.lt(minFee)) maxFee = minFee;
          console.log(
            `(bump) underpriced → maxFee=${toGwei(maxFee)} gwei, priority=${toGwei(
              maxPrio
            )} gwei, retrying...`
          );
          continue;
        }
        console.error("❌ send failed:", e);
        throw e;
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

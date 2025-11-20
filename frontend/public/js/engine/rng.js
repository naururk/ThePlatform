// public/js/engine/rng.js
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function strSeed(s) {
  let h = (2166136261 >>> 0);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function shuffle(arr, rnd) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function pseudoAddr(rnd) {
  return "0x" + Array.from({ length: 40 }, () => Math.floor(rnd() * 16).toString(16)).join("");
}

export function randomNick(rnd) {
  const A = ["Swift","Silent","Greedy","Bold","Lucky","Foxy","Icy","Neon","Misty","Quantum","Pixel","Velvet","Carbon","Ruby","Nova","Turbo","Aero","Omega","Crypto","Meta"];
  const B = ["Cat","Wolf","Bear","Shark","Eagle","Panda","Otter","Lynx","Mantis","Falcon","Whale","Tiger","Koala","Viper","Hawk","Moose","Raven","Cobra","Yak","Mole"];
  return A[Math.floor(rnd() * A.length)] + B[Math.floor(rnd() * B.length)] + Math.floor(rnd() * 999);
}

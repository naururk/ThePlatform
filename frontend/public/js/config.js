// public/js/config.js
export const CONTRACT_ADDRESS = "0x9010265316777018900556E6BE523786733f2bf2";
export const CHAIN_ID        = 11155111n;
export const CHAIN_ID_HEX    = "0xaa36a7";

// ✅ всегда используем прокси на текущем домене
const ORIGIN =
  typeof window !== "undefined" && window.location ? window.location.origin : "";

export const RELAYER_URL = ORIGIN ? `${ORIGIN}/relayer` : "https://relayer.testnet.zama.org";
export const GATEWAY_URL = ORIGIN ? `${ORIGIN}/gateway` : "https://gateway.testnet.zama.org";

// relayer.js
//Lightweight ESM loader for Zama Relayer SDK with robust fallbacks.
// Важно: используем browser-ESM файл "relayer-sdk-js.js" (НЕ .esm.js),
// т.к. он корректно отдаётся с нужными CORS-заголовками.

const CDN_TRIES = [
  // 1) официальный CDN Zama (основной)
  "https://cdn.zama.org/relayer-sdk-js/0.3.0-5/relayer-sdk-js.js",
  // 2) jsDelivr (иногда 404 на старых путях — оставляем на всякий случай)
  "https://cdn.jsdelivr.net/npm/@zama-fhe/relayer-sdk@0.2.0/dist/relayer-sdk-js.js",
  // 3) unpkg (у некоторых пользователей ловит CORS — используем как запасной)
  "https://unpkg.com/@zama-fhe/relayer-sdk@0.2.0/dist/relayer-sdk-js.js",
];

// Локальный файл (если положишь копию в проект — будет last resort)
const LOCAL_FALLBACK = "/vendor/relayer-sdk-js.js";

async function tryImport(url) {
  // Браузерный ESM импорт с CORS — для модулей обязателен.
  return import(/* @vite-ignore */ url);
}

export async function loadRelayerSdk() {
  let lastErr = null;
  for (const url of CDN_TRIES) {
    try {
      const mod = await tryImport(url);
      return mod;
    } catch (e) {
      lastErr = e;
      // eslint-disable-next-line no-console
      console.warn("[RelayerLoader] failed:", url, e?.message || e);
    }
  }
  try {
    const mod = await tryImport(LOCAL_FALLBACK);
    return mod;
  } catch (e) {
    throw new Error("Relayer SDK failed to load: " + String(lastErr || e));
  }
}

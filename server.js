// server.js
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import os from "os";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// === ENV ===
dotenv.config({ path: path.resolve(__dirname, ".env") });
const PORT = Number(process.env.PORT || 3022);
const HOST = process.env.HOST || "0.0.0.0"; // важно: 0.0.0.0 = слушать на всех интерфейсах

// === PATHS ===
const publicDir = path.join(__dirname, "frontend", "public");
const indexHtmlPath = path.join(publicDir, "index.html");
if (!fs.existsSync(indexHtmlPath)) {
  throw new Error(`index.html not found at ${indexHtmlPath}`);
}
console.log("[DEBUG] index.html found at:", indexHtmlPath);

// === APP ===
const app = express();
app.use(cors());

// COOP/COEP нужны для Relayer SDK/WASM/воркеров
app.use((req, res, next) => {
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  next();
});

// Раздача статики
app.use(express.static(publicDir));

// SPA fallback — любые пути отдаем index.html
app.use((req, res) => {
  res.sendFile(indexHtmlPath);
});

// Утилита: получить список LAN-адресов
function getLANAddresses() {
  const ifaces = os.networkInterfaces();
  const addrs = [];
  for (const name of Object.keys(ifaces)) {
    for (const info of ifaces[name] || []) {
      if (info.family === "IPv4" && !info.internal) {
        addrs.push(info.address);
      }
    }
  }
  return addrs;
}

// START
app.listen(PORT, HOST, () => {
  const lan = getLANAddresses();
  console.log("🚀 Server is up:");
  console.log(`   Local:   http://localhost:${PORT}/`);
  for (const a of lan) {
    console.log(`   LAN:     http://${a}:${PORT}/`);
  }
  console.log(`   Host:    ${HOST}`);
});

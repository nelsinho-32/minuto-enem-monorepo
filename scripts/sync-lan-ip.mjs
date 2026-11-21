#!/usr/bin/env node
/**
 * Sincroniza automaticamente o IPv4 ativo na rede local (Wi-Fi / Ethernet)
 * no arquivo apps/web/.env para que Expo Go e navegadores na LAN encontrem a API
 * na porta 3333 sem edição manual a cada troca de rede.
 *
 * Uso:
 *   node scripts/sync-lan-ip.mjs          -> detecta e grava EXPO_PUBLIC_API_URL
 *   node scripts/sync-lan-ip.mjs --clear  -> remove override fixo (ideal p/ --tunnel ou auto-detecção)
 *   node scripts/sync-lan-ip.mjs --print  -> apenas exibe o IP detectado sem alterar arquivos
 */

import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB_ENV_PATH = path.resolve(__dirname, "../apps/web/.env");
const API_PORT = Number(process.env.API_PORT || 3333);

const args = new Set(process.argv.slice(2));
const isClear = args.has("--clear");
const isPrintOnly = args.has("--print");

function isVirtualInterfaceName(name) {
  const lower = name.toLowerCase();
  return (
    lower.includes("vethernet") ||
    lower.includes("docker") ||
    lower.includes("wsl") ||
    lower.includes("vmware") ||
    lower.includes("virtualbox") ||
    lower.includes("vbox") ||
    lower.includes("hyper-v") ||
    lower.includes("loopback") ||
    lower.includes("tailscale") ||
    lower.includes("hamachi")
  );
}

function getInterfacePriority(name, address) {
  const lower = name.toLowerCase();
  let score = 0;

  if (lower.includes("wi-fi") || lower.includes("wifi") || lower.includes("wlan")) {
    score += 50;
  } else if (lower.includes("ethernet") || lower.includes("en0") || lower.includes("eth0")) {
    score += 40;
  }

  if (isVirtualInterfaceName(name)) {
    score -= 100;
  }

  if (address.startsWith("192.168.")) score += 20;
  else if (address.startsWith("10.")) score += 15;
  else if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(address)) score -= 5;

  return score;
}

export function detectBestLanIp() {
  const interfaces = os.networkInterfaces();
  const candidates = [];

  for (const [name, list] of Object.entries(interfaces)) {
    for (const iface of list || []) {
      const family = String(iface.family);
      if (
        (family === "IPv4" || family === "4") &&
        !iface.internal &&
        !iface.address.startsWith("169.254.")
      ) {
        candidates.push({
          name,
          address: iface.address,
          priority: getInterfacePriority(name, iface.address),
        });
      }
    }
  }

  candidates.sort((a, b) => b.priority - a.priority);
  return candidates[0] || null;
}

function updateWebEnvFile(nextUrl) {
  const existingLines = fs.existsSync(WEB_ENV_PATH)
    ? fs.readFileSync(WEB_ENV_PATH, "utf-8").split(/\r?\n/)
    : ["# Configuração automática da URL da API do Minuto ENEM"];

  const filtered = existingLines.filter(
    (line) => !line.trim().startsWith("EXPO_PUBLIC_API_URL=")
  );

  while (filtered.length > 0 && filtered[filtered.length - 1].trim() === "") {
    filtered.pop();
  }

  if (nextUrl) {
    filtered.push(`EXPO_PUBLIC_API_URL=${nextUrl}`);
  } else {
    filtered.push("# EXPO_PUBLIC_API_URL= (auto-detecção ativa pelo app)");
  }

  fs.writeFileSync(WEB_ENV_PATH, filtered.join("\n") + "\n", "utf-8");
}

function main() {
  if (isClear) {
    updateWebEnvFile(null);
    console.log(
      "🧹 [sync-lan-ip] EXPO_PUBLIC_API_URL fixo removido de apps/web/.env (auto-detecção ativa)."
    );
    return;
  }

  const best = detectBestLanIp();
  if (!best) {
    console.warn(
      "⚠️ [sync-lan-ip] Nenhum IP IPv4 de rede local encontrado. Mantendo fallback localhost."
    );
    return;
  }

  const targetUrl = `http://${best.address}:${API_PORT}`;
  if (isPrintOnly) {
    console.log(targetUrl);
    return;
  }

  updateWebEnvFile(targetUrl);
  console.log(
    `🌐 [sync-lan-ip] Rede detectada (${best.name}): ${targetUrl} gravado em apps/web/.env`
  );
}

main();

/**
 * CipherGift event indexer — viem poller + Hono HTTP server.
 *
 * Boot: reads RPC + contract addresses + start block from env, replays
 * logs into an in-memory store, then exposes a JSON API at
 * `http://localhost:$PORT`. The frontend reaches it via
 * `NEXT_PUBLIC_INDEXER_URL`; if unset (or unreachable) the site falls
 * back to direct chain reads transparently.
 *
 * Endpoints:
 *   GET /health
 *   GET /packets                       — all packets (newest first)
 *   GET /packets/:id                   — one packet
 *   GET /sent?creator=0x…              — packets created by addr
 *   GET /claims?claimer=0x…            — claim records by addr
 *   GET /withdrawals?user=0x…          — pending/fulfilled/cancelled
 */

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { existsSync, readFileSync } from "node:fs";
import { type PublicClient, createPublicClient, http, isAddress } from "viem";
import { startPoller } from "./poller.js";
import { IndexerStore } from "./store.js";

function loadEnvFile(file: URL) {
  if (!existsSync(file)) return;
  for (const rawLine of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (!key || process.env[key] !== undefined) continue;
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

loadEnvFile(new URL("../.env.local", import.meta.url));

const env = (key: string, fallback?: string) => {
  const v = process.env[key];
  if (v === undefined || v === "") {
    if (fallback === undefined) throw new Error(`Missing env: ${key}`);
    return fallback;
  }
  return v;
};

const RPC_URL = env("RPC_URL");
const WRAP_ADDRESS = env("CIPHERGIFT_ADDRESS") as `0x${string}`;
const VAULT_ADDRESS = env("VAULT_ADDRESS") as `0x${string}`;
const START_BLOCK = BigInt(env("START_BLOCK", "0"));
const PORT = Number(env("PORT", "42069"));
const POLL_INTERVAL_MS = Number(env("POLL_INTERVAL_MS", "4000"));
const CHUNK_SIZE = BigInt(env("CHUNK_SIZE", "10000"));

if (!isAddress(WRAP_ADDRESS) || !isAddress(VAULT_ADDRESS)) {
  throw new Error("CIPHERGIFT_ADDRESS / VAULT_ADDRESS must be valid 0x addresses");
}

const client: PublicClient = createPublicClient({ transport: http(RPC_URL) });
const store = new IndexerStore();

console.log("[indexer] boot:");
console.log(`  RPC_URL          = ${RPC_URL}`);
console.log(`  CIPHERGIFT       = ${WRAP_ADDRESS}`);
console.log(`  VAULT            = ${VAULT_ADDRESS}`);
console.log(`  START_BLOCK      = ${START_BLOCK}`);
console.log(`  PORT             = ${PORT}`);

const stop = await startPoller(store, {
  client,
  wrapAddress: WRAP_ADDRESS,
  vaultAddress: VAULT_ADDRESS,
  startBlock: START_BLOCK,
  chunkSize: CHUNK_SIZE,
  intervalMs: POLL_INTERVAL_MS,
});

const app = new Hono();
app.use("*", cors());

app.get("/health", (c) =>
  c.json({
    ok: true,
    lastBlock: store.lastBlock.toString(),
    packetCount: store.packets.size,
    claimCount: store.claims.length,
    revealCount: store.reveals.length,
    withdrawalCount: store.withdrawals.size,
    paused: store.ops.paused,
    owner: store.ops.owner ?? null,
    pendingOwner: store.ops.pendingOwner ?? null,
  }),
);

/// @notice Operational state surfaced to /status. Reflects the latest
///         pause + ownership events the poller has ingested. Frontend
///         can poll this without paying full /packets cost.
app.get("/ops", (c) =>
  c.json({
    paused: store.ops.paused,
    pausedAtBlock: store.ops.pausedAtBlock ?? null,
    pausedBy: store.ops.pausedBy ?? null,
    owner: store.ops.owner ?? null,
    pendingOwner: store.ops.pendingOwner ?? null,
    ownershipChangedAtBlock: store.ops.ownershipChangedAtBlock ?? null,
    assetVaults: [...store.assetVaults.values()],
  }),
);

app.get("/reveals", (c) => {
  const claimer = c.req.query("claimer");
  if (claimer && !isAddress(claimer)) return c.json({ error: "invalid claimer" }, 400);
  if (claimer) {
    const lower = claimer.toLowerCase();
    return c.json({ reveals: store.reveals.filter((r) => r.claimer.toLowerCase() === lower) });
  }
  return c.json({ reveals: store.reveals });
});

app.get("/packets", (c) => c.json({ packets: store.packetsList() }));

app.get("/packets/:id", (c) => {
  const id = c.req.param("id");
  const p = store.packets.get(id);
  if (!p) return c.json({ error: "not found" }, 404);
  return c.json(p);
});

app.get("/sent", (c) => {
  const creator = c.req.query("creator");
  if (!creator || !isAddress(creator)) return c.json({ error: "missing creator" }, 400);
  return c.json({ packets: store.packetsByCreator(creator as `0x${string}`) });
});

app.get("/claims", (c) => {
  const claimer = c.req.query("claimer");
  if (!claimer || !isAddress(claimer)) return c.json({ error: "missing claimer" }, 400);
  return c.json({ claims: store.claimsBy(claimer as `0x${string}`) });
});

app.get("/withdrawals", (c) => {
  const user = c.req.query("user");
  if (!user || !isAddress(user)) return c.json({ error: "missing user" }, 400);
  const lower = user.toLowerCase();
  const withdrawals = [...store.withdrawals.values()].filter((w) => w.user.toLowerCase() === lower);
  return c.json({ withdrawals });
});

const server = serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`[indexer] listening on http://localhost:${info.port}`);
});

const shutdown = (sig: string) => {
  console.log(`[indexer] received ${sig}, shutting down`);
  stop();
  server.close();
  process.exit(0);
};
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

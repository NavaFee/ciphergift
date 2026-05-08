/**
 * Polling loop — every `POLL_INTERVAL_MS` walk new logs from
 * `store.lastBlock + 1` through `latest` and apply them. Designed to be
 * resumable: if the indexer restarts, we replay from `START_BLOCK` (no
 * persistence yet).
 *
 * Each `PacketCreated` triggers a single `getPacket` read so we capture
 * the data the events don't carry (note, maxShareScalar, refunded flag).
 */

import { type PublicClient, decodeEventLog } from "viem";
import { cipherWrapAbi, vaultAbi } from "./abi.js";
import type { IndexerStore, PacketRecord, WithdrawalRecord } from "./store.js";

export interface PollerConfig {
  client: PublicClient;
  wrapAddress: `0x${string}`;
  vaultAddress: `0x${string}`;
  startBlock: bigint;
  /** Max range per `eth_getLogs` call. Most providers cap at 10k blocks. */
  chunkSize: bigint;
  intervalMs: number;
}

export async function startPoller(store: IndexerStore, cfg: PollerConfig): Promise<() => void> {
  if (store.lastBlock === 0n) {
    store.lastBlock = cfg.startBlock - 1n;
  }
  let stopped = false;

  const tick = async () => {
    if (stopped) return;
    try {
      const latest = await cfg.client.getBlockNumber();
      let from = store.lastBlock + 1n;
      while (from <= latest) {
        const to = from + cfg.chunkSize - 1n > latest ? latest : from + cfg.chunkSize - 1n;
        await ingestRange(store, cfg, from, to);
        store.lastBlock = to;
        from = to + 1n;
      }
    } catch (err) {
      // Don't crash the indexer on a transient RPC error — try again next tick.
      console.error("[poller] tick failed:", (err as Error).message);
    } finally {
      if (!stopped) setTimeout(tick, cfg.intervalMs);
    }
  };

  void tick();
  return () => {
    stopped = true;
  };
}

async function ingestRange(store: IndexerStore, cfg: PollerConfig, from: bigint, to: bigint) {
  // CipherGift events
  const wrapLogs = await cfg.client.getLogs({
    address: cfg.wrapAddress,
    fromBlock: from,
    toBlock: to,
  });
  for (const log of wrapLogs) {
    let decoded;
    try {
      decoded = decodeEventLog({ abi: cipherWrapAbi, data: log.data, topics: log.topics });
    } catch {
      continue; // not one of ours
    }
    if (decoded.eventName === "PacketCreated") {
      await onPacketCreated(store, cfg, log.blockNumber!, log.transactionHash!, decoded.args);
    } else if (decoded.eventName === "PacketClaimed") {
      const block = await cfg.client.getBlock({ blockNumber: log.blockNumber! });
      store.applyClaim({
        packetId: decoded.args.id.toString(),
        claimer: decoded.args.claimer,
        blockNumber: Number(log.blockNumber!),
        txHash: log.transactionHash!,
        timestamp: Number(block.timestamp),
      });
    } else if (decoded.eventName === "PacketRevealed") {
      store.applyReveal({
        packetId: decoded.args.id.toString(),
        claimer: decoded.args.claimer,
        blockNumber: Number(log.blockNumber!),
        txHash: log.transactionHash!,
      });
    } else if (decoded.eventName === "PacketRefunded") {
      store.applyRefund(decoded.args.id.toString());
    } else if (decoded.eventName === "AssetVaultSet") {
      store.setAssetVault({
        assetId: decoded.args.assetId,
        enabled: decoded.args.enabled,
        blockNumber: Number(log.blockNumber!),
      });
    } else if (decoded.eventName === "Paused") {
      store.setPaused(true, decoded.args.by, Number(log.blockNumber!));
    } else if (decoded.eventName === "Unpaused") {
      store.setPaused(false, decoded.args.by, Number(log.blockNumber!));
    } else if (decoded.eventName === "OwnershipTransferStarted") {
      store.setOwnerStarted(decoded.args.newOwner, Number(log.blockNumber!));
    } else if (decoded.eventName === "OwnershipTransferred") {
      store.setOwner(decoded.args.newOwner, Number(log.blockNumber!));
    }
    // PacketAssetBound is intentionally not handled here — getPacketAsset
    // is read at PacketCreated time (cheaper than a second event hop) and
    // captured into PacketRecord.assetId.
  }

  // Vault events
  const vaultLogs = await cfg.client.getLogs({
    address: cfg.vaultAddress,
    fromBlock: from,
    toBlock: to,
  });
  for (const log of vaultLogs) {
    let decoded;
    try {
      decoded = decodeEventLog({ abi: vaultAbi, data: log.data, topics: log.topics });
    } catch {
      continue;
    }
    if (decoded.eventName === "WithdrawRequested") {
      const w: WithdrawalRecord = {
        reqId: decoded.args.reqId.toString(),
        user: decoded.args.user,
        status: "requested",
        requestedAtBlock: Number(log.blockNumber!),
      };
      store.upsertWithdrawal(w);
    } else if (decoded.eventName === "WithdrawFulfilled") {
      const existing = store.withdrawals.get(decoded.args.reqId.toString());
      store.upsertWithdrawal({
        reqId: decoded.args.reqId.toString(),
        user: decoded.args.user,
        status: "fulfilled",
        requestedAtBlock: existing?.requestedAtBlock ?? Number(log.blockNumber!),
        resolvedAtBlock: Number(log.blockNumber!),
        units: decoded.args.units.toString(),
        weiAmount: decoded.args.weiAmount.toString(),
      });
    } else if (decoded.eventName === "WithdrawCancelled") {
      const existing = store.withdrawals.get(decoded.args.reqId.toString());
      store.upsertWithdrawal({
        reqId: decoded.args.reqId.toString(),
        user: decoded.args.user,
        status: "cancelled",
        requestedAtBlock: existing?.requestedAtBlock ?? Number(log.blockNumber!),
        resolvedAtBlock: Number(log.blockNumber!),
      });
    }
  }
}

async function onPacketCreated(
  store: IndexerStore,
  cfg: PollerConfig,
  blockNumber: bigint,
  txHash: `0x${string}`,
  args: {
    id: bigint;
    creator: `0x${string}`;
    ptype: number;
    totalShares: number;
    expiresAt: bigint;
  },
) {
  // Pull the bits the event doesn't carry.
  const [detail, allowlistRoot, assetId] = await Promise.all([
    cfg.client.readContract({
      address: cfg.wrapAddress,
      abi: cipherWrapAbi,
      functionName: "getPacket",
      args: [args.id],
    }),
    cfg.client.readContract({
      address: cfg.wrapAddress,
      abi: cipherWrapAbi,
      functionName: "allowlistRoot",
      args: [args.id],
    }),
    cfg.client.readContract({
      address: cfg.wrapAddress,
      abi: cipherWrapAbi,
      functionName: "getPacketAsset",
      args: [args.id],
    }),
  ]);

  const record: PacketRecord = {
    id: args.id.toString(),
    creator: detail[0],
    createdAt: Number(detail[1]),
    expiresAt: Number(detail[2]),
    packetType: detail[3],
    totalShares: detail[4],
    // `getPacket` returns current mutable state. During a restart replay,
    // claim/refund/reveal events will be applied after PacketCreated, so
    // start from creation-time state here to avoid double-counting old logs.
    claimedCount: 0,
    revealedCount: 0,
    maxShareScalar: detail[6].toString(),
    assetId,
    note: detail[7],
    refunded: false,
    allowlistRoot,
    createdAtBlock: Number(blockNumber),
    createdAtTx: txHash,
  };
  store.upsertPacket(record);
}

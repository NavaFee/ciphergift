/**
 * In-memory store. Single process, no persistence — restarting the
 * indexer rebuilds from `START_BLOCK`. Suitable for development and
 * small deployments. For larger or hosted deployments, prefer the
 * `packages/subgraph` Graph subgraph or swap this for a SQLite/Postgres
 * persistence layer behind the same interface.
 */

export interface PacketRecord {
  id: string; // bigint as string for JSON safety
  creator: `0x${string}`;
  createdAt: number;
  expiresAt: number;
  packetType: number; // 0=RANDOM, 1=EQUAL, 2=TARGETED, 3=PASSWORD, 4=BLIND
  totalShares: number;
  claimedCount: number;
  /** BLIND only — how many of the claimed shares have been revealed and credited. */
  revealedCount: number;
  maxShareScalar: string;
  assetId?: `0x${string}`;
  note: string;
  refunded: boolean;
  allowlistRoot: `0x${string}`;
  // Blockchain provenance for debugging.
  createdAtBlock: number;
  createdAtTx: `0x${string}`;
}

export interface ClaimRecord {
  packetId: string;
  claimer: `0x${string}`;
  blockNumber: number;
  txHash: `0x${string}`;
  timestamp: number;
}

export interface RevealRecord {
  packetId: string;
  claimer: `0x${string}`;
  blockNumber: number;
  txHash: `0x${string}`;
}

export interface AssetVaultRecord {
  assetId: `0x${string}`;
  enabled: boolean;
  blockNumber: number;
}

export interface OperationsState {
  /** Latest known pause state (true = paused). */
  paused: boolean;
  /** Block + by-address of the most recent Paused/Unpaused event. */
  pausedAtBlock?: number;
  pausedBy?: `0x${string}`;
  /** Latest known owner address (after ownership-transferred). undefined if never seen. */
  owner?: `0x${string}`;
  /** Pending owner from a two-step transferOwnership. */
  pendingOwner?: `0x${string}`;
  ownershipChangedAtBlock?: number;
}

export interface WithdrawalRecord {
  reqId: string;
  user: `0x${string}`;
  /** "requested" | "fulfilled" | "cancelled" */
  status: "requested" | "fulfilled" | "cancelled";
  requestedAtBlock: number;
  resolvedAtBlock?: number;
  units?: string; // populated when fulfilled
  weiAmount?: string;
}

export class IndexerStore {
  packets = new Map<string, PacketRecord>();
  claims: ClaimRecord[] = [];
  reveals: RevealRecord[] = [];
  withdrawals = new Map<string, WithdrawalRecord>();
  assetVaults = new Map<`0x${string}`, AssetVaultRecord>();
  ops: OperationsState = { paused: false };
  /** Highest block whose logs have been ingested. */
  lastBlock = 0n;

  upsertPacket(p: PacketRecord) {
    this.packets.set(p.id, p);
  }

  applyClaim(c: ClaimRecord) {
    if (this.hasClaimed(c.packetId, c.claimer)) return;
    this.claims.push(c);
    const p = this.packets.get(c.packetId);
    if (p) p.claimedCount += 1;
  }

  applyReveal(r: RevealRecord) {
    if (this.hasRevealed(r.packetId, r.claimer)) return;
    this.reveals.push(r);
    const p = this.packets.get(r.packetId);
    if (p) p.revealedCount += 1;
  }

  applyRefund(packetId: string) {
    const p = this.packets.get(packetId);
    if (p) p.refunded = true;
  }

  setAssetVault(rec: AssetVaultRecord) {
    this.assetVaults.set(rec.assetId, rec);
  }

  setPaused(paused: boolean, by: `0x${string}`, block: number) {
    this.ops.paused = paused;
    this.ops.pausedAtBlock = block;
    this.ops.pausedBy = by;
  }

  setOwnerStarted(pendingOwner: `0x${string}`, block: number) {
    this.ops.pendingOwner = pendingOwner === "0x0000000000000000000000000000000000000000" ? undefined : pendingOwner;
    this.ops.ownershipChangedAtBlock = block;
  }

  setOwner(newOwner: `0x${string}`, block: number) {
    this.ops.owner = newOwner;
    this.ops.pendingOwner = undefined;
    this.ops.ownershipChangedAtBlock = block;
  }

  upsertWithdrawal(w: WithdrawalRecord) {
    this.withdrawals.set(w.reqId, w);
  }

  packetsList(): PacketRecord[] {
    return [...this.packets.values()].sort((a, b) => Number(BigInt(b.id) - BigInt(a.id)));
  }

  packetsByCreator(addr: `0x${string}`): PacketRecord[] {
    const lower = addr.toLowerCase();
    return this.packetsList().filter((p) => p.creator.toLowerCase() === lower);
  }

  claimsBy(addr: `0x${string}`): ClaimRecord[] {
    const lower = addr.toLowerCase();
    return this.claims.filter((c) => c.claimer.toLowerCase() === lower);
  }

  hasClaimed(packetId: string, addr: `0x${string}`): boolean {
    const lower = addr.toLowerCase();
    return this.claims.some((c) => c.packetId === packetId && c.claimer.toLowerCase() === lower);
  }

  hasRevealed(packetId: string, addr: `0x${string}`): boolean {
    const lower = addr.toLowerCase();
    return this.reveals.some((r) => r.packetId === packetId && r.claimer.toLowerCase() === lower);
  }
}

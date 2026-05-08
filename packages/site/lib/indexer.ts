/**
 * Frontend client for off-chain indexers. Three modes, in priority:
 *
 *   1. The Graph subgraph (`NEXT_PUBLIC_SUBGRAPH_URL`) — preferred path
 *      for hosted deployments. Free 100k queries/month on Studio.
 *   2. Legacy REST indexer (`NEXT_PUBLIC_INDEXER_URL`) — the in-process
 *      Hono service in packages/indexer. Useful for local dev where
 *      running a graph-node + IPFS is overkill.
 *   3. Neither set — caller falls through to direct chain reads via
 *      usePacketEvents' chain branch.
 *
 * The hooks in `usePacketEvents.ts` call `useIndexerPackets` first and
 * fall back to chain reads when both modes are unreachable, so a
 * crashed/lagging indexer never blocks the UI.
 */
import type { PacketSummary } from "~~/hooks/usePacketEvents";
import type { PacketTypeValue } from "~~/lib/packet-types";

const SUBGRAPH_URL_RAW = process.env.NEXT_PUBLIC_SUBGRAPH_URL;
const INDEXER_URL_RAW = process.env.NEXT_PUBLIC_INDEXER_URL;

export const SUBGRAPH_URL: string | undefined =
  SUBGRAPH_URL_RAW && SUBGRAPH_URL_RAW.length > 0 ? SUBGRAPH_URL_RAW.replace(/\/+$/, "") : undefined;

export const INDEXER_URL: string | undefined =
  INDEXER_URL_RAW && INDEXER_URL_RAW.length > 0 ? INDEXER_URL_RAW.replace(/\/+$/, "") : undefined;

export const indexerEnabled = SUBGRAPH_URL !== undefined || INDEXER_URL !== undefined;

interface RawPacket {
  id: string;
  creator: `0x${string}`;
  createdAt: number;
  expiresAt: number;
  packetType: number;
  totalShares: number;
  claimedCount: number;
  maxShareScalar: string;
  assetId?: `0x${string}`;
  note: string;
  refunded: boolean;
  allowlistRoot: `0x${string}`;
  createdAtBlock: number;
  createdAtTx: `0x${string}`;
}

interface RawClaim {
  packetId: string;
  claimer: `0x${string}`;
  blockNumber: number;
  txHash: `0x${string}`;
  timestamp: number;
}

export interface IndexerHealth {
  ok: boolean;
  lastBlock: string;
  packetCount: number;
  claimCount: number;
  revealCount?: number;
  withdrawalCount?: number;
  paused?: boolean;
  owner?: `0x${string}` | null;
  pendingOwner?: `0x${string}` | null;
  /** Where the metrics came from. Surfaced on /status. */
  source?: "subgraph" | "rest";
}

function toSummary(p: RawPacket): PacketSummary {
  return {
    id: BigInt(p.id),
    creator: p.creator,
    createdAt: p.createdAt,
    expiresAt: p.expiresAt,
    packetType: p.packetType as PacketTypeValue,
    totalShares: p.totalShares,
    claimedCount: p.claimedCount,
    maxShareScalar: BigInt(p.maxShareScalar),
    assetId: p.assetId,
    note: p.note,
    refunded: p.refunded,
  };
}

// ─── REST helpers (legacy in-memory indexer) ─────────────────────────────────

async function restGet<T>(path: string, init?: RequestInit): Promise<T> {
  if (!INDEXER_URL) throw new Error("rest indexer disabled");
  const res = await fetch(`${INDEXER_URL}${path}`, { ...init, cache: "no-store" });
  if (!res.ok) throw new Error(`indexer ${path} → HTTP ${res.status}`);
  return (await res.json()) as T;
}

// ─── GraphQL helpers (The Graph subgraph) ────────────────────────────────────

async function gql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  if (!SUBGRAPH_URL) throw new Error("subgraph disabled");
  const res = await fetch(SUBGRAPH_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`subgraph → HTTP ${res.status}`);
  const body = (await res.json()) as { data?: T; errors?: { message: string }[] };
  if (body.errors && body.errors.length > 0) {
    throw new Error(`subgraph error: ${body.errors.map(e => e.message).join("; ")}`);
  }
  if (!body.data) throw new Error("subgraph returned no data");
  return body.data;
}

interface SubgraphPacket {
  id: string;
  creator: string;
  createdAt: string;
  expiresAt: string;
  packetType: number;
  totalShares: number;
  claimedCount: number;
  maxShareScalar: string;
  assetId: string | null;
  note: string;
  refunded: boolean;
  allowlistRoot: string;
  createdAtBlock: string;
  createdAtTx: string;
}

const PACKET_FIELDS = `
  id creator createdAt expiresAt packetType totalShares claimedCount
  maxShareScalar assetId note refunded allowlistRoot createdAtBlock createdAtTx
`;

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function subgraphToRawPacket(p: SubgraphPacket): RawPacket {
  // The subgraph stores assetId as null for the default cETH vault and
  // hex-strings for everything else; collapse "zero address" to null too.
  const asset = p.assetId && p.assetId.toLowerCase() !== ZERO_ADDRESS ? (p.assetId as `0x${string}`) : undefined;
  return {
    id: p.id,
    creator: p.creator as `0x${string}`,
    createdAt: Number(p.createdAt),
    expiresAt: Number(p.expiresAt),
    packetType: p.packetType,
    totalShares: p.totalShares,
    claimedCount: p.claimedCount,
    maxShareScalar: p.maxShareScalar,
    assetId: asset,
    note: p.note,
    refunded: p.refunded,
    allowlistRoot: p.allowlistRoot as `0x${string}`,
    createdAtBlock: Number(p.createdAtBlock),
    createdAtTx: p.createdAtTx as `0x${string}`,
  };
}

// ─── Public API ──────────────────────────────────────────────────────────────

export async function fetchHealth(): Promise<IndexerHealth | undefined> {
  if (SUBGRAPH_URL) {
    try {
      // Fetch _meta + lightweight ID slices to derive counts. Capped at
      // 1000; if the deployment ever crosses that we'll switch to a
      // dedicated aggregate entity.
      const data = await gql<{
        _meta: { block: { number: number }; hasIndexingErrors: boolean };
        packets: { id: string }[];
        claims: { id: string }[];
        reveals: { id: string }[];
        withdrawals: { id: string }[];
        operationsState: { paused: boolean; owner: string | null; pendingOwner: string | null } | null;
      }>(`
        query Health {
          _meta { block { number } hasIndexingErrors }
          packets(first: 1000) { id }
          claims(first: 1000) { id }
          reveals(first: 1000) { id }
          withdrawals(first: 1000) { id }
          operationsState(id: "state") { paused owner pendingOwner }
        }
      `);
      return {
        ok: !data._meta.hasIndexingErrors,
        lastBlock: data._meta.block.number.toString(),
        packetCount: data.packets.length,
        claimCount: data.claims.length,
        revealCount: data.reveals.length,
        withdrawalCount: data.withdrawals.length,
        paused: data.operationsState?.paused,
        owner: (data.operationsState?.owner as `0x${string}` | null | undefined) ?? null,
        pendingOwner: (data.operationsState?.pendingOwner as `0x${string}` | null | undefined) ?? null,
        source: "subgraph",
      };
    } catch {
      return undefined;
    }
  }
  if (INDEXER_URL) {
    try {
      return { ...(await restGet<IndexerHealth>("/health")), source: "rest" };
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export async function fetchAllPackets(): Promise<PacketSummary[]> {
  if (SUBGRAPH_URL) {
    const data = await gql<{ packets: SubgraphPacket[] }>(`
      query AllPackets {
        packets(first: 1000, orderBy: createdAt, orderDirection: desc) { ${PACKET_FIELDS} }
      }
    `);
    return data.packets.map(subgraphToRawPacket).map(toSummary);
  }
  const data = await restGet<{ packets: RawPacket[] }>("/packets");
  return data.packets.map(toSummary);
}

export async function fetchSentBy(creator: `0x${string}`): Promise<PacketSummary[]> {
  if (SUBGRAPH_URL) {
    const data = await gql<{ packets: SubgraphPacket[] }>(
      `
      query SentBy($creator: Bytes!) {
        packets(first: 1000, where: { creator: $creator }, orderBy: createdAt, orderDirection: desc) {
          ${PACKET_FIELDS}
        }
      }
    `,
      { creator: creator.toLowerCase() },
    );
    return data.packets.map(subgraphToRawPacket).map(toSummary);
  }
  const data = await restGet<{ packets: RawPacket[] }>(`/sent?creator=${creator}`);
  return data.packets.map(toSummary);
}

export async function fetchClaimsBy(claimer: `0x${string}`): Promise<RawClaim[]> {
  if (SUBGRAPH_URL) {
    const data = await gql<{
      claims: { packet: { id: string }; claimer: string; blockNumber: string; txHash: string; timestamp: string }[];
    }>(
      `
      query ClaimsBy($claimer: Bytes!) {
        claims(first: 1000, where: { claimer: $claimer }, orderBy: timestamp, orderDirection: desc) {
          packet { id } claimer blockNumber txHash timestamp
        }
      }
    `,
      { claimer: claimer.toLowerCase() },
    );
    return data.claims.map(c => ({
      packetId: c.packet.id,
      claimer: c.claimer as `0x${string}`,
      blockNumber: Number(c.blockNumber),
      txHash: c.txHash as `0x${string}`,
      timestamp: Number(c.timestamp),
    }));
  }
  const data = await restGet<{ claims: RawClaim[] }>(`/claims?claimer=${claimer}`);
  return data.claims;
}

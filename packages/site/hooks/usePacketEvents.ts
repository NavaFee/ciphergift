"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useCipherGift } from "./useCipherGift";
import type { Address } from "viem";
import { useChainId, useReadContract, useReadContracts } from "wagmi";
import { verifyAllowlistProof } from "~~/lib/allowlist";
import { fetchAllPackets, indexerEnabled } from "~~/lib/indexer";
import { type StoredInvite, loadInvites } from "~~/lib/invite-storage";
import { PacketType, type PacketTypeValue } from "~~/lib/packet-types";

export interface PacketSummary {
  id: bigint;
  creator: `0x${string}`;
  createdAt: number; // unix seconds
  expiresAt: number;
  packetType: PacketTypeValue;
  totalShares: number;
  claimedCount: number;
  /** RANDOM only — plaintext upper bound on each share. 0 for EQUAL/TARGETED. */
  maxShareScalar: bigint;
  /** Asset id: the vault address backing this packet. Undefined means default cETH. */
  assetId?: Address;
  note: string;
  refunded: boolean;
}

/**
 * Loading source for the packet list:
 *   - "indexer"  — got the data from `NEXT_PUBLIC_INDEXER_URL`
 *   - "chain"    — fell back to direct contract reads (indexer disabled
 *                  or unreachable)
 */
export type PacketSource = "indexer" | "chain";

interface UseAllPacketsResult {
  packets: PacketSummary[];
  isLoading: boolean;
  /** Where the current `packets` came from. UI surfaces a banner on "chain". */
  source: PacketSource;
  /**
   * Indexer was attempted but failed (so we transparently dropped to chain
   * reads). Lets `/dashboard` etc. show "running on chain fallback" copy.
   */
  indexerDegraded: boolean;
  refetch: () => void;
}

/**
 * Reads every packet — prefers the indexer when `NEXT_PUBLIC_INDEXER_URL`
 * is set, falls back to walking `0..packetCount-1` on-chain when the
 * indexer is disabled or unreachable. Both paths return the same
 * `PacketSummary` shape.
 */
export function useAllPackets(): UseAllPacketsResult {
  const idx = useAllPacketsViaIndexer();
  const chain = useAllPacketsViaChain(!indexerEnabled || idx.failed);

  // Drop any packetType the UI doesn't surface (currently the contract's
  // BLIND = 4). Filtering at the data boundary keeps every list view free
  // of unsupported types without each one needing its own guard.
  const visiblePackets = (raw: PacketSummary[]) => raw.filter(p => p.packetType <= PacketType.PASSWORD);

  if (indexerEnabled && !idx.failed) {
    return {
      packets: visiblePackets(idx.packets),
      isLoading: idx.isLoading,
      source: "indexer",
      indexerDegraded: false,
      refetch: idx.refetch,
    };
  }
  return {
    packets: visiblePackets(chain.packets),
    isLoading: chain.isLoading,
    source: "chain",
    indexerDegraded: indexerEnabled && idx.failed,
    refetch: () => {
      chain.refetch();
      if (indexerEnabled) idx.refetch();
    },
  };
}

function useAllPacketsViaChain(enabled: boolean) {
  const wrap = useCipherGift();

  const countRead = useReadContract({
    address: wrap?.address,
    abi: wrap?.abi,
    functionName: "packetCount",
    query: { enabled: Boolean(wrap) && enabled },
  });

  const count = useMemo(() => Number((countRead.data as bigint | undefined) ?? 0n), [countRead.data]);

  const ids = useMemo(() => Array.from({ length: count }, (_, i) => BigInt(i)), [count]);

  const detailReads = useReadContracts({
    contracts: wrap
      ? ids.map(
          id =>
            ({
              address: wrap.address,
              abi: wrap.abi,
              functionName: "getPacket",
              args: [id],
            }) as const,
        )
      : [],
    query: { enabled: Boolean(wrap && ids.length > 0) && enabled },
  });

  const assetReads = useReadContracts({
    contracts: wrap
      ? ids.map(
          id =>
            ({
              address: wrap.address,
              abi: wrap.abi,
              functionName: "getPacketAsset",
              args: [id],
            }) as const,
        )
      : [],
    query: { enabled: Boolean(wrap && ids.length > 0) && enabled },
  });

  const packets = useMemo<PacketSummary[]>(() => {
    if (!detailReads.data) return [];
    const out: PacketSummary[] = [];
    detailReads.data.forEach((res, idx) => {
      if (res.status !== "success") return;
      const tuple = res.result as readonly [
        `0x${string}`,
        bigint,
        bigint,
        number,
        number,
        number,
        bigint,
        string,
        boolean,
      ];
      const [creator, createdAt, expiresAt, packetType, totalShares, claimedCount, maxShareScalar, note, refunded] =
        tuple;
      out.push({
        id: ids[idx]!,
        creator,
        createdAt: Number(createdAt),
        expiresAt: Number(expiresAt),
        packetType: packetType as PacketTypeValue,
        totalShares,
        claimedCount,
        maxShareScalar,
        assetId: assetReads.data?.[idx]?.status === "success" ? (assetReads.data[idx].result as Address) : undefined,
        note,
        refunded,
      });
    });
    return out;
  }, [assetReads.data, detailReads.data, ids]);

  const refetch = useCallback(() => {
    countRead.refetch();
    detailReads.refetch();
    assetReads.refetch();
  }, [assetReads, countRead, detailReads]);

  return {
    packets,
    isLoading: countRead.isLoading || detailReads.isLoading || assetReads.isLoading,
    refetch,
  };
}

function useAllPacketsViaIndexer() {
  const [packets, setPackets] = useState<PacketSummary[]>([]);
  const [isLoading, setLoading] = useState(indexerEnabled);
  const [failed, setFailed] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!indexerEnabled) return;
    let cancelled = false;
    setLoading(true);
    fetchAllPackets()
      .then(p => {
        if (cancelled) return;
        setPackets(p);
        setFailed(false);
      })
      .catch(() => {
        if (cancelled) return;
        setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tick]);

  // Light auto-refresh — keeps the list fresh after claim/refund tx
  // without forcing every consumer to call refetch.
  useEffect(() => {
    if (!indexerEnabled) return;
    const t = setInterval(() => setTick(n => n + 1), 8_000);
    return () => clearInterval(t);
  }, []);

  const refetch = useCallback(() => setTick(n => n + 1), []);
  return { packets, isLoading, failed, refetch };
}

/**
 * Filters all packets to those the connected user can still claim:
 *   - not yet claimed by `me`
 *   - not expired / not refunded / claimedCount < totalShares
 *   - TARGETED packets surface only when this browser has previously
 *     observed the share-link fragment (`/r/[id]#salt=…&proof=…`) for
 *     `me`. The (salt, proof) is cached locally by `saveInvite` on the
 *     share-link landing page, so a user who clicked their invite once
 *     can find the packet again from the regular inbox.
 */
export function useIncomingPackets(me?: `0x${string}`) {
  const all = useAllPackets();
  const wrap = useCipherGift();
  const chainId = useChainId();

  // Read claimed[id][me] for each packet so we can hide already-claimed ones.
  const claimedReads = useReadContracts({
    contracts:
      wrap && me
        ? all.packets.map(
            p =>
              ({
                address: wrap.address,
                abi: wrap.abi,
                functionName: "claimed",
                args: [p.id, me],
              }) as const,
          )
        : [],
    query: { enabled: Boolean(wrap && me && all.packets.length > 0) },
  });

  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 30_000);
    return () => clearInterval(t);
  }, []);

  // Re-read invite map on every tick so a fresh `/r/[id]` visit propagates
  // to dashboard / inbox without manual reload.
  const invites = useMemo<Record<string, StoredInvite>>(() => {
    if (!me || !wrap?.address) return {};
    return loadInvites(chainId, wrap.address, me);
    // `now` is intentional — invites is keyed by storage state and we want
    // a periodic re-read so a freshly-saved invite shows up promptly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chainId, me, wrap?.address, now]);

  // For each TARGETED packet that has a stored invite, fetch the on-chain
  // Merkle root so we can re-verify the stored proof against `me`. Stale
  // invites left over from a previous wallet (or saved before we tightened
  // /r/[id] to skip mismatched proofs) would otherwise surface forever as
  // ghost rows whose claim always reverts NotAllowlisted.
  const targetedInviteIds = useMemo(
    () => all.packets.filter(p => p.packetType === PacketType.TARGETED && invites[p.id.toString()]).map(p => p.id),
    [all.packets, invites],
  );
  const targetedRootReads = useReadContracts({
    contracts:
      wrap && targetedInviteIds.length > 0
        ? targetedInviteIds.map(
            id =>
              ({
                address: wrap.address,
                abi: wrap.abi,
                functionName: "allowlistRoot",
                args: [id],
              }) as const,
          )
        : [],
    query: { enabled: Boolean(wrap && targetedInviteIds.length > 0) },
  });
  const targetedProofValid = useMemo<Record<string, boolean>>(() => {
    if (!me) return {};
    const out: Record<string, boolean> = {};
    targetedInviteIds.forEach((id, idx) => {
      const root = targetedRootReads.data?.[idx]?.result as `0x${string}` | undefined;
      const inv = invites[id.toString()];
      if (!root || !inv) return;
      out[id.toString()] = verifyAllowlistProof(root, inv.salt, me, inv.slotIndex, inv.proof);
    });
    return out;
  }, [targetedInviteIds, targetedRootReads.data, invites, me]);

  // Composed refetch: the spread `all.refetch` only kicks the packet list.
  // After a claim tx, `claimed[id][me]` flips on chain but our local
  // `claimedReads` keeps the stale `false`, so the just-claimed row would
  // linger in the inbox until React Query's default re-fetch fires. The
  // OpenModal close handler calls this refetch — make sure all three
  // queries it depends on get re-issued, not just the packet list.
  const refetchAll = useCallback(() => {
    all.refetch();
    claimedReads.refetch();
    targetedRootReads.refetch();
  }, [all, claimedReads, targetedRootReads]);

  const incoming = useMemo<PacketSummary[]>(() => {
    if (!me) return [];
    return all.packets.filter((p, i) => {
      if (p.refunded) return false;
      if (p.expiresAt <= now) return false;
      if (p.claimedCount >= p.totalShares) return false;
      const hasClaimed = claimedReads.data?.[i]?.result === true;
      if (hasClaimed) return false;
      // We *don't* hide creator-self packets — the contract permits it for
      // EQUAL/RANDOM/PASSWORD; treating creators as participants is
      // correct (they can claim their own slot or "play" their random
      // lottery). For TARGETED specifically, creators only show up if
      // they put themselves on the allowlist (then the invite + proof
      // checks below pass), which is also correct.
      if (p.packetType === PacketType.TARGETED) {
        // TARGETED packets need a stored (salt, proof) — gained by
        // visiting the personal `/r/[id]#…` link at least once.
        if (!invites[p.id.toString()]) return false;
        // Stored proof must verify against the connected wallet. We wait
        // for the on-chain root before deciding so we don't drop a valid
        // invite during the read; while loading, leave the row visible.
        const verified = targetedProofValid[p.id.toString()];
        if (verified === false) return false;
      }
      return true;
    });
  }, [all.packets, claimedReads.data, invites, me, now, targetedProofValid]);

  return { ...all, incoming, invites, refetch: refetchAll };
}

export function useSentPackets(me?: `0x${string}`) {
  const all = useAllPackets();
  const sent = useMemo(() => {
    if (!me) return [] as PacketSummary[];
    return all.packets.filter(p => p.creator.toLowerCase() === me.toLowerCase());
  }, [all.packets, me]);
  return { ...all, sent };
}

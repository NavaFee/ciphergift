/**
 * Per-invitee `(salt, slotIndex, amount, proof)` for TARGETED packets only
 * ever exists on the sender's machine — the chain stores just the Merkle
 * root and the encrypted slot ciphertexts. If the sender doesn't copy the
 * personal links right after creation they can't be recovered from chain
 * data alone. Persisting the entries here lets the `/sent/[id]` page
 * re-display them on later visits (same browser).
 *
 * Scope: localStorage, keyed by `(chainId, contract address, packet id)`.
 * Keys are namespaced so deploying a new CipherGift address doesn't pollute
 * old packets and so different chains don't cross-contaminate.
 *
 * `v2` bump: per-slot amounts mean each entry now carries a BigInt amount
 * + slotIndex, so old `v1` shapes are unreadable. Rather than migrate, we
 * just invalidate the prefix and let stale entries fall away.
 */
import type { AllowlistEntry } from "./allowlist";

const STORAGE_PREFIX = "ciphergift.allowlist.v2";

interface SerializedAllowlistEntry {
  address: `0x${string}`;
  amount: string; // BigInt-as-string for JSON roundtrip
  slotIndex: number;
  salt: `0x${string}`;
  proof: `0x${string}`[];
}

function storageKey(chainId: number, wrapAddress: string, packetId: bigint): string {
  return `${STORAGE_PREFIX}.${chainId}.${wrapAddress.toLowerCase()}.${packetId.toString()}`;
}

export function saveAllowlist(chainId: number, wrapAddress: string, packetId: bigint, entries: AllowlistEntry[]): void {
  if (typeof window === "undefined") return;
  if (entries.length === 0) return;
  try {
    const serialized: SerializedAllowlistEntry[] = entries.map(e => ({
      address: e.address,
      amount: e.amount.toString(),
      slotIndex: e.slotIndex,
      salt: e.salt,
      proof: e.proof,
    }));
    window.localStorage.setItem(storageKey(chainId, wrapAddress, packetId), JSON.stringify(serialized));
  } catch {
    // Quota or disabled storage; silently no-op so create flow doesn't fail.
  }
}

export function loadAllowlist(chainId: number, wrapAddress: string, packetId: bigint): AllowlistEntry[] | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.localStorage.getItem(storageKey(chainId, wrapAddress, packetId));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return undefined;
    return (parsed as SerializedAllowlistEntry[]).map(e => ({
      address: e.address,
      amount: BigInt(e.amount),
      slotIndex: e.slotIndex,
      salt: e.salt,
      proof: e.proof,
    }));
  } catch {
    return undefined;
  }
}

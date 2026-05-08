/**
 * Claimer-side persistence for TARGETED invites.
 *
 * When a claimer lands on `/r/<id>#salt=…&slot=…&amount=…&proof=…`, the
 * fragment material is the only way to claim — the chain only knows the
 * Merkle root. Without saving it, the user can't revisit later from
 * `/inbox` to claim, which makes TARGETED packets feel invisible.
 *
 * Scope: localStorage, keyed by `(chainId, contract address, claimer)` so
 * separate wallets / deployments / chains stay isolated. Stored as a map
 * keyed by packet id so we can look up by id directly.
 *
 * `v2` bump: previously stored invites only carried `{salt, proof}`; the
 * per-slot leaf format demands a slotIndex too, so old entries are
 * unrecoverable and the prefix is bumped to invalidate them cleanly.
 */
import type { ParsedFragment } from "./allowlist";

const STORAGE_PREFIX = "ciphergift.invites.v2";

export interface StoredInvite extends ParsedFragment {
  packetId: string;
}

interface SerializedInvite {
  packetId: string;
  salt: `0x${string}`;
  slotIndex: number;
  /** BigInt-as-string so JSON.stringify roundtrips. */
  amount: string;
  proof: `0x${string}`[];
}

function storageKey(chainId: number, wrapAddress: string, claimer: string): string {
  return `${STORAGE_PREFIX}.${chainId}.${wrapAddress.toLowerCase()}.${claimer.toLowerCase()}`;
}

export function saveInvite(
  chainId: number,
  wrapAddress: string,
  claimer: string,
  packetId: bigint,
  fragment: ParsedFragment,
): void {
  if (typeof window === "undefined") return;
  try {
    const key = storageKey(chainId, wrapAddress, claimer);
    const existing = readSerializedMap(key);
    existing[packetId.toString()] = {
      packetId: packetId.toString(),
      salt: fragment.salt,
      slotIndex: fragment.slotIndex,
      amount: fragment.amount.toString(),
      proof: fragment.proof,
    };
    window.localStorage.setItem(key, JSON.stringify(existing));
  } catch {
    // Quota or disabled storage — silently no-op.
  }
}

export function loadInvites(chainId: number, wrapAddress: string, claimer: string): Record<string, StoredInvite> {
  if (typeof window === "undefined") return {};
  const raw = readSerializedMap(storageKey(chainId, wrapAddress, claimer));
  const out: Record<string, StoredInvite> = {};
  for (const [k, v] of Object.entries(raw)) {
    out[k] = {
      packetId: v.packetId,
      salt: v.salt,
      slotIndex: v.slotIndex,
      amount: BigInt(v.amount),
      proof: v.proof,
    };
  }
  return out;
}

export function loadInvite(
  chainId: number,
  wrapAddress: string,
  claimer: string,
  packetId: bigint,
): StoredInvite | undefined {
  return loadInvites(chainId, wrapAddress, claimer)[packetId.toString()];
}

function readSerializedMap(key: string): Record<string, SerializedInvite> {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Record<string, SerializedInvite>;
  } catch {
    return {};
  }
}

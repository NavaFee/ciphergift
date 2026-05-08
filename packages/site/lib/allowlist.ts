/**
 * Encrypted-allowlist helpers for TARGETED packets (per-slot amounts).
 *
 * The on-chain allowlist is just a single bytes32 Merkle root. Per-invitee
 * `(salt, slotIndex, proof)` are distributed off-chain via the share link's
 * URL fragment so the chain never sees who can claim, and the slot's
 * pre-encrypted amount stays encrypted on chain throughout (claim included).
 *
 * Tree convention matches OpenZeppelin's `MerkleProof.verify`:
 *   leaf = keccak256(keccak256(abi.encode(salt, claimer, slotIndex)))
 *   node = keccak256(abi.encode(min(a,b), max(a,b)))           // sortPairs
 *
 * `amount` (the recipient's per-slot units) lives in the fragment as a
 * preview only — the chain doesn't read it. The recipient's wallet uses it
 * to render "you'll receive X" before submitting the claim.
 */
import { encodeAbiParameters, keccak256 } from "viem";

export interface AllowlistRecipient {
  /** EIP-55 / lowercased address. */
  address: `0x${string}`;
  /** Per-slot amount in vault units (e.g. gwei for cETH). */
  amount: bigint;
}

export interface AllowlistEntry extends AllowlistRecipient {
  /** Position of this recipient in the slot ciphertext array. */
  slotIndex: number;
  /** 32-byte cryptographically random salt. */
  salt: `0x${string}`;
  /** Merkle proof for `leaf(salt, address, slotIndex)` against the tree root. */
  proof: `0x${string}`[];
}

export interface BuiltAllowlist {
  /** bytes32 to feed into `createTargetedPacket(... merkleRoot ...)`. */
  root: `0x${string}`;
  /** One entry per invitee — package each into a per-invitee share link. */
  entries: AllowlistEntry[];
}

/**
 * Compute the leaf hash on-chain matches `_allowlistLeaf(salt, claimer, slotIndex)`.
 */
export function leafHash(salt: `0x${string}`, claimer: `0x${string}`, slotIndex: number): `0x${string}` {
  const inner = keccak256(
    encodeAbiParameters([{ type: "bytes32" }, { type: "address" }, { type: "uint32" }], [salt, claimer, slotIndex]),
  );
  return keccak256(inner);
}

/** OpenZeppelin's commutative pair hash (sortPairs). */
function pairHash(a: `0x${string}`, b: `0x${string}`): `0x${string}` {
  const [lo, hi] = a < b ? [a, b] : [b, a];
  return keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "bytes32" }], [lo, hi]));
}

function randomSalt(): `0x${string}` {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `0x${Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("")}` as `0x${string}`;
}

/**
 * Build a Merkle tree from a list of `(address, amount)` recipients. Each
 * recipient gets a freshly-generated salt and a slotIndex matching their
 * position in the input array — that index is the same one the contract uses
 * to look up their pre-encrypted amount in `slotAmount[id][slotIndex]`.
 *
 * Throws if `recipients` is empty (TARGETED packets must have ≥1 invitee).
 */
export function buildAllowlist(recipients: AllowlistRecipient[]): BuiltAllowlist {
  if (recipients.length === 0) {
    throw new Error("buildAllowlist: at least one recipient required");
  }

  const seen = new Set<string>();
  for (const r of recipients) {
    const lower = r.address.toLowerCase();
    if (seen.has(lower)) {
      throw new Error(`buildAllowlist: duplicate address ${r.address}`);
    }
    seen.add(lower);
    if (r.amount <= 0n) {
      throw new Error(`buildAllowlist: amount for ${r.address} must be > 0`);
    }
  }

  const salts = recipients.map(() => randomSalt());
  const leaves = recipients.map((r, i) => leafHash(salts[i]!, r.address, i));

  // Build layers bottom-up. Layer 0 = leaves; if a layer has odd count,
  // the unpaired tail is promoted to the next layer untouched (this matches
  // OZ's StandardMerkleTree default behaviour).
  const layers: `0x${string}`[][] = [leaves];
  let layer = leaves;
  while (layer.length > 1) {
    const next: `0x${string}`[] = [];
    for (let i = 0; i < layer.length; i += 2) {
      if (i + 1 < layer.length) {
        next.push(pairHash(layer[i]!, layer[i + 1]!));
      } else {
        next.push(layer[i]!);
      }
    }
    layers.push(next);
    layer = next;
  }
  const root = layer[0]!;

  // For each leaf, walk up the tree collecting siblings.
  const entries: AllowlistEntry[] = recipients.map((r, idx) => {
    const proof: `0x${string}`[] = [];
    let index = idx;
    for (let depth = 0; depth < layers.length - 1; depth++) {
      const level = layers[depth]!;
      const siblingIndex = index % 2 === 0 ? index + 1 : index - 1;
      if (siblingIndex < level.length) {
        proof.push(level[siblingIndex]!);
      }
      // If sibling is out of bounds the leaf was promoted unpaired — no
      // proof element added at this depth.
      index = Math.floor(index / 2);
    }
    return { address: r.address, amount: r.amount, slotIndex: idx, salt: salts[idx]!, proof };
  });

  return { root, entries };
}

/**
 * Verify a proof off-chain — used by the SendWizard to sanity-check each
 * generated link before showing it to the user.
 */
export function verifyAllowlistProof(
  root: `0x${string}`,
  salt: `0x${string}`,
  claimer: `0x${string}`,
  slotIndex: number,
  proof: `0x${string}`[],
): boolean {
  let computed = leafHash(salt, claimer, slotIndex);
  for (const sibling of proof) {
    computed = pairHash(computed, sibling);
  }
  return computed.toLowerCase() === root.toLowerCase();
}

// ── URL fragment encoding ────────────────────────────────────────────────

export interface ParsedFragment {
  salt: `0x${string}`;
  slotIndex: number;
  /** Recipient's per-slot amount, in vault units. Preview-only — the chain
   *  never reads it; the contract derives the share from the stored slot
   *  ciphertext via slotIndex. */
  amount: bigint;
  proof: `0x${string}`[];
}

/**
 * Encode `{salt, slotIndex, amount, proof}` into a URL fragment string (no leading `#`):
 *   `salt=0x...&slot=N&amount=DECIMAL&proof=0x...,0x...,0x...`
 *
 * Empty proof produces `proof=` so consumers can still detect the fragment.
 */
export function encodeAllowlistFragment(entry: {
  salt: `0x${string}`;
  slotIndex: number;
  amount: bigint;
  proof: `0x${string}`[];
}): string {
  return `salt=${entry.salt}&slot=${entry.slotIndex}&amount=${entry.amount.toString()}&proof=${entry.proof.join(",")}`;
}

/**
 * Parse a URL fragment. Accepts either with or without a leading `#`.
 * Returns undefined if the fragment doesn't look like a packet allowlist
 * fragment (so consumers can safely call this on every page load).
 */
export function parseAllowlistFragment(hash: string | undefined): ParsedFragment | undefined {
  if (!hash) return undefined;
  const stripped = hash.startsWith("#") ? hash.slice(1) : hash;
  const params = new URLSearchParams(stripped);
  const salt = params.get("salt");
  const slotRaw = params.get("slot");
  const amountRaw = params.get("amount");
  const proofRaw = params.get("proof");
  if (!salt || !/^0x[0-9a-f]{64}$/i.test(salt)) return undefined;
  if (slotRaw === null || !/^\d+$/.test(slotRaw)) return undefined;
  if (amountRaw === null || !/^\d+$/.test(amountRaw)) return undefined;
  if (proofRaw === null) return undefined;
  const slotIndex = parseInt(slotRaw, 10);
  if (!Number.isSafeInteger(slotIndex) || slotIndex < 0) return undefined;
  const amount = BigInt(amountRaw);
  const proof: `0x${string}`[] =
    proofRaw === "" ? [] : (proofRaw.split(",").filter(p => /^0x[0-9a-f]{64}$/i.test(p)) as `0x${string}`[]);
  // If the user typoed and we couldn't parse all elements, treat as missing.
  if (proofRaw !== "" && proof.length !== proofRaw.split(",").length) return undefined;
  return { salt: salt as `0x${string}`, slotIndex, amount, proof };
}

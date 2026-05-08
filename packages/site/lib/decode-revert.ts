/**
 * Decode revert data into a human-readable string. Covers our own custom
 * errors plus a few external selectors (KMSVerifier, common Solidity
 * `Error(string)` / `Panic(uint)`).
 *
 * Wallets and viem normalize `eth_estimateGas` failures to the unhelpful
 * "gas limit too high" message; calling this on the raw revert data
 * surfaces the real reason. See `safeSimulateAndWrite` for the call site.
 */
import { type Hex, decodeErrorResult, keccak256, stringToBytes } from "viem";

interface KnownError {
  selector: Hex;
  signature: string;
  /** Optional friendlier message that hides the raw arg list from users. */
  friendly?: (args: readonly unknown[]) => string;
}

// All custom errors used across our contracts + a couple of external ones
// we routinely hit. Order matters only for readability; selectors are
// hashed at runtime so duplicates would simply collide harmlessly.
const KNOWN_ERRORS: ReadonlyArray<{ signature: string; friendly?: (args: readonly unknown[]) => string }> = [
  // ── ConfidentialETHVault / ConfidentialERC20Vault ──
  {
    signature: "PendingWithdrawalExists()",
    friendly: () => "You already have a pending withdrawal — fulfill or cancel it first.",
  },
  { signature: "NoPendingWithdrawal()", friendly: () => "There's no pending withdrawal at this id." },
  { signature: "NotRequestOwner()", friendly: () => "Only the user who issued the request can act on it." },
  { signature: "CancelTooEarly()", friendly: () => "The cancel window opens 5 minutes after `requestWithdraw`." },
  { signature: "UninitializedBalance()", friendly: () => "Encrypted balance is empty — deposit first." },
  {
    signature: "MalformedCleartext()",
    friendly: () => "Gateway returned malformed cleartext (expected a single uint256[1]).",
  },
  { signature: "CleartextOverflow()", friendly: () => "Cleartext exceeds uint64 — vault unit overflow." },
  {
    signature: "InsufficientPool()",
    friendly: () => "Vault doesn't hold enough plaintext ETH/tokens to settle this withdrawal.",
  },
  { signature: "TransferFailed()", friendly: () => "ETH/ERC-20 transfer failed at the boundary." },
  {
    signature: "NotOrchestrator()",
    friendly: () => "Vault rejected the call — only CipherGift may move encrypted balances.",
  },
  // ── CipherGift ──
  { signature: "EmptyShareCount()", friendly: () => "Total shares must be ≥ 1." },
  { signature: "ExpiryInPast()", friendly: () => "Expiry must be > 0 seconds." },
  { signature: "NoteTooLong()", friendly: () => "Note must be ≤ 120 chars." },
  { signature: "TargetedNeedsAllowlist()", friendly: () => "TARGETED packets need a non-zero Merkle root." },
  { signature: "UnexpectedAllowlistRoot()", friendly: () => "Only TARGETED packets accept a Merkle root." },
  { signature: "PasswordNeedsSecret()", friendly: () => "PASSWORD packets need a hashed secret." },
  { signature: "UnexpectedPasswordSecret()", friendly: () => "Only PASSWORD packets accept a password hash." },
  { signature: "RandomNeedsMaxShare()", friendly: () => "RANDOM/BLIND packets need a non-zero maxShareScalar." },
  { signature: "UnexpectedMaxShare()", friendly: () => "Only RANDOM/BLIND accept maxShareScalar." },
  { signature: "InvalidPacketId()", friendly: () => "No packet exists at this id." },
  {
    signature: "TargetedRequiresProof()",
    friendly: () => "Use claimTargeted with the salt + Merkle proof from your invite link.",
  },
  { signature: "PasswordRequired()", friendly: () => "Use claimWithPassword and supply the secret phrase." },
  {
    signature: "UseClaimForOpenPackets()",
    friendly: () => "Wrong claim variant — use plain claim() for this packet type.",
  },
  { signature: "WrongPassword()", friendly: () => "Password didn't match." },
  {
    signature: "NotAllowlisted()",
    friendly: () => "This wallet isn't on the packet's allowlist (or the proof is wrong).",
  },
  { signature: "AlreadyClaimed()", friendly: () => "This wallet already claimed a slot on this packet." },
  { signature: "AllShareClaimed()", friendly: () => "All slots on this packet are taken." },
  { signature: "PacketExpired()", friendly: () => "Packet has expired." },
  { signature: "PacketRefunded_()", friendly: () => "Packet has been refunded by the creator." },
  { signature: "PacketNotExpired()", friendly: () => "Packet hasn't expired yet — wait until expiry." },
  { signature: "NotCreator()", friendly: () => "Only the original creator can refund this packet." },
  { signature: "NotClaimed()", friendly: () => "Reveal requires that you claimed first." },
  { signature: "AlreadyRevealed()", friendly: () => "You've already revealed this BLIND share." },
  { signature: "RevealOnlyBlindPackets()", friendly: () => "Reveal only applies to BLIND packets." },
  { signature: "Paused()", friendly: () => "Packet creation is paused by the operator." },
  { signature: "AssetVaultNotRegistered()", friendly: () => "This asset's vault isn't registered with CipherGift." },
  // ── External (KMSVerifier / FHE) ──
  {
    signature: "KMSInvalidSigner(address)",
    friendly: ([signer]) =>
      `KMS proof recovered to ${signer}, which isn't an authorised signer. The proof bytes do not match the handle/cleartext bytes signed by KMS; retry after gateway sync, and re-request if it persists.`,
  },
  {
    signature: "KMSSignatureThresholdNotReached()",
    friendly: () => "KMS proof has fewer valid signatures than the on-chain threshold.",
  },
  { signature: "KMSZeroSignatures()", friendly: () => "KMS proof is empty." },
  // ── Solidity built-ins ──
  { signature: "Error(string)", friendly: ([msg]) => String(msg) },
  {
    signature: "Panic(uint256)",
    friendly: ([code]) => `Solidity panic ${String(code)} (arithmetic / array bounds / etc).`,
  },
];

let cachedTable: Map<Hex, KnownError> | undefined;

function table(): Map<Hex, KnownError> {
  if (cachedTable) return cachedTable;
  const m = new Map<Hex, KnownError>();
  for (const entry of KNOWN_ERRORS) {
    const selector = keccak256(stringToBytes(entry.signature)).slice(0, 10) as Hex;
    m.set(selector, { selector, signature: entry.signature, friendly: entry.friendly });
  }
  cachedTable = m;
  return m;
}

/**
 * Decode revert data. Returns a friendly message when known, the raw
 * signature when we have the selector but no friendly mapping, or
 * `undefined` when we can't decode at all.
 */
export function decodeRevert(data: Hex | undefined): string | undefined {
  if (!data || data === "0x" || data.length < 10) return undefined;
  const selector = data.slice(0, 10).toLowerCase() as Hex;
  const entry = table().get(selector);
  if (!entry) return undefined;
  if (!entry.friendly) return entry.signature;
  try {
    const abi = [
      {
        type: "error",
        name: entry.signature.slice(0, entry.signature.indexOf("(")),
        inputs: parseSignatureInputs(entry.signature),
      },
    ];
    const decoded = decodeErrorResult({ abi, data });
    return entry.friendly(decoded.args ?? []);
  } catch {
    return entry.signature;
  }
}

function parseSignatureInputs(signature: string): { type: string; name: string }[] {
  const inside = signature.slice(signature.indexOf("(") + 1, signature.lastIndexOf(")"));
  if (!inside) return [];
  return inside.split(",").map((t, i) => ({ type: t.trim(), name: `arg${i}` }));
}

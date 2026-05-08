/**
 * Detect FHE underflow / "wrap" on the encrypted vault balance.
 *
 * Background: `ConfidentialETHVault.internalDebit` does an unchecked
 * `FHE.sub` on the encrypted balance. If the user's balance is below the
 * amount being subtracted (e.g. created a packet without depositing
 * enough), euint64 wraps to `2^64 - delta`. The decrypted balance then
 * shows up as ~1.84e19 gwei — billions of ETH.
 *
 * Recovery: deposit `delta` more ETH and the next FHE.add brings the
 * stored ciphertext back to a sane (small, real) value, mod 2^64.
 */
const TWO63 = 1n << 63n; // values above this are definitely wrapped
const TWO64 = 1n << 64n;

export interface WrapInfo {
  wrapped: boolean;
  /** Gwei units the user would need to deposit to wrap back to zero. */
  recoveryUnits?: bigint;
}

export function detectWrap(units: bigint | undefined): WrapInfo {
  if (units === undefined) return { wrapped: false };
  if (units < TWO63) return { wrapped: false };
  return { wrapped: true, recoveryUnits: TWO64 - units };
}

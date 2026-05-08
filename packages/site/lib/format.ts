/**
 * Display helpers shared across screens.
 */
import { formatUnits, parseUnits } from "viem";

export const SCALE = 10n ** 9n; // matches ConfidentialETHVault.SCALE — 1 unit = 1 gwei

/** Convert encrypted-vault units (gwei) → human ETH string. */
export function unitsToEthLabel(units: bigint, fractionDigits = 4): string {
  return unitsToAssetLabel(units, 9, fractionDigits);
}

/** ETH-string → vault units (gwei). Throws on non-gwei-aligned input. */
export function ethToUnits(ethString: string): bigint {
  return assetToUnits(ethString, 9);
}

/** Convert encrypted-vault units to a display string for the asset's unit scale. */
export function unitsToAssetLabel(units: bigint, unitDecimals: number, fractionDigits = 4): string {
  const value = Number(formatUnits(units, unitDecimals));
  return value.toFixed(fractionDigits);
}

/** Amount string → encrypted vault units. Throws when precision exceeds unit scale. */
export function assetToUnits(amountString: string, unitDecimals: number): bigint {
  const trimmed = amountString.trim();
  if (!trimmed) throw new Error("Empty amount");
  const [, frac = ""] = trimmed.split(".");
  if (frac.length > unitDecimals) {
    throw new Error(`Precision >${unitDecimals} decimals is not supported`);
  }
  return parseUnits(trimmed, unitDecimals);
}

/** @deprecated use assetToUnits(amount, 9) for new asset-aware code. */
export function legacyEthToUnits(ethString: string): bigint {
  const trimmed = ethString.trim();
  if (!trimmed) throw new Error("Empty amount");
  const [whole = "0", frac = ""] = trimmed.split(".");
  const padded = (frac + "0".repeat(9)).slice(0, 9); // 9 decimals → gwei
  // Fail fast if the user typed >9 decimals (sub-gwei precision).
  if (frac.length > 9) {
    throw new Error("Sub-gwei precision (>9 decimals) is not supported");
  }
  return BigInt(whole) * 10n ** 9n + BigInt(padded || "0");
}

/** Trim a hex address for inline display. */
export function shortAddr(a?: string): string {
  if (!a) return "—";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

/** "5h 12m left" / "32m left" / "14d 4h left" / "expired". */
export function expiresInLabel(expiresAt: number, now = Date.now() / 1000): string {
  const left = Math.max(0, Math.floor(expiresAt - now));
  if (left === 0) return "expired";
  if (left < 60) return `${left}s left`;
  if (left < 3600) return `${Math.floor(left / 60)}m left`;
  if (left < 86400) {
    const h = Math.floor(left / 3600);
    const m = Math.floor((left % 3600) / 60);
    return m > 0 ? `${h}h ${m}m left` : `${h}h left`;
  }
  const d = Math.floor(left / 86400);
  const h = Math.floor((left % 86400) / 3600);
  return h > 0 ? `${d}d ${h}h left` : `${d}d left`;
}

/** "2m ago" / "4h ago" / "3d ago". */
export function relativeTimeLabel(seconds: number, now = Date.now() / 1000): string {
  const delta = Math.max(0, Math.floor(now - seconds));
  if (delta < 60) return `${delta}s ago`;
  if (delta < 3600) return `${Math.floor(delta / 60)}m ago`;
  if (delta < 86400) return `${Math.floor(delta / 3600)}h ago`;
  return `${Math.floor(delta / 86400)}d ago`;
}

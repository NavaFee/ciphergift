"use client";

import type { CSSProperties } from "react";
import { Cipher } from "./Cipher";
import { LockIcon, UnlockIcon } from "./icons";
import { useDecryptPacketTotal } from "~~/hooks/useDecryptPacketTotal";
import { unitsToAssetLabel } from "~~/lib/format";
import { type PacketTypeValue } from "~~/lib/packet-types";

interface Props {
  packetId: bigint;
  packetType: PacketTypeValue;
  totalShares: number;
  /** Only the creator can decrypt — pass `false` to render the static cipher mosaic. */
  canDecrypt: boolean;
  /** Cipher mosaic width (px) when undecrypted. */
  width?: number;
  /** Display precision once decrypted. */
  fractionDigits?: number;
  unitDecimals?: number;
  symbol?: string;
  /** Visual size: "inline" (small, fits in tables) vs "block" (big, fits stat tiles). */
  variant?: "inline" | "block";
  /** Override the cleartext color. */
  color?: string;
}

/**
 * `<Cipher>` wrapper that flips to plaintext on demand. The decrypt
 * round-trip:
 *   1. Read the encrypted handle (`getEqualShare` for EQUAL/TARGETED,
 *      `getRemainingAmount` for RANDOM)
 *   2. `useAllow` if needed (one-time per contract)
 *   3. `useUserDecrypt` (EIP-712 sign)
 *   4. Multiply by `totalShares` for EQUAL/TARGETED to recover the
 *      original total; RANDOM falls back to the encrypted residual.
 */
export function DecryptableTotal({
  packetId,
  packetType,
  totalShares,
  canDecrypt,
  width = 70,
  fractionDigits = 4,
  unitDecimals = 9,
  symbol = "ETH",
  variant = "inline",
  color,
}: Props) {
  if (!canDecrypt) {
    return <Cipher width={width} label="enc" />;
  }
  return (
    <DecryptableTotalInner
      packetId={packetId}
      packetType={packetType}
      totalShares={totalShares}
      width={width}
      fractionDigits={fractionDigits}
      unitDecimals={unitDecimals}
      symbol={symbol}
      variant={variant}
      color={color}
    />
  );
}

function DecryptableTotalInner({
  packetId,
  packetType,
  totalShares,
  width,
  fractionDigits,
  unitDecimals,
  symbol,
  variant,
  color,
}: Omit<Props, "canDecrypt"> & { width: number; fractionDigits: number; variant: "inline" | "block" }) {
  const dec = useDecryptPacketTotal(packetId, packetType, totalShares);

  if (dec.cleartextUnits !== undefined) {
    const labelStyle: CSSProperties = {
      color: color ?? "var(--fhe)",
      fontFamily: variant === "block" ? "var(--font-display)" : "var(--font-mono)",
      fontWeight: variant === "block" ? 600 : 500,
      letterSpacing: variant === "block" ? "-0.02em" : 0,
    };
    return (
      <span style={labelStyle}>
        {unitsToAssetLabel(dec.cleartextUnits, unitDecimals ?? 9, fractionDigits)} {symbol ?? "ETH"}
        {dec.label === "Remaining" && (
          <span style={{ marginLeft: 6, fontSize: 9, color: "var(--ink-3)" }}>(remaining)</span>
        )}
      </span>
    );
  }

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dec.decryptTotal();
  };

  const busy = dec.isAllowing || dec.isDecrypting;
  const blocked = dec.isRandomBlocked;
  const buttonLabel = busy ? "…" : blocked ? "no claim yet" : dec.isAllowed ? "decrypt" : "auth & decrypt";

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <Cipher width={width} label="enc" />
      <button
        type="button"
        onClick={handleClick}
        disabled={!dec.canDecrypt || busy || blocked}
        title={blocked ? "RANDOM gifts reveal residual after the first claim." : "Decrypt with your wallet (EIP-712)."}
        style={{
          background: "none",
          border: "1px solid var(--line-2)",
          borderRadius: 4,
          padding: "2px 6px",
          cursor: dec.canDecrypt && !busy && !blocked ? "pointer" : "not-allowed",
          color: "var(--ink-3)",
          fontSize: 10,
          fontFamily: "var(--font-mono)",
          display: "inline-flex",
          alignItems: "center",
          gap: 3,
          opacity: blocked ? 0.5 : 1,
        }}
      >
        {dec.isAllowed ? <UnlockIcon size={9} /> : <LockIcon size={9} />}
        {buttonLabel}
      </button>
    </span>
  );
}

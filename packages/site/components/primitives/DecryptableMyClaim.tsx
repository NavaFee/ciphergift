"use client";

import type { CSSProperties } from "react";
import { Cipher } from "./Cipher";
import { LockIcon, UnlockIcon } from "./icons";
import { useDecryptMyClaim } from "~~/hooks/useDecryptMyClaim";
import { unitsToAssetLabel } from "~~/lib/format";

interface Props {
  packetId: bigint;
  me: `0x${string}` | undefined;
  width?: number;
  fractionDigits?: number;
  unitDecimals?: number;
  symbol?: string;
}

/**
 * Reveals the connected user's claim amount for a given packet.
 * Mirrors `<DecryptableTotal>` but reads the per-user `claimedAmount`
 * handle and shows a single value (no `*totalShares` math).
 */
export function DecryptableMyClaim({
  packetId,
  me,
  width = 36,
  fractionDigits = 4,
  unitDecimals = 9,
  symbol = "ETH",
}: Props) {
  const dec = useDecryptMyClaim(packetId, me);

  if (dec.cleartextUnits !== undefined) {
    const labelStyle: CSSProperties = {
      color: "var(--fhe)",
      fontFamily: "var(--font-mono)",
      fontWeight: 500,
    };
    return (
      <span style={labelStyle}>
        +{unitsToAssetLabel(dec.cleartextUnits, unitDecimals, fractionDigits)} {symbol}
      </span>
    );
  }

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dec.decryptShare();
  };

  const busy = dec.isAllowing || dec.isDecrypting;
  const buttonLabel = busy ? "…" : dec.isAllowed ? "decrypt" : "auth & decrypt";

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <Cipher width={width} label="enc" />
      <button
        type="button"
        onClick={handleClick}
        disabled={!dec.canDecrypt || busy}
        title="Decrypt your share with your wallet (EIP-712)."
        style={{
          background: "none",
          border: "1px solid var(--line-2)",
          borderRadius: 4,
          padding: "2px 6px",
          cursor: dec.canDecrypt && !busy ? "pointer" : "not-allowed",
          color: "var(--ink-3)",
          fontSize: 10,
          fontFamily: "var(--font-mono)",
          display: "inline-flex",
          alignItems: "center",
          gap: 3,
        }}
      >
        {dec.isAllowed ? <UnlockIcon size={9} /> : <LockIcon size={9} />}
        {buttonLabel}
      </button>
    </span>
  );
}

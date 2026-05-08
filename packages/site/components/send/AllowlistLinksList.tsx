"use client";

import { toast } from "react-hot-toast";
import { Btn } from "~~/components/primitives/Btn";
import { type AllowlistEntry, encodeAllowlistFragment } from "~~/lib/allowlist";
import { unitsToAssetLabel } from "~~/lib/format";
import { buildShareLinkPath } from "~~/lib/share-link";

interface AllowlistLinksListProps {
  packetId: bigint;
  entries: AllowlistEntry[];
  /** Display unit precision for the amount column (vault decimals). cETH = 9. */
  unitDecimals?: number;
  /** Asset symbol for the amount column suffix. */
  symbol?: string;
}

/**
 * Per-invitee share-link list shared between the post-create modal in
 * SendWizard and the `/sent/[id]` recovery panel. Only renders the entry
 * cards + "Copy all"; surrounding chrome (modal, panel header) is the
 * caller's responsibility.
 */
export function AllowlistLinksList({ packetId, entries, unitDecimals = 9, symbol = "cETH" }: AllowlistLinksListProps) {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return (
    <>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {entries.map(entry => {
          const url = `${origin}${buildShareLinkPath(packetId)}#${encodeAllowlistFragment(entry)}`;
          const amountLabel = unitsToAssetLabel(entry.amount, unitDecimals);
          return (
            <div
              key={`${entry.address}-${entry.slotIndex}`}
              style={{
                border: "1px solid var(--line-2)",
                background: "var(--bg-2)",
                borderRadius: 8,
                padding: 10,
                fontSize: 12,
                fontFamily: "var(--font-mono)",
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 }}>
                  <span style={{ color: "var(--ink-3)", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {entry.address}
                  </span>
                  <span
                    style={{
                      color: "var(--accent)",
                      whiteSpace: "nowrap",
                      fontWeight: 600,
                    }}
                  >
                    {amountLabel} {symbol}
                  </span>
                </div>
                <Btn
                  kind="ghost"
                  size="sm"
                  onClick={() => {
                    void navigator.clipboard.writeText(url);
                    toast.success("Link copied");
                  }}
                >
                  Copy
                </Btn>
              </div>
              <div style={{ wordBreak: "break-all", color: "var(--ink-2)", fontSize: 11 }}>{url}</div>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end" }}>
        <Btn
          kind="ghost"
          size="sm"
          onClick={() => {
            const all = entries
              .map(
                e =>
                  `${e.address} (${unitsToAssetLabel(e.amount, unitDecimals)} ${symbol}) → ${origin}${buildShareLinkPath(packetId)}#${encodeAllowlistFragment(e)}`,
              )
              .join("\n");
            void navigator.clipboard.writeText(all);
            toast.success("All links copied");
          }}
        >
          Copy all
        </Btn>
      </div>
    </>
  );
}

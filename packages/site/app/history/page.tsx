"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useReadContracts } from "wagmi";
import { AppChrome } from "~~/components/chrome/AppChrome";
import { IndexerDegradedBanner } from "~~/components/chrome/IndexerDegradedBanner";
import { SideNav } from "~~/components/chrome/SideNav";
import { DecryptableMyClaim } from "~~/components/primitives/DecryptableMyClaim";
import { DecryptableTotal } from "~~/components/primitives/DecryptableTotal";
import { Empty } from "~~/components/primitives/Empty";
import { ClockIcon, GiftIcon, SendIcon } from "~~/components/primitives/icons";
import { useCipherGift } from "~~/hooks/useCipherGift";
import { useAllPackets } from "~~/hooks/usePacketEvents";
import { assetForPacket } from "~~/lib/assets";
import { relativeTimeLabel, shortAddr } from "~~/lib/format";
import { type PacketTypeValue } from "~~/lib/packet-types";

interface Row {
  kind: "send" | "refund" | "claim";
  id: bigint;
  ts: number;
  counterparty: string;
  totalShares: number;
  claimedCount: number;
  packetType: PacketTypeValue;
  assetId?: `0x${string}`;
}

export default function HistoryPage() {
  const { isConnected, address } = useAccount();
  const router = useRouter();
  const wrap = useCipherGift();
  const { packets, indexerDegraded } = useAllPackets();

  // Read claimed[id][me] for every packet so we can flag rows the user
  // claimed without leaking other people's history into the feed.
  const claimedReads = useReadContracts({
    contracts:
      wrap && address
        ? packets.map(
            p =>
              ({
                address: wrap.address,
                abi: wrap.abi,
                functionName: "claimed",
                args: [p.id, address],
              }) as const,
          )
        : [],
    query: { enabled: Boolean(wrap && address && packets.length > 0) },
  });

  useEffect(() => {
    if (!isConnected) router.replace("/");
  }, [isConnected, router]);

  const rows = useMemo<Row[]>(() => {
    if (!address) return [];
    const me = address.toLowerCase();
    const out: Row[] = [];
    packets.forEach((p, i) => {
      const isOwn = p.creator.toLowerCase() === me;
      if (isOwn) {
        out.push({
          kind: p.refunded ? "refund" : "send",
          id: p.id,
          ts: p.createdAt,
          counterparty: `→ ${p.totalShares} recipients`,
          totalShares: p.totalShares,
          claimedCount: p.claimedCount,
          packetType: p.packetType,
          assetId: p.assetId,
        });
        return;
      }
      const didClaim = claimedReads.data?.[i]?.result === true;
      if (didClaim) {
        out.push({
          kind: "claim",
          id: p.id,
          ts: p.createdAt,
          counterparty: `from ${shortAddr(p.creator)}`,
          totalShares: p.totalShares,
          claimedCount: p.claimedCount,
          packetType: p.packetType,
          assetId: p.assetId,
        });
      }
    });
    return out.sort((a, b) => b.ts - a.ts);
  }, [packets, claimedReads.data, address]);

  if (!isConnected) return null;

  return (
    <AppChrome sub="history">
      <SideNav />
      <div style={{ flex: 1, minWidth: 0, overflow: "auto", padding: "28px 36px" }}>
        <div className="tick" style={{ marginBottom: 6 }}>
          YOUR ACTIVITY
        </div>
        <h2
          style={{
            margin: "0 0 4px",
            fontFamily: "var(--font-display)",
            fontSize: 28,
            fontWeight: 600,
            letterSpacing: "-0.02em",
          }}
        >
          History
        </h2>
        <p style={{ fontSize: 12, color: "var(--ink-3)", margin: "0 0 20px" }}>
          Packets you sent and packets you claimed. Other people&apos;s activity stays private to them.
        </p>

        {indexerDegraded && <IndexerDegradedBanner />}

        <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "40px 1.2fr 1.5fr 1fr 100px",
              gap: 14,
              padding: "12px 18px",
              background: "var(--bg-2)",
              borderBottom: "1px solid var(--line)",
            }}
          >
            {["", "Event", "Counterparty", "Amount", "When"].map((h, i) => (
              <span key={i} className="tick" style={{ color: "var(--ink-3)" }}>
                {h}
              </span>
            ))}
          </div>
          {rows.length === 0 ? (
            <Empty title="No activity yet" detail="Send a gift or claim one — it'll show up here for your eyes only." />
          ) : (
            rows.map((r, i) => {
              const asset = assetForPacket(r.assetId);
              return (
                <div
                  key={`${r.kind}-${String(r.id)}-${i}`}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "40px 1.2fr 1.5fr 1fr 100px",
                    gap: 14,
                    padding: "14px 18px",
                    alignItems: "center",
                    borderBottom: i < rows.length - 1 ? "1px solid var(--line)" : "none",
                  }}
                >
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 6,
                      background:
                        r.kind === "send"
                          ? "rgba(255,210,0,.12)"
                          : r.kind === "claim"
                            ? "rgba(182,245,105,.12)"
                            : "var(--bg-2)",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: r.kind === "send" ? "var(--accent)" : r.kind === "claim" ? "var(--fhe)" : "var(--ink-3)",
                    }}
                  >
                    {r.kind === "send" ? (
                      <SendIcon size={13} />
                    ) : r.kind === "claim" ? (
                      <GiftIcon size={13} />
                    ) : (
                      <ClockIcon size={13} />
                    )}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {r.kind === "send" ? "Sent gift" : r.kind === "claim" ? "Claimed share" : "Refunded"}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--ink-2)" }}>{r.counterparty}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {r.kind === "claim" ? (
                      <DecryptableMyClaim
                        packetId={r.id}
                        me={address}
                        unitDecimals={asset.unitDecimals}
                        symbol={asset.symbol}
                      />
                    ) : (
                      <>
                        <GiftIcon size={14} />
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink-2)" }}>
                          {asset.symbol} · {r.claimedCount}/{r.totalShares}
                        </span>
                        <DecryptableTotal
                          packetId={r.id}
                          packetType={r.packetType}
                          totalShares={r.totalShares}
                          canDecrypt
                          width={36}
                          unitDecimals={asset.unitDecimals}
                          symbol={asset.symbol}
                        />
                      </>
                    )}
                  </div>
                  <span className="tick">{relativeTimeLabel(r.ts)}</span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </AppChrome>
  );
}

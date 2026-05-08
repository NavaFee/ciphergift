"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { AppChrome } from "~~/components/chrome/AppChrome";
import { IndexerDegradedBanner } from "~~/components/chrome/IndexerDegradedBanner";
import { SideNav } from "~~/components/chrome/SideNav";
import { DecryptableTotal } from "~~/components/primitives/DecryptableTotal";
import { Empty } from "~~/components/primitives/Empty";
import { Loading } from "~~/components/primitives/Loading";
import { ClockIcon, GiftIcon } from "~~/components/primitives/icons";
import { useSentPackets } from "~~/hooks/usePacketEvents";
import { assetForPacket } from "~~/lib/assets";
import { expiresInLabel, relativeTimeLabel } from "~~/lib/format";

const PTYPE_LABEL = ["lucky", "equal", "targeted", "password"] as const;

export default function SentPage() {
  const { isConnected, address } = useAccount();
  const router = useRouter();
  const { sent, isLoading, indexerDegraded } = useSentPackets(address);

  useEffect(() => {
    if (!isConnected) router.replace("/");
  }, [isConnected, router]);

  if (!isConnected) return null;

  return (
    <AppChrome sub="sent">
      <SideNav />
      <div style={{ flex: 1, minWidth: 0, overflow: "auto", padding: "28px 36px" }}>
        <div className="tick" style={{ marginBottom: 6 }}>
          YOUR GIFTS
        </div>
        <h2
          style={{
            margin: 0,
            fontFamily: "var(--font-display)",
            fontSize: 28,
            fontWeight: 600,
            letterSpacing: "-0.02em",
            marginBottom: 22,
          }}
        >
          Sent
        </h2>

        {indexerDegraded && <IndexerDegradedBanner />}

        {isLoading && sent.length === 0 ? (
          <Loading label="Loading sent gifts" />
        ) : sent.length === 0 ? (
          <Empty
            title="No sent gifts yet"
            detail="Compose one from the send screen."
            action={
              <Link href="/send" style={{ color: "var(--accent)", textDecoration: "none" }}>
                Compose one →
              </Link>
            }
          />
        ) : (
          <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
            {sent.map((p, i) => {
              const asset = assetForPacket(p.assetId);
              return (
                <Link
                  key={String(p.id)}
                  href={`/sent/${p.id}`}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "auto 1fr auto auto auto",
                    gap: 14,
                    alignItems: "center",
                    padding: "14px 18px",
                    borderBottom: i < sent.length - 1 ? "1px solid var(--line)" : "none",
                    textDecoration: "none",
                    color: "inherit",
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      background: "linear-gradient(135deg, #382c00 0%, #1a1a1a 100%)",
                      border: "1px solid var(--line-2)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "var(--accent)",
                    }}
                  >
                    <GiftIcon size={16} />
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{p.note || `Gift #${p.id}`}</div>
                    <div className="tick">
                      {PTYPE_LABEL[p.packetType]} · {asset.symbol} · {relativeTimeLabel(p.createdAt)}
                    </div>
                  </div>
                  <div className="tick">
                    {p.claimedCount}/{p.totalShares} claimed
                  </div>
                  <div style={{ display: "flex", alignItems: "center" }}>
                    <DecryptableTotal
                      packetId={p.id}
                      packetType={p.packetType}
                      totalShares={p.totalShares}
                      canDecrypt
                      width={50}
                      fractionDigits={4}
                      unitDecimals={asset.unitDecimals}
                      symbol={asset.symbol}
                    />
                  </div>
                  <span className="tick" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <ClockIcon size={10} /> {expiresInLabel(p.expiresAt)}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </AppChrome>
  );
}

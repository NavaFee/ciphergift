"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { AppChrome } from "~~/components/chrome/AppChrome";
import { IndexerDegradedBanner } from "~~/components/chrome/IndexerDegradedBanner";
import { SideNav } from "~~/components/chrome/SideNav";
import { OpenModal } from "~~/components/inbox/OpenModal";
import { PacketCard } from "~~/components/inbox/PacketCard";
import { QrScanner } from "~~/components/inbox/QrScanner";
import { Btn } from "~~/components/primitives/Btn";
import { Empty } from "~~/components/primitives/Empty";
import { Loading } from "~~/components/primitives/Loading";
import { QrIcon } from "~~/components/primitives/icons";
import { useIncomingPackets } from "~~/hooks/usePacketEvents";
import type { PacketSummary } from "~~/hooks/usePacketEvents";
import { shortAddr } from "~~/lib/format";

type FilterId = "all" | "fhe" | "expiring";

const FILTERS: { id: FilterId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "fhe", label: "FHE-encrypted" },
  { id: "expiring", label: "Expiring" },
];

export default function InboxPage() {
  const { isConnected, address } = useAccount();
  const router = useRouter();
  const { incoming, invites, isLoading, indexerDegraded, refetch } = useIncomingPackets(address);
  const [filter, setFilter] = useState<FilterId>("all");
  const [opening, setOpening] = useState<PacketSummary | null>(null);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    if (!isConnected) router.replace("/");
  }, [isConnected, router]);

  // Refresh after the open modal closes (likely a claim happened).
  useEffect(() => {
    if (opening === null) refetch();
  }, [opening, refetch]);

  const filtered = useMemo(() => {
    const now = Date.now() / 1000;
    if (filter === "all") return incoming;
    if (filter === "expiring") return incoming.filter(p => p.expiresAt - now < 6 * 3600);
    if (filter === "fhe") return incoming; // every packet is FHE-encrypted in v1
    return incoming;
  }, [incoming, filter]);

  if (!isConnected) return null;

  return (
    <AppChrome sub="inbox">
      <SideNav inboxBadge={incoming.length || undefined} />
      <div style={{ flex: 1, minWidth: 0, overflow: "auto", padding: "28px 36px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            marginBottom: 22,
          }}
        >
          <div>
            <div className="tick" style={{ marginBottom: 6 }}>
              INBOX · CLAIMABLE
            </div>
            <h2
              style={{
                margin: 0,
                fontFamily: "var(--font-display)",
                fontSize: 28,
                fontWeight: 600,
                letterSpacing: "-0.02em",
              }}
            >
              Gifts waiting for you<span style={{ color: "var(--accent)" }}>.</span>
            </h2>
            <div style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 6 }}>
              {incoming.length} unclaimed · all amounts decrypted only on claim
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <Btn kind="ghost" size="sm" icon={<QrIcon size={12} />} onClick={() => setScanning(true)}>
              Scan QR
            </Btn>
            <div className="tab-pill">
              {FILTERS.map(f => (
                <button key={f.id} className={filter === f.id ? "active" : ""} onClick={() => setFilter(f.id)}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {indexerDegraded && <IndexerDegradedBanner />}

        {isLoading && filtered.length === 0 ? (
          <Loading label="Loading gifts" />
        ) : filtered.length === 0 ? (
          <Empty
            title="Nothing to claim right now"
            detail="Paste a gift link, scan a QR code, or wait for one to land."
          />
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14 }}>
            {filtered.map(p => (
              <PacketCard key={String(p.id)} packet={p} onOpen={() => setOpening(p)} />
            ))}
          </div>
        )}
      </div>

      {opening && (
        <OpenModal
          packet={opening}
          fromLabel={shortAddr(opening.creator)}
          targetedProof={invites?.[opening.id.toString()]}
          onClose={() => setOpening(null)}
        />
      )}
      {scanning && (
        <QrScanner
          onClose={() => setScanning(false)}
          onResolve={url => {
            setScanning(false);
            router.push(url);
          }}
        />
      )}
    </AppChrome>
  );
}

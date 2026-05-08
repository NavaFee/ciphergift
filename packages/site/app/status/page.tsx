"use client";

import { useEffect, useState } from "react";
import { AppChrome } from "~~/components/chrome/AppChrome";
import { SideNav } from "~~/components/chrome/SideNav";
import { ErrorPanel } from "~~/components/primitives/ErrorPanel";
import { Loading } from "~~/components/primitives/Loading";
import { INDEXER_URL, type IndexerHealth, SUBGRAPH_URL, fetchHealth, indexerEnabled } from "~~/lib/indexer";

export default function StatusPage() {
  const [health, setHealth] = useState<IndexerHealth | undefined>();
  const [checkedAt, setCheckedAt] = useState<Date | undefined>();
  const [loading, setLoading] = useState(indexerEnabled);

  useEffect(() => {
    let cancelled = false;
    if (!indexerEnabled) return;
    setLoading(true);
    fetchHealth()
      .then(h => {
        if (cancelled) return;
        setHealth(h);
        setCheckedAt(new Date());
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = [
    ["Subgraph URL", SUBGRAPH_URL ?? "not configured"],
    ["REST indexer URL", INDEXER_URL ?? "not configured"],
    ["Active source", health?.source ?? (loading ? "checking" : "none")],
    ["Indexer health", !indexerEnabled ? "disabled" : health?.ok ? "ok" : loading ? "checking" : "unreachable"],
    ["Last indexed block", health?.lastBlock ?? "-"],
    ["Packets indexed", health?.packetCount?.toString() ?? "-"],
    ["Claims indexed", health?.claimCount?.toString() ?? "-"],
    ["Reveals indexed", health?.revealCount?.toString() ?? "-"],
    ["Contract paused", health?.paused === undefined ? "-" : health.paused ? "yes" : "no"],
    ["Owner", health?.owner ?? "-"],
    ["Pending owner", health?.pendingOwner ?? "-"],
    ["Last check", checkedAt?.toLocaleString() ?? "-"],
  ];

  return (
    <AppChrome sub="status">
      <SideNav />
      <div style={{ flex: 1, minWidth: 0, overflow: "auto", padding: "28px 36px" }}>
        <div className="tick" style={{ marginBottom: 6 }}>
          OPERATIONS
        </div>
        <h2
          style={{
            margin: "0 0 22px",
            fontFamily: "var(--font-display)",
            fontSize: 28,
            fontWeight: 600,
            letterSpacing: "-0.02em",
          }}
        >
          Status
        </h2>

        {loading ? (
          <Loading label="Checking indexer" />
        ) : indexerEnabled && !health ? (
          <ErrorPanel title="Indexer unreachable" detail="The app will fall back to direct chain reads." />
        ) : null}

        <div className="panel" style={{ padding: 0, overflow: "hidden", maxWidth: 760 }}>
          {rows.map(([label, value], index) => (
            <div
              key={label}
              style={{
                display: "grid",
                gridTemplateColumns: "180px 1fr",
                gap: 18,
                padding: "14px 18px",
                borderBottom: index < rows.length - 1 ? "1px solid var(--line)" : "none",
              }}
            >
              <span className="tick">{label}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink-2)" }}>{value}</span>
            </div>
          ))}
        </div>
      </div>
    </AppChrome>
  );
}

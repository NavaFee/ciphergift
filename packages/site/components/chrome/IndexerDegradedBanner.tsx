"use client";

import { ClockIcon } from "~~/components/primitives/icons";

export function IndexerDegradedBanner() {
  return (
    <div
      className="panel"
      style={{
        marginBottom: 18,
        padding: "10px 12px",
        border: "1px solid var(--warn)",
        background: "rgba(255,170,58,0.06)",
        display: "flex",
        alignItems: "center",
        gap: 10,
        color: "var(--ink-2)",
        fontSize: 12,
      }}
    >
      <ClockIcon size={13} />
      <div>
        <strong style={{ color: "var(--warn)" }}>Indexer fallback.</strong> Reading gift data directly from chain. Lists
        may load slower.
      </div>
    </div>
  );
}

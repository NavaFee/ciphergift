"use client";

import { LockIcon } from "~~/components/primitives/icons";

interface LoadingProps {
  label?: string;
  compact?: boolean;
}

export function Loading({ label = "Loading encrypted state", compact = false }: LoadingProps) {
  return (
    <div
      className="panel"
      style={{
        padding: compact ? 18 : 40,
        textAlign: "center",
        color: "var(--ink-3)",
        fontSize: 13,
      }}
    >
      <span
        style={{
          width: 26,
          height: 26,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 10,
          color: "var(--crypt)",
          animation: "pulse 1.2s ease-in-out infinite",
        }}
      >
        <LockIcon size={18} />
      </span>
      <div>{label}</div>
    </div>
  );
}

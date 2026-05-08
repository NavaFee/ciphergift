"use client";

import type { ReactNode } from "react";
import { Btn } from "~~/components/primitives/Btn";
import { LockIcon } from "~~/components/primitives/icons";

interface ErrorPanelProps {
  title: string;
  detail?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
}

export function ErrorPanel({ title, detail, actionLabel = "Retry", onAction }: ErrorPanelProps) {
  return (
    <div
      className="panel"
      style={{
        padding: 16,
        border: "1px solid var(--danger)",
        background: "rgba(255,94,58,0.06)",
        color: "var(--ink-2)",
      }}
    >
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <LockIcon size={14} style={{ color: "var(--danger)", marginTop: 1 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "var(--danger)", marginBottom: 4 }}>{title}</div>
          {detail && <div style={{ fontSize: 12, lineHeight: 1.5, wordBreak: "break-word" }}>{detail}</div>}
        </div>
        {onAction && (
          <Btn kind="ghost" size="sm" onClick={onAction}>
            {actionLabel}
          </Btn>
        )}
      </div>
    </div>
  );
}

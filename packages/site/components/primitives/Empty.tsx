"use client";

import type { ReactNode } from "react";
import { SparkIcon } from "~~/components/primitives/icons";

interface EmptyProps {
  title: string;
  detail?: ReactNode;
  action?: ReactNode;
}

export function Empty({ title, detail, action }: EmptyProps) {
  return (
    <div
      style={{
        padding: 40,
        background: "var(--bg-1)",
        border: "1px dashed var(--line-2)",
        borderRadius: 12,
        textAlign: "center",
      }}
    >
      <SparkIcon size={18} />
      <div style={{ marginTop: 10, fontSize: 13, fontWeight: 600 }}>{title}</div>
      {detail && <div style={{ marginTop: 6, fontSize: 13, color: "var(--ink-2)" }}>{detail}</div>}
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  );
}

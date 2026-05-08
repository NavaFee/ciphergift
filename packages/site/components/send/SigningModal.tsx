"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Brackets } from "~~/components/primitives/Brackets";
import { Btn } from "~~/components/primitives/Btn";
import { ErrorPanel } from "~~/components/primitives/ErrorPanel";
import { CheckIcon } from "~~/components/primitives/icons";
import type { CreateStep } from "~~/hooks/useCreatePacket";

interface Props {
  step: CreateStep;
  onClose: () => void;
}

const ORDER: { phase: CreateStep["name"]; label: string; detail: string }[] = [
  { phase: "encrypting", label: "Encrypting amounts under FHE", detail: "tfhe.encrypt(total) → ciphertext" },
  { phase: "submitting", label: "Awaiting wallet signature", detail: "signTypedData(...)" },
  { phase: "confirming", label: "Submitting to FHEVM", detail: "tx → gift stored" },
  { phase: "done", label: "Sealed", detail: "gift now live" },
];

function indexOfPhase(name: CreateStep["name"]): number {
  if (name === "idle" || name === "error") return -1;
  return ORDER.findIndex(s => s.phase === name);
}

export function SigningModal({ step, onClose }: Props) {
  const router = useRouter();
  const currentIdx = indexOfPhase(step.name);

  useEffect(() => {
    if (step.name === "done") {
      const t = setTimeout(() => {
        router.push("/dashboard");
        onClose();
      }, 1400);
      return () => clearTimeout(t);
    }
  }, [step.name, router, onClose]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
        padding: 30,
      }}
      onClick={() => {
        if (step.name === "error") onClose();
      }}
    >
      <div
        className="panel"
        onClick={e => e.stopPropagation()}
        style={{ width: 440, padding: 28, position: "relative" }}
      >
        <Brackets />
        <div className="tick" style={{ marginBottom: 8, color: "var(--accent)" }}>
          SIGNING TRANSACTION
        </div>
        <h3
          style={{
            margin: 0,
            fontFamily: "var(--font-display)",
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: "-0.02em",
            marginBottom: 4,
          }}
        >
          Sealing your gift…
        </h3>
        <p style={{ fontSize: 13, color: "var(--ink-2)", marginBottom: 22 }}>
          Encryption happens in your browser. Plaintext never leaves this tab.
        </p>

        {ORDER.map((s, i) => {
          const isDone = currentIdx > i;
          const isDoing = currentIdx === i;
          const isPending = currentIdx < i;
          return (
            <div
              key={s.phase}
              style={{
                display: "grid",
                gridTemplateColumns: "24px 1fr",
                gap: 12,
                padding: "10px 0",
                alignItems: "flex-start",
                opacity: isPending ? 0.4 : 1,
              }}
            >
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 5,
                  background: isDone ? "var(--fhe)" : isDoing ? "transparent" : "var(--bg-3)",
                  border: isDoing ? "2px solid var(--accent)" : "none",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: isDone ? "#08130a" : "var(--ink-2)",
                }}
              >
                {isDone && <CheckIcon size={12} />}
                {isDoing && (
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: "var(--accent)",
                      animation: "pulse 1s ease-in-out infinite",
                    }}
                  />
                )}
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{s.label}</div>
                <div className="tick" style={{ marginTop: 2 }}>
                  {isDoing && step.name !== "idle" && step.name !== "error" && "detail" in step
                    ? step.detail
                    : s.detail}
                </div>
              </div>
            </div>
          );
        })}

        {step.name === "done" && (
          <div
            style={{
              marginTop: 14,
              padding: "12px 14px",
              borderRadius: 8,
              background: "rgba(182,245,105,0.06)",
              border: "1px solid var(--fhe)",
              fontSize: 12,
              color: "var(--fhe)",
            }}
          >
            ✓ Gift sealed. Redirecting…
          </div>
        )}

        {step.name === "error" && (
          <>
            <div style={{ marginTop: 14 }}>
              <ErrorPanel title="Could not seal gift" detail={step.message} />
            </div>
            <div style={{ marginTop: 18, display: "flex", justifyContent: "flex-end" }}>
              <Btn kind="ghost" size="sm" onClick={onClose}>
                Close
              </Btn>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

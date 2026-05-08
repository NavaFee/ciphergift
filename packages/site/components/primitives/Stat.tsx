import { Cipher } from "./Cipher";

interface StatProps {
  label: string;
  value?: string;
  sub?: string;
  encrypted?: boolean;
  accent?: boolean;
}

export function Stat({ label, value, sub, encrypted, accent }: StatProps) {
  return (
    <div
      style={{
        padding: 16,
        borderRadius: 10,
        position: "relative",
        background: "var(--bg-1)",
        border: "1px solid var(--line)",
        ...(accent ? { background: "var(--accent)", color: "var(--accent-ink)", borderColor: "var(--accent)" } : {}),
      }}
    >
      <div
        style={{
          fontSize: 10,
          letterSpacing: ".12em",
          textTransform: "uppercase",
          color: accent ? "rgba(0,0,0,.7)" : "var(--ink-3)",
          fontWeight: 600,
          marginBottom: 10,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 28,
          fontWeight: 600,
          letterSpacing: "-0.02em",
          lineHeight: 1,
        }}
      >
        {encrypted ? <Cipher width={70} label="enc" /> : value}
      </div>
      {sub && (
        <div
          style={{
            marginTop: 8,
            fontSize: 11,
            color: accent ? "rgba(0,0,0,.65)" : "var(--ink-3)",
            fontFamily: "var(--font-mono)",
          }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

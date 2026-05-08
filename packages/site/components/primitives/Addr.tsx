/**
 * Address pill with deterministic conic-gradient avatar (blockie-ish).
 * Pass either a hex address or an ENS name as `a`.
 */

interface AddrProps {
  a?: string;
  avatar?: boolean;
  dim?: boolean;
}

export function Addr({ a = "0x91A4…d2e1", avatar = true, dim }: AddrProps) {
  const hueA = (a.charCodeAt(2) * 7) % 360;
  const hueB = (a.charCodeAt(4) * 11) % 360;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontFamily: "var(--font-mono)",
        fontSize: 12,
        color: dim ? "var(--ink-3)" : "var(--ink-2)",
      }}
    >
      {avatar && (
        <span
          style={{
            width: 14,
            height: 14,
            borderRadius: 3,
            background: `conic-gradient(from 0deg, hsl(${hueA} 70% 55%), hsl(${hueB} 70% 55%), hsl(${hueA} 70% 55%))`,
            border: "1px solid var(--line-2)",
          }}
        />
      )}
      {a}
    </span>
  );
}

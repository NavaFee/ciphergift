interface LogoProps {
  size?: number;
}

/**
 * ciphergift wordmark + bow-and-key mark.
 * Sourced from the Claude Design handoff (readpack/project/logos.jsx).
 *   – The "key teeth" along the horizontal ribbon nod to cipher/cryptography.
 *   – Colours map to the site's dark theme: var(--ink) is the visible
 *     foreground (paper-light on the chrome's dark surface), var(--accent)
 *     is the #FFD200 gold ribbon.
 */
export function Logo({ size = 22 }: LogoProps) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <svg width={size} height={size} viewBox="0 0 100 100" fill="none" aria-hidden>
        {/* box */}
        <rect x="18" y="40" width="64" height="46" rx="3" fill="var(--ink)" />
        {/* vertical ribbon */}
        <rect x="46" y="40" width="8" height="46" fill="var(--accent)" />
        {/* horizontal ribbon */}
        <rect x="18" y="58" width="64" height="8" fill="var(--accent)" />
        {/* bow loops */}
        <path d="M50 40 C 36 28, 30 36, 38 44 L 50 44 Z" fill="var(--accent)" />
        <path d="M50 40 C 64 28, 70 36, 62 44 L 50 44 Z" fill="var(--accent)" />
        {/* knot */}
        <rect x="46" y="38" width="8" height="6" rx="1" fill="var(--ink)" />
        {/* key teeth on the sides */}
        <rect x="14" y="60" width="4" height="4" fill="var(--ink)" />
        <rect x="10" y="60" width="4" height="4" fill="var(--ink)" />
        <rect x="82" y="60" width="4" height="4" fill="var(--ink)" />
        <rect x="86" y="60" width="4" height="4" fill="var(--ink)" />
      </svg>
      <span
        style={{
          fontFamily: "var(--font-display)",
          fontWeight: 600,
          fontSize: 16,
          letterSpacing: "-0.03em",
          lineHeight: 1,
        }}
      >
        cipher<span style={{ color: "var(--accent)" }}>gift</span>
      </span>
    </div>
  );
}

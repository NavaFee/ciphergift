"use client";

import { useEffect, useState } from "react";

const LINES = [
  "> requesting reencryption key…",
  "> verifying eligibility (FHE.eq)",
  "> drawing share via fheRand()",
  "> reencrypt(amount, sessionKey)",
  "> ✓ decrypted locally",
];

export function DecryptLog() {
  const [n, setN] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setN(x => Math.min(x + 1, LINES.length)), 320);
    return () => clearInterval(t);
  }, []);
  return (
    <div style={{ textAlign: "left", fontFamily: "var(--font-mono)", minHeight: 90 }}>
      {LINES.slice(0, n).map((l, i) => (
        <div key={i} style={{ color: i === n - 1 ? "var(--fhe)" : "var(--ink-3)" }}>
          {l}
        </div>
      ))}
    </div>
  );
}

"use client";

import { useMemo } from "react";

const COLORS = ["var(--accent)", "var(--fhe)", "var(--crypt)", "#ff5e3a", "#fff"];

export function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 30 }, (_, i) => ({
        x: Math.random() * 100,
        delay: Math.random() * 0.6,
        duration: 1.4 + Math.random() * 1.5,
        color: COLORS[i % COLORS.length],
        size: 6 + Math.random() * 6,
        rotate: Math.random() * 360,
      })),
    [],
  );
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
        borderRadius: 14,
      }}
    >
      {pieces.map((p, i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            top: -10,
            left: `${p.x}%`,
            width: p.size,
            height: p.size * 0.6,
            background: p.color,
            animation: `fall ${p.duration}s ${p.delay}s linear forwards`,
            transform: `rotate(${p.rotate}deg)`,
          }}
        />
      ))}
    </div>
  );
}

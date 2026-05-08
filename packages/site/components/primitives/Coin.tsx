/**
 * Token chip. `kind` selects the color/letter mapping; `size` changes
 * diameter (font size scales proportionally).
 */

export type CoinKind = "eth" | "usdc" | "usdt" | "zama" | "czama";

interface CoinProps {
  kind?: CoinKind;
  size?: number;
}

const MAP: Record<CoinKind, { cls: string; label: string }> = {
  eth: { cls: "coin-eth", label: "Ξ" },
  usdc: { cls: "coin-usdc", label: "$" },
  usdt: { cls: "coin-usdc", label: "₮" },
  zama: { cls: "coin-zama", label: "Z" },
  czama: { cls: "coin-zama", label: "cZ" },
};

export function Coin({ kind = "eth", size = 28 }: CoinProps) {
  const m = MAP[kind] ?? MAP.eth;
  return (
    <span className={`coin ${m.cls}`} style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {m.label}
    </span>
  );
}

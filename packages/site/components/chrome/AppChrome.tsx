"use client";

import type { ReactNode } from "react";
import { Logo } from "./Logo";
import { useAccount, useBalance, useChainId } from "wagmi";
import { Addr } from "~~/components/primitives/Addr";
import { Coin } from "~~/components/primitives/Coin";

interface AppChromeProps {
  children: ReactNode;
  /** Tag shown after the logo, e.g. "app.ciphergift.xyz" or current page name. */
  sub?: string;
}

function shortenAddr(a?: string): string {
  if (!a) return "—";
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

export function AppChrome({ children, sub = "app.ciphergift.xyz" }: AppChromeProps) {
  const { address } = useAccount();
  const chainId = useChainId();
  const { data: bal } = useBalance({ address });

  const balanceLabel = bal ? `${Number(bal.formatted).toFixed(4)} ${bal.symbol}` : "— ETH";
  const networkLabel =
    chainId === 31337 ? "Hardhat · FHE" : chainId === 11155111 ? "Sepolia · FHE" : `Chain ${chainId} · FHE`;

  return (
    <div
      className="app-shell"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "var(--bg)",
        color: "var(--ink)",
        flex: 1,
        minHeight: 0,
      }}
    >
      <div
        className="app-topbar"
        style={{
          height: 52,
          padding: "0 18px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid var(--line)",
          background: "var(--bg-1)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Logo />
          <span className="tick">/ {sub}</span>
        </div>
        <div className="app-topbar-right" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="badge b-fhe">
            <span className="dot-pulse" /> {networkLabel}
          </span>
          <div
            className="app-topbar-balance"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 12px",
              border: "1px solid var(--line-2)",
              borderRadius: 8,
              background: "var(--bg-2)",
            }}
          >
            <Coin kind="eth" size={18} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--ink-2)" }}>{balanceLabel}</span>
            <span style={{ width: 1, height: 14, background: "var(--line-2)" }} />
            <Addr a={shortenAddr(address)} />
          </div>
        </div>
      </div>
      <div className="app-shell-body" style={{ flex: 1, minHeight: 0, display: "flex" }}>
        {children}
      </div>
    </div>
  );
}

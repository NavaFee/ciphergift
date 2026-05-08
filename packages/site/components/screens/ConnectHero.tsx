"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";
import { Logo } from "~~/components/chrome/Logo";
import { LockIcon } from "~~/components/primitives/icons";

interface WalletCard {
  id: "mm" | "wc" | "cb" | "rb";
  name: string;
  sub: string;
  tag?: string;
}

const WALLETS: WalletCard[] = [
  { id: "mm", name: "MetaMask", sub: "Browser extension", tag: "Recommended" },
  { id: "wc", name: "WalletConnect", sub: "Mobile · 300+ wallets" },
  { id: "cb", name: "Coinbase Wallet", sub: "Smart wallet" },
  { id: "rb", name: "Rabby", sub: "Multi-chain" },
];

export function ConnectHero() {
  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const router = useRouter();
  const [pending, setPending] = useState<WalletCard["id"] | null>(null);

  // Redirect to dashboard once a wallet is connected.
  useEffect(() => {
    if (isConnected) router.replace("/dashboard");
  }, [isConnected, router]);

  const trigger = (id: WalletCard["id"]) => {
    setPending(id);
    if (openConnectModal) openConnectModal();
    // RainbowKit opens its own picker; pending state resets if the modal closes
    // without a connection (handled by isConnected effect or timeout).
    setTimeout(() => setPending(null), 600);
  };

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        overflow: "hidden",
        background: "var(--bg)",
        color: "var(--ink)",
        display: "flex",
        flex: 1,
      }}
    >
      {/* LEFT — hero */}
      <div
        style={{
          flex: 1.15,
          padding: "40px 44px",
          position: "relative",
          background: "linear-gradient(180deg, #0a0a0a 0%, #141104 100%)",
          borderRight: "1px solid var(--line)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div className="dot-bg" style={{ position: "absolute", inset: 0, opacity: 0.5, pointerEvents: "none" }} />

        <div
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Logo size={26} />
          <span className="tick">v0.1.0 · sepolia.fhevm</span>
        </div>

        <div style={{ position: "relative", marginTop: "auto", marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 22 }}>
            <span className="badge b-fhe">
              <LockIcon size={10} /> Built on FHEVM
            </span>
            <span className="badge b-accent">Confidential payouts</span>
          </div>
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 600,
              fontSize: 56,
              lineHeight: 1.02,
              letterSpacing: "-0.03em",
              margin: "0 0 18px",
            }}
          >
            Send a gift.
            <br />
            <span style={{ color: "var(--accent)" }}>Hide the amount.</span>
            <br />
            Pay only who you mean.
          </h1>
          <p
            style={{
              fontSize: 15,
              lineHeight: 1.55,
              color: "var(--ink-2)",
              maxWidth: 460,
              margin: 0,
            }}
          >
            On-chain gifts where balances, recipients, and claim records stay encrypted under FHE. Only the addressee
            can decrypt their share — even validators see ciphertext.
          </p>
        </div>

        {/* tile strip */}
        <div
          style={{
            position: "relative",
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 1,
            background: "var(--line)",
            border: "1px solid var(--line)",
            borderRadius: 10,
            overflow: "hidden",
          }}
        >
          {[
            { k: "Encrypted total", v: "∑ enc" },
            { k: "Per-share", v: "fheRand()" },
            { k: "Hidden recipients", v: "addr → enc" },
            { k: "Private claim log", v: "∅ public" },
          ].map(c => (
            <div key={c.k} style={{ padding: "14px 12px", background: "var(--bg-1)" }}>
              <div className="tick" style={{ marginBottom: 6, color: "var(--ink-3)" }}>
                {c.k}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--accent)" }}>{c.v}</div>
            </div>
          ))}
        </div>

        <div
          style={{
            position: "relative",
            marginTop: 14,
            display: "flex",
            gap: 14,
            color: "var(--ink-3)",
            fontSize: 11,
          }}
        >
          <span className="tick">⌘ built on @fhevm/solidity</span>
          <span className="tick">·</span>
          <span className="tick">no plaintext leaves your browser</span>
        </div>
      </div>

      {/* RIGHT — connect */}
      <div
        style={{
          width: 380,
          padding: "40px 32px",
          background: "var(--bg-1)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div className="tick" style={{ color: "var(--ink-3)", marginBottom: 6 }}>
          STEP 01 / 02
        </div>
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 24,
            fontWeight: 600,
            letterSpacing: "-0.02em",
            marginBottom: 6,
          }}
        >
          Connect a wallet
        </div>
        <div style={{ fontSize: 13, color: "var(--ink-2)", marginBottom: 24, lineHeight: 1.5 }}>
          We&apos;ll generate a session key for FHE re-encryption. No assets move until you sign.
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {WALLETS.map(w => {
            const active = pending === w.id;
            return (
              <button
                key={w.id}
                type="button"
                onClick={() => trigger(w.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 14px",
                  borderRadius: 10,
                  cursor: "pointer",
                  textAlign: "left",
                  background: active ? "rgba(255,210,0,0.06)" : "var(--bg-2)",
                  border: `1px solid ${active ? "var(--accent)" : "var(--line-2)"}`,
                  color: "var(--ink)",
                  fontFamily: "var(--font-sans)",
                  transition: "all .15s",
                }}
              >
                <span
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 6,
                    background: "var(--bg-3)",
                    border: "1px solid var(--line-2)",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: "var(--font-mono)",
                    fontWeight: 700,
                    fontSize: 13,
                    color: "var(--accent)",
                  }}
                >
                  {w.name[0]}
                </span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{w.name}</div>
                  <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{w.sub}</div>
                </div>
                {w.tag && !active && (
                  <span className="badge b-accent" style={{ height: 20, fontSize: 9 }}>
                    {w.tag}
                  </span>
                )}
                {active && (
                  <span
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: "50%",
                      border: "2px solid var(--line-2)",
                      borderTopColor: "var(--accent)",
                      animation: "spin 0.8s linear infinite",
                    }}
                  />
                )}
              </button>
            );
          })}
        </div>

        <div style={{ flex: 1 }} />

        <div
          style={{
            marginTop: 22,
            padding: 14,
            borderRadius: 8,
            background: "var(--bg-2)",
            border: "1px solid var(--line)",
          }}
        >
          <div
            style={{
              fontSize: 10,
              color: "var(--ink-3)",
              letterSpacing: ".1em",
              textTransform: "uppercase",
              marginBottom: 6,
              fontWeight: 600,
            }}
          >
            Why a session key?
          </div>
          <div style={{ fontSize: 11, color: "var(--ink-2)", lineHeight: 1.5 }}>
            FHE re-encrypts your share to a key only your browser holds — the chain never sees your decrypted amount.
            Refresh and you sign again.
          </div>
        </div>
      </div>
    </div>
  );
}

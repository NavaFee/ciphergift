"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAccount, useChainId } from "wagmi";
import { AppChrome } from "~~/components/chrome/AppChrome";
import { IndexerDegradedBanner } from "~~/components/chrome/IndexerDegradedBanner";
import { SideNav } from "~~/components/chrome/SideNav";
import { OpenModal } from "~~/components/inbox/OpenModal";
import { Btn } from "~~/components/primitives/Btn";
import { DecryptableTotal } from "~~/components/primitives/DecryptableTotal";
import { Stat } from "~~/components/primitives/Stat";
import {
  ArrowIcon,
  ClockIcon,
  EqualIcon,
  GiftIcon,
  InboxIcon,
  LockIcon,
  PlusIcon,
  ShuffleIcon,
  UserIcon,
} from "~~/components/primitives/icons";
import { useIncomingPackets, useSentPackets } from "~~/hooks/usePacketEvents";
import type { PacketSummary } from "~~/hooks/usePacketEvents";
import { useUserBalance } from "~~/hooks/useUserBalance";
import { assetForPacket } from "~~/lib/assets";
import { expiresInLabel, relativeTimeLabel, shortAddr, unitsToEthLabel } from "~~/lib/format";
import { type PacketTypeValue } from "~~/lib/packet-types";
import { detectWrap } from "~~/lib/wrap-detect";

const TYPE_ICON: Record<PacketTypeValue, React.ReactNode> = {
  0: <ShuffleIcon size={11} />, // RANDOM
  1: <EqualIcon size={11} />, // EQUAL
  2: <UserIcon size={11} />, // TARGETED
  3: <LockIcon size={11} />, // PASSWORD
};

const TYPE_LABEL: Record<PacketTypeValue, string> = {
  0: "lucky",
  1: "equal",
  2: "targeted",
  3: "password",
};

const CHAIN_LABEL: Record<number, string> = {
  1: "Ethereum",
  11155111: "Sepolia",
  31337: "Localhost",
};

export default function DashboardPage() {
  const { isConnected, isConnecting, address } = useAccount();
  const chainId = useChainId();
  const router = useRouter();
  const { sent, indexerDegraded: sentIndexerDegraded } = useSentPackets(address);
  const { incoming, invites, indexerDegraded: incomingIndexerDegraded } = useIncomingPackets(address);
  const balance = useUserBalance();
  const [opening, setOpening] = useState<PacketSummary | null>(null);
  const networkLabel = CHAIN_LABEL[chainId] ?? `Chain ${chainId}`;

  useEffect(() => {
    if (!isConnecting && !isConnected) router.replace("/");
  }, [isConnected, isConnecting, router]);

  if (!isConnected) return null;

  const activeSent = sent.filter(p => !p.refunded && p.claimedCount < p.totalShares);
  const wrap = detectWrap(balance.cleartextUnits);

  return (
    <AppChrome sub="dashboard">
      <SideNav inboxBadge={incoming.length || undefined} />
      <div style={{ flex: 1, minWidth: 0, overflow: "auto", padding: 28 }}>
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            marginBottom: 22,
          }}
        >
          <div>
            <div className="tick" style={{ marginBottom: 6 }}>
              OVERVIEW · {shortAddr(address)}
            </div>
            <h2
              style={{
                margin: 0,
                fontFamily: "var(--font-display)",
                fontSize: 30,
                fontWeight: 600,
                letterSpacing: "-0.02em",
              }}
            >
              Welcome back<span style={{ color: "var(--accent)" }}>.</span>
            </h2>
            <div style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 6 }}>
              {incoming.length > 0 ? (
                <>
                  You have{" "}
                  <span style={{ color: "var(--accent)", fontWeight: 600 }}>
                    {incoming.length} unclaimed gift{incoming.length === 1 ? "" : "s"}
                  </span>{" "}
                  waiting
                </>
              ) : (
                <>No claimable gifts right now</>
              )}
              {activeSent.length > 0 && <> · {activeSent.length} of yours active</>}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Link href="/inbox" style={{ textDecoration: "none" }}>
              <Btn kind="ghost" icon={<InboxIcon size={14} />}>
                Inbox{incoming.length > 0 ? ` · ${incoming.length}` : ""}
              </Btn>
            </Link>
            <Link href="/send" style={{ textDecoration: "none" }}>
              <Btn kind="primary" icon={<PlusIcon size={14} />}>
                Send a gift
              </Btn>
            </Link>
          </div>
        </div>

        {(sentIndexerDegraded || incomingIndexerDegraded) && <IndexerDegradedBanner />}

        {/* Stat tiles */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 12,
            marginBottom: 24,
          }}
        >
          <Link
            href="/vault"
            title="Open vault to deposit / withdraw"
            style={{ textDecoration: "none", color: "inherit", display: "block" }}
          >
            <Stat
              label="Vault balance"
              value={balance.cleartextUnits !== undefined ? `${unitsToEthLabel(balance.cleartextUnits)} ETH` : "—"}
              sub={balance.cleartextUnits !== undefined ? "decrypted · open vault →" : "open vault to deposit →"}
              encrypted={balance.cleartextUnits === undefined && Boolean(balance.handle)}
            />
          </Link>
          <Stat label="Yet to claim" value={String(incoming.length)} sub="across senders" />
          <Stat label="Your active gifts" value={String(activeSent.length)} sub={`${sent.length} total sent`} />
          <Stat label="Network" value={networkLabel} sub="FHEVM • confidential" accent />
        </div>

        {/* Active sent packets + Quick claim */}
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 18 }}>
          <div className="panel" style={{ padding: 18 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 14,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 16,
                    fontWeight: 600,
                  }}
                >
                  Your active gifts
                </span>
                <span className="badge b-dim">{activeSent.length} LIVE</span>
              </div>
            </div>
            {activeSent.length === 0 ? (
              <div
                style={{
                  padding: "24px 0",
                  textAlign: "center",
                  fontSize: 12,
                  color: "var(--ink-3)",
                }}
              >
                No active gifts. Click <span className="kbd">Send a gift</span> above.
              </div>
            ) : (
              activeSent.map(p => <SentRow key={String(p.id)} packet={p} />)
            )}
          </div>

          <div className="panel" style={{ padding: 18 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 14,
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 16,
                  fontWeight: 600,
                }}
              >
                Quick claim
              </span>
              <span className="badge b-fhe">
                <span className="dot-pulse" /> {incoming.length} ready
              </span>
            </div>
            {incoming.slice(0, 3).map(p => (
              <ClaimableMini key={String(p.id)} packet={p} onClick={() => setOpening(p)} />
            ))}
            {incoming.length === 0 && (
              <div
                style={{
                  padding: "20px 0",
                  textAlign: "center",
                  fontSize: 12,
                  color: "var(--ink-3)",
                }}
              >
                Nothing to claim right now.
              </div>
            )}
            <Link
              href="/inbox"
              style={{
                display: "block",
                width: "100%",
                marginTop: 8,
                padding: "10px",
                background: "transparent",
                border: "1px dashed var(--line-2)",
                borderRadius: 8,
                color: "var(--ink-2)",
                cursor: "pointer",
                fontFamily: "var(--font-sans)",
                fontSize: 12,
                textDecoration: "none",
                textAlign: "center",
              }}
            >
              See all incoming →
            </Link>
          </div>
        </div>

        {/* Vault balance underflow recovery banner */}
        {wrap.wrapped && (
          <div
            className="panel"
            style={{
              marginTop: 18,
              padding: 18,
              border: "1px solid var(--danger)",
              background: "rgba(255,94,58,0.06)",
            }}
          >
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 15,
                fontWeight: 600,
                marginBottom: 6,
                color: "var(--danger)",
              }}
            >
              ⚠ Vault balance has wrapped
            </div>
            <div style={{ fontSize: 12, color: "var(--ink-2)", lineHeight: 1.5, marginBottom: 10 }}>
              The encrypted FHE.sub underflowed because a previous gift was sent without enough deposited. Deposit{" "}
              <strong>{(Number(wrap.recoveryUnits!) / 1e9).toFixed(4)} ETH</strong> to wrap back to <code>0</code>, then
              top up to your real intent.
            </div>
            <Link href="/vault" style={{ textDecoration: "none" }}>
              <Btn kind="primary" size="sm">
                Open vault to recover
              </Btn>
            </Link>
          </div>
        )}

        {/* Decrypt vault balance prompt */}
        {balance.handle && balance.cleartextUnits === undefined && (
          <div
            className="panel"
            style={{
              marginTop: 18,
              padding: 18,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 14,
            }}
          >
            <div>
              <div
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 15,
                  fontWeight: 600,
                  marginBottom: 4,
                }}
              >
                Your vault balance is encrypted on-chain
              </div>
              <div className="tick">Sign once with your wallet to decrypt locally.</div>
            </div>
            <Btn
              kind="fhe"
              size="sm"
              onClick={balance.decryptBalance}
              disabled={balance.isAllowing || balance.isDecrypting}
            >
              {balance.isAllowing
                ? "Authorising…"
                : balance.isDecrypting
                  ? "Decrypting…"
                  : balance.isAllowed
                    ? "Decrypt"
                    : "Authorise & decrypt"}
            </Btn>
          </div>
        )}
      </div>

      {opening && (
        <OpenModal
          packet={opening}
          fromLabel={shortAddr(opening.creator)}
          targetedProof={invites?.[opening.id.toString()]}
          onClose={() => setOpening(null)}
        />
      )}
    </AppChrome>
  );
}

function SentRow({ packet }: { packet: PacketSummary }) {
  const pct = Math.round((packet.claimedCount / packet.totalShares) * 100);
  const asset = assetForPacket(packet.assetId);
  return (
    <Link
      href={`/sent/${packet.id}`}
      style={{
        display: "grid",
        gridTemplateColumns: "auto 1fr auto",
        gap: 14,
        alignItems: "center",
        padding: "12px 0",
        borderBottom: "1px solid var(--line)",
        color: "inherit",
        textDecoration: "none",
      }}
    >
      <div
        style={{
          width: 42,
          height: 42,
          borderRadius: 8,
          background: "linear-gradient(135deg, #382c00 0%, #1a1a1a 100%)",
          border: "1px solid var(--line-2)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--accent)",
        }}
      >
        <GiftIcon size={18} />
      </div>
      <div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 4,
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600 }}>{packet.note || `Gift #${packet.id}`}</span>
          <span className="badge b-dim" style={{ height: 18, fontSize: 9 }}>
            {TYPE_ICON[packet.packetType]} {TYPE_LABEL[packet.packetType]}
          </span>
          <span className="badge b-dim" style={{ height: 18, fontSize: 9 }}>
            {asset.symbol}
          </span>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span className="tick">
            {packet.claimedCount}/{packet.totalShares} claimed
          </span>
          <span className="tick">·</span>
          <span className="tick">{relativeTimeLabel(packet.createdAt)}</span>
          <div className="bar-track" style={{ width: 80 }}>
            <div className="bar-fill fhe" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>
      <div style={{ textAlign: "right" }}>
        <DecryptableTotal
          packetId={packet.id}
          packetType={packet.packetType}
          totalShares={packet.totalShares}
          canDecrypt
          width={50}
          unitDecimals={asset.unitDecimals}
          symbol={asset.symbol}
        />
        <div className="tick" style={{ marginTop: 2 }}>
          <ClockIcon size={9} /> {expiresInLabel(packet.expiresAt)}
        </div>
      </div>
    </Link>
  );
}

function ClaimableMini({ packet, onClick }: { packet: PacketSummary; onClick: () => void }) {
  const asset = assetForPacket(packet.assetId);
  return (
    <button
      onClick={onClick}
      style={{
        width: "100%",
        display: "grid",
        gridTemplateColumns: "auto 1fr auto",
        gap: 10,
        alignItems: "center",
        padding: "10px 0",
        background: "none",
        border: "none",
        borderBottom: "1px solid var(--line)",
        cursor: "pointer",
        textAlign: "left",
        color: "inherit",
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          background: "linear-gradient(135deg, var(--accent) 0%, #d49a00 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#0a0a0a",
        }}
      >
        <GiftIcon size={16} />
      </div>
      <div>
        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>{shortAddr(packet.creator)}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span className="tick" style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
            {TYPE_ICON[packet.packetType]} {TYPE_LABEL[packet.packetType]}
          </span>
          <span className="tick">·</span>
          <span className="tick">{asset.symbol}</span>
          <span className="tick">·</span>
          <span className="tick">
            {packet.totalShares - packet.claimedCount}/{packet.totalShares} left
          </span>
        </div>
      </div>
      <ArrowIcon size={14} />
    </button>
  );
}

"use client";

import { Addr } from "~~/components/primitives/Addr";
import { Btn } from "~~/components/primitives/Btn";
import { Cipher } from "~~/components/primitives/Cipher";
import { ClockIcon, EqualIcon, GiftIcon, KeyIcon, ShuffleIcon, UserIcon } from "~~/components/primitives/icons";
import type { PacketSummary } from "~~/hooks/usePacketEvents";
import { assetForPacket } from "~~/lib/assets";
import { expiresInLabel, relativeTimeLabel, shortAddr } from "~~/lib/format";
import { type PacketTypeValue } from "~~/lib/packet-types";

interface Props {
  packet: PacketSummary;
  /** Undefined disables the open CTA (e.g. visitor not on TARGETED allowlist). */
  onOpen?: () => void;
  /** Force-disable the CTA even if `onOpen` is provided. */
  disabled?: boolean;
}

const TYPE_META: Record<PacketTypeValue, { icon: React.ReactNode; label: string; color: string }> = {
  0: { icon: <ShuffleIcon size={12} />, label: "Lucky", color: "var(--accent)" }, // RANDOM
  1: { icon: <EqualIcon size={12} />, label: "Equal split", color: "var(--ink-2)" },
  2: { icon: <UserIcon size={12} />, label: "For you", color: "var(--fhe)" },
  3: { icon: <KeyIcon size={12} />, label: "Password", color: "var(--crypt)" },
};

export function PacketCard({ packet, onOpen, disabled }: Props) {
  const ctaDisabled = disabled || !onOpen;
  const meta = TYPE_META[packet.packetType];
  const asset = assetForPacket(packet.assetId);
  const remainPct = Math.round(((packet.totalShares - packet.claimedCount) / packet.totalShares) * 100);
  const expiringSoon = packet.expiresAt - Date.now() / 1000 < 6 * 3600;

  return (
    <div
      className="panel"
      style={{
        padding: 18,
        position: "relative",
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      {/* head */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              background:
                packet.packetType === 2
                  ? "linear-gradient(135deg, #0a3a1a 0%, #b6f569 100%)"
                  : "linear-gradient(135deg, #382c00 0%, #FFD200 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#0a0a0a",
            }}
          >
            <GiftIcon size={18} />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 3 }}>{shortAddr(packet.creator)}</div>
            <Addr a={shortAddr(packet.creator)} dim avatar={false} />
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
          <span className="badge" style={{ color: meta.color, borderColor: meta.color, background: "transparent" }}>
            {meta.icon} {meta.label}
          </span>
          <span className="badge b-dim">{asset.symbol}</span>
          <span className="tick">{relativeTimeLabel(packet.createdAt)}</span>
        </div>
      </div>

      {/* note */}
      {packet.note && (
        <div
          style={{
            fontSize: 13,
            fontStyle: "italic",
            color: "var(--ink-2)",
            lineHeight: 1.4,
            padding: "10px 12px",
            background: "var(--bg-2)",
            borderRadius: 6,
          }}
        >
          &ldquo;{packet.note}&rdquo;
        </div>
      )}

      {/* amount + meta */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <div className="tick" style={{ marginBottom: 4 }}>
            YOUR SHARE
          </div>
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: "-0.02em",
            }}
          >
            <Cipher width={70} label="enc" />
          </div>
        </div>
        <div>
          <div className="tick" style={{ marginBottom: 4 }}>
            REMAINING
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div className="bar-track" style={{ flex: 1 }}>
              <div className="bar-fill fhe" style={{ width: `${remainPct}%` }} />
            </div>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-2)" }}>
              {packet.totalShares - packet.claimedCount}/{packet.totalShares}
            </span>
          </div>
          <div
            className="tick"
            style={{
              marginTop: 6,
              display: "flex",
              alignItems: "center",
              gap: 5,
              color: expiringSoon ? "var(--warn)" : "var(--ink-3)",
            }}
          >
            <ClockIcon size={10} />
            {expiresInLabel(packet.expiresAt)}
          </div>
        </div>
      </div>

      <Btn kind="primary" block icon={<GiftIcon size={13} />} onClick={onOpen} disabled={ctaDisabled}>
        {ctaDisabled ? "Cannot claim" : "Open packet"}
      </Btn>
    </div>
  );
}

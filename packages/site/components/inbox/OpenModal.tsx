"use client";

import { useEffect, useState } from "react";
import { Confetti } from "./Confetti";
import { DecryptLog } from "./DecryptLog";
import { Brackets } from "~~/components/primitives/Brackets";
import { Btn } from "~~/components/primitives/Btn";
import { ErrorPanel } from "~~/components/primitives/ErrorPanel";
import { CheckIcon, GiftIcon, ShareIcon } from "~~/components/primitives/icons";
import { ClaimShareCardModal } from "~~/components/share/ClaimShareCardModal";
import { type TargetedProof, useClaim } from "~~/hooks/useClaim";
import type { PacketSummary } from "~~/hooks/usePacketEvents";
import { assetForPacket } from "~~/lib/assets";
import { expiresInLabel, unitsToAssetLabel } from "~~/lib/format";
import { PacketType } from "~~/lib/packet-types";
import { buildShareLinkUrl } from "~~/lib/share-link";

interface OpenModalProps {
  packet: PacketSummary;
  fromLabel: string;
  /**
   * For TARGETED packets, the per-invitee Merkle proof material decoded
   * from the share-link fragment. Without it, claim will revert with
   * `TargetedRequiresProof`. EQUAL/RANDOM packets ignore this.
   */
  targetedProof?: TargetedProof;
  onClose: () => void;
}

export function OpenModal({ packet, fromLabel, targetedProof, onClose }: OpenModalProps) {
  const asset = assetForPacket(packet.assetId);
  const isPasswordPacket = packet.packetType === PacketType.PASSWORD;
  // TARGETED packets need an off-chain (salt, proof) pair; without it the
  // contract reverts with `TargetedRequiresProof`. The claim button stays
  // disabled and we point the user at their personalized invite link.
  const isTargetedPacket = packet.packetType === PacketType.TARGETED;
  const missingTargetedProof = isTargetedPacket && !targetedProof;
  const { phase, errorMessage, cleartextUnits, claim } = useClaim(packet.id, targetedProof);
  const [password, setPassword] = useState("");
  const [shaking, setShaking] = useState(false);
  const [showShareCard, setShowShareCard] = useState(false);

  // Animate the envelope while we're in submitting/confirming phases.
  useEffect(() => {
    setShaking(phase === "submitting" || phase === "confirming");
  }, [phase]);

  const tap = () => {
    if (phase !== "idle") return;
    if (missingTargetedProof) return;
    if (isPasswordPacket && password.trim().length === 0) return;
    void claim(isPasswordPacket ? password.trim() : undefined);
  };

  return (
    <>
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
        padding: 30,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 380,
          borderRadius: 14,
          padding: 28,
          position: "relative",
          background: "var(--bg-1)",
          border: "1px solid var(--line-2)",
          boxShadow: "0 30px 60px rgba(0,0,0,0.5)",
        }}
      >
        <button
          onClick={onClose}
          style={{
            position: "absolute",
            top: 14,
            right: 14,
            background: "none",
            border: "none",
            color: "var(--ink-3)",
            cursor: "pointer",
            fontSize: 18,
          }}
        >
          ×
        </button>

        {phase === "done" && <Confetti />}

        <div className="tick" style={{ marginBottom: 10 }}>
          FROM {fromLabel}
        </div>

        {phase !== "done" && phase !== "error" && (
          <div style={{ textAlign: "center", padding: "14px 0" }}>
            <h3
              style={{
                margin: "0 0 22px",
                fontFamily: "var(--font-display)",
                fontSize: 22,
                fontWeight: 600,
                letterSpacing: "-0.02em",
              }}
            >
              {phase === "decrypting"
                ? "Decrypting your share…"
                : phase === "submitting" || phase === "confirming"
                  ? "Sealing the claim on-chain…"
                  : missingTargetedProof
                    ? "Open with your invite link"
                    : isPasswordPacket
                      ? "Enter password to open"
                      : "Tap to open"}
            </h3>

            {isPasswordPacket && phase === "idle" && (
              <input
                className="cr-input"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Password"
                style={{ margin: "-8px auto 18px", maxWidth: 240 }}
              />
            )}

            <div
              onClick={tap}
              className={shaking ? "shaking" : ""}
              style={{
                width: 200,
                height: 250,
                margin: "0 auto",
                position: "relative",
                cursor:
                  phase === "idle" && !missingTargetedProof && (!isPasswordPacket || password.trim())
                    ? "pointer"
                    : "default",
                opacity: missingTargetedProof || (isPasswordPacket && phase === "idle" && !password.trim()) ? 0.62 : 1,
              }}
            >
              <div
                className="envelope envelope-yellow"
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  padding: 16,
                  color: "#0a0a0a",
                }}
              >
                <Brackets />
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: ".16em",
                    textTransform: "uppercase",
                    opacity: 0.6,
                  }}
                >
                  ciphergift · gift
                </div>
                <div
                  style={{
                    width: 60,
                    height: 60,
                    borderRadius: "50%",
                    background: "#0a0a0a",
                    alignSelf: "center",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--accent)",
                  }}
                >
                  {phase === "decrypting" ? (
                    <span
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: "50%",
                        border: "2.5px solid var(--accent)",
                        borderTopColor: "transparent",
                        animation: "spin 0.8s linear infinite",
                      }}
                    />
                  ) : (
                    <GiftIcon size={26} />
                  )}
                </div>
                <div
                  style={{
                    textAlign: "center",
                    fontSize: 11,
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  {phase === "decrypting"
                    ? "fhe.reencrypt(...)"
                    : missingTargetedProof
                      ? "— invite only —"
                      : isPasswordPacket
                        ? "— unlock —"
                        : "— tap —"}
                </div>
              </div>
            </div>

            {phase === "decrypting" && (
              <div style={{ marginTop: 18, fontSize: 11, color: "var(--ink-3)" }}>
                <DecryptLog />
              </div>
            )}

            {missingTargetedProof && (
              <div
                style={{
                  marginTop: 18,
                  fontSize: 12,
                  color: "var(--ink-2)",
                  lineHeight: 1.55,
                  maxWidth: 280,
                  marginInline: "auto",
                }}
              >
                Targeted gifts need the personalized link the sender shared with you. Open that link to claim — the
                inbox alone can&apos;t prove you&apos;re on the allowlist.
              </div>
            )}
          </div>
        )}

        {phase === "done" && cleartextUnits !== undefined && (
          <div style={{ textAlign: "center", padding: "14px 0" }}>
            <div
              style={{
                fontSize: 11,
                color: "var(--fhe)",
                letterSpacing: ".16em",
                textTransform: "uppercase",
                fontWeight: 700,
                marginBottom: 8,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <CheckIcon size={12} /> Decrypted to your wallet
            </div>
            <div
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 54,
                fontWeight: 600,
                letterSpacing: "-0.03em",
                lineHeight: 1,
                background: "linear-gradient(180deg, var(--accent) 0%, #d4a800 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                margin: "14px 0 6px",
              }}
            >
              +{unitsToAssetLabel(cleartextUnits, asset.unitDecimals, 6)}
            </div>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 14,
                color: "var(--ink-2)",
              }}
            >
              {asset.symbol}
            </div>
            {packet.note && (
              <div
                style={{
                  fontSize: 13,
                  color: "var(--ink-2)",
                  marginTop: 14,
                  marginBottom: 18,
                  fontStyle: "italic",
                }}
              >
                &ldquo;{packet.note}&rdquo;
              </div>
            )}
            <div style={{ display: "flex", gap: 10 }}>
              <Btn kind="ghost" block icon={<ShareIcon size={13} />} onClick={() => setShowShareCard(true)}>
                Share
              </Btn>
              <Btn kind="primary" block onClick={onClose}>
                Done
              </Btn>
            </div>
          </div>
        )}

        {phase === "error" && (
          <div style={{ padding: "20px 0" }}>
            <ErrorPanel title="Claim failed" detail={errorMessage} />
            <Btn kind="ghost" block onClick={onClose}>
              Close
            </Btn>
          </div>
        )}
      </div>
    </div>
    {showShareCard && cleartextUnits !== undefined && (
      <ClaimShareCardModal
        url={buildShareLinkUrl(window.location.origin, packet.id)}
        packetId={packet.id}
        amountLabel={unitsToAssetLabel(cleartextUnits, asset.unitDecimals, 6)}
        assetSymbol={asset.symbol}
        note={packet.note ?? ""}
        creator={packet.creator}
        remaining={Math.max(0, packet.totalShares - packet.claimedCount)}
        totalShares={packet.totalShares}
        expiresInLabel={expiresInLabel(packet.expiresAt)}
        onClose={() => setShowShareCard(false)}
      />
    )}
    </>
  );
}

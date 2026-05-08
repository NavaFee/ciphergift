"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAccount, useChainId, useReadContract } from "wagmi";
import { AppChrome } from "~~/components/chrome/AppChrome";
import { SideNav } from "~~/components/chrome/SideNav";
import { OpenModal } from "~~/components/inbox/OpenModal";
import { PacketCard } from "~~/components/inbox/PacketCard";
import { Btn } from "~~/components/primitives/Btn";
import { Loading } from "~~/components/primitives/Loading";
import { LockIcon, ShareIcon } from "~~/components/primitives/icons";
import { ShareCardModal } from "~~/components/share/ShareCardModal";
import { useCipherGift } from "~~/hooks/useCipherGift";
import type { PacketSummary } from "~~/hooks/usePacketEvents";
import { parseAllowlistFragment, verifyAllowlistProof } from "~~/lib/allowlist";
import { assetForPacket } from "~~/lib/assets";
import { expiresInLabel, shortAddr, unitsToAssetLabel } from "~~/lib/format";
import { saveInvite } from "~~/lib/invite-storage";
import { PacketType, type PacketTypeValue } from "~~/lib/packet-types";

/**
 * Public share-link landing page. Pre-fills the inbox card with the
 * specific packet referenced in the URL and opens the claim modal
 * automatically once a wallet is connected.
 */
export default function ShareLinkPage() {
  const { isConnected, address } = useAccount();
  const chainId = useChainId();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const wrap = useCipherGift();
  const [opened, setOpened] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [shareUrl, setShareUrl] = useState("");

  const packetId = useMemo(() => {
    try {
      return BigInt(params.id);
    } catch {
      return undefined;
    }
  }, [params.id]);

  // Decode the share-link fragment once on mount. For TARGETED packets,
  // this is what proves to the contract that the visitor is on the
  // allowlist. EQUAL/RANDOM packets ignore it.
  const targetedProof = useMemo(() => {
    if (typeof window === "undefined") return undefined;
    return parseAllowlistFragment(window.location.hash);
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") setShareUrl(window.location.href);
  }, []);

  const packetRead = useReadContract({
    address: wrap?.address,
    abi: wrap?.abi,
    functionName: "getPacket",
    args: packetId !== undefined ? [packetId] : undefined,
    query: { enabled: Boolean(wrap && packetId !== undefined) },
  });

  const packetAssetRead = useReadContract({
    address: wrap?.address,
    abi: wrap?.abi,
    functionName: "getPacketAsset",
    args: packetId !== undefined ? [packetId] : undefined,
    query: { enabled: Boolean(wrap && packetId !== undefined) },
  });

  // Read the on-chain Merkle root so we can verify the fragment's proof
  // against the connected wallet — a B who opens A's link should see a
  // clear "not allowlisted" notice instead of a claim CTA that would
  // revert with NotAllowlisted on chain.
  const allowlistRootRead = useReadContract({
    address: wrap?.address,
    abi: wrap?.abi,
    functionName: "allowlistRoot",
    args: packetId !== undefined ? [packetId] : undefined,
    query: { enabled: Boolean(wrap && packetId !== undefined) },
  });

  // Whether the fragment's proof is valid for the *currently connected*
  // wallet. `undefined` = waiting for inputs; `true`/`false` = decided.
  const proofMatchesMe = useMemo<boolean | undefined>(() => {
    if (!targetedProof) return undefined;
    const root = allowlistRootRead.data as `0x${string}` | undefined;
    if (!root || !address) return undefined;
    return verifyAllowlistProof(root, targetedProof.salt, address, targetedProof.slotIndex, targetedProof.proof);
  }, [targetedProof, allowlistRootRead.data, address]);

  // Persist the (salt, proof) for this claimer so the packet shows up in
  // their inbox on subsequent visits — but only when the proof actually
  // verifies for the connected wallet. Saving an invalid invite would
  // surface a permanent ghost row in `/inbox` whose claim would always
  // revert.
  useEffect(() => {
    if (!targetedProof) return;
    if (!address || !wrap?.address || packetId === undefined) return;
    if (proofMatchesMe !== true) return;
    saveInvite(chainId, wrap.address, address, packetId, targetedProof);
  }, [address, chainId, wrap?.address, packetId, targetedProof, proofMatchesMe]);

  // If not connected, push back to landing → /r/[id] resumes after connect
  // because the route is on the same path.
  useEffect(() => {
    if (!isConnected) {
      const t = setTimeout(() => router.replace("/"), 600);
      return () => clearTimeout(t);
    }
  }, [isConnected, router]);

  const packet = useMemo<PacketSummary | undefined>(() => {
    if (!packetRead.data || packetId === undefined) return undefined;
    const tuple = packetRead.data as readonly [
      `0x${string}`,
      bigint,
      bigint,
      number,
      number,
      number,
      bigint,
      string,
      boolean,
    ];
    const [creator, createdAt, expiresAt, packetType, totalShares, claimedCount, maxShareScalar, note, refunded] =
      tuple;
    return {
      id: packetId,
      creator,
      createdAt: Number(createdAt),
      expiresAt: Number(expiresAt),
      packetType: packetType as PacketTypeValue,
      totalShares,
      claimedCount,
      maxShareScalar,
      assetId: packetAssetRead.data as `0x${string}` | undefined,
      note,
      refunded,
    };
  }, [packetAssetRead.data, packetRead.data, packetId]);

  if (!isConnected || !packet) {
    return (
      <AppChrome sub={`r/${params.id}`}>
        <SideNav />
        <div style={{ flex: 1, padding: 28, color: "var(--ink-3)" }}>
          {!isConnected ? "Connect a wallet to claim…" : <Loading label="Loading gift" />}
        </div>
      </AppChrome>
    );
  }

  return (
    <AppChrome sub={`r/${params.id}`}>
      <SideNav />
      <div style={{ flex: 1, minWidth: 0, overflow: "auto", padding: "28px 36px" }}>
        <div className="tick" style={{ marginBottom: 6 }}>
          SHARED GIFT · #{params.id}
        </div>
        <h2
          style={{
            margin: 0,
            fontFamily: "var(--font-display)",
            fontSize: 28,
            fontWeight: 600,
            letterSpacing: "-0.02em",
            marginBottom: 22,
          }}
        >
          You&apos;ve been sent a confidential gift
        </h2>
        <div style={{ maxWidth: 480 }}>
          {packet.packetType === PacketType.TARGETED && targetedProof && proofMatchesMe === true && (
            <div
              className="panel"
              style={{
                padding: 14,
                marginBottom: 14,
                border: "1px solid var(--accent)",
                background: "rgba(255,210,0,0.05)",
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}
            >
              <LockIcon size={16} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="tick" style={{ color: "var(--accent)", marginBottom: 4 }}>
                  YOUR ALLOTMENT
                </div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 600 }}>
                  {unitsToAssetLabel(targetedProof.amount, assetForPacket(packet.assetId).unitDecimals, 6)}{" "}
                  <span style={{ color: "var(--ink-3)", fontSize: 14 }}>{assetForPacket(packet.assetId).symbol}</span>
                </div>
                <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>
                  Encrypted on chain — only you and the sender can see this amount.
                </div>
              </div>
            </div>
          )}
          {packet.packetType === PacketType.TARGETED && targetedProof && proofMatchesMe === false && (
            <div
              className="panel"
              style={{
                padding: 14,
                marginBottom: 14,
                border: "1px solid var(--warn, #ff6b4a)",
                background: "rgba(255,107,74,0.07)",
                display: "flex",
                alignItems: "flex-start",
                gap: 12,
              }}
            >
              <LockIcon size={16} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="tick" style={{ color: "var(--warn, #ff6b4a)", marginBottom: 4 }}>
                  NOT ALLOWLISTED
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.5 }}>
                  This invite link wasn&apos;t issued for{" "}
                  <span style={{ fontFamily: "var(--font-mono)" }}>{shortAddr(address)}</span>. The sender bound it to a
                  different wallet — switch to that wallet (or ask the sender to re-issue) before claiming.
                </div>
                <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 6 }}>
                  Submitting anyway would revert on chain with <code>NotAllowlisted</code>.
                </div>
              </div>
            </div>
          )}
          <PacketCard
            packet={packet}
            onOpen={proofMatchesMe === false ? undefined : () => setOpened(true)}
            disabled={packet.packetType === PacketType.TARGETED && proofMatchesMe === false}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
            <Btn kind="ghost" icon={<ShareIcon size={13} />} onClick={() => setShowShare(true)} disabled={!shareUrl}>
              Share
            </Btn>
          </div>
        </div>
      </div>
      {opened && (
        <OpenModal
          packet={packet}
          fromLabel={shortAddr(packet.creator)}
          targetedProof={packet.packetType === PacketType.TARGETED ? targetedProof : undefined}
          onClose={() => {
            setOpened(false);
            packetRead.refetch();
          }}
        />
      )}
      {showShare && shareUrl && packet && (
        <ShareCardModal
          url={shareUrl}
          packetId={packet.id}
          note={packet.note}
          assetSymbol={assetForPacket(packet.assetId).symbol}
          packetType={packet.packetType}
          totalShares={packet.totalShares}
          claimedCount={packet.claimedCount}
          creator={packet.creator}
          expiresInLabel={expiresInLabel(packet.expiresAt)}
          onClose={() => setShowShare(false)}
        />
      )}
    </AppChrome>
  );
}

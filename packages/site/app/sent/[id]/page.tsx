"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "react-hot-toast";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { AppChrome } from "~~/components/chrome/AppChrome";
import { SideNav } from "~~/components/chrome/SideNav";
import { Addr } from "~~/components/primitives/Addr";
import { Brackets } from "~~/components/primitives/Brackets";
import { Btn } from "~~/components/primitives/Btn";
import { DecryptableTotal } from "~~/components/primitives/DecryptableTotal";
import { Loading } from "~~/components/primitives/Loading";
import { Switch } from "~~/components/primitives/Switch";
import { BackIcon, CopyIcon, LockIcon, ShareIcon } from "~~/components/primitives/icons";
import { AllowlistLinksList } from "~~/components/send/AllowlistLinksList";
import { ShareCardModal } from "~~/components/share/ShareCardModal";
import { useCipherGift } from "~~/hooks/useCipherGift";
import type { AllowlistEntry } from "~~/lib/allowlist";
import { loadAllowlist } from "~~/lib/allowlist-storage";
import { assetForPacket } from "~~/lib/assets";
import { explainContractError } from "~~/lib/explain-error";
import { expiresInLabel, relativeTimeLabel, shortAddr } from "~~/lib/format";
import { PacketType, type PacketTypeValue } from "~~/lib/packet-types";
import { buildShareLinkUrl } from "~~/lib/share-link";

export default function SentDetailPage() {
  const { isConnected, address } = useAccount();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const wrap = useCipherGift();
  const publicClient = usePublicClient();
  const { writeContractAsync, isPending: isRefunding } = useWriteContract();
  const [refundHash, setRefundHash] = useState<`0x${string}` | undefined>();
  const refundReceipt = useWaitForTransactionReceipt({ hash: refundHash, pollingInterval: 2_000 });
  const [showClaimers, setShowClaimers] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [recoveredEntries, setRecoveredEntries] = useState<AllowlistEntry[] | undefined>();
  const chainId = useChainId();

  const packetId = useMemo(() => {
    try {
      return BigInt(params.id);
    } catch {
      return undefined;
    }
  }, [params.id]);

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

  useEffect(() => {
    if (!isConnected) router.replace("/");
  }, [isConnected, router]);

  useEffect(() => {
    if (typeof window !== "undefined" && packetId !== undefined) {
      setShareUrl(buildShareLinkUrl(window.location.origin, packetId));
    }
  }, [packetId]);

  // Restore TARGETED salts/proofs from localStorage so the creator can
  // re-pull per-invitee links if they didn't grab them at create time.
  // Only effective on the same browser that issued the packet.
  useEffect(() => {
    if (packetId === undefined || !wrap?.address) return;
    const entries = loadAllowlist(chainId, wrap.address, packetId);
    setRecoveredEntries(entries);
  }, [chainId, packetId, wrap?.address]);

  useEffect(() => {
    if (refundReceipt.isSuccess) {
      toast.success("Gift refunded");
      packetRead.refetch();
      setRefundHash(undefined);
    }
  }, [refundReceipt.isSuccess, packetRead]);

  if (!isConnected || packetId === undefined) return null;

  const tuple = packetRead.data as
    | readonly [`0x${string}`, bigint, bigint, number, number, number, bigint, string, boolean]
    | undefined;

  if (!tuple) {
    return (
      <AppChrome sub={`sent/${packetId}`}>
        <SideNav />
        <div style={{ flex: 1, padding: 28 }}>
          <Loading label="Loading gift" />
        </div>
      </AppChrome>
    );
  }

  const [creator, createdAt, expiresAt, packetType, totalShares, claimedCount, , note, refunded] = tuple;
  const asset = assetForPacket(packetAssetRead.data as `0x${string}` | undefined);
  const claimedPct = Math.round((claimedCount / totalShares) * 100);
  const isOwn = address && creator.toLowerCase() === address.toLowerCase();
  const expired = Date.now() / 1000 >= Number(expiresAt);

  const onCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success("Link copied");
    } catch {
      toast.error("Could not copy");
    }
  };

  const onRefund = async () => {
    if (!wrap) return;
    try {
      const callConfig = {
        address: wrap.address,
        abi: wrap.abi,
        functionName: "closeAndRefund",
        args: [packetId],
      } as const;
      // Pre-flight simulate so NotCreator / PacketNotExpired / PacketRefunded_
      // surface as real custom-error messages instead of "gas limit too high".
      if (publicClient && address) {
        await publicClient.simulateContract({ ...callConfig, account: address });
      }
      const hash = await writeContractAsync(callConfig);
      setRefundHash(hash);
      toast.loading("Refunding…", { id: "refund" });
    } catch (err) {
      toast.error(explainContractError(err));
    }
  };

  const ptypeLabel: Record<PacketTypeValue, string> = {
    0: "lucky · random",
    1: "equal split",
    2: "targeted",
    3: "password",
  };

  return (
    <AppChrome sub={`sent/${packetId}`}>
      <SideNav />
      <div style={{ flex: 1, minWidth: 0, overflow: "auto", padding: "28px 36px" }}>
        <Link
          href="/dashboard"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            color: "var(--ink-3)",
            textDecoration: "none",
            marginBottom: 14,
          }}
        >
          <BackIcon size={12} /> Back
        </Link>

        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 22, alignItems: "start" }}>
          {/* Main panel */}
          <div>
            <div className="tick" style={{ marginBottom: 6 }}>
              PACKET · #{String(packetId)}
            </div>
            <h2
              style={{
                margin: 0,
                fontFamily: "var(--font-display)",
                fontSize: 30,
                fontWeight: 600,
                letterSpacing: "-0.02em",
                marginBottom: 6,
              }}
            >
              {note || "Untitled gift"}
            </h2>
            <div style={{ display: "flex", gap: 8, marginBottom: 22, alignItems: "center" }}>
              {refunded ? (
                <span className="badge b-warn">REFUNDED</span>
              ) : expired ? (
                <span className="badge b-warn">EXPIRED</span>
              ) : (
                <span className="badge b-live">
                  <span className="dot-pulse" /> LIVE
                </span>
              )}
              <span className="badge b-fhe">
                <LockIcon size={9} /> {ptypeLabel[packetType as PacketTypeValue]}
              </span>
              <span className="badge b-dim">{asset.symbol}</span>
              <span className="tick">created {relativeTimeLabel(Number(createdAt))}</span>
            </div>

            {/* Stats row */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1.1fr 1fr 1fr",
                gap: 1,
                background: "var(--line)",
                border: "1px solid var(--line)",
                borderRadius: 12,
                overflow: "hidden",
                marginBottom: 18,
              }}
            >
              <div style={{ padding: 18, background: "var(--bg-1)" }}>
                <div className="tick" style={{ marginBottom: 8 }}>
                  TOTAL · ENCRYPTED
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 28,
                    fontWeight: 600,
                    letterSpacing: "-0.02em",
                  }}
                >
                  <DecryptableTotal
                    packetId={packetId}
                    packetType={packetType as PacketTypeValue}
                    totalShares={totalShares}
                    canDecrypt={Boolean(isOwn)}
                    width={90}
                    variant="block"
                    unitDecimals={asset.unitDecimals}
                    symbol={asset.symbol}
                  />
                </div>
              </div>
              <div style={{ padding: 18, background: "var(--bg-1)" }}>
                <div className="tick" style={{ marginBottom: 8 }}>
                  CLAIMED
                </div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 600 }}>
                  {claimedCount}
                  <span style={{ color: "var(--ink-3)" }}>/{totalShares}</span>
                </div>
                <div className="bar-track" style={{ marginTop: 8 }}>
                  <div className="bar-fill" style={{ width: `${claimedPct}%` }} />
                </div>
              </div>
              <div style={{ padding: 18, background: "var(--bg-1)" }}>
                <div className="tick" style={{ marginBottom: 8 }}>
                  EXPIRES
                </div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 600 }}>
                  {expiresInLabel(Number(expiresAt))}
                </div>
                <div className="tick" style={{ marginTop: 6 }}>
                  unclaimed → refunded
                </div>
              </div>
            </div>

            {/* Claimers panel — design slot for the per-claim event list. */}
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
                  Claimers
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="tick">Reveal individual amounts:</span>
                  <Switch on={showClaimers} onChange={setShowClaimers} disabled />
                </div>
              </div>
              <div style={{ padding: "14px 0", textAlign: "center", fontSize: 12, color: "var(--ink-3)" }}>
                {claimedCount === 0 ? (
                  <>No claims yet — share the link below.</>
                ) : (
                  <>
                    {claimedCount} address{claimedCount === 1 ? "" : "es"} have claimed. Per-claim addresses are emitted
                    as <span className="kbd">PacketClaimed</span> events; individual reveal flow ships with v1.1.
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Side panel: share link + confidentiality + refund */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="panel" style={{ padding: 18, position: "relative" }}>
              <Brackets />
              <div className="tick" style={{ marginBottom: 10 }}>
                SHARE LINK
              </div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 11,
                  color: "var(--ink-2)",
                  padding: "10px 12px",
                  background: "var(--bg-2)",
                  border: "1px dashed var(--line-2)",
                  borderRadius: 6,
                  wordBreak: "break-all",
                  marginBottom: 10,
                }}
              >
                {shareUrl || "…"}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <Btn kind="ghost" size="sm" block icon={<CopyIcon size={11} />} onClick={onCopyLink}>
                  Copy
                </Btn>
                <Btn
                  kind="dark"
                  size="sm"
                  block
                  icon={<ShareIcon size={11} />}
                  onClick={() => setShowShare(true)}
                  disabled={!shareUrl}
                >
                  Share card
                </Btn>
              </div>
            </div>

            {isOwn && packetType === PacketType.TARGETED && recoveredEntries && recoveredEntries.length > 0 && (
              <div className="panel" style={{ padding: 18 }}>
                <div className="tick" style={{ marginBottom: 8, color: "var(--fhe)" }}>
                  PER-INVITEE LINKS · LOCAL RECOVERY
                </div>
                <p style={{ fontSize: 12, color: "var(--ink-2)", lineHeight: 1.5, marginTop: 0, marginBottom: 12 }}>
                  Re-issued from this browser&apos;s storage. Each link gives one address the salt + proof needed to
                  claim. Whoever holds a link can claim that slot — deliver privately.
                </p>
                <AllowlistLinksList
                  packetId={packetId}
                  entries={recoveredEntries}
                  unitDecimals={asset.unitDecimals}
                  symbol={asset.symbol}
                />
              </div>
            )}

            {isOwn && packetType === PacketType.TARGETED && recoveredEntries === undefined && (
              <div className="panel" style={{ padding: 18, fontSize: 12, color: "var(--ink-2)", lineHeight: 1.5 }}>
                <div className="tick" style={{ marginBottom: 8, color: "var(--warn)" }}>
                  PER-INVITEE LINKS · NOT ON THIS DEVICE
                </div>
                Per-invitee salts only ever existed on the browser that created this packet. The chain stores just the
                Merkle root, so they can&apos;t be recovered here. Open this page from the original browser, or refund
                after expiry and re-issue.
              </div>
            )}

            <div className="panel" style={{ padding: 18 }}>
              <div className="tick" style={{ marginBottom: 10 }}>
                CONFIDENTIALITY
              </div>
              {[
                ["Total amount", "Encrypted on-chain"],
                [
                  "Per-share amounts",
                  packetType === 0 ? "fheRand() · only claimer decrypts" : "Equal · only claimer decrypts",
                ],
                ["Vault balance moves", "All transfers between encrypted balances"],
              ].map(([k, v]) => (
                <div key={k} style={{ marginBottom: 10, display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <LockIcon size={11} />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{k}</div>
                    <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{v}</div>
                  </div>
                </div>
              ))}
            </div>

            {isOwn && !refunded && expired && (
              <Btn kind="ghost" block onClick={onRefund} disabled={isRefunding || refundReceipt.isLoading}>
                {isRefunding || refundReceipt.isLoading ? "Refunding…" : "Close gift & refund"}
              </Btn>
            )}
            {isOwn && !refunded && !expired && (
              <div className="tick" style={{ textAlign: "center", padding: 8 }}>
                Refund unlocks {expiresInLabel(Number(expiresAt))}.
              </div>
            )}
          </div>
        </div>

        <div style={{ marginTop: 20, fontSize: 12 }}>
          <span style={{ color: "var(--ink-3)" }}>Sender · </span>
          <Addr a={shortAddr(creator)} />
        </div>
      </div>
      {showShare && shareUrl && (
        <ShareCardModal
          url={shareUrl}
          packetId={packetId}
          note={note}
          assetSymbol={asset.symbol}
          packetType={packetType as PacketTypeValue}
          totalShares={totalShares}
          claimedCount={claimedCount}
          creator={creator}
          expiresInLabel={expiresInLabel(Number(expiresAt))}
          onClose={() => setShowShare(false)}
        />
      )}
    </AppChrome>
  );
}

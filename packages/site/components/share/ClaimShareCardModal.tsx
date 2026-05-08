"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { toast } from "react-hot-toast";
import { Brackets } from "~~/components/primitives/Brackets";
import { Btn } from "~~/components/primitives/Btn";
import { CopyIcon, DownloadIcon } from "~~/components/primitives/icons";
import {
  CARD_H,
  CARD_W,
  COLORS,
  TelegramLogo,
  XLogo,
  drawBrackets,
  roundRect,
  truncateForWidth,
  wrapText,
} from "~~/components/share/share-card-utils";
import { shortAddr } from "~~/lib/format";

/**
 * "Brag card" the claimer can post after opening a packet. Mirrors the
 * 720×920 visual of `ShareCardModal` but leads with the +amount hero
 * instead of packet metadata. The QR still points at `/r/[id]` so
 * friends arrive on the same landing page (and can claim if shares
 * remain) — the claimer's amount itself is never embedded into the
 * link, only into the card image the claimer chooses to post.
 */

interface ClaimShareCardModalProps {
  url: string;
  packetId: bigint;
  /** Pre-formatted amount string, e.g. "0.000328". */
  amountLabel: string;
  assetSymbol: string;
  note: string;
  creator: string;
  remaining: number;
  totalShares: number;
  expiresInLabel?: string;
  onClose: () => void;
}

export function ClaimShareCardModal({
  url,
  packetId,
  amountLabel,
  assetSymbol,
  note,
  creator,
  remaining,
  totalShares,
  expiresInLabel,
  onClose,
}: ClaimShareCardModalProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string>();
  const [imgDataUrl, setImgDataUrl] = useState<string>();
  const defaultMessage = useMemo(
    () => `🎁 Just claimed +${amountLabel} ${assetSymbol} from a CipherGift — confidential gifts on FHE.`,
    [amountLabel, assetSymbol],
  );
  const [message, setMessage] = useState(defaultMessage);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // QR uses the same yellow palette as the creator card so both decks
  // feel like a series.
  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(url, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 320,
      color: { dark: "#0a0a0a", light: "#ffd200" },
    })
      .then(next => {
        if (!cancelled) setQrDataUrl(next);
      })
      .catch(() => {
        // Non-fatal: card still renders without the QR overlay.
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  useEffect(() => {
    if (!qrDataUrl) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const img = new Image();
    img.onload = () => {
      drawCard(ctx, {
        amountLabel,
        assetSymbol,
        packetId,
        note,
        creator,
        remaining,
        totalShares,
        expiresInLabel,
        url,
        qrImage: img,
      });
      try {
        setImgDataUrl(canvas.toDataURL("image/png"));
      } catch {
        // Tainted canvas safety net.
      }
    };
    img.src = qrDataUrl;
  }, [qrDataUrl, amountLabel, assetSymbol, packetId, note, creator, remaining, totalShares, expiresInLabel, url]);

  const onCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.error("Could not copy link");
    }
  };

  const onCopyMessage = async () => {
    try {
      await navigator.clipboard.writeText(`${message}\n${url}`);
      toast.success("Message + link copied");
    } catch {
      toast.error("Could not copy");
    }
  };

  const xHref = useMemo(
    () => `https://twitter.com/intent/tweet?text=${encodeURIComponent(message)}&url=${encodeURIComponent(url)}`,
    [message, url],
  );
  const tgHref = useMemo(
    () => `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(message)}`,
    [message, url],
  );

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.78)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 120,
        padding: 24,
        overflowY: "auto",
      }}
    >
      <div
        className="panel modal-panel"
        onClick={e => e.stopPropagation()}
        style={{
          width: 920,
          maxWidth: "100%",
          padding: 24,
          position: "relative",
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.05fr) minmax(0, 0.95fr)",
          gap: 22,
        }}
      >
        <Brackets />
        <button
          aria-label="Close"
          onClick={onClose}
          style={{
            position: "absolute",
            top: 14,
            right: 14,
            background: "transparent",
            border: 0,
            color: "var(--ink-3)",
            fontSize: 18,
            cursor: "pointer",
            zIndex: 2,
          }}
        >
          ×
        </button>

        <div>
          <div className="tick" style={{ marginBottom: 10 }}>
            CLAIM CARD
          </div>
          <CardPreview
            amountLabel={amountLabel}
            assetSymbol={assetSymbol}
            packetId={packetId}
            note={note}
            creator={creator}
            remaining={remaining}
            totalShares={totalShares}
            qrDataUrl={qrDataUrl}
            url={url}
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
          <div>
            <div className="tick" style={{ marginBottom: 8 }}>
              SHARE MESSAGE
            </div>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              rows={4}
              style={{
                width: "100%",
                background: "var(--bg-2)",
                color: "var(--ink)",
                border: "1px solid var(--line-2)",
                borderRadius: 8,
                padding: "10px 12px",
                fontFamily: "var(--font-sans)",
                fontSize: 13,
                resize: "vertical",
                outline: "none",
              }}
            />
          </div>

          <div>
            <div className="tick" style={{ marginBottom: 8 }}>
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
              }}
            >
              {url}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {imgDataUrl ? (
              <a href={imgDataUrl} download={`ciphergift-claim-${packetId}.png`} style={{ textDecoration: "none" }}>
                <Btn kind="primary" block icon={<DownloadIcon size={12} />}>
                  Save Image
                </Btn>
              </a>
            ) : (
              <Btn kind="primary" block disabled icon={<DownloadIcon size={12} />}>
                Save Image
              </Btn>
            )}
            <Btn kind="ghost" block icon={<CopyIcon size={12} />} onClick={onCopyLink}>
              Copy Link
            </Btn>
            <a href={xHref} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
              <Btn kind="dark" block icon={<XLogo size={12} />}>
                X
              </Btn>
            </a>
            <a href={tgHref} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none" }}>
              <Btn kind="dark" block icon={<TelegramLogo size={14} />}>
                Telegram
              </Btn>
            </a>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            <Btn kind="ghost" size="sm" onClick={onCopyMessage}>
              Copy text + link
            </Btn>
            <Btn kind="ghost" size="sm" onClick={onClose}>
              Done
            </Btn>
          </div>

          <p style={{ fontSize: 11, color: "var(--ink-3)", margin: 0, lineHeight: 1.5 }}>
            X and Telegram only auto-fill the message and link. To attach the card image, save it first and drop it into
            the composer. {expiresInLabel ? `· packet expires ${expiresInLabel}` : null}
          </p>
        </div>

        <canvas ref={canvasRef} width={CARD_W} height={CARD_H} style={{ display: "none" }} />
      </div>
    </div>
  );
}

interface CardData {
  amountLabel: string;
  assetSymbol: string;
  packetId: bigint;
  note: string;
  creator: string;
  remaining: number;
  totalShares: number;
  qrDataUrl?: string;
  url: string;
}

function CardPreview(props: CardData) {
  const { amountLabel, assetSymbol, packetId, note, creator, remaining, totalShares, qrDataUrl, url } = props;
  const claimable = remaining > 0;
  return (
    <div
      style={{
        position: "relative",
        background: COLORS.bg,
        border: `1px solid ${COLORS.line}`,
        borderRadius: 14,
        padding: 22,
        overflow: "hidden",
        aspectRatio: `${CARD_W} / ${CARD_H}`,
      }}
    >
      <Brackets />
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          letterSpacing: "0.18em",
          color: COLORS.ink3,
        }}
      >
        <span>
          CIPHERGIFT <span style={{ color: COLORS.fhe }}>·</span> CLAIMED
        </span>
        <span>#{String(packetId)}</span>
      </div>

      {/* Hero: +amount */}
      <div style={{ marginTop: 28, textAlign: "center" }}>
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 56,
            fontWeight: 700,
            letterSpacing: "-0.04em",
            color: COLORS.accent,
            lineHeight: 1,
          }}
        >
          +{amountLabel}
        </div>
        <div
          style={{
            marginTop: 6,
            fontFamily: "var(--font-mono)",
            fontSize: 14,
            letterSpacing: "0.16em",
            color: COLORS.ink2,
          }}
        >
          {assetSymbol}
        </div>
      </div>

      {/* Note */}
      {note?.trim() && (
        <div
          style={{
            marginTop: 18,
            fontStyle: "italic",
            fontSize: 13,
            lineHeight: 1.5,
            color: COLORS.ink2,
            textAlign: "center",
            padding: "0 22px",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          &ldquo;{note.trim()}&rdquo;
        </div>
      )}

      {/* QR */}
      <div style={{ marginTop: 22, display: "flex", justifyContent: "center" }}>
        <div
          style={{
            width: "48%",
            aspectRatio: "1",
            background: COLORS.accent,
            borderRadius: 8,
            border: `1px solid ${COLORS.line2}`,
            display: "grid",
            placeItems: "center",
            overflow: "hidden",
            position: "relative",
          }}
        >
          {qrDataUrl ? (
            <div
              role="img"
              aria-label="Share QR"
              style={{
                width: "100%",
                height: "100%",
                backgroundImage: `url(${qrDataUrl})`,
                backgroundSize: "cover",
              }}
            />
          ) : (
            <span style={{ color: COLORS.accentInk, fontFamily: "var(--font-mono)", fontSize: 11 }}>QR</span>
          )}
        </div>
      </div>

      <div
        style={{
          marginTop: 12,
          textAlign: "center",
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          letterSpacing: "0.08em",
          color: COLORS.ink2,
        }}
      >
        {claimable ? `WANT ONE? ${remaining}/${totalShares} LEFT` : "ALREADY FULLY CLAIMED"} · {truncateUrl(url, 38)}
      </div>

      <div
        style={{
          position: "absolute",
          left: 22,
          right: 22,
          bottom: 18,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          letterSpacing: "0.1em",
          color: COLORS.ink3,
        }}
      >
        <span>
          FROM <span style={{ color: COLORS.ink2 }}>{shortAddr(creator)}</span>
        </span>
        <span style={{ color: COLORS.fhe }}>● FHE — only claimer decrypts</span>
      </div>
    </div>
  );
}

function truncateUrl(url: string, max: number) {
  if (url.length <= max) return url;
  return `${url.slice(0, max - 1)}…`;
}

interface DrawData extends Omit<CardData, "qrDataUrl"> {
  qrImage: HTMLImageElement;
  expiresInLabel?: string;
}

/**
 * Mirrors `CardPreview` onto a 2D canvas so we can export PNG. Layout
 * intentionally tracks the React preview — keep them in sync if either
 * changes.
 */
function drawCard(ctx: CanvasRenderingContext2D, d: DrawData) {
  const W = CARD_W;
  const H = CARD_H;
  const PAD = 44;
  const fontDisplay = "'Space Grotesk', 'Inter', system-ui, sans-serif";
  const fontMono = "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace";

  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = COLORS.line;
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, W - 2, H - 2);

  drawBrackets(ctx, W, H, 28, 4, COLORS.accent);

  // Header
  ctx.fillStyle = COLORS.ink3;
  ctx.font = `600 14px ${fontMono}`;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.fillText("CIPHERGIFT · CLAIMED", PAD, PAD + 14);
  ctx.textAlign = "right";
  ctx.fillText(`#${String(d.packetId)}`, W - PAD, PAD + 14);

  // Hero: +amount
  const heroY = PAD + 130;
  ctx.textAlign = "center";
  ctx.fillStyle = COLORS.accent;
  ctx.font = `700 110px ${fontDisplay}`;
  ctx.fillText(truncateForWidth(ctx, `+${d.amountLabel}`, W - PAD * 2), W / 2, heroY);

  // Asset symbol below hero
  ctx.fillStyle = COLORS.ink2;
  ctx.font = `500 22px ${fontMono}`;
  ctx.fillText(d.assetSymbol, W / 2, heroY + 44);

  let cursorY = heroY + 100;

  // Note (optional, italic, up to 2 lines)
  if (d.note?.trim()) {
    ctx.fillStyle = COLORS.ink2;
    ctx.font = `italic 500 22px ${fontDisplay}`;
    const noteLines = wrapText(ctx, `"${d.note.trim()}"`, W - PAD * 2 - 60, 2);
    for (const line of noteLines) {
      ctx.fillText(line, W / 2, cursorY);
      cursorY += 32;
    }
    cursorY += 10;
  }

  // QR block
  const qrSize = 240;
  const qrX = (W - qrSize) / 2;
  const qrY = cursorY + 10;
  ctx.fillStyle = COLORS.accent;
  roundRect(ctx, qrX - 14, qrY - 14, qrSize + 28, qrSize + 28, 12, true, false);
  ctx.strokeStyle = COLORS.line2;
  ctx.lineWidth = 1;
  roundRect(ctx, qrX - 14, qrY - 14, qrSize + 28, qrSize + 28, 12, false, true);
  ctx.drawImage(d.qrImage, qrX, qrY, qrSize, qrSize);

  // Tagline
  const tag =
    d.remaining > 0 ? `WANT ONE? ${d.remaining}/${d.totalShares} LEFT` : "ALREADY FULLY CLAIMED";
  ctx.fillStyle = COLORS.ink2;
  ctx.font = `500 13px ${fontMono}`;
  ctx.fillText(`${tag} · ${truncateForWidth(ctx, d.url, W - PAD * 2)}`, W / 2, qrY + qrSize + 44);

  // Footer
  ctx.fillStyle = COLORS.ink3;
  ctx.font = `500 13px ${fontMono}`;
  ctx.textAlign = "left";
  ctx.fillText(`FROM ${shortAddr(d.creator)}`, PAD, H - PAD);
  ctx.textAlign = "right";
  ctx.fillStyle = COLORS.fhe;
  ctx.fillText("● FHE — only claimer decrypts", W - PAD, H - PAD);
}

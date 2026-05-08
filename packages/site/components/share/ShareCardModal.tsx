"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { toast } from "react-hot-toast";
import { Brackets } from "~~/components/primitives/Brackets";
import { Btn } from "~~/components/primitives/Btn";
import { CopyIcon, DownloadIcon } from "~~/components/primitives/icons";
import { shortAddr } from "~~/lib/format";
import { type PacketTypeValue } from "~~/lib/packet-types";

/**
 * Share modal: renders an OKX-style image card (with QR + packet stats) that
 * the user can download as PNG, copy the link from, or share to X / Telegram.
 *
 * X / Telegram share URLs only carry text+link — uploading the PNG is up to
 * the user (browsers can't push a file into an external composer). We default
 * the message text to a short blurb the user can edit.
 */

const PACKET_TYPE_LABEL: Record<PacketTypeValue, string> = {
  0: "lucky · random",
  1: "equal split",
  2: "targeted",
  3: "password",
  4: "blind box",
};

interface ShareCardModalProps {
  url: string;
  packetId: bigint;
  note: string;
  assetSymbol: string;
  packetType: PacketTypeValue;
  totalShares: number;
  claimedCount: number;
  creator: string;
  expiresInLabel?: string;
  onClose: () => void;
}

const CARD_W = 720;
const CARD_H = 920;

const COLORS = {
  bg: "#111111",
  bg2: "#181818",
  line: "#2a2a2a",
  line2: "#3a3a3a",
  ink: "#f5f5f0",
  ink2: "#b8b8b0",
  ink3: "#6a6a64",
  accent: "#ffd200",
  accentInk: "#0a0a0a",
  fhe: "#b6f569",
};

const DEFAULT_MESSAGE = "🎁 You've got a confidential CipherGift — claim before it expires.";

export function ShareCardModal({
  url,
  packetId,
  note,
  assetSymbol,
  packetType,
  totalShares,
  claimedCount,
  creator,
  expiresInLabel,
  onClose,
}: ShareCardModalProps) {
  const [qrDataUrl, setQrDataUrl] = useState<string>();
  const [imgDataUrl, setImgDataUrl] = useState<string>();
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const remaining = Math.max(0, totalShares - claimedCount);
  const title = note?.trim() || "Untitled gift";

  // Derive QR (white-on-dark so it composites cleanly onto the card).
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
        // Non-fatal: card still renders, just without the QR overlay.
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  // Render card -> canvas -> PNG once the QR is ready. We re-render whenever
  // any text input changes so the download always reflects the latest state.
  useEffect(() => {
    if (!qrDataUrl) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const img = new Image();
    img.onload = () => {
      drawCard(ctx, {
        title,
        packetId,
        assetSymbol,
        packetType,
        totalShares,
        claimedCount,
        remaining,
        creator,
        expiresInLabel,
        url,
        qrImage: img,
      });
      try {
        setImgDataUrl(canvas.toDataURL("image/png"));
      } catch {
        // Tainted canvas safety net — ignore, download button just falls back to QR-only image.
      }
    };
    img.src = qrDataUrl;
  }, [
    qrDataUrl,
    title,
    packetId,
    assetSymbol,
    packetType,
    totalShares,
    claimedCount,
    remaining,
    creator,
    expiresInLabel,
    url,
  ]);

  const onCopy = async () => {
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
        zIndex: 110,
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

        {/* LEFT: live card preview (HTML mirror of the canvas). */}
        <div>
          <div className="tick" style={{ marginBottom: 10 }}>
            SHARE CARD
          </div>
          <CardPreview
            title={title}
            packetId={packetId}
            assetSymbol={assetSymbol}
            packetType={packetType}
            totalShares={totalShares}
            claimedCount={claimedCount}
            remaining={remaining}
            creator={creator}
            expiresInLabel={expiresInLabel}
            qrDataUrl={qrDataUrl}
            url={url}
          />
        </div>

        {/* RIGHT: message editor + actions. */}
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
              <a href={imgDataUrl} download={`ciphergift-packet-${packetId}.png`} style={{ textDecoration: "none" }}>
                <Btn kind="primary" block icon={<DownloadIcon size={12} />}>
                  Save Image
                </Btn>
              </a>
            ) : (
              <Btn kind="primary" block disabled icon={<DownloadIcon size={12} />}>
                Save Image
              </Btn>
            )}
            <Btn kind="ghost" block icon={<CopyIcon size={12} />} onClick={onCopy}>
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
            the composer.
          </p>
        </div>

        {/* Hidden canvas used to mint the downloadable PNG. */}
        <canvas ref={canvasRef} width={CARD_W} height={CARD_H} style={{ display: "none" }} />
      </div>
    </div>
  );
}

interface CardData {
  title: string;
  packetId: bigint;
  assetSymbol: string;
  packetType: PacketTypeValue;
  totalShares: number;
  claimedCount: number;
  remaining: number;
  creator: string;
  expiresInLabel?: string;
  qrDataUrl?: string;
  url: string;
}

function CardPreview(props: CardData) {
  const {
    title,
    packetId,
    assetSymbol,
    packetType,
    totalShares,
    claimedCount,
    remaining,
    creator,
    expiresInLabel,
    qrDataUrl,
    url,
  } = props;
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
      {/* Header */}
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
          CIPHERGIFT <span style={{ color: COLORS.accent }}>·</span> CONFIDENTIAL GIFT
        </span>
        <span>#{String(packetId)}</span>
      </div>

      {/* Title */}
      <div style={{ marginTop: 16 }}>
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 26,
            fontWeight: 600,
            letterSpacing: "-0.02em",
            color: COLORS.ink,
            lineHeight: 1.2,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {title}
        </div>
        <div
          style={{
            marginTop: 6,
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: COLORS.ink2,
            letterSpacing: "0.06em",
          }}
        >
          {assetSymbol} · {PACKET_TYPE_LABEL[packetType]}
        </div>
      </div>

      {/* Stats */}
      <div
        style={{
          marginTop: 18,
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 1,
          background: COLORS.line,
          border: `1px solid ${COLORS.line}`,
          borderRadius: 10,
          overflow: "hidden",
        }}
      >
        <Stat label="CLAIMED" value={`${claimedCount}/${totalShares}`} />
        <Stat label="REMAINING" value={String(remaining)} accent />
        <Stat label="EXPIRES" value={expiresInLabel ?? "—"} />
      </div>

      {/* QR */}
      <div style={{ marginTop: 18, display: "flex", justifyContent: "center" }}>
        <div
          style={{
            width: "55%",
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
        SCAN TO CLAIM · {truncateUrl(url, 42)}
      </div>

      {/* Footer */}
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

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ padding: "12px 14px", background: COLORS.bg, minWidth: 0 }}>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          letterSpacing: "0.16em",
          color: COLORS.ink3,
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 18,
          fontWeight: 600,
          color: accent ? COLORS.accent : COLORS.ink,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {value}
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
}

/**
 * Draws the same card visual into a 2D canvas so we can export a PNG.
 * Layout intentionally mirrors CardPreview, just without DOM/CSS conveniences.
 */
function drawCard(ctx: CanvasRenderingContext2D, d: DrawData) {
  const W = CARD_W;
  const H = CARD_H;
  const PAD = 44;
  const fontDisplay = "'Space Grotesk', 'Inter', system-ui, sans-serif";
  const fontMono = "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace";

  // Background
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, W, H);

  // Outer border
  ctx.strokeStyle = COLORS.line;
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, W - 2, H - 2);

  // Corner brackets (yellow, ~28px)
  drawBrackets(ctx, W, H, 28, 4, COLORS.accent);

  // Header
  ctx.fillStyle = COLORS.ink3;
  ctx.font = `600 14px ${fontMono}`;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.fillText("CIPHERGIFT · CONFIDENTIAL GIFT", PAD, PAD + 14);
  ctx.textAlign = "right";
  ctx.fillText(`#${String(d.packetId)}`, W - PAD, PAD + 14);

  // Title
  ctx.textAlign = "left";
  ctx.fillStyle = COLORS.ink;
  ctx.font = `600 36px ${fontDisplay}`;
  const titleLines = wrapText(ctx, d.title, W - PAD * 2, 2);
  let cursorY = PAD + 70;
  for (const line of titleLines) {
    ctx.fillText(line, PAD, cursorY);
    cursorY += 42;
  }

  // Subtitle (asset · type)
  ctx.fillStyle = COLORS.ink2;
  ctx.font = `500 16px ${fontMono}`;
  ctx.fillText(`${d.assetSymbol}  ·  ${PACKET_TYPE_LABEL[d.packetType]}`, PAD, cursorY + 6);

  // Stats row
  const statY = cursorY + 38;
  const statH = 96;
  const statW = (W - PAD * 2) / 3;
  const stats: Array<[string, string, boolean]> = [
    ["CLAIMED", `${d.claimedCount}/${d.totalShares}`, false],
    ["REMAINING", String(d.remaining), true],
    ["EXPIRES", d.expiresInLabel ?? "—", false],
  ];
  // Group bg
  ctx.fillStyle = COLORS.bg2;
  roundRect(ctx, PAD, statY, W - PAD * 2, statH, 12, true, false);
  // Border
  ctx.strokeStyle = COLORS.line;
  ctx.lineWidth = 1;
  roundRect(ctx, PAD, statY, W - PAD * 2, statH, 12, false, true);
  stats.forEach((s, i) => {
    const x = PAD + statW * i;
    if (i > 0) {
      ctx.strokeStyle = COLORS.line;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, statY + 18);
      ctx.lineTo(x, statY + statH - 18);
      ctx.stroke();
    }
    ctx.fillStyle = COLORS.ink3;
    ctx.font = `600 12px ${fontMono}`;
    ctx.textAlign = "left";
    ctx.fillText(s[0], x + 18, statY + 30);
    ctx.fillStyle = s[2] ? COLORS.accent : COLORS.ink;
    ctx.font = `600 26px ${fontDisplay}`;
    ctx.fillText(truncateForWidth(ctx, s[1], statW - 36), x + 18, statY + 64);
  });

  // QR block
  const qrSize = 280;
  const qrX = (W - qrSize) / 2;
  const qrY = statY + statH + 36;
  ctx.fillStyle = COLORS.accent;
  roundRect(ctx, qrX - 14, qrY - 14, qrSize + 28, qrSize + 28, 12, true, false);
  ctx.strokeStyle = COLORS.line2;
  ctx.lineWidth = 1;
  roundRect(ctx, qrX - 14, qrY - 14, qrSize + 28, qrSize + 28, 12, false, true);
  ctx.drawImage(d.qrImage, qrX, qrY, qrSize, qrSize);

  // "SCAN TO CLAIM · url"
  ctx.fillStyle = COLORS.ink2;
  ctx.font = `500 13px ${fontMono}`;
  ctx.textAlign = "center";
  ctx.fillText(`SCAN TO CLAIM · ${truncateForWidth(ctx, d.url, W - PAD * 2)}`, W / 2, qrY + qrSize + 50);

  // Footer
  ctx.fillStyle = COLORS.ink3;
  ctx.font = `500 13px ${fontMono}`;
  ctx.textAlign = "left";
  ctx.fillText(`FROM ${shortAddr(d.creator)}`, PAD, H - PAD);
  ctx.textAlign = "right";
  ctx.fillStyle = COLORS.fhe;
  ctx.fillText("● FHE — only claimer decrypts", W - PAD, H - PAD);
}

function drawBrackets(ctx: CanvasRenderingContext2D, W: number, H: number, len: number, thick: number, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = thick;
  const off = 8;
  // top-left
  ctx.beginPath();
  ctx.moveTo(off, off + len);
  ctx.lineTo(off, off);
  ctx.lineTo(off + len, off);
  ctx.stroke();
  // top-right
  ctx.beginPath();
  ctx.moveTo(W - off - len, off);
  ctx.lineTo(W - off, off);
  ctx.lineTo(W - off, off + len);
  ctx.stroke();
  // bottom-left
  ctx.beginPath();
  ctx.moveTo(off, H - off - len);
  ctx.lineTo(off, H - off);
  ctx.lineTo(off + len, H - off);
  ctx.stroke();
  // bottom-right
  ctx.beginPath();
  ctx.moveTo(W - off - len, H - off);
  ctx.lineTo(W - off, H - off);
  ctx.lineTo(W - off, H - off - len);
  ctx.stroke();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: boolean,
  stroke: boolean,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && current) {
      lines.push(current);
      current = word;
      if (lines.length === maxLines - 1) break;
    } else {
      current = candidate;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length === maxLines) {
    const last = lines[maxLines - 1];
    lines[maxLines - 1] = truncateForWidth(ctx, last, maxWidth);
  }
  return lines;
}

function truncateForWidth(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (ctx.measureText(`${text.slice(0, mid)}…`).width <= maxWidth) lo = mid + 1;
    else hi = mid;
  }
  return `${text.slice(0, Math.max(0, lo - 1))}…`;
}

function XLogo({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.244 2H21.5l-7.55 8.63L23 22h-6.844l-5.36-7.01L4.6 22H1.34l8.07-9.22L1 2h7.01l4.84 6.4L18.244 2zm-2.4 18h1.91L7.25 4H5.24l10.604 16z" />
    </svg>
  );
}

function TelegramLogo({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.146.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.022c.242-.213-.054-.334-.373-.121L8.48 13.45l-2.95-.924c-.642-.205-.654-.642.135-.95l11.514-4.438c.534-.196 1.006.128.832.943z" />
    </svg>
  );
}

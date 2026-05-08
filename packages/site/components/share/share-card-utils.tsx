/**
 * Pure helpers + tokens shared between the creator's `ShareCardModal`
 * and the claimer's `ClaimShareCardModal`. Both modals render the same
 * 720×920 canvas card — only the layout content differs — so the
 * primitives here keep the two visuals in lockstep.
 */

export const CARD_W = 720;
export const CARD_H = 920;

export const COLORS = {
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

export function drawBrackets(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  len: number,
  thick: number,
  color: string,
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = thick;
  const off = 8;
  ctx.beginPath();
  ctx.moveTo(off, off + len);
  ctx.lineTo(off, off);
  ctx.lineTo(off + len, off);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(W - off - len, off);
  ctx.lineTo(W - off, off);
  ctx.lineTo(W - off, off + len);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(off, H - off - len);
  ctx.lineTo(off, H - off);
  ctx.lineTo(off + len, H - off);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(W - off - len, H - off);
  ctx.lineTo(W - off, H - off);
  ctx.lineTo(W - off, H - off - len);
  ctx.stroke();
}

export function roundRect(
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

export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
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

export function truncateForWidth(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
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

export function XLogo({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.244 2H21.5l-7.55 8.63L23 22h-6.844l-5.36-7.01L4.6 22H1.34l8.07-9.22L1 2h7.01l4.84 6.4L18.244 2zm-2.4 18h1.91L7.25 4H5.24l10.604 16z" />
    </svg>
  );
}

export function TelegramLogo({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.146.658-.537.818-1.084.508l-3-2.21-1.446 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.022c.242-.213-.054-.334-.373-.121L8.48 13.45l-2.95-.924c-.642-.205-.654-.642.135-.95l11.514-4.438c.534-.196 1.006.128.832.943z" />
    </svg>
  );
}

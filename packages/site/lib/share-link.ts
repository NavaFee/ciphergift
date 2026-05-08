/**
 * Share-link helpers for `/r/[id]` URLs. The path embeds only the packet
 * ID; per-invitee secrets (TARGETED salts/proofs) travel in the URL
 * fragment, never on the server.
 */

export function buildShareLinkPath(packetId: bigint | number | string): string {
  return `/r/${String(packetId)}`;
}

export function buildShareLinkUrl(origin: string, packetId: bigint | number | string): string {
  return `${origin}${buildShareLinkPath(packetId)}`;
}

export function parsePacketIdFromParam(param: string | undefined): bigint | undefined {
  if (!param) return undefined;
  try {
    const n = BigInt(param);
    if (n < 0n) return undefined;
    return n;
  } catch {
    return undefined;
  }
}

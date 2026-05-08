/**
 * Mirrors the on-chain `CipherGift.PacketType` enum + UI metadata used
 * by the send wizard, dashboard chips, and inbox card badges.
 */

export const PacketType = {
  RANDOM: 0,
  EQUAL: 1,
  TARGETED: 2,
  PASSWORD: 3,
  BLIND: 4,
} as const;

export type PacketTypeKey = keyof typeof PacketType;
export type PacketTypeValue = (typeof PacketType)[PacketTypeKey];

export const PACKET_TYPE_LABELS: Record<PacketTypeKey, string> = {
  RANDOM: "Lucky · random",
  EQUAL: "Equal split",
  TARGETED: "Targeted",
  PASSWORD: "Password",
  BLIND: "Blind box",
};

export const PACKET_TYPE_HINTS: Record<PacketTypeKey, string> = {
  RANDOM: "FHE-random shares, drawn on-chain. Most fun.",
  EQUAL: "Same amount per claim. Predictable.",
  TARGETED: "Only listed addresses can claim. List is encrypted.",
  PASSWORD: "Anyone with the secret phrase can claim.",
  BLIND: "Claim first, reveal later.",
};

/** Toggle a packet type off here to hide it from the Send wizard. */
export const PACKET_TYPE_AVAILABLE: Record<PacketTypeKey, boolean> = {
  RANDOM: true,
  EQUAL: true,
  TARGETED: true,
  PASSWORD: true,
  BLIND: true,
};

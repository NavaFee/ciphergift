/**
 * Hand-curated ABI fragments for the events and reads the indexer needs.
 * Kept here rather than imported from packages/site to keep the indexer
 * decoupled from the frontend build (and to dodge the Next.js path
 * aliasing). When CipherGift.sol's event surface changes, sync here.
 */

import { parseAbi } from "viem";

export const cipherWrapAbi = parseAbi([
  "event PacketCreated(uint256 indexed id, address indexed creator, uint8 ptype, uint32 totalShares, uint64 expiresAt)",
  "event PacketAssetBound(uint256 indexed id, address indexed assetId)",
  "event PacketClaimed(uint256 indexed id, address indexed claimer)",
  "event PacketRevealed(uint256 indexed id, address indexed claimer)",
  "event PacketRefunded(uint256 indexed id)",
  "event AssetVaultSet(address indexed assetId, bool enabled)",
  "event Paused(address indexed by)",
  "event Unpaused(address indexed by)",
  "event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner)",
  "event OwnershipTransferred(address indexed previousOwner, address indexed newOwner)",
  "function packetCount() view returns (uint256)",
  "function getPacket(uint256 id) view returns (address creator, uint64 createdAt, uint64 expiresAt, uint8 packetType, uint32 totalShares, uint32 claimedCount, uint64 maxShareScalar, string note, bool refunded)",
  "function getPacketAsset(uint256 id) view returns (address)",
  "function allowlistRoot(uint256 id) view returns (bytes32)",
] as const);

export const vaultAbi = parseAbi([
  "event Deposited(address indexed user, uint256 weiAmount, uint64 units)",
  "event WithdrawRequested(uint256 indexed reqId, address indexed user, bytes32 balanceHandle)",
  "event WithdrawFulfilled(uint256 indexed reqId, address indexed user, uint64 units, uint256 weiAmount)",
  "event WithdrawCancelled(uint256 indexed reqId, address indexed user)",
] as const);

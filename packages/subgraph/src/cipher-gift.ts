/**
 * Event handlers for the CipherGift contract. Each handler maps an
 * on-chain event onto entity mutations in the subgraph store, mirroring
 * the in-memory transitions in the legacy indexer's poller.ts.
 */
import { BigInt, Bytes } from "@graphprotocol/graph-ts";
import {
  AssetVaultSet,
  CipherGift,
  OwnershipTransferStarted,
  OwnershipTransferred,
  PacketAssetBound,
  PacketClaimed,
  PacketCreated,
  PacketRefunded,
  PacketRevealed,
  Paused,
  Unpaused,
} from "../generated/CipherGift/CipherGift";
import { AssetVault, Claim, OperationsState, Packet, Reveal } from "../generated/schema";

const ZERO_ADDRESS = Bytes.fromHexString("0x0000000000000000000000000000000000000000") as Bytes;
const OPS_ID = "state";

export function handlePacketCreated(event: PacketCreated): void {
  const id = event.params.id.toString();
  const wrap = CipherGift.bind(event.address);

  // Pull bits the event doesn't carry. tryX() avoids reverts during chain
  // catch-up if a packet ever ends up half-written, which shouldn't
  // happen but keeps the indexer crash-resistant.
  const detail = wrap.try_getPacket(event.params.id);
  const allowlistRoot = wrap.try_allowlistRoot(event.params.id);
  const assetId = wrap.try_getPacketAsset(event.params.id);

  const packet = new Packet(id);
  packet.creator = event.params.creator;
  if (!detail.reverted) {
    // graph-cli 0.93+ types uint32 as BigInt (only uint8/uint16 stay i32),
    // so .toI32() is required when the entity field is `Int!`.
    packet.createdAt = detail.value.value1;
    packet.expiresAt = detail.value.value2;
    packet.packetType = detail.value.value3;
    packet.totalShares = detail.value.value4.toI32();
    packet.maxShareScalar = detail.value.value6;
    packet.note = detail.value.value7;
  } else {
    // Fall back to event-only fields if the read reverted. createdAt isn't in
    // the event so we approximate with block.timestamp.
    packet.createdAt = event.block.timestamp;
    packet.expiresAt = event.params.expiresAt;
    packet.packetType = event.params.ptype;
    packet.totalShares = event.params.totalShares.toI32();
    packet.maxShareScalar = BigInt.zero();
    packet.note = "";
  }
  packet.claimedCount = 0;
  packet.revealedCount = 0;
  packet.refunded = false;
  if (!allowlistRoot.reverted) {
    packet.allowlistRoot = allowlistRoot.value;
  } else {
    packet.allowlistRoot = Bytes.fromHexString(
      "0x0000000000000000000000000000000000000000000000000000000000000000",
    ) as Bytes;
  }
  if (!assetId.reverted && assetId.value.notEqual(ZERO_ADDRESS)) {
    packet.assetId = assetId.value;
  }
  packet.createdAtBlock = event.block.number;
  packet.createdAtTx = event.transaction.hash;
  packet.save();
}

export function handlePacketAssetBound(event: PacketAssetBound): void {
  const id = event.params.id.toString();
  const packet = Packet.load(id);
  if (packet == null) return;
  packet.assetId = event.params.assetId;
  packet.save();
}

export function handlePacketClaimed(event: PacketClaimed): void {
  const packetId = event.params.id.toString();
  const claimId = packetId + "-" + event.params.claimer.toHexString();
  // Immutable entity — first write wins; replays of the same log skip.
  if (Claim.load(claimId) != null) return;
  const claim = new Claim(claimId);
  claim.packet = packetId;
  claim.claimer = event.params.claimer;
  claim.blockNumber = event.block.number;
  claim.txHash = event.transaction.hash;
  claim.timestamp = event.block.timestamp;
  claim.save();

  const packet = Packet.load(packetId);
  if (packet != null) {
    packet.claimedCount = packet.claimedCount + 1;
    packet.save();
  }
}

export function handlePacketRevealed(event: PacketRevealed): void {
  const packetId = event.params.id.toString();
  const revealId = packetId + "-" + event.params.claimer.toHexString();
  if (Reveal.load(revealId) != null) return;
  const reveal = new Reveal(revealId);
  reveal.packet = packetId;
  reveal.claimer = event.params.claimer;
  reveal.blockNumber = event.block.number;
  reveal.txHash = event.transaction.hash;
  reveal.timestamp = event.block.timestamp;
  reveal.save();

  const packet = Packet.load(packetId);
  if (packet != null) {
    packet.revealedCount = packet.revealedCount + 1;
    packet.save();
  }
}

export function handlePacketRefunded(event: PacketRefunded): void {
  const packet = Packet.load(event.params.id.toString());
  if (packet == null) return;
  packet.refunded = true;
  packet.save();
}

export function handleAssetVaultSet(event: AssetVaultSet): void {
  const id = event.params.assetId.toHexString();
  let v = AssetVault.load(id);
  if (v == null) v = new AssetVault(id);
  v.enabled = event.params.enabled;
  v.blockNumber = event.block.number;
  v.save();
}

export function handlePaused(event: Paused): void {
  const ops = loadOps();
  ops.paused = true;
  ops.pausedAtBlock = event.block.number;
  ops.pausedBy = event.params.by;
  ops.save();
}

export function handleUnpaused(event: Unpaused): void {
  const ops = loadOps();
  ops.paused = false;
  ops.pausedAtBlock = event.block.number;
  ops.pausedBy = event.params.by;
  ops.save();
}

export function handleOwnershipTransferStarted(event: OwnershipTransferStarted): void {
  const ops = loadOps();
  if (event.params.newOwner.equals(ZERO_ADDRESS)) {
    ops.pendingOwner = null;
  } else {
    ops.pendingOwner = event.params.newOwner;
  }
  ops.ownershipChangedAtBlock = event.block.number;
  ops.save();
}

export function handleOwnershipTransferred(event: OwnershipTransferred): void {
  const ops = loadOps();
  ops.owner = event.params.newOwner;
  ops.pendingOwner = null;
  ops.ownershipChangedAtBlock = event.block.number;
  ops.save();
}

function loadOps(): OperationsState {
  let ops = OperationsState.load(OPS_ID);
  if (ops == null) {
    ops = new OperationsState(OPS_ID);
    ops.paused = false;
  }
  return ops;
}

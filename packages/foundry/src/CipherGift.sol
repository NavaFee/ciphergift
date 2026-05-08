// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {FHE, ebool, euint32, euint64, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";
import {ConfidentialETHVault} from "./ConfidentialETHVault.sol";
import {IConfidentialVault} from "./IConfidentialVault.sol";

/// @title  CipherGift — confidential gift contract
/// @notice Senders pre-deposit cETH (via the vault) and create packets;
///         claimers receive an encrypted share that lands in their own
///         vault balance. Per-share amounts and the recipient's claim
///         total stay encrypted on chain — only the claimer can decrypt
///         their slice. Sender can refund unclaimed residuals after
///         expiry.
///
/// ── Scope ─────────────────────────────────────────────────────────────
/// • EQUAL split: every claimer gets exactly `total / totalShares`. The
///   equal-share ciphertext is computed once at creation via
///   `FHE.div(total, scalarN)` and reused per claim.
/// • RANDOM split: each claimer gets a random encrypted slice in
///   [0, maxShareScalar) drawn from `FHE.randEuint64() % maxShareScalar`,
///   capped at `remainingAmount`. The last claimer takes whatever's left
///   so the full `total` is always distributed. `maxShareScalar` is
///   plaintext (typically `2 * total / totalShares`) so the contract can
///   apply the scalar `FHE.rem` and the per-share size has a public
///   upper bound while staying encrypted within it.
/// • TARGETED is per-recipient amounts (salary use case). The sender
///   commits each slot's encrypted amount up front via
///   `createTargetedPacket`; the on-chain Merkle leaf binds
///   `(salt, claimer, slotIndex)`, so the chain only sees a root + N
///   ciphertexts and never learns who-gets-what. Claimers present
///   `(salt, slotIndex, proof)` and the contract debits their slot's
///   pre-encrypted amount — amounts stay encrypted on chain throughout,
///   even on claim.
///
/// ── FHE ACL chain ─────────────────────────────────────────────────────
/// At every encrypted-mutation site we re-allow the new handle to:
///   • this contract           (FHE.allowThis) — for follow-up reads
///   • the relevant user(s)    (FHE.allow)     — so they can decrypt
///   • the vault               (FHE.allow)     — so vault can FHE.sub
///                                               in internalCredit/Debit
contract CipherGift is ZamaEthereumConfig {
    enum PacketType {
        RANDOM,
        EQUAL,
        TARGETED,
        PASSWORD,
        BLIND
    }

    struct Packet {
        address creator;
        uint64 createdAt;
        uint64 expiresAt;
        PacketType packetType;
        uint32 totalShares;
        uint32 claimedCount;
        uint64 maxShareScalar; // plaintext upper bound for random shares (RANDOM only; 0 otherwise)
        address assetId; // vault address for this packet; default is the ETH vault
        euint64 remainingAmount; // decremented per claim (encrypted)
        euint64 equalShareEnc; // total / totalShares, fixed at creation (used by EQUAL/TARGETED)
        string note; // ≤120 chars, plaintext (acts as a public memo)
        bool refunded;
    }

    ConfidentialETHVault public immutable vault;
    address public immutable defaultAssetId;
    address public owner;
    /// @notice Pending owner for the two-step `transferOwnership`/`acceptOwnership`
    ///         dance. The current owner picks a successor; the successor must
    ///         then call `acceptOwnership` from their own address. Prevents
    ///         locking the contract behind a typoed multisig address.
    address public pendingOwner;
    bool public paused;

    mapping(uint256 => Packet) internal _packets;
    mapping(address => bool) public supportedAssetVault;
    /// @notice Merkle root of the TARGETED allowlist. Leaves are
    ///         `keccak256(bytes.concat(keccak256(abi.encode(salt, claimer, slotIndex))))`.
    ///         The slotIndex binds each (claimer, salt) pair to a specific
    ///         pre-encrypted slot amount, so the same address can't reuse
    ///         a foreign slot's salt to drain a different bucket.
    ///         Zero handle for non-TARGETED packets.
    mapping(uint256 => bytes32) public allowlistRoot;
    /// @notice TARGETED only. Per-slot pre-encrypted amounts committed at
    ///         creation. Indexed by `slotIndex` in `[0, totalShares)`. A
    ///         claim consumes exactly the slot's ciphertext — amounts stay
    ///         encrypted on chain even after claim. Empty for non-TARGETED.
    mapping(uint256 => mapping(uint32 => euint64)) public slotAmount;
    /// @notice PASSWORD packets store `keccak256(abi.encode(packetId, keccak256(bytes(password))))`.
    ///         The preimage is supplied at claim time via `claimWithPassword`.
    mapping(uint256 => bytes32) public passwordHash;
    mapping(uint256 => mapping(address => bool)) public claimed;
    mapping(uint256 => mapping(address => bool)) public revealed;
    mapping(uint256 => mapping(address => euint64)) public claimedAmount;

    uint256 public packetCount;

    event PacketCreated(
        uint256 indexed id, address indexed creator, PacketType ptype, uint32 totalShares, uint64 expiresAt
    );
    event PacketAssetBound(uint256 indexed id, address indexed assetId);
    event PacketClaimed(uint256 indexed id, address indexed claimer);
    event PacketRevealed(uint256 indexed id, address indexed claimer);
    event PacketRefunded(uint256 indexed id);
    event AssetVaultSet(address indexed assetId, bool enabled);
    event Paused(address indexed by);
    event Unpaused(address indexed by);
    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error EmptyShareCount();
    error ExpiryInPast();
    error NoteTooLong();
    error InvalidPacketId();
    error PacketExpired();
    error PacketNotExpired();
    error PacketRefunded_();
    error AlreadyClaimed();
    error AllShareClaimed();
    error NotAllowlisted();
    error NotCreator();
    error TargetedNeedsAllowlist();
    error TargetedRequiresProof();
    error TargetedUseDedicatedCreate();
    error TargetedSlotCountMismatch();
    error SlotIndexOutOfRange();
    error PasswordNeedsSecret();
    error PasswordRequired();
    error WrongPassword();
    error UnexpectedPasswordSecret();
    error UseClaimForOpenPackets();
    error RevealOnlyBlindPackets();
    error NotClaimed();
    error AlreadyRevealed();
    error RandomNeedsMaxShare();
    error UnexpectedMaxShare();
    error UnexpectedAllowlistRoot();
    error NotOwner();
    error NotPendingOwner();
    error ZeroAsset();
    error UnsupportedAsset();
    error Paused_();

    constructor(ConfidentialETHVault _vault) {
        vault = _vault;
        defaultAssetId = address(_vault);
        owner = msg.sender;
        supportedAssetVault[address(_vault)] = true;
        emit AssetVaultSet(address(_vault), true);
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert Paused_();
        _;
    }

    /// @notice Step 1 of the two-step ownership transfer. Only sets a
    ///         pending successor; the contract still belongs to the
    ///         current `owner` until the successor confirms via
    ///         `acceptOwnership`. Pass the zero address to cancel a
    ///         previously-started transfer.
    function transferOwnership(address newOwner) external onlyOwner {
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    /// @notice Step 2 of the two-step ownership transfer. Must be called
    ///         from `pendingOwner`'s own address — guards against typoed
    ///         successors and unreachable multisigs.
    function acceptOwnership() external {
        if (msg.sender != pendingOwner) revert NotPendingOwner();
        address oldOwner = owner;
        owner = pendingOwner;
        delete pendingOwner;
        emit OwnershipTransferred(oldOwner, owner);
    }

    /// @notice Emergency stop for new packet creation only. Claim, reveal,
    ///         and refund remain open so existing funds are not locked.
    function pause() external onlyOwner {
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused(msg.sender);
    }

    /// @notice Register or disable an asset vault. `assetId` is the vault
    ///         address; that vault must use this CipherGift as orchestrator.
    function setAssetVault(address assetId, bool enabled) external onlyOwner {
        if (assetId == address(0)) revert ZeroAsset();
        supportedAssetVault[assetId] = enabled;
        emit AssetVaultSet(assetId, enabled);
    }

    // ── Read helpers ────────────────────────────────────────────────

    function getPacket(uint256 id)
        external
        view
        returns (
            address creator,
            uint64 createdAt,
            uint64 expiresAt,
            PacketType packetType,
            uint32 totalShares,
            uint32 claimedCount,
            uint64 maxShareScalar,
            string memory note,
            bool refunded
        )
    {
        Packet storage p = _packets[id];
        if (p.createdAt == 0) revert InvalidPacketId();
        return (
            p.creator,
            p.createdAt,
            p.expiresAt,
            p.packetType,
            p.totalShares,
            p.claimedCount,
            p.maxShareScalar,
            p.note,
            p.refunded
        );
    }

    /// @notice The encrypted residual still locked in the packet vault.
    ///         Only the creator is `FHE.allow`'d to decrypt it.
    function getRemainingAmount(uint256 id) external view returns (euint64) {
        if (_packets[id].createdAt == 0) revert InvalidPacketId();
        return _packets[id].remainingAmount;
    }

    /// @notice Asset vault address backing a packet. Frontend treats this as
    ///         the asset id and resolves metadata from deployment/env config.
    function getPacketAsset(uint256 id) external view returns (address) {
        if (_packets[id].createdAt == 0) revert InvalidPacketId();
        return _packets[id].assetId;
    }

    /// @notice The encrypted equal share for EQUAL / PASSWORD packets.
    ///         Returns zero handle for TARGETED (each slot has its own
    ///         pre-encrypted amount — see `slotAmount[id][slotIndex]`).
    function getEqualShare(uint256 id) external view returns (euint64) {
        if (_packets[id].createdAt == 0) revert InvalidPacketId();
        return _packets[id].equalShareEnc;
    }

    /// @notice The encrypted per-slot amount for a TARGETED packet.
    ///         `slotIndex` must be `< totalShares`.
    function getSlotAmount(uint256 id, uint32 slotIndex) external view returns (euint64) {
        Packet storage p = _packets[id];
        if (p.createdAt == 0) revert InvalidPacketId();
        if (slotIndex >= p.totalShares) revert SlotIndexOutOfRange();
        return slotAmount[id][slotIndex];
    }

    // ── Create ──────────────────────────────────────────────────────

    /// @notice Create a packet escrowed by `msg.sender`'s pre-deposited
    ///         cETH balance.
    /// @param ptype           Packet variant.
    /// @param encTotal        Sender-encrypted total cETH-units.
    /// @param totalProof      Input proof from the encryption flow.
    /// @param totalShares     Public share count (UI shows N/M claimed).
    /// @param expirySecs      Seconds from now until refund becomes legal.
    /// @param maxShareScalar  RANDOM only — plaintext upper bound for the
    ///                        per-claim random share. Typically set to
    ///                        `2 * total / totalShares` by the sender.
    ///                        Must be 0 for EQUAL/TARGETED.
    /// @param merkleRoot      For TARGETED: Merkle root of the allowlist
    ///                        leaves (see `allowlistRoot`). Must be zero
    ///                        for non-TARGETED.
    /// @param note            Optional public memo (≤120 chars).
    function createPacket(
        PacketType ptype,
        externalEuint64 encTotal,
        bytes calldata totalProof,
        uint32 totalShares,
        uint32 expirySecs,
        uint64 maxShareScalar,
        bytes32 merkleRoot,
        string calldata note
    ) external returns (uint256 id) {
        return _createPacket(
            address(vault),
            ptype,
            encTotal,
            totalProof,
            totalShares,
            expirySecs,
            maxShareScalar,
            merkleRoot,
            bytes32(0),
            note
        );
    }

    /// @notice Create a packet for a registered asset vault. The legacy
    ///         `createPacket` wrapper remains the cETH default path.
    function createPacketWithAsset(
        address assetId,
        PacketType ptype,
        externalEuint64 encTotal,
        bytes calldata totalProof,
        uint32 totalShares,
        uint32 expirySecs,
        uint64 maxShareScalar,
        bytes32 merkleRoot,
        string calldata note
    ) external returns (uint256 id) {
        return _createPacket(
            assetId, ptype, encTotal, totalProof, totalShares, expirySecs, maxShareScalar, merkleRoot, bytes32(0), note
        );
    }

    /// @notice Create a password-gated equal-split packet backed by cETH.
    ///         `passwordSecret` is `keccak256(bytes(password))`; the contract
    ///         binds it to the final packet id before storing it.
    function createPasswordPacket(
        externalEuint64 encTotal,
        bytes calldata totalProof,
        uint32 totalShares,
        uint32 expirySecs,
        bytes32 passwordSecret,
        string calldata note
    ) external returns (uint256 id) {
        return _createPacket(
            address(vault),
            PacketType.PASSWORD,
            encTotal,
            totalProof,
            totalShares,
            expirySecs,
            0,
            bytes32(0),
            passwordSecret,
            note
        );
    }

    /// @notice Create a password-gated equal-split packet for a registered
    ///         asset vault.
    function createPasswordPacketWithAsset(
        address assetId,
        externalEuint64 encTotal,
        bytes calldata totalProof,
        uint32 totalShares,
        uint32 expirySecs,
        bytes32 passwordSecret,
        string calldata note
    ) external returns (uint256 id) {
        return _createPacket(
            assetId,
            PacketType.PASSWORD,
            encTotal,
            totalProof,
            totalShares,
            expirySecs,
            0,
            bytes32(0),
            passwordSecret,
            note
        );
    }

    /// @notice Create a TARGETED packet with per-slot encrypted amounts.
    ///         The Merkle root commits to leaves
    ///         `keccak256(bytes.concat(keccak256(abi.encode(salt, claimer, slotIndex))))`,
    ///         one per recipient. The chain stores N pre-encrypted slot
    ///         amounts and never sees who-gets-what; the claim path debits
    ///         exactly the slot's ciphertext, so amounts stay encrypted
    ///         throughout. `encSlotAmounts.length` is the share count.
    /// @param encSlotAmounts  Per-recipient encrypted amounts. Order is
    ///                        opaque to the chain — the sender chooses
    ///                        slotIndex when building the Merkle tree.
    /// @param inputProof      Single batched FHE input proof covering
    ///                        `encTotal` and every entry in `encSlotAmounts`.
    function createTargetedPacket(
        externalEuint64 encTotal,
        externalEuint64[] calldata encSlotAmounts,
        bytes calldata inputProof,
        uint32 expirySecs,
        bytes32 merkleRoot,
        string calldata note
    ) external returns (uint256 id) {
        return _createTargetedPacket(address(vault), encTotal, encSlotAmounts, inputProof, expirySecs, merkleRoot, note);
    }

    function createTargetedPacketWithAsset(
        address assetId,
        externalEuint64 encTotal,
        externalEuint64[] calldata encSlotAmounts,
        bytes calldata inputProof,
        uint32 expirySecs,
        bytes32 merkleRoot,
        string calldata note
    ) external returns (uint256 id) {
        return _createTargetedPacket(assetId, encTotal, encSlotAmounts, inputProof, expirySecs, merkleRoot, note);
    }

    function _createPacket(
        address assetId,
        PacketType ptype,
        externalEuint64 encTotal,
        bytes calldata totalProof,
        uint32 totalShares,
        uint32 expirySecs,
        uint64 maxShareScalar,
        bytes32 merkleRoot,
        bytes32 passwordSecret,
        string calldata note
    ) private whenNotPaused returns (uint256 id) {
        if (ptype == PacketType.TARGETED) revert TargetedUseDedicatedCreate();
        if (totalShares == 0) revert EmptyShareCount();
        if (expirySecs == 0) revert ExpiryInPast();
        if (bytes(note).length > 120) revert NoteTooLong();
        IConfidentialVault assetVault = _assetVault(assetId);
        if (merkleRoot != bytes32(0)) revert UnexpectedAllowlistRoot();
        if (ptype == PacketType.PASSWORD) {
            if (passwordSecret == bytes32(0)) revert PasswordNeedsSecret();
        } else if (passwordSecret != bytes32(0)) {
            revert UnexpectedPasswordSecret();
        }
        if (ptype == PacketType.RANDOM || ptype == PacketType.BLIND) {
            if (maxShareScalar == 0) revert RandomNeedsMaxShare();
        } else if (maxShareScalar != 0) {
            revert UnexpectedMaxShare();
        }

        // Ingest the encrypted total + grant the vault permission to operate
        // on it inside `internalDebit`.
        euint64 totalEnc = FHE.fromExternal(encTotal, totalProof);
        FHE.allowThis(totalEnc);
        FHE.allow(totalEnc, address(assetVault));

        // For EQUAL/PASSWORD, pre-compute the equal share once. RANDOM/BLIND
        // packets compute their share per-claim, so equalShareEnc stays
        // as the zero handle.
        euint64 equalShareEnc;
        if (ptype != PacketType.RANDOM && ptype != PacketType.BLIND) {
            equalShareEnc = FHE.div(totalEnc, uint64(totalShares));
            FHE.allowThis(equalShareEnc);
            FHE.allow(equalShareEnc, msg.sender);
            FHE.allow(equalShareEnc, address(assetVault));
        }

        id = packetCount++;
        _packets[id] = Packet({
            creator: msg.sender,
            createdAt: uint64(block.timestamp),
            expiresAt: uint64(block.timestamp + expirySecs),
            packetType: ptype,
            totalShares: totalShares,
            claimedCount: 0,
            maxShareScalar: maxShareScalar,
            assetId: assetId,
            remainingAmount: totalEnc,
            equalShareEnc: equalShareEnc,
            note: note,
            refunded: false
        });

        if (ptype == PacketType.PASSWORD) {
            passwordHash[id] = _passwordDigest(id, passwordSecret);
        }

        // Pull encrypted units from creator to the asset vault's implicit
        // packet escrow balance. No public asset leaves the vault; only the
        // creator's encrypted internal balance is debited.
        assetVault.internalDebit(msg.sender, totalEnc);

        emit PacketCreated(id, msg.sender, ptype, totalShares, _packets[id].expiresAt);
        emit PacketAssetBound(id, assetId);
    }

    function _createTargetedPacket(
        address assetId,
        externalEuint64 encTotal,
        externalEuint64[] calldata encSlotAmounts,
        bytes calldata inputProof,
        uint32 expirySecs,
        bytes32 merkleRoot,
        string calldata note
    ) private whenNotPaused returns (uint256 id) {
        if (encSlotAmounts.length == 0) revert EmptyShareCount();
        if (encSlotAmounts.length > type(uint32).max) revert TargetedSlotCountMismatch();
        if (expirySecs == 0) revert ExpiryInPast();
        if (bytes(note).length > 120) revert NoteTooLong();
        if (merkleRoot == bytes32(0)) revert TargetedNeedsAllowlist();
        IConfidentialVault assetVault = _assetVault(assetId);

        uint32 totalShares = uint32(encSlotAmounts.length);

        // Single proof covers totalEnc + every slot ciphertext (batched
        // input from the FHEVM SDK). Vault is authorized to operate on
        // the total inside `internalDebit`.
        euint64 totalEnc = FHE.fromExternal(encTotal, inputProof);
        FHE.allowThis(totalEnc);
        FHE.allow(totalEnc, address(assetVault));

        id = packetCount++;
        Packet storage p = _packets[id];
        p.creator = msg.sender;
        p.createdAt = uint64(block.timestamp);
        p.expiresAt = uint64(block.timestamp + expirySecs);
        p.packetType = PacketType.TARGETED;
        p.totalShares = totalShares;
        p.assetId = assetId;
        p.remainingAmount = totalEnc;
        p.note = note;

        allowlistRoot[id] = merkleRoot;

        // Ingest each slot. The vault must be ACL'd so `internalCredit`
        // can FHE.add the slot ciphertext into the claimer's balance.
        for (uint32 i = 0; i < totalShares; i++) {
            euint64 slotEnc = FHE.fromExternal(encSlotAmounts[i], inputProof);
            FHE.allowThis(slotEnc);
            FHE.allow(slotEnc, address(assetVault));
            slotAmount[id][i] = slotEnc;
        }

        // Sender's responsibility: amounts must sum to the deposited total.
        // If the claims overshoot, FHE.sub on remainingAmount silently
        // wraps under (encrypted) and later claimers receive garbage —
        // by then the vault has nothing left, which is the sender's loss.
        assetVault.internalDebit(msg.sender, totalEnc);

        emit PacketCreated(id, msg.sender, PacketType.TARGETED, totalShares, p.expiresAt);
        emit PacketAssetBound(id, assetId);
    }

    // ── Claim ───────────────────────────────────────────────────────

    /// @notice Claim a slot from a non-TARGETED (EQUAL/RANDOM) packet.
    ///         For TARGETED packets, callers must use `claimTargeted`
    ///         and supply the Merkle proof + salt distributed to them
    ///         off-chain.
    function claim(uint256 id) external {
        Packet storage p = _packets[id];
        if (p.createdAt == 0) revert InvalidPacketId();
        if (p.packetType == PacketType.TARGETED) revert TargetedRequiresProof();
        if (p.packetType == PacketType.PASSWORD) revert PasswordRequired();
        _doClaim(id, p);
    }

    /// @notice Reveal a previously claimed BLIND packet share. The claim
    ///         itself reserves the encrypted share; reveal grants the claimer
    ///         decrypt access and credits their asset vault balance.
    function reveal(uint256 id) external {
        _doReveal(id, msg.sender);
    }

    /// @notice Reveal an unrevealed BLIND claim on behalf of a claimer.
    ///         Only callable after the packet expires — until then a slot is
    ///         the claimer's to settle on their own schedule. After expiry
    ///         this is permissionless so abandoned claims still land in the
    ///         claimer's vault (the alternative — leaving the share in
    ///         `claimedAmount` — would silently lock funds, since
    ///         `closeAndRefund` only returns the unclaimed residual).
    function revealFor(uint256 id, address claimer) external {
        Packet storage p = _packets[id];
        if (p.createdAt == 0) revert InvalidPacketId();
        if (block.timestamp < p.expiresAt) revert PacketNotExpired();
        _doReveal(id, claimer);
    }

    function _doReveal(uint256 id, address claimer) private {
        Packet storage p = _packets[id];
        if (p.createdAt == 0) revert InvalidPacketId();
        if (p.packetType != PacketType.BLIND) revert RevealOnlyBlindPackets();
        if (!claimed[id][claimer]) revert NotClaimed();
        if (revealed[id][claimer]) revert AlreadyRevealed();

        euint64 share = claimedAmount[id][claimer];
        IConfidentialVault assetVault = IConfidentialVault(p.assetId);

        revealed[id][claimer] = true;
        FHE.allowThis(share);
        FHE.allow(share, claimer);
        FHE.allow(share, address(assetVault));
        assetVault.internalCredit(claimer, share);

        emit PacketRevealed(id, claimer);
    }

    /// @notice Claim a slot from a TARGETED packet. The caller proves
    ///         membership in the allowlist by submitting the salt that
    ///         was bound to their address + slotIndex at packet creation,
    ///         plus the Merkle proof connecting
    ///         `leaf(salt, msg.sender, slotIndex)` to the on-chain
    ///         `allowlistRoot[id]`. The slot's pre-encrypted amount is
    ///         debited as the share — amounts stay encrypted on chain.
    function claimTargeted(uint256 id, bytes32 salt, uint32 slotIndex, bytes32[] calldata proof) external {
        Packet storage p = _packets[id];
        if (p.createdAt == 0) revert InvalidPacketId();
        if (p.packetType != PacketType.TARGETED) revert UseClaimForOpenPackets();
        if (slotIndex >= p.totalShares) revert SlotIndexOutOfRange();

        bytes32 leaf = _allowlistLeaf(salt, msg.sender, slotIndex);
        if (!MerkleProof.verify(proof, allowlistRoot[id], leaf)) {
            revert NotAllowlisted();
        }
        _settleClaim(id, p, slotAmount[id][slotIndex]);
    }

    /// @notice Claim a PASSWORD packet by supplying the shared secret phrase.
    function claimWithPassword(uint256 id, string calldata password) external {
        Packet storage p = _packets[id];
        if (p.createdAt == 0) revert InvalidPacketId();
        if (p.packetType != PacketType.PASSWORD) revert UseClaimForOpenPackets();
        bytes32 supplied = _passwordDigest(id, keccak256(bytes(password)));
        if (supplied != passwordHash[id]) revert WrongPassword();
        _doClaim(id, p);
    }

    /// @notice Off-chain helper: returns the leaf hash a
    ///         `(salt, claimer, slotIndex)` triple would produce. Useful
    ///         for the frontend to double-check tree builds before
    ///         publishing the root.
    function previewAllowlistLeaf(bytes32 salt, address claimer, uint32 slotIndex) external pure returns (bytes32) {
        return _allowlistLeaf(salt, claimer, slotIndex);
    }

    function _allowlistLeaf(bytes32 salt, address claimer, uint32 slotIndex) private pure returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(salt, claimer, slotIndex))));
    }

    function _passwordDigest(uint256 id, bytes32 passwordSecret) private pure returns (bytes32) {
        return keccak256(abi.encode(id, passwordSecret));
    }

    function _assetVault(address assetId) private view returns (IConfidentialVault) {
        if (assetId == address(0)) revert ZeroAsset();
        if (!supportedAssetVault[assetId]) revert UnsupportedAsset();
        return IConfidentialVault(assetId);
    }

    function _doClaim(uint256 id, Packet storage p) private {
        // TARGETED uses claimTargeted's overload because the share comes
        // from `slotAmount[id][slotIndex]` rather than the packet defaults.
        if (p.packetType == PacketType.TARGETED) revert TargetedRequiresProof();
        _settleClaim(id, p, _openShare(p));
    }

    function _openShare(Packet storage p) private returns (euint64) {
        if (p.packetType == PacketType.RANDOM || p.packetType == PacketType.BLIND) {
            bool isLastClaimer = (p.claimedCount + 1 == p.totalShares);
            if (isLastClaimer) {
                // Last claimer takes the entire encrypted residual so the full
                // total is always distributed (no rounding/cap residue).
                return p.remainingAmount;
            }
            // Random in [0, maxShareScalar). Cap at remainingAmount to
            // avoid encrypted underflow on the running residual; the cap
            // also keeps us solvent if the sender chose a maxShareScalar
            // larger than the true total.
            euint64 randomVal = FHE.randEuint64();
            euint64 capped = FHE.rem(randomVal, p.maxShareScalar);
            ebool overshoot = FHE.lt(p.remainingAmount, capped);
            return FHE.select(overshoot, p.remainingAmount, capped);
        }
        // EQUAL / PASSWORD: every claimer takes the pre-computed equal share.
        return p.equalShareEnc;
    }

    function _settleClaim(uint256 id, Packet storage p, euint64 share) private {
        if (p.refunded) revert PacketRefunded_();
        if (block.timestamp >= p.expiresAt) revert PacketExpired();
        if (claimed[id][msg.sender]) revert AlreadyClaimed();
        if (p.claimedCount >= p.totalShares) revert AllShareClaimed();

        // Decrement the encrypted residual so closeAndRefund returns only
        // the unclaimed pool.
        IConfidentialVault assetVault = IConfidentialVault(p.assetId);
        p.remainingAmount = FHE.sub(p.remainingAmount, share);
        FHE.allowThis(p.remainingAmount);
        FHE.allow(p.remainingAmount, p.creator);
        FHE.allow(p.remainingAmount, address(assetVault));

        // Track this claim. The share ciphertext is allowed to the claimer
        // so the open-modal can decrypt it after the tx confirms.
        claimedAmount[id][msg.sender] = share;
        claimed[id][msg.sender] = true;
        p.claimedCount += 1;

        FHE.allowThis(share);
        if (p.packetType != PacketType.BLIND) {
            FHE.allow(share, msg.sender);
            // RANDOM/TARGETED produce/consume fresh ciphertexts; vault must be
            // re-allowed so internalCredit's FHE.add works. For EQUAL/PASSWORD
            // the equalShareEnc was already allowed to vault at creation, but
            // re-allowing is idempotent.
            FHE.allow(share, address(assetVault));

            // Vault credits the claimer's encrypted balance.
            assetVault.internalCredit(msg.sender, share);
        }

        emit PacketClaimed(id, msg.sender);
    }

    // ── Refund ──────────────────────────────────────────────────────

    /// @notice After expiry, the creator can pull the encrypted residual
    ///         (unclaimed slots × equal share) back into their cETH balance.
    function closeAndRefund(uint256 id) external {
        Packet storage p = _packets[id];
        if (p.createdAt == 0) revert InvalidPacketId();
        if (msg.sender != p.creator) revert NotCreator();
        if (block.timestamp < p.expiresAt) revert PacketNotExpired();
        if (p.refunded) revert PacketRefunded_();

        p.refunded = true;
        euint64 residual = p.remainingAmount;
        IConfidentialVault assetVault = IConfidentialVault(p.assetId);

        // Refresh ACL so the vault can debit the (effectively zero) packet
        // residual back to the creator's encrypted balance.
        FHE.allowThis(residual);
        FHE.allow(residual, address(assetVault));
        FHE.allow(residual, p.creator);

        assetVault.internalCredit(p.creator, residual);

        emit PacketRefunded(id);
    }
}

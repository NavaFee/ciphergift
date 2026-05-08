// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {FHE, euint64, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title  ConfidentialETHVault — encrypted internal-balance ETH wrapper
/// @notice Users deposit native ETH; the vault tracks each user's holdings
///         as an `euint64` (in gwei units, so 18 ETH-decimal precision is
///         preserved while staying inside the FHE word size).
///
///         Deposits and withdrawals are inherently public on-chain (they
///         move real ETH). The privacy gain comes from internal transfers
///         executed by an authorised orchestrator (CipherGift, set once at
///         construction) when gifts are created and claimed — those
///         move encrypted balance between user accounts without leaking
///         amounts.
///
/// ── Two-phase withdrawal ──────────────────────────────────────────────
/// Withdrawal happens in two transactions:
///   1. `requestWithdraw()` — caller flags their encrypted balance handle
///      as publicly decryptable via `FHE.makePubliclyDecryptable`. A
///      pending record is stored. The Zama gateway watches for this and
///      eventually posts the cleartext + KMS signatures.
///   2. `fulfillWithdraw(reqId, abiEncodedCleartext, decryptionProof)` —
///      verifies the KMS proof against the snapshotted handle, transfers
///      `cleartext * SCALE` wei to the user, and subtracts the (now-known)
///      cleartext from the user's current encrypted balance.
///
/// Concurrency: while a withdrawal is pending we allow `internalCredit`
/// (so claimers can still receive packet shares) but block `internalDebit`
/// and `internalTransfer.from = user` (which would make the current
/// encrypted balance smaller than the snapshotted cleartext, causing the
/// `FHE.sub` at fulfillment to underflow). Deposits are also allowed.
///
/// Privacy caveat: once `makePubliclyDecryptable` is called, the cleartext
/// of the snapshotted handle is permanently retrievable from the gateway,
/// even if the user later cancels the request. The UI must warn before a
/// user issues `requestWithdraw`.
contract ConfidentialETHVault is ZamaEthereumConfig {
    /// @dev 1 vault unit = 1 gwei. euint64 max ≈ 1.8e19, so the cap is
    ///      ~1.8e10 ETH — far above any realistic deposit.
    uint256 public constant SCALE = 1e9;

    /// @notice Minimum age before a pending withdrawal can be cancelled by
    ///         the user (gateway timeout escape hatch).
    uint256 public constant CANCEL_DELAY = 5 minutes;

    mapping(address => euint64) private _balance;

    /// @notice The single contract permitted to call `_internalCredit`,
    ///         `_internalDebit` and `_internalTransfer`. Set once via
    ///         `setOrchestrator` by `owner` before CipherGift takes over.
    address public orchestrator;
    address public immutable owner;

    struct PendingWithdrawal {
        address user;
        uint64 requestedAt;
        bytes32 balanceHandle;
    }

    mapping(uint256 => PendingWithdrawal) public pendingWithdrawals;
    mapping(address => uint256) public pendingWithdrawalIdOf;
    uint256 private _nextWithdrawalId = 1;

    event Deposited(address indexed user, uint256 weiAmount, uint64 units);
    event WithdrawRequested(uint256 indexed reqId, address indexed user, bytes32 balanceHandle);
    event WithdrawFulfilled(uint256 indexed reqId, address indexed user, uint64 units, uint256 weiAmount);
    event WithdrawCancelled(uint256 indexed reqId, address indexed user);
    event OrchestratorSet(address indexed orchestrator);

    error NotOwner();
    error OrchestratorAlreadySet();
    error NotOrchestrator();
    error ZeroValue();
    error NotGweiAligned();
    error InsufficientPool();
    error TransferFailed();
    error PendingWithdrawalExists();
    error NoPendingWithdrawal();
    error NotRequestOwner();
    error CancelTooEarly();
    error UninitializedBalance();
    error MalformedCleartext();
    error CleartextOverflow();

    constructor() {
        owner = msg.sender;
    }

    /// @notice One-time wiring of the orchestrator (CipherGift). Reverts
    ///         on second call so the relationship is immutable in prod.
    function setOrchestrator(address newOrchestrator) external {
        if (msg.sender != owner) revert NotOwner();
        if (orchestrator != address(0)) revert OrchestratorAlreadySet();
        orchestrator = newOrchestrator;
        emit OrchestratorSet(newOrchestrator);
    }

    modifier onlyOrchestrator() {
        if (msg.sender != orchestrator) revert NotOrchestrator();
        _;
    }

    modifier noPendingWithdrawalFor(address user) {
        if (pendingWithdrawalIdOf[user] != 0) revert PendingWithdrawalExists();
        _;
    }

    /// @notice Read access for the encrypted balance handle. The caller
    ///         needs an `FHE.allow` grant (auto-set on every mutation).
    function balanceOf(address user) external view returns (euint64) {
        return _balance[user];
    }

    /// @notice Helper for the frontend: true while user has an open
    ///         pending withdrawal request.
    function hasPendingWithdrawal(address user) external view returns (bool) {
        return pendingWithdrawalIdOf[user] != 0;
    }

    /// @notice Deposit native ETH and credit `msg.sender`'s encrypted
    ///         balance with the gwei-equivalent unit count.
    function depositETH() external payable {
        if (msg.value == 0) revert ZeroValue();
        if (msg.value % SCALE != 0) revert NotGweiAligned();
        uint64 units = uint64(msg.value / SCALE);

        euint64 inc = FHE.asEuint64(units);
        _balance[msg.sender] = FHE.add(_balance[msg.sender], inc);
        FHE.allowThis(_balance[msg.sender]);
        FHE.allow(_balance[msg.sender], msg.sender);

        emit Deposited(msg.sender, msg.value, units);
    }

    /// @notice Step 1 of withdrawal — flag the caller's encrypted balance
    ///         for public decryption and record a pending request. The
    ///         Zama gateway will pick this up and post a cleartext +
    ///         KMS-signed proof, which anyone can then submit through
    ///         `fulfillWithdraw`.
    /// @return reqId Identifier of the pending request, also surfaced in
    ///         `WithdrawRequested`.
    function requestWithdraw() external noPendingWithdrawalFor(msg.sender) returns (uint256 reqId) {
        bytes32 handle = euint64.unwrap(_balance[msg.sender]);
        if (handle == bytes32(0)) revert UninitializedBalance();

        FHE.makePubliclyDecryptable(_balance[msg.sender]);

        reqId = _nextWithdrawalId++;
        pendingWithdrawals[reqId] =
            PendingWithdrawal({user: msg.sender, requestedAt: uint64(block.timestamp), balanceHandle: handle});
        pendingWithdrawalIdOf[msg.sender] = reqId;

        emit WithdrawRequested(reqId, msg.sender, handle);
    }

    /// @notice Step 2 of withdrawal — verify the KMS-signed cleartext
    ///         against the snapshotted handle, transfer ETH, and subtract
    ///         the cleartext from the user's current encrypted balance.
    ///
    ///         The cleartext is the single-handle value returned by the
    ///         gateway SDK as `abiEncodedClearValues`, i.e. a 32-byte static
    ///         ABI word. It must be passed to `FHE.checkSignatures` exactly
    ///         as KMS signed it.
    ///         Permissionless: any address can submit, since the proof
    ///         must already be signed by the KMS.
    function fulfillWithdraw(uint256 reqId, bytes calldata abiEncodedCleartexts, bytes calldata decryptionProof)
        external
    {
        PendingWithdrawal memory pw = pendingWithdrawals[reqId];
        if (pw.user == address(0)) revert NoPendingWithdrawal();
        if (abiEncodedCleartexts.length != 32) revert MalformedCleartext();

        bytes32[] memory handles = new bytes32[](1);
        handles[0] = pw.balanceHandle;
        FHE.checkSignatures(handles, abiEncodedCleartexts, decryptionProof);

        uint256 cleartext256 = abi.decode(abiEncodedCleartexts, (uint256));
        if (cleartext256 > type(uint64).max) revert CleartextOverflow();
        uint64 cleartext = uint64(cleartext256);

        delete pendingWithdrawalIdOf[pw.user];
        delete pendingWithdrawals[reqId];

        uint256 weiAmount = uint256(cleartext) * SCALE;
        if (cleartext > 0) {
            if (address(this).balance < weiAmount) revert InsufficientPool();

            _balance[pw.user] = FHE.sub(_balance[pw.user], FHE.asEuint64(cleartext));
            FHE.allowThis(_balance[pw.user]);
            FHE.allow(_balance[pw.user], pw.user);

            (bool ok,) = pw.user.call{value: weiAmount}("");
            if (!ok) revert TransferFailed();
        }

        emit WithdrawFulfilled(reqId, pw.user, cleartext, weiAmount);
    }

    /// @notice Escape hatch — if the gateway never fulfills (or fulfills
    ///         on a stale handle and reverts), the user can clear their
    ///         pending state after `CANCEL_DELAY` to free themselves up
    ///         for new withdrawals / packet creation. Note that the
    ///         snapshotted balance has already been made publicly
    ///         decryptable; cancelling does not restore privacy.
    function cancelWithdrawRequest(uint256 reqId) external {
        PendingWithdrawal memory pw = pendingWithdrawals[reqId];
        if (pw.user == address(0)) revert NoPendingWithdrawal();
        if (pw.user != msg.sender) revert NotRequestOwner();
        if (block.timestamp < uint256(pw.requestedAt) + CANCEL_DELAY) revert CancelTooEarly();

        delete pendingWithdrawalIdOf[pw.user];
        delete pendingWithdrawals[reqId];

        emit WithdrawCancelled(reqId, pw.user);
    }

    /// @notice Internal-only debit. Called by CipherGift when the creator
    ///         escrows a packet's encrypted total. Blocked while `from`
    ///         has a pending withdrawal.
    function internalDebit(address from, euint64 amount) external onlyOrchestrator noPendingWithdrawalFor(from) {
        _balance[from] = FHE.sub(_balance[from], amount);
        FHE.allowThis(_balance[from]);
        FHE.allow(_balance[from], from);
    }

    /// @notice Internal-only credit. Called by CipherGift when a claimer
    ///         receives a (still-encrypted) share, or when a creator
    ///         refunds an unclaimed packet residual. Allowed during a
    ///         pending withdrawal — `fulfillWithdraw` only subtracts the
    ///         old (now publicly known) cleartext, leaving any concurrent
    ///         credits intact.
    function internalCredit(address to, euint64 amount) external onlyOrchestrator {
        _balance[to] = FHE.add(_balance[to], amount);
        FHE.allowThis(_balance[to]);
        FHE.allow(_balance[to], to);
    }

    /// @notice Atomic internal move. Blocked while `from` has a pending
    ///         withdrawal (debit side); `to` may be in pending state.
    function internalTransfer(address from, address to, euint64 amount)
        external
        onlyOrchestrator
        noPendingWithdrawalFor(from)
    {
        _balance[from] = FHE.sub(_balance[from], amount);
        _balance[to] = FHE.add(_balance[to], amount);
        FHE.allowThis(_balance[from]);
        FHE.allowThis(_balance[to]);
        FHE.allow(_balance[from], from);
        FHE.allow(_balance[to], to);
    }

    /// @dev Receive ETH bypassing depositETH (e.g. from a refund coming
    ///      back through CipherGift). Doesn't credit any encrypted
    ///      balance — orchestrator must call internalCredit to do that.
    receive() external payable {}
}

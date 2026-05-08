// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {FHE, euint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {IConfidentialVault} from "./IConfidentialVault.sol";

/// @title  ConfidentialERC20Vault
/// @notice Encrypted internal-balance wrapper for ERC-20 assets such as
///         cUSDC and cZAMA. Deposits/withdrawals move public ERC-20 tokens;
///         internal transfers between packet creators and claimers move only
///         encrypted `euint64` unit balances.
///
///         Unit scaling is per vault:
///           - cUSDC (6 decimals) with `unitDecimals = 6` => 1 unit = 1 token atom.
///           - cZAMA (18 decimals) with `unitDecimals = 6` => 1 unit = 1e12 token atoms.
///
///         This keeps the packet contract asset-agnostic while preventing
///         sub-unit dust from entering encrypted accounting.
contract ConfidentialERC20Vault is ZamaEthereumConfig, IConfidentialVault {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;
    uint8 public immutable tokenDecimals;
    uint8 public immutable unitDecimals;
    uint256 public immutable unitScale;

    /// @notice Minimum age before a pending withdrawal can be cancelled by
    ///         the user (gateway timeout escape hatch).
    uint256 public constant CANCEL_DELAY = 5 minutes;

    mapping(address => euint64) private _balance;

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

    event Deposited(address indexed user, uint256 tokenAmount, uint64 units);
    event WithdrawRequested(uint256 indexed reqId, address indexed user, bytes32 balanceHandle);
    event WithdrawFulfilled(uint256 indexed reqId, address indexed user, uint64 units, uint256 tokenAmount);
    event WithdrawCancelled(uint256 indexed reqId, address indexed user);
    event OrchestratorSet(address indexed orchestrator);

    error NotOwner();
    error OrchestratorAlreadySet();
    error NotOrchestrator();
    error ZeroValue();
    error UnitDecimalsTooHigh();
    error NotUnitAligned();
    error AmountOverflow();
    error InsufficientPool();
    error PendingWithdrawalExists();
    error NoPendingWithdrawal();
    error NotRequestOwner();
    error CancelTooEarly();
    error UninitializedBalance();
    error MalformedCleartext();
    error CleartextOverflow();

    constructor(IERC20Metadata token_, uint8 unitDecimals_) {
        token = IERC20(address(token_));
        tokenDecimals = token_.decimals();
        if (unitDecimals_ > tokenDecimals) revert UnitDecimalsTooHigh();
        unitDecimals = unitDecimals_;
        unitScale = 10 ** uint256(tokenDecimals - unitDecimals_);
        owner = msg.sender;
    }

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

    function balanceOf(address user) external view returns (euint64) {
        return _balance[user];
    }

    function hasPendingWithdrawal(address user) external view returns (bool) {
        return pendingWithdrawalIdOf[user] != 0;
    }

    /// @notice Deposit ERC-20 tokens and credit `msg.sender`'s encrypted
    ///         balance in vault units. Caller must approve this vault first.
    function deposit(uint256 tokenAmount) external {
        if (tokenAmount == 0) revert ZeroValue();
        if (tokenAmount % unitScale != 0) revert NotUnitAligned();
        uint256 units256 = tokenAmount / unitScale;
        if (units256 > type(uint64).max) revert AmountOverflow();
        uint64 units = uint64(units256);

        token.safeTransferFrom(msg.sender, address(this), tokenAmount);

        euint64 inc = FHE.asEuint64(units);
        _balance[msg.sender] = FHE.add(_balance[msg.sender], inc);
        FHE.allowThis(_balance[msg.sender]);
        FHE.allow(_balance[msg.sender], msg.sender);

        emit Deposited(msg.sender, tokenAmount, units);
    }

    /// @notice Step 1 of withdrawal — make the encrypted balance handle
    ///         publicly decryptable and store a pending request.
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

    /// @notice Step 2 of withdrawal — verify KMS cleartext proof, subtract
    ///         that encrypted amount, and release the ERC-20 tokens.
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

        uint256 tokenAmount = uint256(cleartext) * unitScale;
        if (cleartext > 0) {
            if (token.balanceOf(address(this)) < tokenAmount) revert InsufficientPool();

            _balance[pw.user] = FHE.sub(_balance[pw.user], FHE.asEuint64(cleartext));
            FHE.allowThis(_balance[pw.user]);
            FHE.allow(_balance[pw.user], pw.user);

            token.safeTransfer(pw.user, tokenAmount);
        }

        emit WithdrawFulfilled(reqId, pw.user, cleartext, tokenAmount);
    }

    function cancelWithdrawRequest(uint256 reqId) external {
        PendingWithdrawal memory pw = pendingWithdrawals[reqId];
        if (pw.user == address(0)) revert NoPendingWithdrawal();
        if (pw.user != msg.sender) revert NotRequestOwner();
        if (block.timestamp < uint256(pw.requestedAt) + CANCEL_DELAY) revert CancelTooEarly();

        delete pendingWithdrawalIdOf[pw.user];
        delete pendingWithdrawals[reqId];

        emit WithdrawCancelled(reqId, pw.user);
    }

    function internalDebit(address from, euint64 amount) external onlyOrchestrator noPendingWithdrawalFor(from) {
        _balance[from] = FHE.sub(_balance[from], amount);
        FHE.allowThis(_balance[from]);
        FHE.allow(_balance[from], from);
    }

    function internalCredit(address to, euint64 amount) external onlyOrchestrator {
        _balance[to] = FHE.add(_balance[to], amount);
        FHE.allowThis(_balance[to]);
        FHE.allow(_balance[to], to);
    }

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
}

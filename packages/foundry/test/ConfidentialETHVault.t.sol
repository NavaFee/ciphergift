// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {FhevmTest} from "forge-fhevm/FhevmTest.sol";
import {ConfidentialETHVault} from "../src/ConfidentialETHVault.sol";
import {FHE, euint64, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @dev Minimal orchestrator standing in for CipherGift so the vault's
///      internal* paths can be exercised directly. Performs the canonical
///      `FHE.fromExternal` + `FHE.allow(_, vault)` re-grant before each
///      forwarding call.
contract MockOrchestrator is ZamaEthereumConfig {
    ConfidentialETHVault public immutable vault;

    constructor(ConfidentialETHVault v) {
        vault = v;
    }

    function credit(address to, externalEuint64 enc, bytes calldata proof) external {
        euint64 amount = FHE.fromExternal(enc, proof);
        FHE.allowThis(amount);
        FHE.allow(amount, address(vault));
        vault.internalCredit(to, amount);
    }

    function debit(address from, externalEuint64 enc, bytes calldata proof) external {
        euint64 amount = FHE.fromExternal(enc, proof);
        FHE.allowThis(amount);
        FHE.allow(amount, address(vault));
        vault.internalDebit(from, amount);
    }

    function xfer(address from, address to, externalEuint64 enc, bytes calldata proof) external {
        euint64 amount = FHE.fromExternal(enc, proof);
        FHE.allowThis(amount);
        FHE.allow(amount, address(vault));
        vault.internalTransfer(from, to, amount);
    }
}

/// @notice Vault tests: deposit, two-phase withdraw (request → fulfill),
///         cancellation, and orchestrator-gated mutations under pending
///         state. Internal* paths are driven via a `MockOrchestrator` so
///         the gating semantics are exercised end-to-end.
contract ConfidentialETHVaultTest is FhevmTest {
    ConfidentialETHVault internal vault;
    address internal vaultAddress;
    MockOrchestrator internal orchestrator;
    address internal orchestratorAddress;

    uint256 internal constant ALICE_PK = 0xA11CE;
    uint256 internal constant BOB_PK = 0xB0B;
    address internal alice;
    address internal bob;

    function setUp() public override {
        super.setUp();
        vault = new ConfidentialETHVault();
        vaultAddress = address(vault);
        orchestrator = new MockOrchestrator(vault);
        orchestratorAddress = address(orchestrator);
        alice = vm.addr(ALICE_PK);
        bob = vm.addr(BOB_PK);
        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
    }

    function _decryptBalance() internal returns (uint256) {
        euint64 enc = vault.balanceOf(alice);
        if (euint64.unwrap(enc) == bytes32(0)) return 0;
        bytes memory sig = signUserDecrypt(ALICE_PK, vaultAddress);
        return userDecrypt(euint64.unwrap(enc), alice, vaultAddress, sig);
    }

    function _wireOrchestrator() internal {
        vault.setOrchestrator(orchestratorAddress);
    }

    /// @dev Drives the gateway round-trip in tests: takes the snapshotted
    ///      handle from a pending request, asks forge-fhevm's mock KMS to
    ///      decrypt it, and submits `fulfillWithdraw`.
    function _fulfillFor(uint256 reqId) internal {
        (,, bytes32 handle) = vault.pendingWithdrawals(reqId);
        bytes32[] memory handles = new bytes32[](1);
        handles[0] = handle;
        (uint256[] memory cleartexts,) = publicDecrypt(handles);
        bytes memory abiEncoded = abi.encode(cleartexts[0]);
        bytes memory proof = buildDecryptionProof(handles, abiEncoded);
        vault.fulfillWithdraw(reqId, abiEncoded, proof);
    }

    function _credit(address to, uint64 units) internal {
        (externalEuint64 enc, bytes memory proof) = encryptUint64(units, address(this), orchestratorAddress);
        orchestrator.credit(to, enc, proof);
    }

    function _debit(address from, uint64 units) internal {
        (externalEuint64 enc, bytes memory proof) = encryptUint64(units, address(this), orchestratorAddress);
        orchestrator.debit(from, enc, proof);
    }

    function _transfer(address from, address to, uint64 units) internal {
        (externalEuint64 enc, bytes memory proof) = encryptUint64(units, address(this), orchestratorAddress);
        orchestrator.xfer(from, to, enc, proof);
    }

    // ── Deposit ─────────────────────────────────────────────────────────

    function test_balanceUninitializedAfterDeployment() public view {
        assertEq(euint64.unwrap(vault.balanceOf(alice)), bytes32(0));
    }

    function test_cancelDelayIsFiveMinutes() public view {
        assertEq(vault.CANCEL_DELAY(), 5 minutes);
    }

    function test_depositCreditsEncryptedBalance() public {
        uint256 weiAmount = 1e16;
        uint64 expectedUnits = uint64(weiAmount / vault.SCALE());

        vm.prank(alice);
        vault.depositETH{value: weiAmount}();

        assertEq(_decryptBalance(), expectedUnits);
        assertEq(vaultAddress.balance, weiAmount);
    }

    function test_depositMultipleAccumulates() public {
        vm.prank(alice);
        vault.depositETH{value: 1e16}();
        vm.prank(alice);
        vault.depositETH{value: 2e16}();

        assertEq(_decryptBalance(), 3e7);
    }

    function test_depositRevertsOnNonGweiAlignedValue() public {
        vm.prank(alice);
        vm.expectRevert(ConfidentialETHVault.NotGweiAligned.selector);
        vault.depositETH{value: 1e16 + 1}();
    }

    function test_depositRevertsOnZero() public {
        vm.prank(alice);
        vm.expectRevert(ConfidentialETHVault.ZeroValue.selector);
        vault.depositETH{value: 0}();
    }

    // ── Two-phase withdraw: request ─────────────────────────────────────

    function test_requestWithdrawRevertsOnUninitializedBalance() public {
        vm.prank(alice);
        vm.expectRevert(ConfidentialETHVault.UninitializedBalance.selector);
        vault.requestWithdraw();
    }

    function test_requestWithdrawAssignsIdAndRecordsHandle() public {
        vm.prank(alice);
        vault.depositETH{value: 1e16}();

        bytes32 expectedHandle = euint64.unwrap(vault.balanceOf(alice));

        vm.prank(alice);
        uint256 reqId = vault.requestWithdraw();

        assertEq(reqId, 1);
        assertEq(vault.pendingWithdrawalIdOf(alice), reqId);
        assertTrue(vault.hasPendingWithdrawal(alice));

        (address user, uint64 requestedAt, bytes32 handle) = vault.pendingWithdrawals(reqId);
        assertEq(user, alice);
        assertEq(handle, expectedHandle);
        assertEq(uint256(requestedAt), block.timestamp);
    }

    function test_requestWithdrawRejectsDoubleRequest() public {
        vm.prank(alice);
        vault.depositETH{value: 1e16}();
        vm.prank(alice);
        vault.requestWithdraw();

        vm.prank(alice);
        vm.expectRevert(ConfidentialETHVault.PendingWithdrawalExists.selector);
        vault.requestWithdraw();
    }

    function test_requestWithdrawIdsAreUniquePerUser() public {
        vm.prank(alice);
        vault.depositETH{value: 1e16}();
        vm.prank(bob);
        vault.depositETH{value: 1e16}();

        vm.prank(alice);
        uint256 aliceReq = vault.requestWithdraw();
        vm.prank(bob);
        uint256 bobReq = vault.requestWithdraw();

        assertEq(aliceReq, 1);
        assertEq(bobReq, 2);
    }

    // ── Two-phase withdraw: fulfill ─────────────────────────────────────

    function test_fulfillWithdrawTransfersETHAndZerosBalance() public {
        vm.prank(alice);
        vault.depositETH{value: 1e16}();

        uint256 aliceBalBefore = alice.balance;

        vm.prank(alice);
        uint256 reqId = vault.requestWithdraw();

        _fulfillFor(reqId);

        assertEq(alice.balance, aliceBalBefore + 1e16);
        assertEq(_decryptBalance(), 0);
        assertEq(vault.pendingWithdrawalIdOf(alice), 0);
        assertFalse(vault.hasPendingWithdrawal(alice));
    }

    function test_fulfillWithdrawSubtractsCleartextFromConcurrentCredits() public {
        _wireOrchestrator();

        // Alice deposits 1e7 units, then requests withdraw.
        vm.prank(alice);
        vault.depositETH{value: 1e16}();
        vm.prank(alice);
        uint256 reqId = vault.requestWithdraw();

        // Orchestrator credits Alice 5e6 units mid-flight (e.g. gift
        // claim payout). The pending cleartext is still the pre-credit
        // balance; fulfill should subtract that and leave the credit.
        _credit(alice, 5e6);

        uint256 aliceBalBefore = alice.balance;
        _fulfillFor(reqId);

        assertEq(alice.balance, aliceBalBefore + 1e16); // pre-credit cleartext
        assertEq(_decryptBalance(), 5e6); // remaining = the credited amount
    }

    function test_fulfillWithdrawRevertsOnUnknownReqId() public {
        bytes memory fakeProof = hex"00";
        bytes memory fakeCleartexts = abi.encode(uint256(0));
        vm.expectRevert(ConfidentialETHVault.NoPendingWithdrawal.selector);
        vault.fulfillWithdraw(999, fakeCleartexts, fakeProof);
    }

    function test_fulfillWithdrawRevertsOnInvalidProof() public {
        vm.prank(alice);
        vault.depositETH{value: 1e16}();
        vm.prank(alice);
        uint256 reqId = vault.requestWithdraw();

        bytes memory abiEncoded = abi.encode(uint256(1e7));
        bytes memory garbageProof = hex"01ff"; // 1 signer, but signature bytes are bogus

        vm.expectRevert(); // KMSVerifier reverts on bad signature
        vault.fulfillWithdraw(reqId, abiEncoded, garbageProof);
    }

    function test_fulfillWithdrawRejectsArrayEncodedCleartext() public {
        vm.prank(alice);
        vault.depositETH{value: 1e16}();
        vm.prank(alice);
        uint256 reqId = vault.requestWithdraw();

        (,, bytes32 handle) = vault.pendingWithdrawals(reqId);
        bytes32[] memory handles = new bytes32[](1);
        handles[0] = handle;
        (uint256[] memory cleartexts, bytes memory proof) = publicDecrypt(handles);

        vm.expectRevert(ConfidentialETHVault.MalformedCleartext.selector);
        vault.fulfillWithdraw(reqId, abi.encode(cleartexts), proof);
    }

    function test_fulfillWithdrawIsPermissionless() public {
        vm.prank(alice);
        vault.depositETH{value: 1e16}();
        vm.prank(alice);
        uint256 reqId = vault.requestWithdraw();

        // Bob (a stranger) submits the fulfill on Alice's behalf with a
        // valid KMS proof. Real ETH still flows to Alice.
        (,, bytes32 handle) = vault.pendingWithdrawals(reqId);
        bytes32[] memory handles = new bytes32[](1);
        handles[0] = handle;
        (uint256[] memory cleartexts,) = publicDecrypt(handles);
        bytes memory abiEncoded = abi.encode(cleartexts[0]);
        bytes memory proof = buildDecryptionProof(handles, abiEncoded);

        uint256 aliceBalBefore = alice.balance;
        vm.prank(bob);
        vault.fulfillWithdraw(reqId, abiEncoded, proof);

        assertEq(alice.balance, aliceBalBefore + 1e16);
    }

    // ── Cancellation ────────────────────────────────────────────────────

    function test_cancelWithdrawRequestRevertsBeforeDelay() public {
        vm.prank(alice);
        vault.depositETH{value: 1e16}();
        vm.prank(alice);
        uint256 reqId = vault.requestWithdraw();

        vm.prank(alice);
        vm.expectRevert(ConfidentialETHVault.CancelTooEarly.selector);
        vault.cancelWithdrawRequest(reqId);
    }

    function test_cancelWithdrawRequestRevertsForStranger() public {
        vm.prank(alice);
        vault.depositETH{value: 1e16}();
        vm.prank(alice);
        uint256 reqId = vault.requestWithdraw();

        vm.warp(block.timestamp + vault.CANCEL_DELAY());
        vm.prank(bob);
        vm.expectRevert(ConfidentialETHVault.NotRequestOwner.selector);
        vault.cancelWithdrawRequest(reqId);
    }

    function test_cancelWithdrawRequestClearsState() public {
        vm.prank(alice);
        vault.depositETH{value: 1e16}();
        vm.prank(alice);
        uint256 reqId = vault.requestWithdraw();

        vm.warp(block.timestamp + vault.CANCEL_DELAY() + 1);
        vm.prank(alice);
        vault.cancelWithdrawRequest(reqId);

        assertFalse(vault.hasPendingWithdrawal(alice));
        (address user,,) = vault.pendingWithdrawals(reqId);
        assertEq(user, address(0));

        // A fresh request can now be issued.
        vm.prank(alice);
        uint256 reqId2 = vault.requestWithdraw();
        assertEq(reqId2, 2);
    }

    // ── Orchestrator gating under pending state ─────────────────────────

    function test_internalDebitBlockedDuringPending() public {
        _wireOrchestrator();
        vm.prank(alice);
        vault.depositETH{value: 1e16}();
        vm.prank(alice);
        vault.requestWithdraw();

        vm.expectRevert(ConfidentialETHVault.PendingWithdrawalExists.selector);
        _debit(alice, 1e6);
    }

    function test_internalCreditAllowedDuringPending() public {
        _wireOrchestrator();
        vm.prank(alice);
        vault.depositETH{value: 1e16}();
        vm.prank(alice);
        vault.requestWithdraw();

        _credit(alice, 3e6);

        // Snapshot cleartext is the pre-credit balance (1e7); current
        // balance handle now holds 1e7 + 3e6.
        assertEq(_decryptBalance(), 1e7 + 3e6);
    }

    function test_internalTransferFromBlockedDuringPending() public {
        _wireOrchestrator();
        vm.prank(alice);
        vault.depositETH{value: 1e16}();
        vm.prank(bob);
        vault.depositETH{value: 1e16}();
        vm.prank(alice);
        vault.requestWithdraw();

        vm.expectRevert(ConfidentialETHVault.PendingWithdrawalExists.selector);
        _transfer(alice, bob, 1e6);
    }

    function test_internalTransferToAllowedDuringPending() public {
        _wireOrchestrator();
        vm.prank(alice);
        vault.depositETH{value: 1e16}();
        vm.prank(bob);
        vault.depositETH{value: 1e16}();
        vm.prank(alice);
        vault.requestWithdraw();

        // Transfer from Bob -> Alice should succeed even with Alice pending.
        _transfer(bob, alice, 2e6);

        assertEq(_decryptBalance(), 1e7 + 2e6);
    }

    // ── Existing orchestrator wiring tests ──────────────────────────────

    function test_setOrchestratorIsOneShot() public {
        _wireOrchestrator();
        vm.expectRevert(ConfidentialETHVault.OrchestratorAlreadySet.selector);
        vault.setOrchestrator(address(0xBEEF));
    }

    function test_setOrchestratorOnlyOwner() public {
        vm.prank(alice);
        vm.expectRevert(ConfidentialETHVault.NotOwner.selector);
        vault.setOrchestrator(orchestratorAddress);
    }

    function test_internalDebitRejectsNonOrchestrator() public {
        euint64 dummy = euint64.wrap(bytes32(uint256(1)));
        vm.prank(alice);
        vm.expectRevert(ConfidentialETHVault.NotOrchestrator.selector);
        vault.internalDebit(alice, dummy);

        _wireOrchestrator();
        vm.prank(alice);
        vm.expectRevert(ConfidentialETHVault.NotOrchestrator.selector);
        vault.internalDebit(alice, dummy);
    }
}

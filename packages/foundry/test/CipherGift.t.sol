// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {FhevmTest} from "forge-fhevm/FhevmTest.sol";
import {ConfidentialETHVault} from "../src/ConfidentialETHVault.sol";
import {ConfidentialERC20Vault} from "../src/ConfidentialERC20Vault.sol";
import {CipherGift} from "../src/CipherGift.sol";
import {euint64, externalEuint64} from "encrypted-types/EncryptedTypes.sol";
import {InputProofHelper} from "forge-fhevm/InputProofHelper.sol";
import {FheType} from "@fhevm/host-contracts/contracts/shared/FheType.sol";
import {aclAdd, inputVerifierAdd} from "@fhevm/host-contracts/addresses/FHEVMHostAddresses.sol";

contract MockPacketERC20 is ERC20 {
    uint8 private immutable _decimals;

    constructor(string memory name_, string memory symbol_, uint8 decimals_) ERC20(name_, symbol_) {
        _decimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @notice Covers EQUAL split end-to-end, RANDOM with residual settlement,
///         TARGETED Merkle-allowlist gating, refund, password packets,
///         BLIND reveal flows, and pause / two-step ownership controls.
contract CipherGiftTest is FhevmTest {
    ConfidentialETHVault internal vault;
    MockPacketERC20 internal usdc;
    ConfidentialERC20Vault internal usdcVault;
    CipherGift internal wrap;

    address internal vaultAddress;
    address internal usdcVaultAddress;
    address internal wrapAddress;

    uint256 internal constant ALICE_PK = 0xA11CE;
    uint256 internal constant BOB_PK = 0xB0B;
    uint256 internal constant CAROL_PK = 0xCA801;
    uint256 internal constant DAVE_PK = 0xDA8E;

    address internal alice; // creator
    address internal bob;
    address internal carol;
    address internal dave;

    uint256 internal constant SCALE = 1e9;

    /// @dev Local nonce for the batch-encrypt helper. The base FhevmTest's
    ///      `_encryptNonce` is private, so we keep our own to derive unique
    ///      handles when building multi-value input proofs.
    uint256 private _batchNonce;

    function setUp() public override {
        super.setUp();
        vault = new ConfidentialETHVault();
        usdc = new MockPacketERC20("Confidential USDC", "cUSDC", 6);
        usdcVault = new ConfidentialERC20Vault(usdc, 6);
        wrap = new CipherGift(vault);
        vaultAddress = address(vault);
        usdcVaultAddress = address(usdcVault);
        wrapAddress = address(wrap);
        vault.setOrchestrator(wrapAddress);
        usdcVault.setOrchestrator(wrapAddress);
        wrap.setAssetVault(usdcVaultAddress, true);

        alice = vm.addr(ALICE_PK);
        bob = vm.addr(BOB_PK);
        carol = vm.addr(CAROL_PK);
        dave = vm.addr(DAVE_PK);

        vm.deal(alice, 10 ether);
        vm.deal(bob, 10 ether);
        vm.deal(carol, 10 ether);
        vm.deal(dave, 10 ether);
        usdc.mint(alice, 1_000e6);
    }

    // ── helpers ──────────────────────────────────────────────────────────

    function _decryptVaultBalance(uint256 pk, address user) internal returns (uint256) {
        euint64 enc = vault.balanceOf(user);
        if (euint64.unwrap(enc) == bytes32(0)) return 0;
        bytes memory sig = signUserDecrypt(pk, vaultAddress);
        return userDecrypt(euint64.unwrap(enc), user, vaultAddress, sig);
    }

    function _decryptClaimedAmount(uint256 packetId, uint256 pk, address user) internal returns (uint256) {
        euint64 enc = wrap.claimedAmount(packetId, user);
        if (euint64.unwrap(enc) == bytes32(0)) return 0;
        bytes memory sig = signUserDecrypt(pk, wrapAddress);
        return userDecrypt(euint64.unwrap(enc), user, wrapAddress, sig);
    }

    function _aliceDeposits(uint256 weiAmount) internal {
        vm.prank(alice);
        vault.depositETH{value: weiAmount}();
    }

    function _aliceDepositsUsdc(uint256 tokenAmount) internal {
        vm.startPrank(alice);
        usdc.approve(usdcVaultAddress, tokenAmount);
        usdcVault.deposit(tokenAmount);
        vm.stopPrank();
    }

    function _decryptUsdcVaultBalance(uint256 pk, address user) internal returns (uint256) {
        euint64 enc = usdcVault.balanceOf(user);
        if (euint64.unwrap(enc) == bytes32(0)) return 0;
        bytes memory sig = signUserDecrypt(pk, usdcVaultAddress);
        return userDecrypt(euint64.unwrap(enc), user, usdcVaultAddress, sig);
    }

    function _aliceCreatesEqual(uint64 totalUnits, uint32 totalShares, uint32 expirySecs)
        internal
        returns (uint256 id)
    {
        (externalEuint64 enc, bytes memory proof) = encryptUint64(totalUnits, alice, wrapAddress);
        bytes32 noRoot = bytes32(0);
        vm.prank(alice);
        id = wrap.createPacket(CipherGift.PacketType.EQUAL, enc, proof, totalShares, expirySecs, 0, noRoot, "test note");
    }

    function _aliceCreatesRandom(uint64 totalUnits, uint32 totalShares, uint64 maxShareScalar, uint32 expirySecs)
        internal
        returns (uint256 id)
    {
        (externalEuint64 enc, bytes memory proof) = encryptUint64(totalUnits, alice, wrapAddress);
        bytes32 noRoot = bytes32(0);
        vm.prank(alice);
        id = wrap.createPacket(
            CipherGift.PacketType.RANDOM, enc, proof, totalShares, expirySecs, maxShareScalar, noRoot, "lucky draw"
        );
    }

    function _aliceCreatesPassword(uint64 totalUnits, uint32 totalShares, uint32 expirySecs, string memory password)
        internal
        returns (uint256 id)
    {
        (externalEuint64 enc, bytes memory proof) = encryptUint64(totalUnits, alice, wrapAddress);
        vm.prank(alice);
        id = wrap.createPasswordPacket(enc, proof, totalShares, expirySecs, keccak256(bytes(password)), "password note");
    }

    function _aliceCreatesBlind(uint64 totalUnits, uint32 totalShares, uint64 maxShareScalar, uint32 expirySecs)
        internal
        returns (uint256 id)
    {
        (externalEuint64 enc, bytes memory proof) = encryptUint64(totalUnits, alice, wrapAddress);
        vm.prank(alice);
        id = wrap.createPacket(
            CipherGift.PacketType.BLIND, enc, proof, totalShares, expirySecs, maxShareScalar, bytes32(0), "blind note"
        );
    }

    function _aliceCreatesEqualUsdc(uint64 totalUnits, uint32 totalShares, uint32 expirySecs)
        internal
        returns (uint256 id)
    {
        (externalEuint64 enc, bytes memory proof) = encryptUint64(totalUnits, alice, wrapAddress);
        bytes32 noRoot = bytes32(0);
        vm.prank(alice);
        id = wrap.createPacketWithAsset(
            usdcVaultAddress, CipherGift.PacketType.EQUAL, enc, proof, totalShares, expirySecs, 0, noRoot, "usdc note"
        );
    }

    // ── tests ────────────────────────────────────────────────────────────

    function test_createEqualDebitsCreatorBalance() public {
        // Alice deposits 0.04 ETH = 4e7 units, then creates 4-share equal packet.
        _aliceDeposits(0.04 ether);
        uint256 balBefore = _decryptVaultBalance(ALICE_PK, alice);
        assertEq(balBefore, 4e7);

        uint256 id = _aliceCreatesEqual(4e7, 4, 1 days);
        assertEq(id, 0);

        (
            address creator,
            ,
            ,
            CipherGift.PacketType ptype,
            uint32 totalShares,
            uint32 claimedCount,
            uint64 maxShareScalar,
            string memory note,
            bool refunded
        ) = wrap.getPacket(id);
        assertEq(creator, alice);
        assertEq(uint8(ptype), uint8(CipherGift.PacketType.EQUAL));
        assertEq(totalShares, 4);
        assertEq(claimedCount, 0);
        assertEq(maxShareScalar, 0);
        assertEq(note, "test note");
        assertFalse(refunded);
        assertEq(wrap.getPacketAsset(id), vaultAddress);

        assertEq(_decryptVaultBalance(ALICE_PK, alice), 0);
    }

    function test_createUsdcPacketDebitsUsdcVaultOnly() public {
        _aliceDeposits(0.04 ether);
        _aliceDepositsUsdc(20e6);

        uint256 id = _aliceCreatesEqualUsdc(20e6, 4, 1 days);

        assertEq(wrap.getPacketAsset(id), usdcVaultAddress);
        assertEq(_decryptUsdcVaultBalance(ALICE_PK, alice), 0);
        assertEq(_decryptVaultBalance(ALICE_PK, alice), 4e7);
    }

    function test_usdcPacketDistributesUsdcShares() public {
        _aliceDepositsUsdc(20e6);
        uint256 id = _aliceCreatesEqualUsdc(20e6, 4, 1 days);

        vm.prank(bob);
        wrap.claim(id);
        vm.prank(carol);
        wrap.claim(id);

        assertEq(_decryptUsdcVaultBalance(BOB_PK, bob), 5e6);
        assertEq(_decryptUsdcVaultBalance(CAROL_PK, carol), 5e6);
        assertEq(_decryptVaultBalance(BOB_PK, bob), 0);
        assertEq(_decryptVaultBalance(CAROL_PK, carol), 0);
    }

    function test_unsupportedAssetPacketReverts() public {
        ConfidentialERC20Vault strayVault = new ConfidentialERC20Vault(usdc, 6);
        (externalEuint64 enc, bytes memory proof) = encryptUint64(20e6, alice, wrapAddress);

        vm.prank(alice);
        vm.expectRevert(CipherGift.UnsupportedAsset.selector);
        wrap.createPacketWithAsset(
            address(strayVault), CipherGift.PacketType.EQUAL, enc, proof, 4, 1 days, 0, bytes32(0), ""
        );
    }

    function test_claimEqualPacketDistributesShares() public {
        _aliceDeposits(0.04 ether);
        uint256 id = _aliceCreatesEqual(4e7, 4, 1 days);

        address[4] memory claimers = [bob, carol, dave, alice];
        uint256[4] memory pks = [BOB_PK, CAROL_PK, DAVE_PK, ALICE_PK];

        for (uint256 i = 0; i < 4; i++) {
            vm.prank(claimers[i]);
            wrap.claim(id);
            uint256 received = _decryptVaultBalance(pks[i], claimers[i]);
            // Alice still has 0 + her share; others have their share only.
            uint256 expected = 1e7;
            if (claimers[i] == alice) {
                // Alice's pre-claim balance was 0 (debited at create).
                assertEq(received, expected);
            } else {
                assertEq(received, expected);
            }
        }

        (,,,,, uint32 claimedCount,,,) = wrap.getPacket(id);
        assertEq(claimedCount, 4);
    }

    function test_cannotClaimTwice() public {
        _aliceDeposits(0.04 ether);
        uint256 id = _aliceCreatesEqual(4e7, 4, 1 days);

        vm.prank(bob);
        wrap.claim(id);

        vm.prank(bob);
        vm.expectRevert(CipherGift.AlreadyClaimed.selector);
        wrap.claim(id);
    }

    function test_cannotClaimAfterAllSlotsTaken() public {
        _aliceDeposits(0.02 ether);
        uint256 id = _aliceCreatesEqual(2e7, 2, 1 days);

        vm.prank(bob);
        wrap.claim(id);
        vm.prank(carol);
        wrap.claim(id);

        vm.prank(dave);
        vm.expectRevert(CipherGift.AllShareClaimed.selector);
        wrap.claim(id);
    }

    function test_cannotClaimAfterExpiry() public {
        _aliceDeposits(0.04 ether);
        uint256 id = _aliceCreatesEqual(4e7, 4, 1 hours);

        vm.warp(block.timestamp + 2 hours);

        vm.prank(bob);
        vm.expectRevert(CipherGift.PacketExpired.selector);
        wrap.claim(id);
    }

    /// @dev Builds a leaf compatible with `CipherGift._allowlistLeaf`.
    function _leaf(bytes32 salt, address claimer, uint32 slotIndex) internal pure returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(salt, claimer, slotIndex))));
    }

    /// @dev Encrypts N uint64 values into one batched input proof. Mirrors
    ///      `FhevmTest._encrypt` but assembles all handles under a single
    ///      signed digest, matching how the SDK's batched input builder
    ///      works in production. Used by TARGETED tests to build
    ///      `(encTotal, encSlotAmounts[])` with one shared proof.
    function _encryptBatchUint64(uint64[] memory values, address user, address target)
        internal
        returns (externalEuint64[] memory externals, bytes memory inputProof)
    {
        uint256 n = values.length;
        bytes32[] memory handles = new bytes32[](n);
        externals = new externalEuint64[](n);
        for (uint256 i = 0; i < n; i++) {
            _batchNonce += 1;
            bytes memory ct =
                abi.encodePacked(keccak256(abi.encodePacked(uint256(values[i]), uint8(FheType.Uint64), _batchNonce)));
            bytes32 handle =
                InputProofHelper.computeInputHandle(ct, uint8(i), FheType.Uint64, aclAdd, uint64(block.chainid));
            _plaintexts[handle] = uint256(values[i]);
            handles[i] = handle;
            externals[i] = externalEuint64.wrap(handle);
        }

        bytes32 domainSeparator = InputProofHelper.computeInputVerifierDomainSeparator(inputVerifierAdd, block.chainid);
        bytes32 digest = InputProofHelper.computeInputVerificationDigest(
            handles, user, target, block.chainid, EMPTY_EXTRA_DATA, domainSeparator
        );
        bytes[] memory signatures = new bytes[](1);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(MOCK_INPUT_SIGNER_PK, digest);
        signatures[0] = abi.encodePacked(r, s, v);
        inputProof = InputProofHelper.assembleInputProof(handles, signatures, EMPTY_EXTRA_DATA);
    }

    /// @dev Sorted-pair hash matching OpenZeppelin's MerkleProof.verify.
    function _pair(bytes32 a, bytes32 b) internal pure returns (bytes32) {
        return a < b ? keccak256(abi.encode(a, b)) : keccak256(abi.encode(b, a));
    }

    /// @dev Builds a TARGETED packet from Alice with custom per-slot amounts.
    ///      Returns the new packet id. Uses `salt-bob` and `salt-carol` as
    ///      the well-known salts so individual tests can construct proofs.
    function _aliceCreatesTargetedSalary(
        uint64 totalUnits,
        uint64 bobAmount,
        uint64 carolAmount,
        bytes32 saltBob,
        bytes32 saltCarol
    ) internal returns (uint256 id) {
        // Single batched proof: total at index 0, slot amounts at 1..N.
        uint64[] memory values = new uint64[](3);
        values[0] = totalUnits;
        values[1] = bobAmount; // slotIndex 0
        values[2] = carolAmount; // slotIndex 1
        (externalEuint64[] memory externals, bytes memory proof) = _encryptBatchUint64(values, alice, wrapAddress);

        externalEuint64[] memory slots = new externalEuint64[](2);
        slots[0] = externals[1];
        slots[1] = externals[2];

        bytes32 root = _pair(_leaf(saltBob, bob, 0), _leaf(saltCarol, carol, 1));

        vm.prank(alice);
        id = wrap.createTargetedPacket(externals[0], slots, proof, 1 days, root, "salary");
    }

    function test_targetedClaimWithValidMerkleProof() public {
        _aliceDeposits(0.03 ether);
        // Bob gets 1e7 (0.01), Carol gets 2e7 (0.02). Total 3e7.
        bytes32 saltBob = keccak256("salt-bob");
        bytes32 saltCarol = keccak256("salt-carol");
        uint256 id = _aliceCreatesTargetedSalary(3e7, 1e7, 2e7, saltBob, saltCarol);

        bytes32 leafBob = _leaf(saltBob, bob, 0);
        bytes32 leafCarol = _leaf(saltCarol, carol, 1);

        // Bob's proof = [leafCarol]; Carol's proof = [leafBob].
        bytes32[] memory proofBob = new bytes32[](1);
        proofBob[0] = leafCarol;
        bytes32[] memory proofCarol = new bytes32[](1);
        proofCarol[0] = leafBob;

        vm.prank(bob);
        wrap.claimTargeted(id, saltBob, 0, proofBob);

        vm.prank(carol);
        wrap.claimTargeted(id, saltCarol, 1, proofCarol);

        // Per-recipient encrypted amounts come through end-to-end.
        assertEq(_decryptVaultBalance(BOB_PK, bob), 1e7);
        assertEq(_decryptVaultBalance(CAROL_PK, carol), 2e7);
    }

    function test_targetedRejectsBadProof() public {
        _aliceDeposits(0.03 ether);
        bytes32 saltBob = keccak256("salt-bob");
        bytes32 saltCarol = keccak256("salt-carol");
        uint256 id = _aliceCreatesTargetedSalary(3e7, 1e7, 2e7, saltBob, saltCarol);

        bytes32 leafBob = _leaf(saltBob, bob, 0);
        bytes32 leafCarol = _leaf(saltCarol, carol, 1);

        // Dave (not in tree) tries Bob's salt + slot — leaf computes to a different
        // hash, no proof verifies.
        bytes32[] memory proofForDave = new bytes32[](1);
        proofForDave[0] = leafCarol;

        vm.prank(dave);
        vm.expectRevert(CipherGift.NotAllowlisted.selector);
        wrap.claimTargeted(id, saltBob, 0, proofForDave);

        // Bob with the wrong salt also reverts.
        bytes32[] memory proofForBob = new bytes32[](1);
        proofForBob[0] = leafCarol;

        vm.prank(bob);
        vm.expectRevert(CipherGift.NotAllowlisted.selector);
        wrap.claimTargeted(id, keccak256("wrong-salt"), 0, proofForBob);

        // Bob with his correct salt but wrong slotIndex (Carol's slot) also reverts.
        bytes32[] memory proofForBob2 = new bytes32[](1);
        proofForBob2[0] = leafBob;
        vm.prank(bob);
        vm.expectRevert(CipherGift.NotAllowlisted.selector);
        wrap.claimTargeted(id, saltBob, 1, proofForBob2);
    }

    function test_targetedRejectsSlotIndexOutOfRange() public {
        _aliceDeposits(0.03 ether);
        bytes32 saltBob = keccak256("salt-bob");
        bytes32 saltCarol = keccak256("salt-carol");
        uint256 id = _aliceCreatesTargetedSalary(3e7, 1e7, 2e7, saltBob, saltCarol);

        bytes32[] memory proofBob = new bytes32[](1);
        proofBob[0] = _leaf(saltCarol, carol, 1);

        vm.prank(bob);
        vm.expectRevert(CipherGift.SlotIndexOutOfRange.selector);
        wrap.claimTargeted(id, saltBob, 5, proofBob);
    }

    function test_targetedClaimRejectsThroughOpenClaim() public {
        // For TARGETED packets, plain claim() must redirect users to
        // claimTargeted() instead of silently bypassing the allowlist.
        _aliceDeposits(0.03 ether);
        uint256 id = _aliceCreatesTargetedSalary(3e7, 1e7, 2e7, keccak256("s1"), keccak256("s2"));

        vm.prank(bob);
        vm.expectRevert(CipherGift.TargetedRequiresProof.selector);
        wrap.claim(id);
    }

    function test_openClaimRejectedThroughClaimTargeted() public {
        // For non-TARGETED packets, claimTargeted() must reject so honest
        // users don't accidentally publish a salt no one needs.
        _aliceDeposits(0.04 ether);
        uint256 id = _aliceCreatesEqual(4e7, 4, 1 days);

        bytes32[] memory emptyProof = new bytes32[](0);
        vm.prank(bob);
        vm.expectRevert(CipherGift.UseClaimForOpenPackets.selector);
        wrap.claimTargeted(id, bytes32(0), 0, emptyProof);
    }

    function test_targetedThroughOldCreatePacketReverts() public {
        // The legacy `createPacket(...)` path no longer accepts TARGETED;
        // senders must use `createTargetedPacket` so they pass per-slot amounts.
        _aliceDeposits(0.02 ether);
        (externalEuint64 enc, bytes memory proof) = encryptUint64(2e7, alice, wrapAddress);
        bytes32 root = keccak256("any-root");

        vm.prank(alice);
        vm.expectRevert(CipherGift.TargetedUseDedicatedCreate.selector);
        wrap.createPacket(CipherGift.PacketType.TARGETED, enc, proof, 2, 1 days, 0, root, "");
    }

    function test_passwordPacketRequiresSecret() public {
        _aliceDeposits(0.02 ether);
        (externalEuint64 enc, bytes memory proof) = encryptUint64(2e7, alice, wrapAddress);

        vm.prank(alice);
        vm.expectRevert(CipherGift.PasswordNeedsSecret.selector);
        wrap.createPasswordPacket(enc, proof, 2, 1 days, bytes32(0), "");
    }

    function test_passwordPacketRejectsPlainClaim() public {
        _aliceDeposits(0.02 ether);
        uint256 id = _aliceCreatesPassword(2e7, 2, 1 days, "open sesame");

        vm.prank(bob);
        vm.expectRevert(CipherGift.PasswordRequired.selector);
        wrap.claim(id);
    }

    function test_passwordPacketRejectsWrongPassword() public {
        _aliceDeposits(0.02 ether);
        uint256 id = _aliceCreatesPassword(2e7, 2, 1 days, "open sesame");

        vm.prank(bob);
        vm.expectRevert(CipherGift.WrongPassword.selector);
        wrap.claimWithPassword(id, "wrong");
    }

    function test_passwordPacketClaimsWithCorrectPassword() public {
        _aliceDeposits(0.02 ether);
        uint256 id = _aliceCreatesPassword(2e7, 2, 1 days, "open sesame");

        vm.prank(bob);
        wrap.claimWithPassword(id, "open sesame");

        assertEq(_decryptVaultBalance(BOB_PK, bob), 1e7);
        assertEq(_decryptClaimedAmount(id, BOB_PK, bob), 1e7);
    }

    function test_passwordPacketSupportsAssetVault() public {
        _aliceDepositsUsdc(20e6);
        (externalEuint64 enc, bytes memory proof) = encryptUint64(20e6, alice, wrapAddress);

        vm.prank(alice);
        uint256 id = wrap.createPasswordPacketWithAsset(
            usdcVaultAddress, enc, proof, 4, 1 days, keccak256(bytes("stable secret")), "usdc password"
        );

        vm.prank(bob);
        wrap.claimWithPassword(id, "stable secret");

        assertEq(wrap.getPacketAsset(id), usdcVaultAddress);
        assertEq(_decryptUsdcVaultBalance(BOB_PK, bob), 5e6);
    }

    function test_blindClaimDoesNotCreditVaultUntilReveal() public {
        _aliceDeposits(0.03 ether);
        uint256 id = _aliceCreatesBlind(3e7, 1, 3e7, 1 days);

        vm.prank(bob);
        wrap.claim(id);

        assertTrue(wrap.claimed(id, bob));
        assertFalse(wrap.revealed(id, bob));
        assertEq(_decryptVaultBalance(BOB_PK, bob), 0);

        vm.prank(bob);
        wrap.reveal(id);

        assertTrue(wrap.revealed(id, bob));
        assertEq(_decryptVaultBalance(BOB_PK, bob), 3e7);
        assertEq(_decryptClaimedAmount(id, BOB_PK, bob), 3e7);
    }

    function test_blindRevealRequiresClaim() public {
        _aliceDeposits(0.03 ether);
        uint256 id = _aliceCreatesBlind(3e7, 1, 3e7, 1 days);

        vm.prank(bob);
        vm.expectRevert(CipherGift.NotClaimed.selector);
        wrap.reveal(id);
    }

    function test_blindRevealCannotRunTwice() public {
        _aliceDeposits(0.03 ether);
        uint256 id = _aliceCreatesBlind(3e7, 1, 3e7, 1 days);

        vm.prank(bob);
        wrap.claim(id);
        vm.prank(bob);
        wrap.reveal(id);

        vm.prank(bob);
        vm.expectRevert(CipherGift.AlreadyRevealed.selector);
        wrap.reveal(id);
    }

    function test_blindRevealForRequiresExpiry() public {
        // Pre-expiry, only the claimer themselves can reveal a BLIND share.
        // revealFor(id, other) before expiresAt must revert so claimers
        // retain agency over when their balance ticks up.
        _aliceDeposits(0.03 ether);
        uint256 id = _aliceCreatesBlind(3e7, 1, 3e7, 1 days);

        vm.prank(bob);
        wrap.claim(id);

        vm.prank(carol);
        vm.expectRevert(CipherGift.PacketNotExpired.selector);
        wrap.revealFor(id, bob);

        // Self-reveal still works pre-expiry through the regular path.
        vm.prank(bob);
        wrap.reveal(id);
        assertTrue(wrap.revealed(id, bob));
    }

    function test_blindRevealForSettlesAbandonedClaimAfterExpiry() public {
        // A BLIND claimer who never returns to reveal would otherwise lock
        // their share permanently — `closeAndRefund` only returns the
        // unclaimed residual. After expiry, anyone can call `revealFor` to
        // settle the abandoned claim into the claimer's vault. The funds
        // end up where claim semantics promised.
        _aliceDeposits(0.03 ether);
        uint256 id = _aliceCreatesBlind(3e7, 1, 3e7, 1 hours);

        vm.prank(bob);
        wrap.claim(id);
        assertEq(_decryptVaultBalance(BOB_PK, bob), 0);

        // Bob never reveals; packet expires.
        vm.warp(block.timestamp + 2 hours);

        // Carol (a stranger) settles Bob's claim. Bob's vault is credited.
        vm.prank(carol);
        wrap.revealFor(id, bob);

        assertTrue(wrap.revealed(id, bob));
        assertEq(_decryptVaultBalance(BOB_PK, bob), 3e7);
    }

    function test_blindRevealForRejectsNonClaimer() public {
        // After expiry, revealFor still requires the claimer to have
        // actually claimed — settling someone who never claimed makes
        // no sense and would corrupt accounting.
        _aliceDeposits(0.03 ether);
        uint256 id = _aliceCreatesBlind(3e7, 1, 3e7, 1 hours);

        vm.warp(block.timestamp + 2 hours);

        vm.prank(carol);
        vm.expectRevert(CipherGift.NotClaimed.selector);
        wrap.revealFor(id, dave);
    }

    function test_pauseBlocksNewPacketCreation() public {
        _aliceDeposits(0.04 ether);
        (externalEuint64 enc, bytes memory proof) = encryptUint64(4e7, alice, wrapAddress);

        wrap.pause();

        vm.prank(alice);
        vm.expectRevert(CipherGift.Paused_.selector);
        wrap.createPacket(CipherGift.PacketType.EQUAL, enc, proof, 4, 1 days, 0, bytes32(0), "");
    }

    function test_pauseDoesNotBlockClaimRevealOrRefund() public {
        _aliceDeposits(0.06 ether);
        uint256 equalId = _aliceCreatesEqual(3e7, 3, 1 hours);
        uint256 blindId = _aliceCreatesBlind(3e7, 1, 3e7, 1 hours);

        wrap.pause();

        vm.prank(bob);
        wrap.claim(equalId);
        assertEq(_decryptVaultBalance(BOB_PK, bob), 1e7);

        vm.prank(carol);
        wrap.claim(blindId);
        assertEq(_decryptVaultBalance(CAROL_PK, carol), 0);
        vm.prank(carol);
        wrap.reveal(blindId);
        assertEq(_decryptVaultBalance(CAROL_PK, carol), 3e7);

        vm.warp(block.timestamp + 2 hours);
        vm.prank(alice);
        wrap.closeAndRefund(equalId);
        (,,,,,,,, bool refunded) = wrap.getPacket(equalId);
        assertTrue(refunded);
    }

    function test_transferOwnershipIsTwoStep() public {
        // transferOwnership only stages a successor; until they accept,
        // the original owner retains all privileges. This avoids bricking
        // the contract on a typoed multisig address.
        address newOwner = vm.addr(0xBEEF);
        wrap.transferOwnership(newOwner);

        assertEq(wrap.owner(), address(this));
        assertEq(wrap.pendingOwner(), newOwner);

        // Original owner can still pause while transfer is pending.
        wrap.pause();
        assertTrue(wrap.paused());
        wrap.unpause();

        // Pending owner can't act yet — only after acceptOwnership.
        vm.prank(newOwner);
        vm.expectRevert(CipherGift.NotOwner.selector);
        wrap.pause();

        vm.prank(newOwner);
        wrap.acceptOwnership();

        assertEq(wrap.owner(), newOwner);
        assertEq(wrap.pendingOwner(), address(0));

        // Old owner is now powerless.
        vm.expectRevert(CipherGift.NotOwner.selector);
        wrap.pause();

        vm.prank(newOwner);
        wrap.pause();
        assertTrue(wrap.paused());
    }

    function test_acceptOwnershipOnlyByPending() public {
        address newOwner = vm.addr(0xBEEF);
        wrap.transferOwnership(newOwner);

        // A stranger can't claim ownership.
        vm.prank(alice);
        vm.expectRevert(CipherGift.NotPendingOwner.selector);
        wrap.acceptOwnership();

        // Still pending; original owner still in charge.
        assertEq(wrap.owner(), address(this));
    }

    function test_transferOwnershipCanBeCancelled() public {
        address newOwner = vm.addr(0xBEEF);
        wrap.transferOwnership(newOwner);
        assertEq(wrap.pendingOwner(), newOwner);

        // Owner cancels by passing zero address.
        wrap.transferOwnership(address(0));
        assertEq(wrap.pendingOwner(), address(0));

        // Previously-pending address can no longer claim.
        vm.prank(newOwner);
        vm.expectRevert(CipherGift.NotPendingOwner.selector);
        wrap.acceptOwnership();
    }

    function test_targetedRequiresMerkleRoot() public {
        _aliceDeposits(0.02 ether);
        uint64[] memory values = new uint64[](3);
        values[0] = 2e7;
        values[1] = 1e7;
        values[2] = 1e7;
        (externalEuint64[] memory externals, bytes memory proof) = _encryptBatchUint64(values, alice, wrapAddress);
        externalEuint64[] memory slots = new externalEuint64[](2);
        slots[0] = externals[1];
        slots[1] = externals[2];

        vm.prank(alice);
        vm.expectRevert(CipherGift.TargetedNeedsAllowlist.selector);
        wrap.createTargetedPacket(externals[0], slots, proof, 1 days, bytes32(0), "");
    }

    function test_nonTargetedRejectsAllowlistRoot() public {
        _aliceDeposits(0.04 ether);
        (externalEuint64 enc, bytes memory proof) = encryptUint64(4e7, alice, wrapAddress);
        bytes32 stray = keccak256("oops");

        vm.prank(alice);
        vm.expectRevert(CipherGift.UnexpectedAllowlistRoot.selector);
        wrap.createPacket(CipherGift.PacketType.EQUAL, enc, proof, 4, 1 days, 0, stray, "");
    }

    function test_previewAllowlistLeafMatches() public view {
        bytes32 salt = keccak256("hello");
        bytes32 expected = _leaf(salt, bob, 7);
        assertEq(wrap.previewAllowlistLeaf(salt, bob, 7), expected);
    }

    function test_randomNeedsMaxShareScalar() public {
        _aliceDeposits(0.04 ether);
        (externalEuint64 enc, bytes memory proof) = encryptUint64(4e7, alice, wrapAddress);
        bytes32 noRoot = bytes32(0);

        vm.prank(alice);
        vm.expectRevert(CipherGift.RandomNeedsMaxShare.selector);
        wrap.createPacket(CipherGift.PacketType.RANDOM, enc, proof, 4, 1 days, 0, noRoot, "");
    }

    function test_equalRejectsNonZeroMaxShare() public {
        _aliceDeposits(0.04 ether);
        (externalEuint64 enc, bytes memory proof) = encryptUint64(4e7, alice, wrapAddress);
        bytes32 noRoot = bytes32(0);

        vm.prank(alice);
        vm.expectRevert(CipherGift.UnexpectedMaxShare.selector);
        wrap.createPacket(CipherGift.PacketType.EQUAL, enc, proof, 4, 1 days, 1e7, noRoot, "");
    }

    function test_randomSplitSumsToTotal() public {
        // Alice creates a 5-share random packet of 1e8 units; cap each share
        // at 4e7 (4× fair share to give visible variance). Each claimer's
        // share decrypts to a value ≤ remainingAmount; the last claimer takes
        // the residual so the sum equals the original total.
        _aliceDeposits(0.1 ether);
        uint256 id = _aliceCreatesRandom(1e8, 5, 4e7, 1 days);

        address[5] memory claimers = [bob, carol, dave, alice, vm.addr(0xFEED)];
        uint256[5] memory pks = [BOB_PK, CAROL_PK, DAVE_PK, ALICE_PK, uint256(0xFEED)];

        uint256 sum = 0;
        for (uint256 i = 0; i < 5; i++) {
            vm.prank(claimers[i]);
            wrap.claim(id);
            uint256 share = _decryptVaultBalance(pks[i], claimers[i]);
            // Alice's pre-claim balance was 0 (debited at create); for her
            // the decrypted vault balance == her claimed share.
            sum += share;
        }

        assertEq(sum, 1e8);
    }

    function test_randomLastClaimerTakesResidual() public {
        // After 2 of 3 claims, the 3rd claim should empty the residual
        // regardless of FHE.randEuint64 outcome.
        _aliceDeposits(0.03 ether);
        uint256 id = _aliceCreatesRandom(3e7, 3, 2e7, 1 days);

        vm.prank(bob);
        wrap.claim(id);
        vm.prank(carol);
        wrap.claim(id);

        // Read residual via creator (must be FHE.allow'd).
        euint64 residualHandle = wrap.getRemainingAmount(id);
        bytes memory sig = signUserDecrypt(ALICE_PK, wrapAddress);
        uint256 residual = userDecrypt(euint64.unwrap(residualHandle), alice, wrapAddress, sig);

        vm.prank(dave);
        wrap.claim(id);

        // Dave's vault balance now equals the residual.
        assertEq(_decryptVaultBalance(DAVE_PK, dave), residual);
    }

    function test_randomTotalIsExhausted() public {
        // After all claims on a RANDOM packet, the encrypted residual is 0.
        _aliceDeposits(0.03 ether);
        uint256 id = _aliceCreatesRandom(3e7, 3, 2e7, 1 days);

        vm.prank(bob);
        wrap.claim(id);
        vm.prank(carol);
        wrap.claim(id);
        vm.prank(dave);
        wrap.claim(id);

        // After last claim, residual handle decrypts to 0 (everything was distributed).
        euint64 residualHandle = wrap.getRemainingAmount(id);
        bytes memory sig = signUserDecrypt(ALICE_PK, wrapAddress);
        uint256 residual = userDecrypt(euint64.unwrap(residualHandle), alice, wrapAddress, sig);
        assertEq(residual, 0);
    }

    function test_refundCreditsResidualToCreator() public {
        _aliceDeposits(0.04 ether);
        uint256 id = _aliceCreatesEqual(4e7, 4, 1 hours);

        // Bob and Carol claim; 2 slots remain unclaimed (2e7 residual).
        vm.prank(bob);
        wrap.claim(id);
        vm.prank(carol);
        wrap.claim(id);

        vm.warp(block.timestamp + 2 hours);

        vm.prank(alice);
        wrap.closeAndRefund(id);

        // Alice's pre-claim balance was 0; refund credits 2e7.
        assertEq(_decryptVaultBalance(ALICE_PK, alice), 2e7);

        (,,,,,,,, bool refunded) = wrap.getPacket(id);
        assertTrue(refunded);
    }

    function test_refundFailsBeforeExpiry() public {
        _aliceDeposits(0.04 ether);
        uint256 id = _aliceCreatesEqual(4e7, 4, 1 days);

        vm.prank(alice);
        vm.expectRevert(CipherGift.PacketNotExpired.selector);
        wrap.closeAndRefund(id);
    }

    function test_refundOnlyCreator() public {
        _aliceDeposits(0.04 ether);
        uint256 id = _aliceCreatesEqual(4e7, 4, 1 hours);

        vm.warp(block.timestamp + 2 hours);

        vm.prank(bob);
        vm.expectRevert(CipherGift.NotCreator.selector);
        wrap.closeAndRefund(id);
    }

    function test_refundCannotBeCalledTwice() public {
        _aliceDeposits(0.04 ether);
        uint256 id = _aliceCreatesEqual(4e7, 4, 1 hours);

        vm.warp(block.timestamp + 2 hours);

        vm.prank(alice);
        wrap.closeAndRefund(id);

        vm.prank(alice);
        vm.expectRevert(CipherGift.PacketRefunded_.selector);
        wrap.closeAndRefund(id);
    }

    function test_claimedAmountDecryptableByClaimer() public {
        _aliceDeposits(0.04 ether);
        uint256 id = _aliceCreatesEqual(4e7, 4, 1 days);

        vm.prank(bob);
        wrap.claim(id);

        // Bob can decrypt his own claimedAmount handle.
        uint256 bobShare = _decryptClaimedAmount(id, BOB_PK, bob);
        assertEq(bobShare, 1e7);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {FhevmTest} from "forge-fhevm/FhevmTest.sol";
import {ConfidentialERC20Vault} from "../src/ConfidentialERC20Vault.sol";
import {FHE, euint64, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

contract MockERC20 is ERC20 {
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

contract MockERC20Orchestrator is ZamaEthereumConfig {
    ConfidentialERC20Vault public immutable vault;

    constructor(ConfidentialERC20Vault v) {
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
}

contract ConfidentialERC20VaultTest is FhevmTest {
    MockERC20 internal usdc;
    MockERC20 internal zama;
    ConfidentialERC20Vault internal usdcVault;
    ConfidentialERC20Vault internal zamaVault;
    MockERC20Orchestrator internal orchestrator;

    uint256 internal constant ALICE_PK = 0xA11CE;
    address internal alice;

    function setUp() public override {
        super.setUp();
        alice = vm.addr(ALICE_PK);

        usdc = new MockERC20("Confidential USDC", "cUSDC", 6);
        zama = new MockERC20("Confidential ZAMA", "cZAMA", 18);
        usdcVault = new ConfidentialERC20Vault(usdc, 6);
        zamaVault = new ConfidentialERC20Vault(zama, 6);
        orchestrator = new MockERC20Orchestrator(usdcVault);
        usdcVault.setOrchestrator(address(orchestrator));

        usdc.mint(alice, 1_000e6);
        zama.mint(alice, 1_000e18);
    }

    function _decryptUsdcBalance(address user) internal returns (uint256) {
        euint64 enc = usdcVault.balanceOf(user);
        if (euint64.unwrap(enc) == bytes32(0)) return 0;
        bytes memory sig = signUserDecrypt(ALICE_PK, address(usdcVault));
        return userDecrypt(euint64.unwrap(enc), user, address(usdcVault), sig);
    }

    function _fulfillFor(uint256 reqId) internal {
        (,, bytes32 handle) = usdcVault.pendingWithdrawals(reqId);
        bytes32[] memory handles = new bytes32[](1);
        handles[0] = handle;
        (uint256[] memory cleartexts,) = publicDecrypt(handles);
        bytes memory abiEncoded = abi.encode(cleartexts[0]);
        bytes memory proof = buildDecryptionProof(handles, abiEncoded);
        usdcVault.fulfillWithdraw(reqId, abiEncoded, proof);
    }

    function test_cancelDelayIsFiveMinutes() public view {
        assertEq(usdcVault.CANCEL_DELAY(), 5 minutes);
    }

    function test_depositCreditsUsdcUnits() public {
        vm.startPrank(alice);
        usdc.approve(address(usdcVault), 25e6);
        usdcVault.deposit(25e6);
        vm.stopPrank();

        assertEq(_decryptUsdcBalance(alice), 25e6);
        assertEq(usdc.balanceOf(address(usdcVault)), 25e6);
    }

    function test_depositRejectsSubUnitDust() public {
        vm.startPrank(alice);
        zama.approve(address(zamaVault), 1e12 + 1);
        vm.expectRevert(ConfidentialERC20Vault.NotUnitAligned.selector);
        zamaVault.deposit(1e12 + 1);
        vm.stopPrank();
    }

    function test_fulfillWithdrawTransfersTokensAndZerosBalance() public {
        vm.startPrank(alice);
        usdc.approve(address(usdcVault), 40e6);
        usdcVault.deposit(40e6);
        uint256 before = usdc.balanceOf(alice);
        uint256 reqId = usdcVault.requestWithdraw();
        vm.stopPrank();

        _fulfillFor(reqId);

        assertEq(usdc.balanceOf(alice), before + 40e6);
        assertEq(_decryptUsdcBalance(alice), 0);
        assertEq(usdcVault.pendingWithdrawalIdOf(alice), 0);
    }

    function test_internalDebitBlockedDuringPendingWithdrawal() public {
        vm.startPrank(alice);
        usdc.approve(address(usdcVault), 40e6);
        usdcVault.deposit(40e6);
        usdcVault.requestWithdraw();
        vm.stopPrank();

        (externalEuint64 enc, bytes memory proof) = encryptUint64(1e6, address(this), address(orchestrator));
        vm.expectRevert(ConfidentialERC20Vault.PendingWithdrawalExists.selector);
        orchestrator.debit(alice, enc, proof);
    }
}

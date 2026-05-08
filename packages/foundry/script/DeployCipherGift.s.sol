// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {Script, console} from "forge-std/Script.sol";
import {CipherGift} from "../src/CipherGift.sol";
import {ConfidentialETHVault} from "../src/ConfidentialETHVault.sol";
import {ConfidentialERC20Vault} from "../src/ConfidentialERC20Vault.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

/// @notice Deploys ConfidentialETHVault + CipherGift and wires the
///         vault's orchestrator to the freshly-deployed CipherGift so
///         packet creation/claim flows can mutate vault balances.
contract DeployCipherGift is Script {
    function run() external {
        vm.startBroadcast();

        ConfidentialETHVault vault = new ConfidentialETHVault();
        CipherGift wrap = new CipherGift(vault);
        vault.setOrchestrator(address(wrap));

        address cusdcToken = vm.envOr("CUSDC_TOKEN_ADDRESS", address(0));
        address czamaToken = vm.envOr("CZAMA_TOKEN_ADDRESS", address(0));
        ConfidentialERC20Vault cusdcVault;
        ConfidentialERC20Vault czamaVault;
        if (cusdcToken != address(0)) {
            cusdcVault = new ConfidentialERC20Vault(IERC20Metadata(cusdcToken), 6);
            cusdcVault.setOrchestrator(address(wrap));
            wrap.setAssetVault(address(cusdcVault), true);
        }
        if (czamaToken != address(0)) {
            czamaVault = new ConfidentialERC20Vault(IERC20Metadata(czamaToken), 6);
            czamaVault.setOrchestrator(address(wrap));
            wrap.setAssetVault(address(czamaVault), true);
        }

        address multisigOwner = vm.envOr("MULTISIG_OWNER", address(0));
        if (multisigOwner != address(0)) {
            // Two-step transfer: the multisig still needs to call
            // `acceptOwnership()` from its own address before the deployer
            // EOA loses ownership. Until then the deployer remains owner so
            // mis-deployments can be fixed without bricking the contract.
            wrap.transferOwnership(multisigOwner);
        }

        vm.stopBroadcast();

        console.log("=== CipherGift deployment ===");
        console.log("ConfidentialETHVault:", address(vault));
        console.log("CipherGift:           ", address(wrap));
        console.log("Owner:                ", vault.owner());
        console.log("CipherGift owner:     ", wrap.owner());
        console.log("CipherGift pendingOwner:", wrap.pendingOwner());
        console.log("Orchestrator:         ", vault.orchestrator());
        console.log("Default assetId:      ", wrap.defaultAssetId());
        if (address(cusdcVault) != address(0)) console.log("cUSDC vault:          ", address(cusdcVault));
        if (address(czamaVault) != address(0)) console.log("cZAMA vault:          ", address(czamaVault));
        if (multisigOwner != address(0)) {
            console.log("");
            console.log("ACTION REQUIRED: pendingOwner must call CipherGift.acceptOwnership()");
            console.log("                 before the deployer EOA's privileges are revoked.");
        }
    }
}

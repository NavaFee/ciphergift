// SPDX-License-Identifier: BSD-3-Clause-Clear
pragma solidity ^0.8.27;

import {euint64} from "@fhevm/solidity/lib/FHE.sol";

/// @title  IConfidentialVault
/// @notice Minimal encrypted-balance interface used by CipherGift.
///         ETH and ERC-20 vaults can share the same packet accounting
///         because CipherGift only moves encrypted units; asset-specific
///         deposits, withdrawals, and decimal scaling stay inside each vault.
interface IConfidentialVault {
    function balanceOf(address user) external view returns (euint64);
    function hasPendingWithdrawal(address user) external view returns (bool);
    function internalDebit(address from, euint64 amount) external;
    function internalCredit(address to, euint64 amount) external;
    function internalTransfer(address from, address to, euint64 amount) external;
}

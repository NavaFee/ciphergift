"use client";

import { useChainId } from "wagmi";
import { ConfidentialETHVault } from "~~/contracts/ConfidentialETHVault";
import { deploymentFor } from "~~/utils/contract";

/**
 * Resolves the deployed ConfidentialETHVault for the current chain.
 * Returns `undefined` if the vault has not been deployed on the
 * connected chain (e.g. local FHEVM after a fresh clone before
 * `pnpm deploy:localhost`).
 */
export function useCipherGiftVault() {
  const chainId = useChainId();
  const deployment = deploymentFor(ConfidentialETHVault, chainId);
  if (!deployment) return undefined;
  return {
    address: deployment.address,
    abi: deployment.abi,
    chainId,
    deployedOnBlock: deployment.deployedOnBlock,
  };
}

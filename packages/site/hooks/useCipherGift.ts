"use client";

import { useChainId } from "wagmi";
import { CipherGift } from "~~/contracts/CipherGift";
import { deploymentFor } from "~~/utils/contract";

/**
 * Resolves the deployed CipherGift for the current chain. Returns
 * `undefined` until `pnpm deploy:localhost` or `pnpm deploy:sepolia`
 * populates the address book.
 */
export function useCipherGift() {
  const chainId = useChainId();
  const deployment = deploymentFor(CipherGift, chainId);
  if (!deployment) return undefined;
  return {
    address: deployment.address,
    abi: deployment.abi,
    chainId,
    deployedOnBlock: deployment.deployedOnBlock,
  };
}

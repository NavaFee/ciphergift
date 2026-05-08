"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useCipherGiftVault } from "./useCipherGiftVault";
import { useAllow, useIsAllowed, useUserDecrypt } from "@zama-fhe/react-sdk";
import { type Abi, type Address, parseAbi } from "viem";
import { useAccount, useChainId, useReadContract } from "wagmi";
import { classifyFheError } from "~~/lib/fhe-errors";
import { captureError, trackEvent } from "~~/services/observability";

const ZERO_HANDLE = "0x0000000000000000000000000000000000000000000000000000000000000000";

export const CONFIDENTIAL_VAULT_BALANCE_ABI = parseAbi([
  "function balanceOf(address user) view returns (bytes32)",
] as const);

export interface VaultBalanceTarget {
  address: Address;
  abi?: Abi;
  chainId?: number;
}

/**
 * Reads the caller's encrypted vault balance (a `euint64` handle), and
 * exposes a `decrypt()` action that runs the EIP-712-gated user-decrypt
 * flow to reveal the cleartext gwei units.
 *
 * The encrypted handle changes whenever the vault mutates the user's
 * balance (deposit / withdraw / packet flow), so consumers can re-render
 * the cipher mosaic against the latest ciphertext without manual cache
 * invalidation.
 */
export function useUserBalance(vaultOverride?: VaultBalanceTarget) {
  const { address } = useAccount();
  const chainId = useChainId();
  const defaultVault = useCipherGiftVault();
  const vault = useMemo(() => {
    if (!vaultOverride) return defaultVault;
    return {
      address: vaultOverride.address,
      abi: vaultOverride.abi ?? CONFIDENTIAL_VAULT_BALANCE_ABI,
      chainId: vaultOverride.chainId ?? chainId,
      deployedOnBlock: 0,
    };
  }, [chainId, defaultVault, vaultOverride]);

  const read = useReadContract({
    address: vault?.address,
    abi: vault?.abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(vault && address) },
  });

  const handle = useMemo(() => {
    const data = read.data as `0x${string}` | undefined;
    if (!data || data === ZERO_HANDLE) return undefined;
    return data;
  }, [read.data]);

  // useIsAllowed requires a non-empty tuple of contract addresses; gate the
  // call by passing a stable single-address tuple only when the vault is
  // resolved, and disable the query otherwise.
  const allowQuery = useIsAllowed({
    contractAddresses: vault ? [vault.address] : ["0x0000000000000000000000000000000000000000"],
  });
  const isAllowed = Boolean(vault && allowQuery.data);

  const { mutate: requestAllow, isPending: isAllowing } = useAllow();

  const [decryptEnabled, setDecryptEnabled] = useState(false);

  const decryptInputs = useMemo(
    () => (handle && vault ? [{ handle, contractAddress: vault.address }] : []),
    [handle, vault],
  );

  const decrypt = useUserDecrypt(
    { handles: decryptInputs },
    { enabled: decryptEnabled && isAllowed && decryptInputs.length > 0 },
  );
  const decryptError = (decrypt as { error?: unknown }).error;

  const cleartext = useMemo(() => {
    const map = decrypt.data;
    if (!map || !handle) return undefined;
    const raw = (map as Record<string, bigint | string | undefined>)[handle];
    if (raw === undefined) return undefined;
    return BigInt(raw as string | bigint);
  }, [decrypt.data, handle]);

  const decryptBalance = useCallback(() => {
    if (!vault) return;
    if (!isAllowed) {
      requestAllow([vault.address]);
      return;
    }
    trackEvent("vault_decrypt_start", { wallet: address, chainId: vault.chainId, vault: vault.address });
    setDecryptEnabled(true);
  }, [address, vault, isAllowed, requestAllow]);

  useEffect(() => {
    if (!decryptError) return;
    const info = classifyFheError(decryptError);
    captureError(decryptError, { flow: "vault_decrypt", kind: info.kind, wallet: address });
  }, [address, decryptError]);

  const refetch = useCallback(() => {
    setDecryptEnabled(false);
    return read.refetch();
  }, [read]);

  return {
    vault,
    address,
    handle,
    isAllowed,
    isAllowing,
    isDecrypting: decrypt.isFetching || decrypt.isLoading,
    cleartextUnits: cleartext,
    decryptBalance,
    refetch,
  };
}

"use client";

import { useCallback, useMemo, useState } from "react";
import { useCipherGift } from "./useCipherGift";
import { useAllow, useIsAllowed, useUserDecrypt } from "@zama-fhe/react-sdk";
import { useReadContract } from "wagmi";

const ZERO_HANDLE = "0x0000000000000000000000000000000000000000000000000000000000000000";

/**
 * Lets a claimant decrypt their own share for a given packet by reading
 * `claimedAmount(id, me)` and running the SDK allow + userDecrypt round
 * trip — same pattern as `useDecryptPacketTotal`, but for the per-user
 * handle instead of the creator's total / remaining.
 *
 * Used by `/history` to power the "+0.0123 ETH" reveal next to each row
 * the user claimed.
 */
export function useDecryptMyClaim(packetId: bigint | undefined, me: `0x${string}` | undefined) {
  const wrap = useCipherGift();

  const handleRead = useReadContract({
    address: wrap?.address,
    abi: wrap?.abi,
    functionName: "claimedAmount",
    args: packetId !== undefined && me ? [packetId, me] : undefined,
    query: { enabled: Boolean(wrap && packetId !== undefined && me) },
  });

  const handle = useMemo(() => {
    const raw = handleRead.data as `0x${string}` | undefined;
    if (!raw || raw === ZERO_HANDLE) return undefined;
    return raw;
  }, [handleRead.data]);

  const allowQuery = useIsAllowed({
    contractAddresses: wrap ? [wrap.address] : ["0x0000000000000000000000000000000000000000"],
  });
  const isAllowed = Boolean(wrap && allowQuery.data);
  const { mutate: requestAllow, isPending: isAllowing } = useAllow();

  const [decryptEnabled, setDecryptEnabled] = useState(false);

  const decryptInputs = useMemo(
    () => (handle && wrap ? [{ handle, contractAddress: wrap.address }] : []),
    [handle, wrap],
  );

  const decrypt = useUserDecrypt(
    { handles: decryptInputs },
    { enabled: decryptEnabled && isAllowed && decryptInputs.length > 0 },
  );

  const cleartextUnits = useMemo(() => {
    const map = decrypt.data;
    if (!map || !handle) return undefined;
    const raw = (map as Record<string, bigint | string | undefined>)[handle];
    if (raw === undefined) return undefined;
    return BigInt(raw as string | bigint);
  }, [decrypt.data, handle]);

  const decryptShare = useCallback(() => {
    if (!wrap) return;
    if (!isAllowed) {
      requestAllow([wrap.address]);
      return;
    }
    setDecryptEnabled(true);
  }, [wrap, isAllowed, requestAllow]);

  return {
    cleartextUnits,
    decryptShare,
    isAllowed,
    isAllowing,
    isDecrypting: decrypt.isFetching || decrypt.isLoading,
    canDecrypt: Boolean(handle),
  };
}

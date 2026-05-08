"use client";

import { useCallback, useMemo, useState } from "react";
import { useCipherGift } from "./useCipherGift";
import { useAllow, useIsAllowed, useUserDecrypt } from "@zama-fhe/react-sdk";
import { useReadContract } from "wagmi";
import { type PacketTypeValue } from "~~/lib/packet-types";

const ZERO_HANDLE = "0x0000000000000000000000000000000000000000000000000000000000000000";

/**
 * Lets the packet creator decrypt the original total deposited.
 *
 * Strategy:
 *   • EQUAL / TARGETED — read `getEqualShare(id)` (which is FHE.allow'd to
 *     the creator at creation), decrypt, and multiply by the plaintext
 *     `totalShares`. Works regardless of how many claims have happened.
 *   • RANDOM           — there's no equalShare to read, so we fall back to
 *     `getRemainingAmount(id)`. The handle is FHE.allow'd to the creator
 *     starting from the first claim; before any claim happens it stays
 *     accessible only via the implicit `allowThis` grant, which means a
 *     RANDOM packet's "total" reveal is gated until ≥1 claimer triggers
 *     the post-claim re-allow. After that it shows the residual, not the
 *     original total — but per-share amounts are intentionally hidden in
 *     RANDOM, so this is the cleanest creator-side view.
 */
export function useDecryptPacketTotal(
  packetId: bigint | undefined,
  packetType: PacketTypeValue | undefined,
  totalShares: number | undefined,
) {
  const wrap = useCipherGift();
  const isRandom = packetType === 0;

  const handleRead = useReadContract({
    address: wrap?.address,
    abi: wrap?.abi,
    functionName: isRandom ? "getRemainingAmount" : "getEqualShare",
    args: packetId !== undefined ? [packetId] : undefined,
    query: {
      enabled: Boolean(wrap && packetId !== undefined && packetType !== undefined),
    },
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
    const base = BigInt(raw as string | bigint);
    if (!isRandom && totalShares !== undefined) return base * BigInt(totalShares);
    return base;
  }, [decrypt.data, handle, isRandom, totalShares]);

  const decryptTotal = useCallback(() => {
    if (!wrap) return;
    if (!isAllowed) {
      requestAllow([wrap.address]);
      return;
    }
    setDecryptEnabled(true);
  }, [wrap, isAllowed, requestAllow]);

  return {
    cleartextUnits,
    decryptTotal,
    isAllowed,
    isAllowing,
    isDecrypting: decrypt.isFetching || decrypt.isLoading,
    canDecrypt: Boolean(handle),
    /** True for RANDOM packets that haven't received their first claim yet — UI should explain. */
    isRandomBlocked: isRandom && !handle,
    /** "Total" for EQUAL/TARGETED, "Remaining" for RANDOM (since per-share stays encrypted). */
    label: isRandom ? "Remaining" : "Total",
  };
}

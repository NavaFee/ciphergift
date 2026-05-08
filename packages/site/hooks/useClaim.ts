"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useCipherGift } from "./useCipherGift";
import { useAllow, useIsAllowed, useUserDecrypt } from "@zama-fhe/react-sdk";
import { useAccount, usePublicClient, useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { classifyFheError } from "~~/lib/fhe-errors";
import { captureError, trackEvent } from "~~/services/observability";

const ZERO_HANDLE = "0x0000000000000000000000000000000000000000000000000000000000000000";

export type ClaimPhase = "idle" | "submitting" | "confirming" | "decrypting" | "done" | "error";

/**
 * Per-invitee Merkle proof material for TARGETED packets — distributed
 * off-chain via the share link's URL fragment. Pass `undefined` for
 * EQUAL/RANDOM packets (the hook will route to plain `claim`).
 */
export interface TargetedProof {
  salt: `0x${string}`;
  /** Position in the on-chain slot ciphertext array. The contract uses
   *  this to look up the recipient's pre-encrypted amount. */
  slotIndex: number;
  proof: `0x${string}`[];
}

interface UseClaimResult {
  phase: ClaimPhase;
  errorMessage?: string;
  /** Decrypted share in vault units (gwei) once `phase === "done"`. */
  cleartextUnits?: bigint;
  /** Trigger the claim tx + post-confirmation decrypt. Idempotent. */
  claim: (password?: string) => Promise<void>;
  /** Reset to "idle" so the modal can replay. */
  reset: () => void;
}

/**
 * Full claim flow for a single packet:
 *   1. writeContract('claim', [id])
 *   2. waitForReceipt
 *   3. read claimedAmount[id][me] handle from chain
 *   4. ensure isAllowed(CipherGift), else useAllow
 *   5. useUserDecrypt → exact share
 *
 * The OpenModal animation states ("shaking", "decrypting", "done")
 * map onto the `phase` here; `cleartextUnits` is what the modal
 * displays in the +amount reveal.
 */
export function useClaim(packetId: bigint | undefined, targeted?: TargetedProof): UseClaimResult {
  const { address } = useAccount();
  const wrap = useCipherGift();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const [phase, setPhase] = useState<ClaimPhase>("idle");
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const [pendingHash, setPendingHash] = useState<`0x${string}` | undefined>();
  const [decryptEnabled, setDecryptEnabled] = useState(false);

  const receipt = useWaitForTransactionReceipt({ hash: pendingHash, pollingInterval: 2_000 });

  // After confirmation, query claimedAmount[id][me] to grab the share handle.
  const claimedRead = useReadContract({
    address: wrap?.address,
    abi: wrap?.abi,
    functionName: "claimedAmount",
    args: address && packetId !== undefined ? [packetId, address] : undefined,
    query: {
      enabled: Boolean(wrap && address && packetId !== undefined && phase === "decrypting"),
    },
  });

  const handle = useMemo(() => {
    const raw = claimedRead.data as `0x${string}` | undefined;
    if (!raw || raw === ZERO_HANDLE) return undefined;
    return raw;
  }, [claimedRead.data]);

  // Allow + decrypt the share handle.
  const allowQuery = useIsAllowed({
    contractAddresses: wrap ? [wrap.address] : ["0x0000000000000000000000000000000000000000"],
  });
  const isAllowed = Boolean(wrap && allowQuery.data);
  const { mutate: requestAllow, isPending: isAllowing } = useAllow();

  const decryptInputs = useMemo(
    () => (handle && wrap ? [{ handle, contractAddress: wrap.address }] : []),
    [handle, wrap],
  );

  const decrypt = useUserDecrypt(
    { handles: decryptInputs },
    { enabled: decryptEnabled && isAllowed && decryptInputs.length > 0 },
  );
  const decryptError = (decrypt as { error?: unknown }).error;

  const cleartextUnits = useMemo(() => {
    const map = decrypt.data;
    if (!map || !handle) return undefined;
    const raw = (map as Record<string, bigint | string | undefined>)[handle];
    if (raw === undefined) return undefined;
    return BigInt(raw as string | bigint);
  }, [decrypt.data, handle]);

  useEffect(() => {
    if (phase !== "decrypting" || !decryptError) return;
    const info = classifyFheError(decryptError);
    setErrorMessage(info.message);
    captureError(decryptError, {
      flow: "claim_decrypt",
      kind: info.kind,
      packetId: packetId?.toString(),
      wallet: address,
    });
    setPhase("error");
  }, [address, decryptError, packetId, phase]);

  // Once tx confirms, advance to decrypting.
  useEffect(() => {
    if (receipt.isSuccess && phase === "confirming") {
      setPhase("decrypting");
    }
  }, [receipt.isSuccess, phase]);

  // Once we have a handle and allow has been granted, kick off decrypt query.
  useEffect(() => {
    if (phase !== "decrypting" || !wrap) return;
    if (!handle) return; // still fetching claimedAmount
    if (!isAllowed) {
      if (!isAllowing) requestAllow([wrap.address]);
      return;
    }
    setDecryptEnabled(true);
  }, [phase, wrap, handle, isAllowed, isAllowing, requestAllow]);

  // Once decrypted, mark done.
  useEffect(() => {
    if (phase === "decrypting" && cleartextUnits !== undefined) {
      trackEvent("claim_done", { wallet: address, packetId: packetId?.toString() });
      setPhase("done");
    }
  }, [address, packetId, phase, cleartextUnits]);

  const claim = useCallback(
    async (password?: string) => {
      if (!wrap || packetId === undefined) {
        setErrorMessage("Wallet or contract not ready");
        setPhase("error");
        return;
      }
      try {
        setPhase("submitting");
        trackEvent("claim_start", {
          wallet: address,
          packetId: packetId.toString(),
          targeted: Boolean(targeted),
          password: Boolean(password),
        });
        // Pre-flight simulate so duplicate-claim / not-allowlisted / expired
        // reverts surface as real custom-error messages instead of the
        // wallet's misleading "gas limit too high" wrapper.
        //
        // The branches are spelled out per-functionName because wagmi's typed
        // `simulateContract` / `writeContract` collapse a union of differently-
        // shaped `args` tuples to the most-specific tuple, breaking type
        // checking — we keep each branch homogeneous so the type narrows.
        let hash: `0x${string}`;
        if (targeted) {
          const callConfig = {
            address: wrap.address,
            abi: wrap.abi,
            functionName: "claimTargeted",
            args: [packetId, targeted.salt, targeted.slotIndex, targeted.proof],
          } as const;
          if (publicClient && address) {
            await publicClient.simulateContract({ ...callConfig, account: address });
          }
          hash = await writeContractAsync(callConfig);
        } else if (password) {
          const callConfig = {
            address: wrap.address,
            abi: wrap.abi,
            functionName: "claimWithPassword",
            args: [packetId, password],
          } as const;
          if (publicClient && address) {
            await publicClient.simulateContract({ ...callConfig, account: address });
          }
          hash = await writeContractAsync(callConfig);
        } else {
          const callConfig = {
            address: wrap.address,
            abi: wrap.abi,
            functionName: "claim",
            args: [packetId],
          } as const;
          if (publicClient && address) {
            await publicClient.simulateContract({ ...callConfig, account: address });
          }
          hash = await writeContractAsync(callConfig);
        }
        setPendingHash(hash);
        setPhase("confirming");
      } catch (err) {
        const info = classifyFheError(err);
        setErrorMessage(info.message);
        captureError(err, { flow: "claim", kind: info.kind, packetId: packetId.toString(), wallet: address });
        setPhase("error");
      }
    },
    [wrap, packetId, targeted, writeContractAsync, address, publicClient],
  );

  const reset = useCallback(() => {
    setPhase("idle");
    setPendingHash(undefined);
    setDecryptEnabled(false);
    setErrorMessage(undefined);
  }, []);

  return { phase, errorMessage, cleartextUnits, claim, reset };
}

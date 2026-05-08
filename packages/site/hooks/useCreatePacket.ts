"use client";

import { useCallback, useEffect, useState } from "react";
import { useCipherGift } from "./useCipherGift";
import { useEncrypt } from "@zama-fhe/react-sdk";
import { type Address, bytesToHex } from "viem";
import { useAccount, usePublicClient, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { classifyFheError } from "~~/lib/fhe-errors";
import { PacketType, type PacketTypeValue } from "~~/lib/packet-types";
import { captureError, trackEvent } from "~~/services/observability";

export interface CreatePacketDraft {
  totalUnits: bigint; // gwei units
  totalShares: number;
  packetType: PacketTypeValue;
  expirySecs: number;
  /** RANDOM only: plaintext upper bound for each random share. */
  maxShareScalar: bigint;
  /**
   * TARGETED only: bytes32 Merkle root over `(salt, address, slotIndex)`
   * leaves. Built off-chain via `lib/allowlist.buildAllowlist`. Set to
   * the zero hash for non-TARGETED packets.
   */
  allowlistRoot: `0x${string}`;
  /**
   * TARGETED only: per-slot amounts in vault units. The array order is the
   * `slotIndex` baked into each Merkle leaf — these get batch-encrypted
   * alongside `totalUnits` so the contract sees ciphertexts only.
   */
  slotAmounts?: bigint[];
  /** Optional asset vault address. Omit for the default cETH path. */
  assetId?: Address;
  assetSymbol?: string;
  /** PASSWORD packets only: keccak256(bytes(password)). */
  passwordHash?: `0x${string}`;
  note: string;
}

export type CreateStep =
  | { name: "idle" }
  | { name: "encrypting"; detail: string }
  | { name: "submitting"; detail: string }
  | { name: "confirming"; detail: string; hash: `0x${string}` }
  | { name: "done"; hash: `0x${string}` }
  | { name: "error"; message: string };

/**
 * Orchestrates the full create-packet flow:
 *   1. Encrypt the total amount under FHE
 *   2. Write the on-chain createPacket(...) call
 *   3. Wait for the receipt → return the new packet ID
 *
 * Each transition exposes a `step` value the SigningModal renders as a
 * progress checklist.
 */
export function useCreatePacket() {
  const { address } = useAccount();
  const wrap = useCipherGift();
  const publicClient = usePublicClient();
  const encrypt = useEncrypt();
  const { writeContractAsync } = useWriteContract();

  const [step, setStep] = useState<CreateStep>({ name: "idle" });
  const [pendingHash, setPendingHash] = useState<`0x${string}` | undefined>();

  const receipt = useWaitForTransactionReceipt({ hash: pendingHash, pollingInterval: 2_000 });

  const submit = useCallback(
    async (draft: CreatePacketDraft) => {
      if (!wrap || !address) {
        setStep({ name: "error", message: "Wallet or contract not ready" });
        return;
      }
      try {
        const isTargeted = draft.packetType === PacketType.TARGETED;
        if (isTargeted && (!draft.slotAmounts || draft.slotAmounts.length !== draft.totalShares)) {
          setStep({ name: "error", message: "TARGETED packet requires one encrypted amount per recipient" });
          return;
        }
        setStep({
          name: "encrypting",
          detail: isTargeted
            ? `tfhe.encrypt(total + ${draft.slotAmounts!.length} slot amounts) → ciphertexts`
            : "tfhe.encrypt(total) → ciphertext",
        });
        trackEvent("send_start", {
          wallet: address,
          packetType: draft.packetType,
          totalShares: draft.totalShares,
          asset: draft.assetSymbol ?? "cETH",
        });
        // Single batched input: total at index 0; for TARGETED, slot amounts
        // at indices 1..N. The FHEVM SDK returns one shared inputProof
        // covering every handle, so the on-chain `FHE.fromExternal` calls
        // all reference the same proof bytes.
        const encryptValues: { value: bigint; type: "euint64" }[] = [{ value: draft.totalUnits, type: "euint64" }];
        if (isTargeted) {
          for (const amount of draft.slotAmounts!) encryptValues.push({ value: amount, type: "euint64" });
        }
        const enc = await encrypt.mutateAsync({
          values: encryptValues,
          contractAddress: wrap.address,
          userAddress: address,
        });
        const totalHandle = bytesToHex(enc.handles[0]!);
        const proof = bytesToHex(enc.inputProof);
        const slotHandles = isTargeted ? draft.slotAmounts!.map((_, i) => bytesToHex(enc.handles[i + 1]!)) : undefined;

        setStep({ name: "submitting", detail: "signTypedData(...) → wallet sign" });
        // Each branch builds a homogeneous `callConfig` and runs the simulate
        // + write inline. We can't construct a union of differently-shaped
        // `args` tuples upfront because wagmi's typed entry points collapse
        // it to the most-specific tuple, breaking type checking.
        //
        // Pre-flight simulate so EmptyShareCount / ExpiryInPast / NoteTooLong
        // / Paused / AssetVaultNotRegistered surface as real revert reasons
        // instead of the wallet's "gas limit too high" envelope.
        const baseAddress = wrap.address;
        const baseAbi = wrap.abi;
        let hash: `0x${string}`;
        if (isTargeted) {
          if (draft.assetId) {
            const cfg = {
              address: baseAddress,
              abi: baseAbi,
              functionName: "createTargetedPacketWithAsset",
              args: [
                draft.assetId,
                totalHandle,
                slotHandles!,
                proof,
                draft.expirySecs,
                draft.allowlistRoot,
                draft.note,
              ],
            } as const;
            if (publicClient && address) {
              await publicClient.simulateContract({ ...cfg, account: address });
            }
            hash = await writeContractAsync(cfg);
          } else {
            const cfg = {
              address: baseAddress,
              abi: baseAbi,
              functionName: "createTargetedPacket",
              args: [totalHandle, slotHandles!, proof, draft.expirySecs, draft.allowlistRoot, draft.note],
            } as const;
            if (publicClient && address) {
              await publicClient.simulateContract({ ...cfg, account: address });
            }
            hash = await writeContractAsync(cfg);
          }
        } else if (draft.passwordHash) {
          if (draft.assetId) {
            const cfg = {
              address: baseAddress,
              abi: baseAbi,
              functionName: "createPasswordPacketWithAsset",
              args: [
                draft.assetId,
                totalHandle,
                proof,
                draft.totalShares,
                draft.expirySecs,
                draft.passwordHash,
                draft.note,
              ],
            } as const;
            if (publicClient && address) {
              await publicClient.simulateContract({ ...cfg, account: address });
            }
            hash = await writeContractAsync(cfg);
          } else {
            const cfg = {
              address: baseAddress,
              abi: baseAbi,
              functionName: "createPasswordPacket",
              args: [totalHandle, proof, draft.totalShares, draft.expirySecs, draft.passwordHash, draft.note],
            } as const;
            if (publicClient && address) {
              await publicClient.simulateContract({ ...cfg, account: address });
            }
            hash = await writeContractAsync(cfg);
          }
        } else if (draft.assetId) {
          const cfg = {
            address: baseAddress,
            abi: baseAbi,
            functionName: "createPacketWithAsset",
            args: [
              draft.assetId,
              draft.packetType,
              totalHandle,
              proof,
              draft.totalShares,
              draft.expirySecs,
              draft.maxShareScalar,
              draft.allowlistRoot,
              draft.note,
            ],
          } as const;
          if (publicClient && address) {
            await publicClient.simulateContract({ ...cfg, account: address });
          }
          hash = await writeContractAsync(cfg);
        } else {
          const cfg = {
            address: baseAddress,
            abi: baseAbi,
            functionName: "createPacket",
            args: [
              draft.packetType,
              totalHandle,
              proof,
              draft.totalShares,
              draft.expirySecs,
              draft.maxShareScalar,
              draft.allowlistRoot,
              draft.note,
            ],
          } as const;
          if (publicClient && address) {
            await publicClient.simulateContract({ ...cfg, account: address });
          }
          hash = await writeContractAsync(cfg);
        }
        setPendingHash(hash);
        setStep({ name: "confirming", detail: `tx → ${hash.slice(0, 10)}…`, hash });
      } catch (err) {
        const info = classifyFheError(err);
        captureError(err, {
          flow: "create_packet",
          kind: info.kind,
          wallet: address,
          packetType: draft.packetType,
          asset: draft.assetSymbol ?? "cETH",
        });
        setStep({ name: "error", message: info.message });
      }
    },
    [wrap, address, encrypt, writeContractAsync, publicClient],
  );

  useEffect(() => {
    if (receipt.isSuccess && pendingHash && step.name === "confirming") {
      trackEvent("send_done", { wallet: address, txHash: pendingHash });
      setStep({ name: "done", hash: pendingHash });
    }
  }, [address, receipt.isSuccess, pendingHash, step.name]);

  const reset = useCallback(() => {
    setStep({ name: "idle" });
    setPendingHash(undefined);
  }, []);

  return { step, submit, reset, receipt };
}

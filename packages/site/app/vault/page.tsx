"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { usePublicDecrypt } from "@zama-fhe/react-sdk";
import { toast } from "react-hot-toast";
import { formatGwei, parseEther } from "viem";
import { useAccount, usePublicClient, useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { AppChrome } from "~~/components/chrome/AppChrome";
import { SideNav } from "~~/components/chrome/SideNav";
import { Btn } from "~~/components/primitives/Btn";
import { Cipher } from "~~/components/primitives/Cipher";
import { LockIcon, UnlockIcon, ZapIcon } from "~~/components/primitives/icons";
import { useUserBalance } from "~~/hooks/useUserBalance";
import { explainContractError } from "~~/lib/explain-error";

/**
 * User-facing vault page for `ConfidentialETHVault`. Covers the full
 * deposit/withdraw lifecycle:
 *   1. Deposit a plaintext ETH amount → encrypted balance grows
 *   2. Read the encrypted handle (cipher mosaic)
 *   3. Click "Decrypt" → EIP-712 sign → reveal exact gwei units
 *   4. `requestWithdraw()` flags the balance for public decryption and
 *      records a pending request
 *   5. `usePublicDecrypt(handle)` round-trips through the relayer/gateway,
 *      then `fulfillWithdraw(reqId, ...)` verifies the KMS proof on-chain
 *      and releases real ETH
 *
 * `Cancel` is exposed as the gateway-timeout escape hatch (5m default).
 */
export default function VaultPage() {
  const { address, isConnected } = useAccount();
  const router = useRouter();
  const balance = useUserBalance();
  const publicClient = usePublicClient();
  const { writeContractAsync, isPending: isWriting } = useWriteContract();
  const [pendingHash, setPendingHash] = useState<`0x${string}` | undefined>();
  const receipt = useWaitForTransactionReceipt({ hash: pendingHash, pollingInterval: 2_000 });

  const [depositInput, setDepositInput] = useState("0.01");
  const publicDecrypt = usePublicDecrypt();

  useEffect(() => {
    if (!isConnected) router.replace("/");
  }, [isConnected, router]);

  // Pending withdrawal id for the connected user.
  const pendingIdRead = useReadContract({
    address: balance.vault?.address,
    abi: balance.vault?.abi,
    functionName: "pendingWithdrawalIdOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(balance.vault && address) },
  });
  const pendingId = (pendingIdRead.data as bigint | undefined) ?? 0n;
  const isPending = pendingId !== 0n;

  // Pending withdrawal struct (user, requestedAt, balanceHandle).
  const pendingStructRead = useReadContract({
    address: balance.vault?.address,
    abi: balance.vault?.abi,
    functionName: "pendingWithdrawals",
    args: pendingId !== 0n ? [pendingId] : undefined,
    query: { enabled: Boolean(balance.vault && pendingId !== 0n) },
  });
  const pendingStruct = pendingStructRead.data as readonly [`0x${string}`, bigint, `0x${string}`] | undefined;
  const pendingHandle = pendingStruct?.[2];
  const requestedAt = pendingStruct ? Number(pendingStruct[1]) : undefined;

  const cancelDelayRead = useReadContract({
    address: balance.vault?.address,
    abi: balance.vault?.abi,
    functionName: "CANCEL_DELAY",
    query: { enabled: Boolean(balance.vault) },
  });
  const cancelDelay = (cancelDelayRead.data as bigint | undefined) ?? 300n;
  const cancelableAt = useMemo(
    () => (requestedAt !== undefined ? requestedAt + Number(cancelDelay) : undefined),
    [requestedAt, cancelDelay],
  );

  // Drive the balance refetch + pending state refetch after every tx.
  // Replace the in-flight loading toast (id "tx" or "fulfill") with a
  // success — without explicit dismiss the spinner outlives the tx.
  useEffect(() => {
    if (receipt.isSuccess && pendingHash) {
      balance.refetch();
      pendingIdRead.refetch();
      pendingStructRead.refetch();
      setPendingHash(undefined);
      toast.dismiss("tx");
      toast.dismiss("fulfill");
      toast.success("Vault state updated");
    }
  }, [receipt.isSuccess, pendingHash, balance, pendingIdRead, pendingStructRead]);

  const onDeposit = async () => {
    if (!balance.vault) {
      toast.error("Vault not deployed on this chain");
      return;
    }
    let weiAmount: bigint;
    try {
      weiAmount = parseEther(depositInput);
    } catch {
      toast.error("Invalid amount");
      return;
    }
    if (weiAmount === 0n) {
      toast.error("Amount must be > 0");
      return;
    }
    if (weiAmount % BigInt(1e9) !== 0n) {
      toast.error("Must be gwei-aligned");
      return;
    }
    try {
      const callConfig = {
        address: balance.vault.address,
        abi: balance.vault.abi,
        functionName: "depositETH",
        value: weiAmount,
        args: [],
      } as const;
      if (publicClient && address) {
        await publicClient.simulateContract({ ...callConfig, account: address });
      }
      const hash = await writeContractAsync(callConfig);
      setPendingHash(hash);
      toast.loading("Confirming deposit…", { id: "tx" });
    } catch (err) {
      toast.error(explainContractError(err));
    }
  };

  const onRequestWithdraw = async () => {
    if (!balance.vault) {
      toast.error("Vault not deployed");
      return;
    }
    if (!balance.handle) {
      toast.error("Nothing to withdraw");
      return;
    }
    try {
      if (publicClient && address) {
        await publicClient.simulateContract({
          address: balance.vault.address,
          abi: balance.vault.abi,
          functionName: "requestWithdraw",
          args: [],
          account: address,
        });
      }
      const hash = await writeContractAsync({
        address: balance.vault.address,
        abi: balance.vault.abi,
        functionName: "requestWithdraw",
        args: [],
      });
      setPendingHash(hash);
      toast.loading("Submitting withdrawal request…", { id: "tx" });
    } catch (err) {
      toast.error(explainContractError(err));
    }
  };

  const onFulfillWithdraw = async () => {
    if (!balance.vault || pendingId === 0n || !pendingHandle) {
      toast.error("No pending request");
      return;
    }
    toast.loading("Asking gateway to decrypt balance…", { id: "fulfill" });
    try {
      const result = await publicDecrypt.mutateAsync([pendingHandle]);
      // KMS signs this exact byte string. Re-encoding `clearValues` changes
      // the digest and makes `FHE.checkSignatures` recover a non-KMS signer.
      const abiEncoded = result.abiEncodedClearValues;
      const proof = result.decryptionProof;
      // Pre-flight simulate so revert reasons surface as real custom-error
      // messages rather than the wallet's misleading "gas limit too high".
      if (publicClient && address) {
        await publicClient.simulateContract({
          address: balance.vault.address,
          abi: balance.vault.abi,
          functionName: "fulfillWithdraw",
          args: [pendingId, abiEncoded, proof],
          account: address,
        });
      }
      const hash = await writeContractAsync({
        address: balance.vault.address,
        abi: balance.vault.abi,
        functionName: "fulfillWithdraw",
        args: [pendingId, abiEncoded, proof],
      });
      setPendingHash(hash);
      toast.loading("Confirming fulfillment…", { id: "fulfill" });
    } catch (err) {
      toast.dismiss("fulfill");
      toast.error(explainContractError(err));
    }
  };

  const onCancelWithdraw = async () => {
    if (!balance.vault || pendingId === 0n) {
      toast.error("No pending request");
      return;
    }
    try {
      if (publicClient && address) {
        await publicClient.simulateContract({
          address: balance.vault.address,
          abi: balance.vault.abi,
          functionName: "cancelWithdrawRequest",
          args: [pendingId],
          account: address,
        });
      }
      const hash = await writeContractAsync({
        address: balance.vault.address,
        abi: balance.vault.abi,
        functionName: "cancelWithdrawRequest",
        args: [pendingId],
      });
      setPendingHash(hash);
      toast.loading("Cancelling…", { id: "tx" });
    } catch (err) {
      toast.error(explainContractError(err));
    }
  };

  // Re-render every 30s so the cancel countdown ticks down without
  // requiring user interaction.
  const [nowSecs, setNowSecs] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNowSecs(Math.floor(Date.now() / 1000)), 30_000);
    return () => clearInterval(t);
  }, []);

  if (!isConnected) return null;

  const cleartextEth = balance.cleartextUnits === undefined ? null : formatGwei(balance.cleartextUnits);

  const canCancel = cancelableAt !== undefined && nowSecs >= cancelableAt;
  const cancelCountdown = (() => {
    const remaining = Math.max(0, (cancelableAt ?? 0) - nowSecs);
    if (remaining < 60) return `${remaining}s`;
    const minutes = Math.floor(remaining / 60);
    const seconds = remaining % 60;
    if (minutes < 60) return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
    const hours = Math.floor(minutes / 60);
    const restMinutes = minutes % 60;
    return restMinutes === 0 ? `${hours}h` : `${hours}h ${restMinutes}m`;
  })();

  return (
    <AppChrome sub="vault">
      <SideNav />
      <div style={{ flex: 1, minWidth: 0, overflow: "auto", padding: 28 }}>
        <div className="tick" style={{ marginBottom: 6 }}>
          VAULT · CONFIDENTIAL ETH
        </div>
        <h2
          style={{
            margin: 0,
            fontFamily: "var(--font-display)",
            fontSize: 28,
            fontWeight: 600,
            letterSpacing: "-0.02em",
            marginBottom: 24,
          }}
        >
          Wrap & unwrap encrypted ETH
        </h2>

        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 22, alignItems: "start" }}>
          {/* Encrypted balance card */}
          <div className="panel" style={{ padding: 22, position: "relative" }}>
            <div className="tick" style={{ marginBottom: 10 }}>
              YOUR ENCRYPTED BALANCE
            </div>

            {!balance.vault && (
              <div
                style={{
                  padding: 14,
                  borderRadius: 8,
                  background: "rgba(255,170,58,0.06)",
                  border: "1px solid var(--warn)",
                  color: "var(--ink-2)",
                  fontSize: 12,
                  marginBottom: 14,
                }}
              >
                Vault not deployed on this chain. Run <span className="kbd">pnpm deploy:localhost</span> or{" "}
                <span className="kbd">pnpm deploy:sepolia</span> first.
              </div>
            )}

            <div style={{ marginBottom: 18 }}>
              {balance.cleartextUnits !== undefined ? (
                <div
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 36,
                    fontWeight: 600,
                    letterSpacing: "-0.02em",
                    lineHeight: 1.1,
                    color: "var(--fhe)",
                  }}
                >
                  {cleartextEth} <span style={{ fontSize: 18, color: "var(--ink-2)" }}>ETH</span>
                </div>
              ) : balance.handle ? (
                <div
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 32,
                    fontWeight: 600,
                    letterSpacing: "-0.02em",
                  }}
                >
                  <Cipher width={140} label="enc" />
                </div>
              ) : (
                <div
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 32,
                    fontWeight: 600,
                    color: "var(--ink-3)",
                  }}
                >
                  0 ETH
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Btn
                kind="fhe"
                size="sm"
                disabled={!balance.handle || balance.isAllowing || balance.isDecrypting}
                onClick={balance.decryptBalance}
                icon={balance.cleartextUnits !== undefined ? <UnlockIcon size={12} /> : <LockIcon size={12} />}
              >
                {balance.cleartextUnits !== undefined
                  ? "Decrypted"
                  : balance.isAllowing
                    ? "Authorising…"
                    : balance.isDecrypting
                      ? "Decrypting…"
                      : balance.isAllowed
                        ? "Decrypt balance"
                        : "Authorise & decrypt"}
              </Btn>
              <Btn kind="ghost" size="sm" onClick={() => balance.refetch()}>
                Refresh handle
              </Btn>
            </div>

            <div style={{ marginTop: 18, fontSize: 11, color: "var(--ink-3)", lineHeight: 1.5 }}>
              The handle on chain is a 32-byte ciphertext. Decryption happens locally with a session keypair
              re-encrypted to your wallet via EIP-712 — the chain never sees the plaintext.
            </div>
          </div>

          {/* Deposit / withdraw */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="panel" style={{ padding: 18 }}>
              <div className="tick" style={{ marginBottom: 8 }}>
                DEPOSIT (PLAINTEXT)
              </div>
              <input
                className="cr-input mono"
                value={depositInput}
                onChange={e => setDepositInput(e.target.value)}
                placeholder="0.01"
                style={{ marginBottom: 10 }}
                disabled={isPending}
              />
              <Btn
                kind="primary"
                block
                onClick={onDeposit}
                disabled={!balance.vault || isWriting || receipt.isLoading || isPending}
                icon={<ZapIcon size={13} />}
              >
                {isWriting || receipt.isLoading ? "Submitting…" : `Deposit ${depositInput} ETH`}
              </Btn>
              <div className="tick" style={{ marginTop: 8 }}>
                ETH amount becomes encrypted gwei units (1 ETH = 1e9 units).
              </div>
            </div>

            {/* Withdrawal: idle vs pending */}
            {!isPending ? (
              <div className="panel" style={{ padding: 18 }}>
                <div className="tick" style={{ marginBottom: 8 }}>
                  WITHDRAW (TWO-PHASE)
                </div>
                <Btn
                  kind="dark"
                  block
                  onClick={onRequestWithdraw}
                  disabled={!balance.vault || !balance.handle || isWriting || receipt.isLoading}
                >
                  {isWriting || receipt.isLoading ? "Submitting…" : "Request full withdrawal"}
                </Btn>
                <div className="tick" style={{ marginTop: 8, lineHeight: 1.5 }}>
                  Step 1 publishes your encrypted balance to the gateway for KMS-signed decryption. Step 2 verifies the
                  proof on-chain and releases <span className="kbd">balance × 1 gwei</span> wei.
                  <br />
                  <span style={{ color: "var(--warn)" }}>
                    Once you request, your balance cleartext is permanently retrievable from the gateway — even if you
                    cancel.
                  </span>
                </div>
              </div>
            ) : (
              <div
                className="panel"
                style={{ padding: 18, border: "1px solid var(--warn)", background: "rgba(255,170,58,0.04)" }}
              >
                <div className="tick" style={{ marginBottom: 8, color: "var(--warn)" }}>
                  WITHDRAWAL PENDING · REQ #{pendingId.toString()}
                </div>
                <div style={{ fontSize: 12, color: "var(--ink-2)", marginBottom: 12, lineHeight: 1.5 }}>
                  Your encrypted balance has been published to the gateway. Click <em>Fulfill</em> to fetch the
                  KMS-signed proof and release ETH on-chain.
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Btn
                    kind="primary"
                    onClick={onFulfillWithdraw}
                    disabled={isWriting || receipt.isLoading || publicDecrypt.isPending}
                  >
                    {publicDecrypt.isPending
                      ? "Asking gateway…"
                      : isWriting || receipt.isLoading
                        ? "Submitting…"
                        : "Fulfill withdrawal"}
                  </Btn>
                  <Btn
                    kind="ghost"
                    onClick={onCancelWithdraw}
                    disabled={!canCancel || isWriting || receipt.isLoading}
                    title={
                      !canCancel
                        ? `Cancel becomes available 5 minutes after the request — at ${new Date((cancelableAt ?? 0) * 1000).toLocaleString()}. Cancel does not return funds; it just clears the pending state so you can re-request.`
                        : ""
                    }
                  >
                    {canCancel ? "Cancel request" : `Cancellable in ${cancelCountdown}`}
                  </Btn>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppChrome>
  );
}

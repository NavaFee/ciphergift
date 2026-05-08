"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Brackets } from "../primitives/Brackets";
import { AllowlistLinksList } from "./AllowlistLinksList";
import { SigningModal } from "./SigningModal";
import { toast } from "react-hot-toast";
import { decodeEventLog, isAddress, keccak256, parseAbiItem, stringToBytes } from "viem";
import { useAccount, useChainId, useReadContract } from "wagmi";
import { Btn } from "~~/components/primitives/Btn";
import { Cipher } from "~~/components/primitives/Cipher";
import { Coin } from "~~/components/primitives/Coin";
import { Switch } from "~~/components/primitives/Switch";
import {
  BackIcon,
  EqualIcon,
  KeyIcon,
  LockIcon,
  PlusIcon,
  ShuffleIcon,
  UserIcon,
  ZapIcon,
} from "~~/components/primitives/icons";
import { useCipherGift } from "~~/hooks/useCipherGift";
import { useCipherGiftVault } from "~~/hooks/useCipherGiftVault";
import { useCreatePacket } from "~~/hooks/useCreatePacket";
import { CONFIDENTIAL_VAULT_BALANCE_ABI, useUserBalance } from "~~/hooks/useUserBalance";
import { type AllowlistEntry, type AllowlistRecipient, buildAllowlist } from "~~/lib/allowlist";
import { saveAllowlist } from "~~/lib/allowlist-storage";
import { type AssetConfig, type AssetKey, assetOptions } from "~~/lib/assets";
import { assetToUnits, unitsToAssetLabel } from "~~/lib/format";
import { PACKET_TYPE_AVAILABLE, PACKET_TYPE_HINTS, PACKET_TYPE_LABELS, PacketType } from "~~/lib/packet-types";
import { detectWrap } from "~~/lib/wrap-detect";

const ZERO_ROOT = "0x0000000000000000000000000000000000000000000000000000000000000000" as `0x${string}`;

type TypeKey = "RANDOM" | "EQUAL" | "TARGETED" | "PASSWORD";

const TYPE_ICONS: Record<TypeKey, React.ReactNode> = {
  RANDOM: <ShuffleIcon size={14} />,
  EQUAL: <EqualIcon size={14} />,
  TARGETED: <UserIcon size={14} />,
  PASSWORD: <KeyIcon size={14} />,
};

const EXPIRY_PRESETS: Array<{ hours: number; label: string; sub: string }> = [
  { hours: 1, label: "1h", sub: "short" },
  { hours: 24, label: "1d", sub: "one day" },
  { hours: 72, label: "3d", sub: "three days" },
  { hours: 168, label: "7d", sub: "one week" },
];

export function SendWizard() {
  const { address } = useAccount();
  const chainId = useChainId();
  const router = useRouter();
  const create = useCreatePacket();
  const cipherWrap = useCipherGift();
  const defaultVault = useCipherGiftVault();
  const assets = useMemo(() => assetOptions(defaultVault?.address), [defaultVault?.address]);

  const [amount, setAmount] = useState("0.04");
  const [assetKey, setAssetKey] = useState<AssetKey>("ceth");
  const selectedAsset = useMemo(() => assets.find(a => a.key === assetKey) ?? assets[0]!, [assetKey, assets]);
  const selectedVault = useMemo(
    () =>
      selectedAsset.assetId
        ? { address: selectedAsset.assetId, abi: CONFIDENTIAL_VAULT_BALANCE_ABI, chainId }
        : undefined,
    [chainId, selectedAsset.assetId],
  );
  const balance = useUserBalance(selectedVault);
  const pausedRead = useReadContract({
    address: cipherWrap?.address,
    abi: cipherWrap?.abi,
    functionName: "paused",
    query: { enabled: Boolean(cipherWrap) },
  });
  const isPaused = pausedRead.data === true;
  const [type, setType] = useState<TypeKey>("EQUAL");
  const [count, setCount] = useState(4);
  const [password, setPassword] = useState("");
  const [recipientInput, setRecipientInput] = useState("");
  /**
   * TARGETED-only: addresses + per-recipient amounts (display units, kept
   * as strings so the input can show partial decimals while typing). Total
   * and slot count are derived from this list.
   */
  const [targetedRows, setTargetedRows] = useState<{ address: `0x${string}`; amount: string }[]>([]);
  const [uniformInput, setUniformInput] = useState("");
  const [showUniform, setShowUniform] = useState(false);
  /**
   * Allowlist entries (one per invitee) materialised at submit time so each
   * invitee gets a unique salt + Merkle proof. Rendered as a copy-each-link
   * panel after the create tx confirms.
   */
  const [allowlistEntries, setAllowlistEntries] = useState<AllowlistEntry[]>([]);
  /** Packet id parsed from the create receipt — needed to build /r/[id] links. */
  const [createdPacketId, setCreatedPacketId] = useState<bigint | undefined>();

  // Once the create tx confirms, parse the PacketCreated event to recover
  // the new packet id. Required for TARGETED so we can stitch
  // `/r/{id}#salt=...&proof=...` per invitee.
  useEffect(() => {
    if (!create.receipt.isSuccess || !create.receipt.data) return;
    if (createdPacketId !== undefined) return;
    const event = parseAbiItem(
      "event PacketCreated(uint256 indexed id, address indexed creator, uint8 ptype, uint32 totalShares, uint64 expiresAt)",
    );
    for (const log of create.receipt.data.logs) {
      try {
        const decoded = decodeEventLog({ abi: [event], data: log.data, topics: log.topics });
        if (decoded.eventName === "PacketCreated") {
          setCreatedPacketId(decoded.args.id);
          return;
        }
      } catch {
        // log isn't a PacketCreated event; skip
      }
    }
  }, [create.receipt.isSuccess, create.receipt.data, createdPacketId]);

  // Persist TARGETED salts/proofs locally so the sender can re-pull the
  // per-invitee links from `/sent/[id]` if they didn't copy them right
  // after creation. Chain only stores the Merkle root, so without this the
  // entries are lost when this component unmounts.
  useEffect(() => {
    if (createdPacketId === undefined) return;
    if (allowlistEntries.length === 0) return;
    if (!cipherWrap?.address) return;
    saveAllowlist(chainId, cipherWrap.address, createdPacketId, allowlistEntries);
  }, [createdPacketId, allowlistEntries, cipherWrap?.address, chainId]);
  const [expiryHours, setExpiryHours] = useState(24);
  const [note, setNote] = useState("Happy launch day 🎉");
  const [encryptTotal] = useState(true); // always true in v1

  const showAllowlistLinks =
    create.step.name === "done" && type === "TARGETED" && allowlistEntries.length > 0 && createdPacketId !== undefined;
  const showSigning = create.step.name !== "idle" && !showAllowlistLinks;

  /**
   * Per-row TARGETED amounts parsed into vault units. Empty / unparseable
   * rows produce `undefined` so the UI can flag them inline. Non-TARGETED
   * leaves this empty.
   */
  const targetedSlotUnits = useMemo<(bigint | undefined)[]>(() => {
    if (type !== "TARGETED") return [];
    return targetedRows.map(row => {
      const trimmed = row.amount.trim();
      if (!trimmed) return undefined;
      try {
        const u = assetToUnits(trimmed, selectedAsset.unitDecimals);
        return u > 0n ? u : undefined;
      } catch {
        return undefined;
      }
    });
  }, [type, targetedRows, selectedAsset.unitDecimals]);

  const targetedSumUnits = useMemo(() => {
    if (type !== "TARGETED") return undefined;
    let acc = 0n;
    for (const u of targetedSlotUnits) {
      if (u === undefined) return undefined;
      acc += u;
    }
    return acc;
  }, [type, targetedSlotUnits]);

  const totalUnits = useMemo(() => {
    if (type === "TARGETED") return targetedSumUnits;
    try {
      return assetToUnits(amount, selectedAsset.unitDecimals);
    } catch {
      return undefined;
    }
  }, [type, targetedSumUnits, amount, selectedAsset.unitDecimals]);

  const effectiveShareCount = type === "TARGETED" ? targetedRows.length : count;
  const isAmountValid = totalUnits !== undefined && totalUnits > 0n;
  const isCountValid = effectiveShareCount >= 1 && effectiveShareCount <= 200;
  // RANDOM doesn't require integer-divisibility (last claimer takes residual);
  // EQUAL / PASSWORD do. TARGETED has per-recipient amounts so divisibility
  // is irrelevant.
  const requiresIntegerSplit = type === "EQUAL" || type === "PASSWORD";
  const isPerShareInteger =
    !requiresIntegerSplit || (isAmountValid && isCountValid && totalUnits! % BigInt(effectiveShareCount) === 0n);
  const isAllowlistValid =
    type !== "TARGETED" ||
    (targetedRows.length > 0 && targetedRows.length <= 200 && targetedSlotUnits.every(u => u !== undefined && u > 0n));
  const isPasswordValid = type !== "PASSWORD" || password.trim().length >= 4;

  // Vault-balance gating. v1's `internalDebit` does an unchecked FHE.sub,
  // so spending more than the encrypted balance silently underflows to
  // ~2^64 gwei (~18B ETH). Block submission until we've verified there's
  // enough headroom in plaintext.
  const assetEnabled = selectedAsset.enabled && Boolean(selectedAsset.assetId);
  const wrap = detectWrap(balance.cleartextUnits);
  const hasNoVaultBalance = assetEnabled && balance.handle === undefined; // never deposited
  const balanceUnverified = assetEnabled && !hasNoVaultBalance && balance.cleartextUnits === undefined;
  const isInsufficient =
    assetEnabled &&
    !wrap.wrapped &&
    balance.cleartextUnits !== undefined &&
    isAmountValid &&
    balance.cleartextUnits < totalUnits!;
  const vaultOk = assetEnabled && !hasNoVaultBalance && !balanceUnverified && !wrap.wrapped && !isInsufficient;

  const canSubmit =
    Boolean(address) &&
    !isPaused &&
    assetEnabled &&
    isAmountValid &&
    isCountValid &&
    isPerShareInteger &&
    isAllowlistValid &&
    isPasswordValid &&
    PACKET_TYPE_AVAILABLE[type as keyof typeof PACKET_TYPE_AVAILABLE] &&
    vaultOk;

  const addRecipient = () => {
    const trimmed = recipientInput.trim();
    if (!isAddress(trimmed)) {
      toast.error("Not a valid 0x address");
      return;
    }
    if (targetedRows.some(r => r.address.toLowerCase() === trimmed.toLowerCase())) {
      toast.error("Already added");
      return;
    }
    // Pre-fill amount with the uniform-input if it parses, so adding the
    // next employee is one click instead of two.
    const seedAmount = (() => {
      const u = uniformInput.trim();
      if (!u) return "";
      try {
        if (assetToUnits(u, selectedAsset.unitDecimals) > 0n) return u;
      } catch {}
      return "";
    })();
    setTargetedRows(rows => [...rows, { address: trimmed as `0x${string}`, amount: seedAmount }]);
    setRecipientInput("");
  };

  const setUniformAmount = () => {
    const trimmed = uniformInput.trim();
    if (!trimmed) {
      toast.error("Enter an amount first");
      return;
    }
    try {
      const u = assetToUnits(trimmed, selectedAsset.unitDecimals);
      if (u <= 0n) throw new Error("must be > 0");
    } catch {
      toast.error(`Not a valid ${selectedAsset.symbol} amount`);
      return;
    }
    if (targetedRows.length === 0) {
      toast.error("Add at least one recipient first");
      return;
    }
    setTargetedRows(rows => rows.map(r => ({ ...r, amount: trimmed })));
    toast.success(`All ${targetedRows.length} rows set to ${trimmed} ${selectedAsset.symbol}`);
  };

  const onSubmit = () => {
    if (!totalUnits) {
      toast.error("Invalid amount");
      return;
    }
    if (isPaused) {
      toast.error("Gift creation is temporarily paused");
      return;
    }
    if (!assetEnabled || !selectedAsset.assetId) {
      toast.error(`${selectedAsset.symbol} vault is not configured`);
      return;
    }
    if (requiresIntegerSplit && !isPerShareInteger) {
      toast.error("Total must divide evenly by share count");
      return;
    }
    if (!isPasswordValid) {
      toast.error("Password must be at least 4 characters");
      return;
    }
    if (hasNoVaultBalance) {
      toast.error(`Deposit ${selectedAsset.symbol} into the vault first`);
      return;
    }
    if (balanceUnverified) {
      toast.error("Verify (decrypt) your vault balance before sending");
      return;
    }
    if (wrap.wrapped) {
      toast.error("Vault balance underflowed — top up to recover before sending");
      return;
    }
    if (isInsufficient) {
      toast.error("Insufficient vault balance");
      return;
    }
    // For RANDOM, cap each share at 2× the fair-share size — reveals only
    // an upper bound, not the exact total. EQUAL/TARGETED/PASSWORD leave it 0.
    const maxShareScalar = type === "RANDOM" ? (totalUnits * 2n) / BigInt(effectiveShareCount) : 0n;

    // For TARGETED, build the Merkle tree now so the per-invitee salts are
    // available to render share links once the create tx confirms.
    let allowlistRoot = ZERO_ROOT;
    let entries: AllowlistEntry[] = [];
    let slotAmounts: bigint[] | undefined;
    if (type === "TARGETED") {
      try {
        const recipients: AllowlistRecipient[] = targetedRows.map((row, i) => ({
          address: row.address,
          amount: targetedSlotUnits[i]!,
        }));
        const built = buildAllowlist(recipients);
        allowlistRoot = built.root;
        entries = built.entries;
        slotAmounts = recipients.map(r => r.amount);
      } catch (err) {
        toast.error((err as Error).message ?? "Failed to build allowlist");
        return;
      }
    }
    setAllowlistEntries(entries);

    void create.submit({
      totalUnits,
      totalShares: effectiveShareCount,
      packetType:
        type === "RANDOM"
          ? PacketType.RANDOM
          : type === "TARGETED"
            ? PacketType.TARGETED
            : type === "PASSWORD"
              ? PacketType.PASSWORD
              : PacketType.EQUAL,
      expirySecs: expiryHours * 3600,
      maxShareScalar,
      allowlistRoot,
      slotAmounts,
      assetId: selectedAsset.key === "ceth" ? undefined : selectedAsset.assetId,
      assetSymbol: selectedAsset.symbol,
      passwordHash: type === "PASSWORD" ? keccak256(stringToBytes(password.trim())) : undefined,
      note,
    });
  };

  return (
    <div style={{ flex: 1, minWidth: 0, overflow: "auto", padding: "28px 36px" }}>
      <Link
        href="/dashboard"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: 12,
          color: "var(--ink-3)",
          textDecoration: "none",
          marginBottom: 14,
        }}
      >
        <BackIcon size={12} /> Back to dashboard
      </Link>

      <div style={{ marginBottom: 22 }}>
        <div className="tick" style={{ marginBottom: 6 }}>
          NEW PACKET · CONFIDENTIAL
        </div>
        <h2
          style={{
            margin: 0,
            fontFamily: "var(--font-display)",
            fontSize: 28,
            fontWeight: 600,
            letterSpacing: "-0.02em",
          }}
        >
          Compose a confidential gift
        </h2>
      </div>

      {/* Vault balance gate — v1's encrypted FHE.sub doesn't underflow-check, so a
          send beyond the vault balance silently wraps to ~2^64 gwei. We surface
          the balance, force a one-time decrypt, and detect/explain wraps. */}
      <VaultGate
        balance={balance}
        wrap={wrap}
        asset={selectedAsset}
        hasNoVaultBalance={hasNoVaultBalance}
        balanceUnverified={balanceUnverified}
        isInsufficient={isInsufficient}
        amountLabel={amount}
      />

      {isPaused && (
        <div
          className="panel"
          style={{
            padding: 14,
            marginBottom: 22,
            border: "1px solid var(--warn)",
            background: "rgba(255,170,58,0.06)",
            fontSize: 12,
            color: "var(--ink-2)",
          }}
        >
          <strong style={{ color: "var(--warn)" }}>Creation paused.</strong> Existing gifts can still be claimed or
          refunded.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 22, alignItems: "start" }}>
        {/* Form */}
        <div className="panel" style={{ padding: 22, display: "flex", flexDirection: "column", gap: 22 }}>
          {/* Asset */}
          <AssetPicker assets={assets} selectedKey={assetKey} onSelect={setAssetKey} />

          <div className="divider" />

          {/* Amount */}
          <div>
            <label className="field-label">
              Total amount · {selectedAsset.symbol} vault
              {type === "TARGETED" && (
                <span style={{ fontWeight: 400, color: "var(--ink-3)", marginLeft: 8 }}>
                  · auto-summed from recipients
                </span>
              )}
            </label>
            <div style={{ position: "relative", marginBottom: 14 }}>
              <input
                className="cr-input mono"
                value={
                  type === "TARGETED"
                    ? targetedSumUnits !== undefined
                      ? unitsToAssetLabel(targetedSumUnits, selectedAsset.unitDecimals)
                      : "0"
                    : amount
                }
                onChange={e => type !== "TARGETED" && setAmount(e.target.value)}
                readOnly={type === "TARGETED"}
                style={{
                  fontSize: 28,
                  fontWeight: 600,
                  height: 60,
                  paddingRight: 90,
                  opacity: type === "TARGETED" ? 0.85 : 1,
                  cursor: type === "TARGETED" ? "default" : "text",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  right: 14,
                  top: "50%",
                  transform: "translateY(-50%)",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  color: "var(--ink-3)",
                }}
              >
                <Coin kind={selectedAsset.coin} size={22} />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}>{selectedAsset.symbol}</span>
              </div>
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 14px",
                borderRadius: 8,
                background: "rgba(167,139,250,0.06)",
                border: "1px solid var(--crypt)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <LockIcon size={13} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>Encrypt total amount</div>
                  <div className="tick">Hide it from explorers — only you & claimers see deltas</div>
                </div>
              </div>
              <Switch on={encryptTotal} onChange={() => undefined} disabled />
            </div>
          </div>

          <div className="divider" />

          {/* Type */}
          <div>
            <label className="field-label">Packet type</label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
              {(["RANDOM", "EQUAL", "TARGETED", "PASSWORD"] as TypeKey[]).map(k => {
                const available = PACKET_TYPE_AVAILABLE[k];
                const active = type === k;
                const label = k === "PASSWORD" ? "Password" : PACKET_TYPE_LABELS[k];
                const hint =
                  k === "PASSWORD"
                    ? "Anyone with the secret phrase can claim."
                    : k === "RANDOM"
                      ? "FHE-random shares; the last claimer takes the residual."
                      : PACKET_TYPE_HINTS[k];
                return (
                  <button
                    key={k}
                    type="button"
                    disabled={!available}
                    onClick={() => available && setType(k)}
                    style={{
                      padding: "14px 14px",
                      textAlign: "left",
                      cursor: available ? "pointer" : "not-allowed",
                      borderRadius: 10,
                      color: "var(--ink)",
                      background: active ? "rgba(255,210,0,0.06)" : "var(--bg-2)",
                      border: `1px solid ${active ? "var(--accent)" : "var(--line-2)"}`,
                      opacity: available ? 1 : 0.4,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <span
                        style={{
                          width: 24,
                          height: 24,
                          borderRadius: 6,
                          background: active ? "var(--accent)" : "var(--bg-3)",
                          color: active ? "var(--accent-ink)" : "var(--ink-2)",
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {TYPE_ICONS[k]}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{label}</span>
                      {!available && (
                        <span className="badge b-dim" style={{ height: 18, fontSize: 9, marginLeft: "auto" }}>
                          v2
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--ink-2)", lineHeight: 1.5 }}>{hint}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Shares — hidden for TARGETED, where share count = recipients.length. */}
          {type !== "TARGETED" && (
            <div>
              <label className="field-label">Number of shares</label>
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
                <input
                  className="cr-input mono"
                  value={count}
                  onChange={e => setCount(parseInt(e.target.value || "0", 10) || 0)}
                  style={{ width: 120, fontSize: 18, fontWeight: 600 }}
                />
                <input
                  type="range"
                  min={1}
                  max={200}
                  value={count}
                  onChange={e => setCount(parseInt(e.target.value, 10))}
                  style={{ flex: 1, accentColor: "var(--accent)" }}
                />
                <span className="tick" style={{ minWidth: 60, textAlign: "right" }}>
                  {count} ppl
                </span>
              </div>
              {!isPerShareInteger && isAmountValid && isCountValid && (
                <div style={{ fontSize: 11, color: "var(--warn)" }}>
                  Total must divide evenly by share count (no sub-unit residual). Adjust the amount or share count.
                </div>
              )}
            </div>
          )}

          {/* Allowlist (TARGETED only) */}
          {type === "TARGETED" && (
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  justifyContent: "space-between",
                  marginBottom: 6,
                }}
              >
                <label className="field-label" style={{ margin: 0 }}>
                  Recipients · {targetedRows.length}
                </label>
                <span className="tick">
                  Σ ={" "}
                  {targetedSumUnits !== undefined
                    ? `${unitsToAssetLabel(targetedSumUnits, selectedAsset.unitDecimals)} ${selectedAsset.symbol}`
                    : "—"}
                </span>
              </div>
              <div
                style={{
                  background: "var(--bg-2)",
                  border: "1px solid var(--line-2)",
                  borderRadius: 8,
                  padding: 8,
                  marginBottom: 8,
                  minHeight: 60,
                }}
              >
                {targetedRows.length === 0 && (
                  <div style={{ padding: 8, fontSize: 12, color: "var(--ink-3)" }}>
                    Empty — add at least one address.
                  </div>
                )}
                {targetedRows.map((row, i) => {
                  const parsed = targetedSlotUnits[i];
                  const invalid = row.amount.trim() !== "" && parsed === undefined;
                  return (
                    <div
                      key={`${row.address}-${i}`}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 130px 28px",
                        gap: 8,
                        alignItems: "center",
                        padding: "6px 8px",
                        borderBottom: i < targetedRows.length - 1 ? "1px solid var(--line)" : "none",
                        fontFamily: "var(--font-mono)",
                        fontSize: 12,
                      }}
                    >
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {row.address}
                      </span>
                      <input
                        className="cr-input mono"
                        value={row.amount}
                        onChange={e =>
                          setTargetedRows(rows => rows.map((r, j) => (j === i ? { ...r, amount: e.target.value } : r)))
                        }
                        placeholder="0.0"
                        style={{
                          height: 28,
                          padding: "4px 8px",
                          fontSize: 12,
                          borderColor: invalid ? "var(--warn)" : "var(--line-2)",
                        }}
                      />
                      <button
                        onClick={() => setTargetedRows(rows => rows.filter((_, j) => j !== i))}
                        style={{
                          background: "none",
                          border: "none",
                          color: "var(--ink-3)",
                          cursor: "pointer",
                          fontSize: 14,
                        }}
                        aria-label="Remove recipient"
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  className="cr-input mono"
                  value={recipientInput}
                  onChange={e => setRecipientInput(e.target.value)}
                  placeholder="0x…"
                  onKeyDown={e => e.key === "Enter" && addRecipient()}
                />
                <Btn kind="dark" icon={<PlusIcon size={13} />} onClick={addRecipient}>
                  Add
                </Btn>
                <Btn kind="ghost" onClick={() => setShowUniform(s => !s)}>
                  Uniform
                </Btn>
              </div>
              {showUniform && (
                <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
                  <input
                    className="cr-input mono"
                    value={uniformInput}
                    onChange={e => setUniformInput(e.target.value)}
                    placeholder={`Amount per recipient · ${selectedAsset.symbol}`}
                    onKeyDown={e => e.key === "Enter" && setUniformAmount()}
                    style={{ flex: 1 }}
                  />
                  <Btn kind="primary" onClick={setUniformAmount}>
                    Apply to all
                  </Btn>
                </div>
              )}
              <div style={{ marginTop: 10, fontSize: 11, color: "var(--ink-3)", lineHeight: 1.5 }}>
                Each recipient gets their own pre-encrypted slot. The chain stores only a Merkle root of{" "}
                <span className="kbd">keccak(salt, address, slotIndex)</span> + N encrypted amounts — addresses and
                amounts both stay private on chain. Each invitee gets a personal share link you&apos;ll be shown after
                sealing; whoever holds it can claim that exact slot, so deliver it privately.
              </div>
            </div>
          )}

          {type === "PASSWORD" && (
            <div>
              <label className="field-label">Claim password</label>
              <input
                className="cr-input"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Secret phrase"
              />
              <div style={{ marginTop: 8, fontSize: 11, color: "var(--ink-3)", lineHeight: 1.5 }}>
                The contract stores only a packet-bound hash. Anyone who knows this phrase can claim until the red
                packet is full or expired.
              </div>
            </div>
          )}

          {/* Expiry */}
          <div>
            <label className="field-label">Expires after</label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
              {EXPIRY_PRESETS.map(p => (
                <button
                  key={p.hours}
                  type="button"
                  onClick={() => setExpiryHours(p.hours)}
                  style={{
                    padding: 10,
                    borderRadius: 8,
                    cursor: "pointer",
                    background: expiryHours === p.hours ? "rgba(255,210,0,0.08)" : "var(--bg-2)",
                    border: `1px solid ${expiryHours === p.hours ? "var(--accent)" : "var(--line-2)"}`,
                    color: "var(--ink)",
                    textAlign: "center",
                  }}
                >
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 600 }}>{p.label}</div>
                  <div className="tick">{p.sub}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Note */}
          <div>
            <label className="field-label">Message · public</label>
            <textarea
              className="cr-textarea"
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={2}
              maxLength={120}
              placeholder="Add a friendly note (visible on-chain)"
            />
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
              <span className="tick">Message stays in plaintext for context</span>
              <span className="tick">{note.length}/120</span>
            </div>
          </div>

          {/* Submit */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, paddingTop: 8 }}>
            <Btn kind="fhe" iconRight={<ZapIcon size={13} />} onClick={onSubmit} disabled={!canSubmit}>
              Encrypt &amp; sign
            </Btn>
          </div>
        </div>

        {/* Live preview (envelope) */}
        <div style={{ position: "sticky", top: 0 }}>
          <div className="tick" style={{ marginBottom: 8 }}>
            LIVE PREVIEW
          </div>
          <div
            className="envelope envelope-yellow"
            style={{ padding: "22px 22px 24px", minHeight: 240, position: "relative", color: "#0a0a0a" }}
          >
            <Brackets />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: ".16em",
                    textTransform: "uppercase",
                    opacity: 0.7,
                  }}
                >
                  from {address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "—"}
                </div>
                <div
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 38,
                    fontWeight: 600,
                    marginTop: 14,
                    letterSpacing: "-0.02em",
                    lineHeight: 1.05,
                  }}
                >
                  <Cipher width={120} label="∑ enc" />
                </div>
              </div>
            </div>
            <div
              style={{
                marginTop: 22,
                fontSize: 13,
                fontStyle: "italic",
                padding: "10px 12px",
                background: "rgba(0,0,0,0.06)",
                borderRadius: 6,
              }}
            >
              &ldquo;{note || "add a message…"}&rdquo;
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
              {[
                selectedAsset.symbol,
                type.toLowerCase(),
                `${effectiveShareCount} shares`,
                `${expiryHours}h`,
                type === "TARGETED"
                  ? targetedSumUnits !== undefined
                    ? unitsToAssetLabel(targetedSumUnits, selectedAsset.unitDecimals)
                    : "Σ —"
                  : amount,
              ].map(tag => (
                <span
                  key={tag}
                  style={{
                    background: "rgba(0,0,0,0.18)",
                    color: "#0a0a0a",
                    padding: "2px 8px",
                    borderRadius: 4,
                    fontSize: 10,
                    fontFamily: "var(--font-mono)",
                    fontWeight: 600,
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {showSigning && <SigningModal step={create.step} onClose={create.reset} />}
      {showAllowlistLinks && createdPacketId !== undefined && (
        <AllowlistLinksModal
          packetId={createdPacketId}
          entries={allowlistEntries}
          unitDecimals={selectedAsset.unitDecimals}
          symbol={selectedAsset.symbol}
          onClose={() => {
            create.reset();
            setAllowlistEntries([]);
            setCreatedPacketId(undefined);
            router.push("/dashboard");
          }}
        />
      )}
    </div>
  );
}

interface AllowlistLinksModalProps {
  packetId: bigint;
  entries: AllowlistEntry[];
  unitDecimals: number;
  symbol: string;
  onClose: () => void;
}

interface AssetPickerProps {
  assets: AssetConfig[];
  selectedKey: AssetKey;
  onSelect: (key: AssetKey) => void;
}

function AssetPicker({ assets, selectedKey, onSelect }: AssetPickerProps) {
  return (
    <div>
      <label className="field-label">Asset</label>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
        {assets.map(asset => {
          const active = selectedKey === asset.key;
          return (
            <button
              key={asset.key}
              type="button"
              disabled={!asset.enabled}
              title={asset.enabled ? asset.label : asset.disabledReason}
              onClick={() => asset.enabled && onSelect(asset.key)}
              style={{
                minHeight: 74,
                padding: "12px 12px",
                textAlign: "left",
                cursor: asset.enabled ? "pointer" : "not-allowed",
                borderRadius: 8,
                color: "var(--ink)",
                background: active ? "rgba(255,210,0,0.06)" : "var(--bg-2)",
                border: `1px solid ${active ? "var(--accent)" : "var(--line-2)"}`,
                opacity: asset.enabled ? 1 : 0.45,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <Coin kind={asset.coin} size={24} />
                <span style={{ fontSize: 13, fontWeight: 700 }}>{asset.symbol}</span>
              </div>
              <div style={{ fontSize: 11, color: "var(--ink-2)", lineHeight: 1.35 }}>
                {asset.enabled ? asset.label : "Vault not configured"}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function AllowlistLinksModal({ packetId, entries, unitDecimals, symbol, onClose }: AllowlistLinksModalProps) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
        padding: 30,
      }}
      onClick={onClose}
    >
      <div
        className="panel"
        onClick={e => e.stopPropagation()}
        style={{
          width: 580,
          maxHeight: "80vh",
          position: "relative",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Brackets />
        <div
          className="scroll-y"
          style={{ padding: 24, display: "flex", flexDirection: "column", minHeight: 0, flex: "1 1 auto" }}
        >
          <div className="tick" style={{ marginBottom: 8, color: "var(--fhe)" }}>
            PACKET SEALED · #{packetId.toString()}
          </div>
          <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 600, marginBottom: 4 }}>
            Send each invitee their personal link
          </h3>
          <p style={{ fontSize: 12, color: "var(--ink-2)", marginBottom: 16, lineHeight: 1.5 }}>
            The chain only knows the Merkle root. Each link contains the salt + proof a single invitee needs to claim.{" "}
            <strong style={{ color: "var(--warn)" }}>Whoever holds a link can claim that slot</strong> — deliver
            privately (DM, encrypted chat, signal). Don&apos;t paste them into a public channel. Recovery copies are
            also kept on this device — you can re-open them later from the packet detail page.
          </p>
          <AllowlistLinksList packetId={packetId} entries={entries} unitDecimals={unitDecimals} symbol={symbol} />
          <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end" }}>
            <Btn kind="primary" onClick={onClose}>
              Done — back to dashboard
            </Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

interface VaultGateProps {
  balance: ReturnType<typeof useUserBalance>;
  wrap: ReturnType<typeof detectWrap>;
  asset: AssetConfig;
  hasNoVaultBalance: boolean;
  balanceUnverified: boolean;
  isInsufficient: boolean;
  amountLabel: string;
}

function VaultGate({
  balance,
  wrap,
  asset,
  hasNoVaultBalance,
  balanceUnverified,
  isInsufficient,
  amountLabel,
}: VaultGateProps) {
  // Resolve a banner palette per state so the UI is unambiguous about what's wrong.
  let banner: { tone: "warn" | "danger" | "info"; title: string; body: React.ReactNode } | undefined;

  if (hasNoVaultBalance) {
    banner = {
      tone: "warn",
      title: "Vault is empty",
      body: (
        <>
          You need to deposit {asset.symbol} into the vault before sending a gift.{" "}
          <Link href="/dev/vault" style={{ color: "var(--accent)", textDecoration: "underline" }}>
            Deposit {asset.symbol} →
          </Link>
        </>
      ),
    };
  } else if (wrap.wrapped) {
    const recoveryAmount = unitsToAssetLabel(wrap.recoveryUnits!, asset.unitDecimals);
    banner = {
      tone: "danger",
      title: "Vault balance underflowed",
      body: (
        <>
          Your encrypted balance wrapped — likely from a previous gift sent without enough deposit. Deposit{" "}
          <strong>
            {recoveryAmount} {asset.symbol}
          </strong>{" "}
          to bring it back to <code>0</code>, then top up to your real intent.{" "}
          <Link href="/dev/vault" style={{ color: "var(--accent)", textDecoration: "underline" }}>
            Open vault →
          </Link>
        </>
      ),
    };
  } else if (balanceUnverified) {
    banner = {
      tone: "info",
      title: "Verify your vault balance",
      body: <>Decrypt once to confirm your balance covers this gift (avoids accidental underflow).</>,
    };
  } else if (isInsufficient && balance.cleartextUnits !== undefined) {
    banner = {
      tone: "warn",
      title: "Insufficient vault balance",
      body: (
        <>
          You&apos;re trying to send{" "}
          <strong>
            {amountLabel} {asset.symbol}
          </strong>{" "}
          but the vault only holds{" "}
          <strong>
            {unitsToAssetLabel(balance.cleartextUnits, asset.unitDecimals)} {asset.symbol}
          </strong>
          .{" "}
          <Link href="/dev/vault" style={{ color: "var(--accent)", textDecoration: "underline" }}>
            Top up →
          </Link>
        </>
      ),
    };
  }

  const toneColors = {
    warn: { border: "var(--warn)", bg: "rgba(255,170,58,0.06)", text: "var(--warn)" },
    danger: { border: "var(--danger)", bg: "rgba(255,94,58,0.06)", text: "var(--danger)" },
    info: { border: "var(--crypt)", bg: "rgba(167,139,250,0.06)", text: "var(--crypt)" },
  };

  return (
    <div className="panel" style={{ padding: 16, marginBottom: 22 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 14 }}>
        <div>
          <div className="tick" style={{ marginBottom: 6 }}>
            VAULT BALANCE
          </div>
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: "-0.02em",
            }}
          >
            {balance.cleartextUnits !== undefined ? (
              <span style={{ color: wrap.wrapped ? "var(--danger)" : "var(--fhe)" }}>
                {wrap.wrapped
                  ? `wrapped (~${Number(balance.cleartextUnits).toExponential(2)} units)`
                  : `${unitsToAssetLabel(balance.cleartextUnits, asset.unitDecimals)} ${asset.symbol}`}
              </span>
            ) : balance.handle ? (
              <Cipher width={120} label="enc" />
            ) : (
              <span style={{ color: "var(--ink-3)" }}>0 {asset.symbol} (no deposits yet)</span>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {balance.handle && balance.cleartextUnits === undefined && (
            <Btn
              kind="fhe"
              size="sm"
              onClick={balance.decryptBalance}
              disabled={balance.isAllowing || balance.isDecrypting}
              icon={<LockIcon size={11} />}
            >
              {balance.isAllowing
                ? "Authorising…"
                : balance.isDecrypting
                  ? "Decrypting…"
                  : balance.isAllowed
                    ? "Decrypt"
                    : "Auth & decrypt"}
            </Btn>
          )}
          <Link href="/dev/vault" style={{ textDecoration: "none" }}>
            <Btn kind="ghost" size="sm">
              Manage vault
            </Btn>
          </Link>
        </div>
      </div>

      {banner && (
        <div
          style={{
            marginTop: 14,
            padding: "10px 12px",
            borderRadius: 8,
            background: toneColors[banner.tone].bg,
            border: `1px solid ${toneColors[banner.tone].border}`,
            fontSize: 12,
            lineHeight: 1.5,
            color: "var(--ink-2)",
          }}
        >
          <div
            style={{
              fontWeight: 700,
              fontSize: 11,
              letterSpacing: ".08em",
              textTransform: "uppercase",
              color: toneColors[banner.tone].text,
              marginBottom: 4,
            }}
          >
            {banner.title}
          </div>
          {banner.body}
        </div>
      )}
    </div>
  );
}

/**
 * Walk a viem / wagmi error tree and produce a user-facing message.
 *
 * Wallets and viem normalize `eth_estimateGas` failures to "gas limit
 * too high", which hides the real revert. By traversing the error's
 * `cause` chain we can usually find a `BaseError` carrying the raw
 * revert data; piping that through `decodeRevert` recovers the actual
 * reason.
 */
import { decodeRevert } from "./decode-revert";
import type { Hex } from "viem";
import { BaseError, ContractFunctionRevertedError } from "viem";

export function explainContractError(err: unknown): string {
  // Walk the cause chain to find specific viem error subclasses.
  const visited = new Set<unknown>();
  let cursor: unknown = err;
  let revertedSignature: string | undefined;
  let rawData: Hex | undefined;
  let topMessage: string | undefined;

  while (cursor && !visited.has(cursor)) {
    visited.add(cursor);
    if (cursor instanceof BaseError) {
      if (!topMessage) topMessage = cursor.shortMessage;
      if (cursor instanceof ContractFunctionRevertedError) {
        revertedSignature = cursor.signature;
        const data = (cursor.data as { args?: readonly unknown[]; errorName?: string } | undefined)?.errorName;
        if (data && !revertedSignature) revertedSignature = data;
      }
      // viem's error objects sometimes hang the raw revert data off `data`
      const maybeData = (cursor as unknown as { data?: { data?: Hex } | Hex }).data;
      if (typeof maybeData === "string" && maybeData.startsWith("0x")) {
        rawData = maybeData as Hex;
      } else if (maybeData && typeof maybeData === "object" && "data" in maybeData) {
        rawData = (maybeData as { data?: Hex }).data;
      }
    } else if (cursor instanceof Error) {
      if (!topMessage) topMessage = cursor.message;
      // RPC errors sometimes embed the data in the message itself.
      const match = (cursor.message ?? "").match(/0x[0-9a-fA-F]{8,}/);
      if (match && !rawData) rawData = match[0] as Hex;
    }
    cursor = (cursor as { cause?: unknown } | undefined)?.cause;
  }

  const decoded = decodeRevert(rawData);
  if (decoded) return decoded;
  if (revertedSignature) return revertedSignature;
  if (topMessage) {
    // Strip the misleading "gas limit too high" from estimateGas wrappers.
    return topMessage.replace(/^The contract function "[^"]+" reverted with the following reason:\s*/i, "");
  }
  return "Transaction failed";
}

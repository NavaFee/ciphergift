import { decodeRevert } from "./decode-revert";
import { explainContractError } from "./explain-error";

export type FheErrorKind =
  | "user_rejected"
  | "acl_missing"
  | "gateway_timeout"
  | "network"
  | "contract_revert"
  | "unknown";

export interface FheErrorInfo {
  kind: FheErrorKind;
  title: string;
  message: string;
  retryable: boolean;
}

const KNOWN_REVERTS: Record<string, string> = {
  AlreadyClaimed: "This wallet has already claimed this packet.",
  AllShareClaimed: "Every share has already been claimed.",
  PacketExpired: "This packet has expired.",
  PacketRefunded_: "This packet has already been refunded.",
  NotAllowlisted: "This link is not valid for the connected wallet.",
  TargetedRequiresProof: "This targeted packet must be opened from a personal invite link.",
  PendingWithdrawalExists: "Finish or cancel the pending withdrawal before spending from the vault.",
};

export function classifyFheError(err: unknown): FheErrorInfo {
  const raw = err instanceof Error ? err.message : String(err ?? "");
  const message = raw.toLowerCase();

  if (
    message.includes("user rejected") ||
    message.includes("user denied") ||
    message.includes("rejected the request")
  ) {
    return {
      kind: "user_rejected",
      title: "Signature rejected",
      message: "The wallet request was cancelled. Start the action again when ready.",
      retryable: true,
    };
  }

  if (message.includes("allow") || message.includes("acl") || message.includes("not allowed")) {
    return {
      kind: "acl_missing",
      title: "Decrypt permission missing",
      message: "The encrypted handle is not allowed for this wallet yet. Authorise and retry.",
      retryable: true,
    };
  }

  if (message.includes("timeout") || message.includes("gateway")) {
    return {
      kind: "gateway_timeout",
      title: "Gateway is slow",
      message: "The FHE gateway did not answer in time. Keep the page open and retry.",
      retryable: true,
    };
  }

  if (message.includes("network") || message.includes("fetch") || message.includes("rpc") || message.includes("503")) {
    return {
      kind: "network",
      title: "Network issue",
      message: "The RPC or relayer is unreachable. Check the network and retry.",
      retryable: true,
    };
  }

  for (const [name, friendly] of Object.entries(KNOWN_REVERTS)) {
    if (raw.includes(name)) {
      return {
        kind: "contract_revert",
        title: "Action rejected on-chain",
        message: friendly,
        retryable: false,
      };
    }
  }

  // Unwrap viem's `gas limit too high` envelope by walking the cause chain
  // for raw revert data; surfaces real custom-error reasons instead.
  const decoded = explainContractError(err);
  if (decoded && decoded !== "Transaction failed" && !/gas limit too high/i.test(decoded)) {
    return {
      kind: "contract_revert",
      title: "Action rejected on-chain",
      message: decoded,
      retryable: false,
    };
  }

  // Last-ditch: scan for a 4-byte selector in the raw error string and
  // try to decode it directly. Helps when the error chain has been
  // flattened by an intermediate wrapper.
  const selectorMatch = raw.match(/0x[0-9a-fA-F]{8,}/);
  if (selectorMatch) {
    const directDecoded = decodeRevert(selectorMatch[0] as `0x${string}`);
    if (directDecoded) {
      return {
        kind: "contract_revert",
        title: "Action rejected on-chain",
        message: directDecoded,
        retryable: false,
      };
    }
  }

  return {
    kind: "unknown",
    title: "Encrypted action failed",
    message: raw || "Unknown FHE error.",
    retryable: true,
  };
}

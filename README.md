# CipherGift

[English](./README.md) · [中文](./docs/README_zh.md)

Confidential gift packets on [Zama FHEVM](https://docs.zama.ai/fhevm). Senders create on-chain gifts where **per-share amounts and recipient claim records stay encrypted under FHE**. Validators, explorers, and even other claimers see ciphertext — only the addressee can decrypt their slice.

Targets Sepolia (FHEVM v0.11) and a local FHEVM stack via `pnpm chain`.

---

## What it does

|                                                      | Plaintext (public)                  | Encrypted (FHE)           |
| ---------------------------------------------------- | ----------------------------------- | ------------------------- |
| Total amount                                         | —                                   | ✓                         |
| Per-share amount                                     | —                                   | ✓ (only claimer decrypts) |
| Vault balances                                       | —                                   | ✓                         |
| Claim record per address                             | event log shows _that_ they claimed | ✓ amount stays encrypted  |
| Packet metadata (creator, expiry, share count, note) | ✓                                   | —                         |
| Allowlist (TARGETED packets)                         | Merkle root only                    | per-invitee salt/proof    |
| Asset type                                           | vault address (`assetId`)           | amount stays encrypted    |

### Packet types

- **Equal** — every claimer gets exactly `total / shares`. Fair, predictable.
- **Random** — each claimer's share is drawn under FHE via `FHE.randEuint64()`, capped at a public upper bound the sender chose (typically `2 × total / shares`). Last claimer takes the residual so the full total always distributes.
- **Targeted** — only addresses with a per-invitee Merkle salt/proof can claim; the chain stores only the root, not the invitee list.
- **Password** — equal-split packet gated by a shared secret phrase. The contract stores a packet-bound hash and claimers call `claimWithPassword`.
- **Blind box** — random share is reserved on claim, but not credited or decryptable until the claimer explicitly calls `reveal`.

All packet types support **expiry + creator refund** of the unclaimed encrypted residual. Packets can be backed by cETH by default, or by registered ERC-20 vaults such as cUSDC / cZAMA.

---

## Architecture

pnpm monorepo with four packages.

```
ciphergift/
├── packages/
│   ├── foundry/                       # Solidity + Forge
│   │   ├── src/
│   │   │   ├── IConfidentialVault.sol       # encrypted-balance vault interface
│   │   │   ├── ConfidentialETHVault.sol     # encrypted ETH balance per user
│   │   │   ├── ConfidentialERC20Vault.sol   # encrypted ERC-20 balance per user
│   │   │   └── CipherGift.sol               # packet logic on top of vaults
│   │   ├── script/DeployCipherGift.s.sol
│   │   └── test/{ConfidentialETHVault,ConfidentialERC20Vault,CipherGift}.t.sol
│   ├── site/                          # Next.js 15 App Router
│   │   ├── app/                       # routes (page-per-screen)
│   │   ├── components/
│   │   │   ├── chrome/                # AppChrome, SideNav, Logo
│   │   │   ├── primitives/            # Btn, Cipher, Coin, Stat, …
│   │   │   ├── send/                  # SendWizard, SigningModal
│   │   │   └── inbox/                 # PacketCard, OpenModal, DecryptLog
│   │   ├── hooks/                     # FHE I/O (useEncryptUint, useUserBalance, useClaim, …)
│   │   ├── lib/                       # format, packet-types, share-link, allowlist, indexer
│   │   ├── contracts/                 # auto-generated TS ABI/address files
│   │   └── services/web3/             # wagmi config + signer
│   ├── indexer/                       # viem poller + Hono HTTP server
│   │   └── src/{index,poller,store,abi}.ts
│   └── subgraph/                      # The Graph subgraph (hosted alternative to indexer)
└── scripts/
    ├── chain.sh                       # local FHEVM stack
    ├── deploy-localhost.sh            # forge script + ABI codegen
    ├── deploy-sepolia.sh
    └── generateTsAbis.ts              # broadcast → packages/site/contracts/*.ts
```

### Vault + packet design

**`IConfidentialVault`** is the asset-agnostic interface `CipherGift` uses: `internalDebit`, `internalCredit`, `internalTransfer`, and `balanceOf`. The packet contract only moves encrypted `euint64` units; deposits, withdrawals, and decimal scaling stay inside each vault.

**`ConfidentialETHVault`** holds pooled ETH and tracks each user's holdings as `mapping(address => euint64)` in gwei units (1 ETH = 1e9 vault units). Public on-chain ops:

- `depositETH() payable` — wraps ETH into encrypted balance
- `requestWithdraw()` / `fulfillWithdraw(...)` — gateway-decrypts the user's encrypted balance before releasing ETH
- `internalCredit / internalDebit / internalTransfer` — orchestrator-only (CipherGift), used by packet flows. No real ETH moves; only encrypted balances shift.

**`ConfidentialERC20Vault`** mirrors the ETH vault for ERC-20 assets. `deposit(tokenAmount)` pulls approved tokens with `transferFrom`, converts to vault units (`unitDecimals = 6` for cUSDC/cZAMA), and stores the balance encrypted. Withdrawals use the same gateway-decrypt request/fulfill pattern.

**`CipherGift`** sits on top. `createPacket` keeps the default cETH path; `createPacketWithAsset(assetId, ...)` binds a packet to a registered vault address. Claim/refund routes credit the same vault recorded in `getPacketAsset(id)`. The per-claim share ciphertext is stored in `mapping(uint256 => mapping(address => euint64)) claimedAmount` with `FHE.allow(share, claimer)` so the recipient (and only the recipient) can decrypt it.

### FHE ACL chain

Every encrypted-mutation site re-allows the new ciphertext to:

| Op                                            | `FHE.allowThis` | `FHE.allow(_, claimer)`        | `FHE.allow(_, vault)`                                                                                         |
| --------------------------------------------- | --------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| createPacket → totalEnc                       | ✓               | —                              | ✓                                                                                                             |
| createPacket → equalShareEnc (EQUAL/TARGETED) | ✓               | — (creator gets it explicitly) | ✓                                                                                                             |
| claim → share                                 | ✓               | ✓                              | ✓ (must re-allow even for EQUAL where it's idempotent — RANDOM path produces a fresh `FHE.select` ciphertext) |
| claim → updated remainingAmount               | ✓               | (creator)                      | ✓                                                                                                             |

### Random share algorithm

```solidity
if (isLastClaimer) {
    share = remainingAmount;          // takes the encrypted residual
} else {
    randomVal = FHE.randEuint64();
    capped = FHE.rem(randomVal, maxShareScalar);  // scalar plaintext bound
    overshoot = FHE.lt(remainingAmount, capped);
    share = FHE.select(overshoot, remainingAmount, capped);
}
```

`maxShareScalar` is plaintext (sender provides it; UI sets it to `2 * total / shares`). This reveals the upper bound on per-share size but keeps each individual share encrypted within it. The full total is always distributed because the last claimer takes whatever's left.

---

## Run it

### Prerequisites

- Node ≥ 20, pnpm 10+
- Foundry (`forge`, `cast`)
- A Sepolia RPC URL + an Etherscan API key (only for `pnpm deploy:sepolia`)

### Local dev (FHEVM cleartext)

```bash
pnpm install
pnpm contracts:install        # forge soldeer install
pnpm contracts:build          # forge build

# Terminal 1
pnpm chain                    # local anvil + FHEVM cleartext host

# Terminal 2
pnpm deploy:localhost         # deploys ConfidentialETHVault + CipherGift
                              # auto-runs generateTsAbis.ts → packages/site/contracts/*

# Terminal 3
pnpm start                    # next dev → http://localhost:3000
```

### Indexer (optional)

Without it the site reads packets directly from chain (works for local
demos, slow on long-running networks). Setting `NEXT_PUBLIC_INDEXER_URL`
in `packages/site/.env.local` makes the site call the indexer first and
transparently fall back to chain reads if it's down.

```bash
# Terminal 4 (after pnpm deploy:localhost has populated the addresses)
cp packages/indexer/.env.example packages/indexer/.env.local
# Fill CIPHERGIFT_ADDRESS / VAULT_ADDRESS by inspecting
# packages/site/contracts/CipherGift.local.ts after the deploy.
pnpm indexer:dev               # http://localhost:42069
```

```bash
# packages/site/.env.local
NEXT_PUBLIC_INDEXER_URL=http://localhost:42069
NEXT_PUBLIC_CUSDC_VAULT_ADDRESS=0x...   # optional ERC-20 vault
NEXT_PUBLIC_CZAMA_VAULT_ADDRESS=0x...   # optional ERC-20 vault
```

Endpoints: `GET /health`, `/packets`, `/packets/:id`, `/sent?creator=0x…`,
`/claims?claimer=0x…`, `/withdrawals?user=0x…`.

For hosted deployments, see [`packages/subgraph/README.md`](packages/subgraph/README.md) for a Graph subgraph alternative — the frontend prefers `NEXT_PUBLIC_SUBGRAPH_URL` and falls back through the REST indexer to direct chain reads.

### Sepolia

```bash
# packages/foundry/.env.local (or shell)
export SEPOLIA_RPC_URL=https://...
export DEPLOYER_PRIVATE_KEY=0x...
export ETHERSCAN_API_KEY=...     # optional — enables verification
export CUSDC_TOKEN_ADDRESS=0x... # optional — deploy/register cUSDC vault
export CZAMA_TOKEN_ADDRESS=0x... # optional — deploy/register cZAMA vault
export MULTISIG_OWNER=0x...      # optional — stage two-step ownership transfer

pnpm deploy:sepolia              # deploys + regenerates packages/site/contracts/*.ts
                                 # commit the resulting CipherGift.ts / ConfidentialETHVault.ts
```

If `MULTISIG_OWNER` is set, the deploy script only **stages** the transfer — the deployer EOA remains owner until the multisig calls `CipherGift.acceptOwnership()` from its own address. This is intentional: a typoed multisig address won't brick the contract.

After deploying, set the frontend env (`packages/site/.env.local`):

- `NEXT_PUBLIC_INDEXER_URL` (or `NEXT_PUBLIC_SUBGRAPH_URL` for hosted)
- `NEXT_PUBLIC_CUSDC_VAULT_ADDRESS`, `NEXT_PUBLIC_CZAMA_VAULT_ADDRESS` (if registered)
- optional `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_SENTRY_DSN` for observability

A post-deploy smoke test should cover: deposit, create equal packet, claim, reveal a blind packet, refund an expired packet.

### Pause policy

`CipherGift.pause()` is an emergency control owned by the contract owner (typically a multisig). It blocks `_createPacket` only — claim, reveal, and refund paths remain open. The intent is to stop new exposure without trapping existing funds:

- `claim`, `claimTargeted`, `claimWithPassword` — always available
- `reveal`, `revealFor` — always available
- `closeAndRefund` — always available
- `createPacket`, `createPacketWithAsset` — blocked while paused

### Tests

```bash
pnpm contracts:test            # forge test -vv
```

Coverage includes:

- vault deposit / withdraw / orchestrator gating
- equal split distributes exactly `total / shares` to each of N claimers
- random sums to total, last claimer takes residual, residual = 0 after all claims
- targeted rejects non-allowlisted, requires non-empty list
- expiry / refund (only creator, only after expiry, idempotent)
- can't claim twice / after expiry / after all slots taken
- ERC-20 vault deposit / gateway withdraw / pending-withdrawal debit gate
- ETH and cUSDC packets coexisting without crossing vault balances

---

## Routes

| Route        | Purpose                                                                                                |
| ------------ | ------------------------------------------------------------------------------------------------------ |
| `/`          | Connect screen with RainbowKit picker; redirects to `/dashboard` once connected                        |
| `/dashboard` | Vault balance (cipher → decrypt-on-click), active sent packets, quick claim, summary stats             |
| `/send`      | Wizard: asset + amount + type + count + (allowlist if targeted) + expiry + note → SigningModal         |
| `/inbox`     | 2-column grid of claimable packets; `OpenModal` runs claim / password claim / blind reveal + decrypt   |
| `/sent`      | List of all packets the user created                                                                   |
| `/sent/[id]` | Packet detail (creator view): encrypted total, claimed count, share link, refund button (after expiry) |
| `/history`   | Full activity table                                                                                    |
| `/r/[id]`    | Public share-link landing — auto-opens the claim modal once connected                                  |
| `/status`    | Operational status page for indexer health and fallback visibility                                     |
| `/dev/vault` | Developer tool: deposit / decrypt / withdraw against `ConfidentialETHVault`                            |

---

## Notable design decisions

1. **Why a vault wrapper instead of `msg.value` per packet?** A plaintext deposit/withdraw at the boundary is unavoidable, but keeping balances + packet flows inside an encrypted ledger lets the _internal_ movement (creator → packet → claimer) stay confidential. Without the vault, the total amount would leak via `msg.value` at create time.

2. **Why `via_ir = true` in foundry.toml?** The `Packet` struct + multiple `FHE.allow` calls inside `createPacket` push the EVM stack past the legacy depth limit when ciphertext locals are 32-byte handles. `viaIR` resolves it cleanly.

3. **Why a plaintext `maxShareScalar` for RANDOM?** `FHE.rem` only accepts a scalar (plaintext) divisor in fhevm-solidity 0.11; encrypted-divisor `rem` would require a separate (much more expensive) library. The sender picks the bound explicitly so the trade-off is visible in the UX.

4. **Why Merkle salts instead of an on-chain allowlist mapping?** TARGETED packets store only a Merkle root of `keccak(salt, address)` leaves. Each invitee receives a private link containing their salt and proof. This keeps the invitee set off-chain while preserving cheap claim-time verification.

5. **Why use vault addresses as asset IDs?** `CipherGift` does not need token decimals, symbols, or transfer logic. Binding a packet to a registered vault address keeps the packet math asset-agnostic and lets ETH, cUSDC, and cZAMA share the same encrypted claim/refund code.

6. **Why password hash instead of encrypted password matching?** Password packets are a pragmatic product layer: the secret itself is distributed off-chain, and the contract stores `keccak256(abi.encode(packetId, keccak256(bytes(password))))`. This gates casual link forwarding, but it is not a replacement for high-entropy secrets because weak passwords can still be brute-forced from public transaction data.

7. **Why does BLIND credit only on reveal?** If claim credited the vault immediately, the vault balance handle would be allowed to the user and could leak the delta before the reveal UX. BLIND therefore reserves the share in `claimedAmount`, decrements the packet residual, and credits the vault only when `reveal(id)` runs.

8. **Why two-phase withdrawals?** Releasing real ETH/ERC-20 tokens requires plaintext, but user balances are encrypted. The vault snapshots the encrypted handle with `FHE.makePubliclyDecryptable`, then `fulfillWithdraw` verifies the KMS proof before transferring the clear amount. While a request is pending, debit paths are blocked so the fulfilled cleartext cannot exceed the current encrypted balance.

---

## Tech reference

- `@fhevm/solidity` 0.11.1 — `FHE.fromExternal`, `FHE.add/sub/div/rem`, `FHE.allow/allowThis`, `FHE.randEuint64`, `FHE.select`
- `forge-fhevm` rev `eba2324` — `FhevmTest`, `encryptUint64`, `signUserDecrypt`, `userDecrypt`
- `@zama-fhe/react-sdk` 3.0.0 — `useEncrypt`, `useUserDecrypt`, `useAllow`, `useIsAllowed`
- Next.js 15.2, React 19, wagmi 2.19, viem 2.48, RainbowKit 2.2

## License

BSD-3-Clause-Clear. See [LICENSE](LICENSE).

## Acknowledgements

- [zama-ai/fhevm-react-template](https://github.com/zama-ai/fhevm-react-template) — Next.js + Foundry skeleton, wagmi+RainbowKit setup, ABI codegen
- [zama-ai/forge-fhevm](https://github.com/zama-ai/forge-fhevm) — Solidity test helpers (FHE encrypt/decrypt cheatcodes)
- [patriciaOrtuno28/Paychain-On-Chain-Payroll](https://github.com/patriciaOrtuno28/Paychain-On-Chain-Payroll) — encrypted-balance vault pattern reference

# CipherGift Contracts

Solidity sources, tests, and deployment scripts for CipherGift. Built with [Foundry](https://book.getfoundry.sh/) on top of [Zama FHEVM](https://docs.zama.ai/fhevm) v0.11.

## Layout

```
packages/foundry/
├── src/
│   ├── IConfidentialVault.sol       # asset-agnostic encrypted-balance interface
│   ├── ConfidentialETHVault.sol     # ETH-backed vault (gwei-scaled euint64)
│   ├── ConfidentialERC20Vault.sol   # ERC-20-backed vault (configurable unitDecimals)
│   └── CipherGift.sol               # packet logic (equal, random, targeted, password)
├── test/
│   ├── ConfidentialETHVault.t.sol
│   ├── ConfidentialERC20Vault.t.sol
│   └── CipherGift.t.sol
├── script/
│   └── DeployCipherGift.s.sol       # deploys vault + wrapper, optional ERC-20 vaults
├── foundry.toml                     # via_ir = true (FHE locals push past legacy stack depth)
└── remappings.txt
```

## Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation) (`forge`, `cast`, `anvil`).

## Quick start

From the repository root:

```bash
pnpm install
pnpm contracts:install   # forge soldeer install
pnpm contracts:build     # forge build
pnpm contracts:test      # forge test -vv
```

Or directly from this package:

```bash
forge soldeer install
forge build
forge test -vvv
```

### Single test

```bash
forge test --match-test test_equalSplit_distributesExactly -vvv
```

### Local deployment

A local FHEVM cleartext host is started by the root script `pnpm chain`. Once it is running:

```bash
pnpm deploy:localhost      # from repo root
```

This invokes `script/DeployCipherGift.s.sol`, then regenerates the TypeScript ABI bindings under `packages/site/contracts/`.

### Sepolia deployment

Set the required environment variables (see [`docs/MAINNET_READINESS.md`](../../docs/MAINNET_READINESS.md) for the full list) and run:

```bash
pnpm deploy:sepolia
```

## References

- [FHEVM Solidity guide](https://docs.zama.ai/fhevm)
- [forge-fhevm](https://github.com/zama-ai/forge-fhevm) — Solidity test helpers used by the test suite

## License

BSD-3-Clause-Clear. See the repository [LICENSE](../../LICENSE).

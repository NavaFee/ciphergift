# CipherGift

[English](../README.md) · [中文](./README_zh.md)

基于 [Zama FHEVM](https://docs.zama.ai/fhevm) 的隐私红包 dApp。发送方在链上创建红包，**每份金额、每个领取人的领取记录都以 FHE 密文形式存在**。验证人、区块浏览器、其他领取人都只能看到密文 handle —— 只有目标领取人能解密属于自己的那一份。

支持 Sepolia（FHEVM v0.11），也可以通过 `pnpm chain` 起一套本地 FHEVM。

---

## 这个项目做什么

|                                            | 明文（公开）             | 密文（FHE）             |
| ------------------------------------------ | ------------------------ | ----------------------- |
| 红包总金额                                 | —                        | ✓                       |
| 每份金额                                   | —                        | ✓（仅领取人解密）       |
| Vault 余额                                 | —                        | ✓                       |
| 每个地址的领取记录                         | event 日志会暴露"领过了" | ✓ 金额本身仍然加密      |
| 红包元数据（创建者、过期时间、份数、备注） | ✓                        | —                       |
| Allowlist（TARGETED 红包）                 | 链上只存 Merkle root     | 每位邀请人的 salt/proof |
| 资产类型                                   | vault 地址（`assetId`）  | 金额仍加密              |

### 红包类型

- **Equal（等额）** —— 每个领取人精确拿到 `total / shares`，公平、可预测。
- **Random（随机）** —— 每份金额由 FHE `FHE.randEuint64()` 抽取，受发送方设置的明文上限约束（典型值为 `2 × total / shares`）；最后一个领取人吃残值，确保总额完全分配。
- **Targeted（定向）** —— 只有持有专属 Merkle salt/proof 的地址才能领取；链上仅存 root，不存邀请名单。
- **Password（密码）** —— 等额红包，但需要凭口令领取。合约存的是包绑定的 hash，领取走 `claimWithPassword`。

所有类型都支持 **过期 + 创建者退款** 未领取的密文残值。红包默认由 cETH 担保，也可以挂在已注册的 ERC-20 vault（如 cUSDC / cZAMA）上。

---

## 架构

pnpm monorepo，四个 package。

```
ciphergift/
├── packages/
│   ├── foundry/                       # Solidity + Forge
│   │   ├── src/
│   │   │   ├── IConfidentialVault.sol       # 加密余额 vault 接口
│   │   │   ├── ConfidentialETHVault.sol     # 每个用户的加密 ETH 余额
│   │   │   ├── ConfidentialERC20Vault.sol   # 每个用户的加密 ERC-20 余额
│   │   │   └── CipherGift.sol               # vault 之上的红包逻辑
│   │   ├── script/DeployCipherGift.s.sol
│   │   └── test/{ConfidentialETHVault,ConfidentialERC20Vault,CipherGift}.t.sol
│   ├── site/                          # Next.js 15 App Router
│   │   ├── app/                       # 路由（一屏一文件）
│   │   ├── components/
│   │   │   ├── chrome/                # AppChrome、SideNav、Logo
│   │   │   ├── primitives/            # Btn、Cipher、Coin、Stat 等
│   │   │   ├── send/                  # SendWizard、SigningModal
│   │   │   └── inbox/                 # PacketCard、OpenModal、DecryptLog
│   │   ├── hooks/                     # FHE I/O（useEncryptUint、useUserBalance、useClaim 等）
│   │   ├── lib/                       # format、packet-types、share-link、allowlist、indexer
│   │   ├── contracts/                 # 自动生成的 TS ABI / 地址文件
│   │   └── services/web3/             # wagmi 配置 + signer
│   ├── indexer/                       # viem 轮询器 + Hono HTTP server
│   │   └── src/{index,poller,store,abi}.ts
│   └── subgraph/                      # The Graph 子图（托管部署的替代方案）
└── scripts/
    ├── chain.sh                       # 本地 FHEVM 栈
    ├── deploy-localhost.sh            # forge script + ABI codegen
    ├── deploy-sepolia.sh
    └── generateTsAbis.ts              # broadcast → packages/site/contracts/*.ts
```

### Vault + 红包设计

**`IConfidentialVault`** 是 `CipherGift` 使用的资产无关接口：`internalDebit`、`internalCredit`、`internalTransfer`、`balanceOf`。红包合约只搬加密的 `euint64` 单位；存款、取款、小数精度换算全部留在每个 vault 内部。

**`ConfidentialETHVault`** 池化保管 ETH，用 `mapping(address => euint64)` 跟踪每个用户的余额（单位 gwei，1 ETH = 1e9 vault unit）。链上公开操作：

- `depositETH() payable` —— 把 ETH 包装成加密余额
- `requestWithdraw()` / `fulfillWithdraw(...)` —— 通过 gateway 解密用户的加密余额，再放出真实 ETH
- `internalCredit / internalDebit / internalTransfer` —— 仅 orchestrator（CipherGift）可调用，给红包流程用。不挪真 ETH，只挪加密余额

**`ConfidentialERC20Vault`** 是 ERC-20 版本的同款 vault。`deposit(tokenAmount)` 用 `transferFrom` 拉走授权的 token，按 vault unit 换算（cUSDC/cZAMA 均用 `unitDecimals = 6`），再加密入账。取款走同样的 gateway-decrypt 两阶段流程。

**`CipherGift`** 在 vault 之上。`createPacket` 默认走 cETH；`createPacketWithAsset(assetId, ...)` 把红包绑定到已注册的 vault 地址。Claim/refund 路径会向 `getPacketAsset(id)` 记录的 vault 入账。每次 claim 的密文份额存在 `mapping(uint256 => mapping(address => euint64)) claimedAmount` 里，并通过 `FHE.allow(share, claimer)` 授权领取人（且仅领取人）解密。

### FHE ACL 链路

每个加密变更点都会重新对新密文授权：

| 操作                                          | `FHE.allowThis` | `FHE.allow(_, claimer)` | `FHE.allow(_, vault)`                                                             |
| --------------------------------------------- | --------------- | ----------------------- | --------------------------------------------------------------------------------- |
| createPacket → totalEnc                       | ✓               | —                       | ✓                                                                                 |
| createPacket → equalShareEnc (EQUAL/TARGETED) | ✓               | — (创建者另行获得)      | ✓                                                                                 |
| claim → share                                 | ✓               | ✓                       | ✓（即使 EQUAL 是幂等的也必须重新授权 —— RANDOM 路径会产生新的 `FHE.select` 密文） |
| claim → 更新后的 remainingAmount              | ✓               | (创建者)                | ✓                                                                                 |

### 随机份额算法

```solidity
if (isLastClaimer) {
    share = remainingAmount;          // 直接拿密文残值
} else {
    randomVal = FHE.randEuint64();
    capped = FHE.rem(randomVal, maxShareScalar);  // 标量明文上界
    overshoot = FHE.lt(remainingAmount, capped);
    share = FHE.select(overshoot, remainingAmount, capped);
}
```

`maxShareScalar` 是明文（发送方提供，UI 默认设成 `2 * total / shares`）。这会暴露每份的上限，但单份金额本身仍然加密在该上限内。最后一个领取人吃残值，所以总额一定全部分配。

---

## 运行

### 前置依赖

- Node ≥ 20，pnpm 10+
- Foundry（`forge`、`cast`）
- Sepolia RPC URL + Etherscan API key（仅 `pnpm deploy:sepolia` 需要）

### 本地开发（FHEVM 明文模式）

```bash
pnpm install
pnpm contracts:install        # forge soldeer install
pnpm contracts:build          # forge build

# 终端 1
pnpm chain                    # 本地 anvil + FHEVM 明文 host

# 终端 2
pnpm deploy:localhost         # 部署 ConfidentialETHVault + CipherGift
                              # 自动跑 generateTsAbis.ts → packages/site/contracts/*

# 终端 3
pnpm start                    # next dev → http://localhost:3000
```

### Indexer（可选）

不开 indexer 时，前端直接读链——本地 demo 可用，但在长寿命网络上会慢。在 `packages/site/.env.local` 里设置 `NEXT_PUBLIC_INDEXER_URL` 后，前端会优先调 indexer，挂掉时自动透明回退到链上读。

```bash
# 终端 4（在 pnpm deploy:localhost 之后跑）
cp packages/indexer/.env.example packages/indexer/.env.local
# 通过查看 packages/site/contracts/CipherGift.local.ts
# 把 CIPHERGIFT_ADDRESS / VAULT_ADDRESS 填进去
pnpm indexer:dev               # http://localhost:42069
```

```bash
# packages/site/.env.local
NEXT_PUBLIC_INDEXER_URL=http://localhost:42069
NEXT_PUBLIC_CUSDC_VAULT_ADDRESS=0x...   # 可选 ERC-20 vault
NEXT_PUBLIC_CZAMA_VAULT_ADDRESS=0x...   # 可选 ERC-20 vault
```

接口：`GET /health`、`/packets`、`/packets/:id`、`/sent?creator=0x…`、`/claims?claimer=0x…`、`/withdrawals?user=0x…`。

如果是托管部署，参考 [`packages/subgraph/README.md`](../packages/subgraph/README.md) 的 Graph 子图方案 —— 前端优先用 `NEXT_PUBLIC_SUBGRAPH_URL`，再回退到 REST indexer，最后回退到直读链上。

### Sepolia

```bash
# packages/foundry/.env.local（或 shell 环境变量）
export SEPOLIA_RPC_URL=https://...
export DEPLOYER_PRIVATE_KEY=0x...
export ETHERSCAN_API_KEY=...     # 可选——开启验证
export CUSDC_TOKEN_ADDRESS=0x... # 可选——部署 / 注册 cUSDC vault
export CZAMA_TOKEN_ADDRESS=0x... # 可选——部署 / 注册 cZAMA vault
export MULTISIG_OWNER=0x...      # 可选——挂起两步式所有权转移

pnpm deploy:sepolia              # 部署 + 重新生成 packages/site/contracts/*.ts
                                 # 把生成的 CipherGift.ts / ConfidentialETHVault.ts 提交
```

如果设了 `MULTISIG_OWNER`，部署脚本只会**挂起**所有权转移 —— deployer EOA 仍然是 owner，需要 multisig 用自己的地址调一次 `CipherGift.acceptOwnership()` 才正式生效。这是有意设计：multisig 地址写错也不会把合约锁死。

部署完后设置前端环境变量（`packages/site/.env.local`）：

- `NEXT_PUBLIC_INDEXER_URL`（或 `NEXT_PUBLIC_SUBGRAPH_URL` 用托管）
- `NEXT_PUBLIC_CUSDC_VAULT_ADDRESS`、`NEXT_PUBLIC_CZAMA_VAULT_ADDRESS`（如果注册了对应 vault）
- 可选 `NEXT_PUBLIC_POSTHOG_KEY`、`NEXT_PUBLIC_SENTRY_DSN` 用于观测

部署后建议跑一遍冒烟测试：deposit → 创建 equal 红包 → claim → 退款一个过期红包。

### 暂停策略

`CipherGift.pause()` 是合约 owner（一般是 multisig）持有的应急控制开关。它**只**挡 `_createPacket`，不挡领取与退款 —— 目的是阻断新增风险，但不锁住已有资金：

- `claim`、`claimTargeted`、`claimWithPassword` —— 始终可用
- `closeAndRefund` —— 始终可用
- `createPacket`、`createPacketWithAsset` —— pause 期间被挡

### 测试

```bash
pnpm contracts:test            # forge test -vv
```

覆盖：

- vault 存款 / 取款 / orchestrator 权限门控
- equal split 给 N 个领取人各精确分到 `total / shares`
- random 加起来等于 total，最后一个领取人吃残值，全部领完后残值为 0
- targeted 拒绝非 allowlist 地址，要求非空名单
- 过期 / 退款（仅创建者，仅过期后，幂等）
- 不能重复领取 / 过期后不能领 / 满额后不能领
- ERC-20 vault 存款 / gateway 取款 / pending withdraw 期间的 debit 门控
- ETH 红包和 cUSDC 红包共存，互不串账

---

## 路由

| 路由         | 用途                                                                                         |
| ------------ | -------------------------------------------------------------------------------------------- |
| `/`          | 连接钱包页（RainbowKit picker），连上后跳转 `/dashboard`                                     |
| `/dashboard` | Vault 余额（密文 → 点击解密）、活跃发出红包、快捷领取、汇总统计                              |
| `/send`      | 创建向导：资产 + 金额 + 类型 + 份数 +（如果 targeted）allowlist + 过期 + 备注 → SigningModal |
| `/inbox`     | 可领取红包的双列网格；`OpenModal` 跑 claim / 密码 claim + 解密                                |
| `/sent`      | 用户创建过的所有红包列表                                                                     |
| `/sent/[id]` | 红包详情（创建者视角）：密文总额、领取数、分享 link、过期后的退款按钮                        |
| `/history`   | 完整活动表                                                                                   |
| `/r/[id]`    | 公共分享 link 落地页 —— 连接钱包后自动弹 claim modal                                         |
| `/status`    | 运营状态页：indexer 健康度和 fallback 可见性                                                 |
| `/vault`     | 用户金库页：在 `ConfidentialETHVault` 上 deposit / 解密 / 取款                                |

---

## 关键设计决策

1. **为什么要 vault wrapper，不直接每包用 `msg.value`？** 入金 / 出金时的明文边界绕不开，但把余额 + 红包流程都关进加密账本里，能让**内部**资金移动（创建者 → 红包 → 领取人）保持机密。没有 vault 的话，create 时 `msg.value` 就把总额泄露了。

2. **为什么 foundry.toml 里要 `via_ir = true`？** `Packet` 结构体加上 `createPacket` 内部多次 `FHE.allow`，密文 locals 是 32 字节 handle，会把 EVM 栈深度推过传统编译路径的限制。`viaIR` 干净解决。

3. **为什么 RANDOM 用明文 `maxShareScalar`？** fhevm-solidity 0.11 的 `FHE.rem` 只接受标量（明文）除数；密文除数 `rem` 需要单独的（贵得多的）库。让发送方显式选这个上界，保持 trade-off 在 UX 里可见。

4. **为什么 TARGETED 用 Merkle salt 而不是链上 allowlist mapping？** TARGETED 红包链上只存 `keccak(salt, address)` 叶子的 Merkle root。每位邀请人收到一条夹带其专属 salt + proof 的私链。这把邀请名单留在链下，同时保留了便宜的 claim 时验证。

5. **为什么用 vault 地址当 asset ID？** `CipherGift` 不需要知道 token 的 decimals、symbol、transfer 逻辑。把红包绑定到已注册的 vault 地址，让 packet 的数学运算与资产无关 —— ETH、cUSDC、cZAMA 共享同一份加密 claim/refund 代码。

6. **为什么是 password hash 而不是密文比对？** 密码红包是产品层的便利特性：密码本身链下分发，合约只存 `keccak256(abi.encode(packetId, keccak256(bytes(password))))`。这能挡住"分享链接被随便转发"的场景，但不能替代高熵密钥 —— 弱密码仍然可以从公开的交易数据里被暴力破解。

7. **为什么 withdraw 要两阶段？** 释放真实的 ETH / ERC-20 需要明文，但用户余额是密文。Vault 用 `FHE.makePubliclyDecryptable` 给加密 handle 拍个快照，`fulfillWithdraw` 验证 KMS 证明后才转账。请求挂起期间所有 debit 路径被挡，确保兑付的明文不会超过当前加密余额。

---

## 技术参考

- `@fhevm/solidity` 0.11.1 —— `FHE.fromExternal`、`FHE.add/sub/div/rem`、`FHE.allow/allowThis`、`FHE.randEuint64`、`FHE.select`
- `forge-fhevm` rev `eba2324` —— `FhevmTest`、`encryptUint64`、`signUserDecrypt`、`userDecrypt`
- `@zama-fhe/react-sdk` 3.0.0 —— `useEncrypt`、`useUserDecrypt`、`useAllow`、`useIsAllowed`
- Next.js 15.2、React 19、wagmi 2.19、viem 2.48、RainbowKit 2.2

## 许可证

BSD-3-Clause-Clear。详见 [LICENSE](../LICENSE)。

## 鸣谢

- [zama-ai/fhevm-react-template](https://github.com/zama-ai/fhevm-react-template) —— Next.js + Foundry 脚手架，wagmi + RainbowKit 配置，ABI codegen
- [zama-ai/forge-fhevm](https://github.com/zama-ai/forge-fhevm) —— Solidity 测试 helper（FHE 加密 / 解密 cheatcode）
- [patriciaOrtuno28/Paychain-On-Chain-Payroll](https://github.com/patriciaOrtuno28/Paychain-On-Chain-Payroll) —— 加密余额 vault 模式参考

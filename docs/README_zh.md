<div align="center">

<br/>

<img src="https://img.shields.io/badge/CipherGift-FFD208?style=for-the-badge&labelColor=000000&logoColor=FFD208" height="60" alt="CipherGift"/>

<br/><br/>

# 基于 Zama FHEVM 的密文红包协议

### *红包、空投、团队分润 —— 让金额从「策略上保密」变成「数学上不可读」。*

<br/>

[![Live Demo](https://img.shields.io/badge/在线%20Demo-Vercel-FFD208?style=for-the-badge&labelColor=000000&logo=vercel&logoColor=FFD208)](https://www.ciphergift.xyz)
[![YouTube Demo](https://img.shields.io/badge/观看演示-YouTube-FFD208?style=for-the-badge&labelColor=000000&logo=youtube&logoColor=FFD208)](https://youtu.be/RghDukEKUJ0)

[![Built with fhEVM](https://img.shields.io/badge/Built%20with-fhEVM-FFD208?style=flat-square&labelColor=000000)](https://www.zama.ai/)
[![Zama Bounty](https://img.shields.io/badge/Zama-Bounty-FFD208?style=flat-square&labelColor=000000)](https://www.zama.ai/)
[![FHEVM](https://img.shields.io/badge/FHEVM-v0.11-FFD208?style=flat-square&labelColor=000000)](https://docs.zama.ai/fhevm)
[![Network](https://img.shields.io/badge/Network-Sepolia%20%7C%20Localhost-FFD208?style=flat-square&labelColor=000000)]()
[![Stack](https://img.shields.io/badge/Stack-Next.js%20%7C%20Foundry-FFD208?style=flat-square&labelColor=000000)]()
[![License](https://img.shields.io/badge/License-BSD--3--Clause--Clear-FFD208?style=flat-square&labelColor=000000)]()

<br/>

[English](../README.md) · [中文](./README_zh.md)

<br/>

---

<table width="100%">
<tr>
<td width="100%" valign="top" align="center">

**🚀 &nbsp;立刻上手**

[在 Sepolia 体验](https://www.ciphergift.xyz) &nbsp;·&nbsp; [观看 YouTube 演示](https://youtu.be/RghDukEKUJ0) &nbsp;·&nbsp; [来抢发布日红包](https://www.ciphergift.xyz/r/12)

</td>
</tr>
<tr>
<td width="100%" valign="top" align="center">

**📖 &nbsp;了解项目**

[概述](#-概述) &nbsp;·&nbsp; [为什么是 CipherGift](#-为什么是-ciphergift) &nbsp;·&nbsp; [红包类型](#-红包类型) &nbsp;·&nbsp; [参与角色](#-参与角色) &nbsp;·&nbsp; [架构](#-架构) &nbsp;·&nbsp; [合约](#-合约) &nbsp;·&nbsp; [FHE ACL 链路](#-fhe-acl-链路) &nbsp;·&nbsp; [关键设计取舍](#-关键设计取舍)

</td>
</tr>
<tr>
<td width="100%" valign="top" align="center">

**🛠️ &nbsp;构建与部署**

[环境要求](#-环境要求) &nbsp;·&nbsp; [本地部署](#-本地部署) &nbsp;·&nbsp; [Sepolia 部署](#-sepolia-部署) &nbsp;·&nbsp; [前端路由](#-前端路由) &nbsp;·&nbsp; [技术栈](#-技术栈)

</td>
</tr>
</table>

---

</div>

<br/>

## 🎬 在线演示

<div align="center">
<table>
<tr>
<td align="center" width="50%">

### 🌐 立即体验

[![Live Demo](https://img.shields.io/badge/打开%20Live%20Demo-Vercel-ffffff?style=for-the-badge&logo=vercel&logoColor=000000&labelColor=000000)](https://www.ciphergift.xyz)

部署在 **Sepolia 测试网** 上<br/>
连接 MetaMask 或任意 RainbowKit 钱包<br/>
即可发送和领取红包。

</td>
<td align="center" width="50%">

### 🎥 观看演示

[![Watch on YouTube](https://img.shields.io/badge/观看演示-YouTube-FF0000?style=for-the-badge&logo=youtube&logoColor=white&labelColor=FF0000)](https://youtu.be/RghDukEKUJ0)

完整的 **端到端流程演示** ——<br/>
存款、发送、领取、解密、<br/>
退款、提现一气呵成。

</td>
</tr>
</table>
</div>

<br/>

## 🎉 发布日红包

<div align="center">

我给大家发了一个加密红包，正在过期倒计时。扫码或点击卡片来抢 —— 只有你自己的钱包能解密你那一份。

<a href="https://www.ciphergift.xyz/r/12">
  <img src="./images/ciphergift-packet-12.png" alt="CipherGift 发布日红包 #12 — 扫码领取" width="320" />
</a>

[**ciphergift.xyz/r/12 →**](https://www.ciphergift.xyz/r/12)

</div>

<br/>

## 🚀 部署地址

### Sepolia &nbsp;·&nbsp; chainId `11155111`

| 合约 | 地址 |
|---|---|
| `CipherGift` | [`0x1BFE706fC87B8C4Fef962b1a275586769FAD746E`](https://sepolia.etherscan.io/address/0x1BFE706fC87B8C4Fef962b1a275586769FAD746E) |
| `ConfidentialETHVault` | [`0x01B008Ed2fA95858D9bfB730F58B5a49fA77b588`](https://sepolia.etherscan.io/address/0x01B008Ed2fA95858D9bfB730F58B5a49fA77b588) |
| `ConfidentialERC20Vault`（cUSDC） | *暂未部署* |
| `ConfidentialERC20Vault`（cZAMA） | *暂未部署* |

> 前端使用的地址绑定文件由代码自动生成，位于 [`packages/site/contracts/`](../packages/site/contracts/)。本地链（`chainId 31337`）的部署在同名的 `*.local.ts`（已 gitignore）中。

<br/>

## 🔍 概述

**CipherGift** 是一个**密文红包协议**，可以把加密资产发给一个人、一个群、或一整张白名单 —— 而不暴露每个人到底领了多少。基于 **Zama 的 fhEVM**（全同态加密虚拟机），它能在链上保证**每份金额、每条领取记录在数学上不可读**。

这与今天所有红包 / 空投 dApp 的工作方式都根本不同。无论你用 Disperse 批量转账、用标准 Merkle 分发器做空投，还是在任何 L1 / L2 上发红包，每一笔领取都会以明文形式广播金额。任何人在区块浏览器上都能还原出完整的分布曲线：谁领得最多、谁领得最少、整条尾部曲线。

**CipherGift 把这个缺口完全堵上。** 每份金额以 FHE 加密的 `euint64` handle 形式存在，金库余额是密文，领取记录在链上**只能看出"领过了"**这件事，金额不会泄露。**只有指定收件人**能通过 per-recipient FHE ACL 授权解密自己那一份。

<br/>

## ⚡ 为什么是 CipherGift

<table>
<thead>
<tr>
<th>能力</th>
<th>传统加密红包 / 空投</th>
<th><strong>CipherGift</strong></th>
</tr>
</thead>
<tbody>
<tr>
<td>每份金额是否上链可见</td>
<td>❌ 在 Etherscan 上明文广播</td>
<td>✅ FHE 加密 · 仅领取人可解密</td>
</tr>
<tr>
<td>发送者金库余额</td>
<td>❌ 公开 ERC-20 余额</td>
<td>✅ FHE 加密 · 仅 owner 自己可解密</td>
</tr>
<tr>
<td>定向白名单空投</td>
<td>❌ Merkle 叶子上链泄露地址</td>
<td>✅ 仅存 root · 邀请人 salt 在链下</td>
</tr>
<tr>
<td>随机 / 拼手气分配</td>
<td>⚠️ 链下伪随机，再以明文上链</td>
<td>✅ 链上 <code>FHE.randEuint64</code> · <code>FHE.select</code> 取密文残值</td>
</tr>
<tr>
<td>口令红包</td>
<td>❌ 口令在 calldata 中泄露</td>
<td>✅ 存为 <code>keccak256(packetId, keccak(password))</code></td>
</tr>
<tr>
<td>未领取金额退款</td>
<td>⚠️ 手动处理 · 容易被困死</td>
<td>✅ 密文残值原路退回创建者金库</td>
</tr>
<tr>
<td>多资产支持</td>
<td>⚠️ 每种资产都得单独部一套</td>
<td>✅ ETH + ERC-20 vault 共用一份红包合约</td>
</tr>
</tbody>
</table>

> **一句话总结：** *"区块浏览器查不到金额"的红包。* 任何在透明链上发过红包、被群友互相比对过数字的人，都能立刻 get 到这套机制的价值。

<br/>

## 🎁 红包类型

CipherGift 内置 **四种红包原语**，全部端到端加密。每一种对应一种不同的分配意图。

<table>
<thead>
<tr>
<th>类型</th>
<th>分配方式</th>
<th>隐私属性</th>
<th>典型用途</th>
</tr>
</thead>
<tbody>
<tr>
<td><strong>EQUAL（等额）</strong></td>
<td>每个领取人精确拿到 <code>total / shares</code></td>
<td>每份金额加密，但可由 total + shares 推断（取决于发送者公开多少）</td>
<td>团队公平分润 · 固定奖金</td>
</tr>
<tr>
<td><strong>RANDOM（拼手气）</strong></td>
<td>每份由 <code>FHE.randEuint64()</code> 抽取，受发送者设置的明文上限约束。最后一个领取人通过 <code>FHE.select</code> 取走加密残值</td>
<td>每份金额完全加密，仅明文上限公开</td>
<td>拼手气红包 · 病毒式发包</td>
</tr>
<tr>
<td><strong>TARGETED（定向）</strong></td>
<td>等额分配，但只有 Merkle 白名单上的地址才能领取</td>
<td>链上仅存 root；邀请名单通过 per-recipient salt + proof 留在链下</td>
<td>保密团队分配 · 私密白名单空投</td>
</tr>
<tr>
<td><strong>PASSWORD（口令）</strong></td>
<td>等额分配，由共享口令把守</td>
<td>合约存 <code>keccak256(packetId, keccak(password))</code> · 口令永远不上链</td>
<td>临时分享场景 · 线下会议派发</td>
</tr>
</tbody>
</table>

四种类型都支持 **过期 + 创建者退款** 未领取的密文残值。红包默认由 **cETH** 担保，也可以挂在任意已注册的 ERC-20 vault 上（如 **cUSDC** / **cZAMA**）。

<br/>

## 👥 参与角色

CipherGift 是完全无许可的 —— 没有雇主注册表、没有分用户的 onboarding 流程。三类角色从合约设计中自然涌现。

<br/>

### 🏗️ Platform Admin（平台管理员）

> 协议级合约的部署者与所有者。

Platform Admin 负责：

- 部署 `ConfidentialETHVault` 和 `CipherGift`（每条网络一份）
- 可选：部署并通过 `CipherGift.registerAsset(vaultAddress)` 注册 `ConfidentialERC20Vault` 实例（cUSDC、cZAMA 等）
- 持有 owner key，**仅**用于：紧急 `pause()`（仅阻断新建红包）、`unpause()`、`transferOwnership()`（两步式）

生产环境下这个角色应当由**多签**持有。部署脚本通过 `MULTISIG_OWNER` 支持「分阶段所有权移交」—— EOA 在多签调用 `acceptOwnership()` 之前一直是 owner，所以**多签地址打错也不会把合约砖死**。

Platform Admin **从不**接触用户资金、白名单或领取流程。

<br/>

### 🎁 Sender（发送者）

> 想把加密价值发给一个或多个收件人的任何人。

**链上动作：**
1. 调 `vault.depositETH()`（ERC-20 vault 用 `vault.deposit(amount)`）把明文资产 wrap 成加密 vault 单位
2. 调 `CipherGift.createPacket(...)` 或 `createPacketWithAsset(assetId, ...)`，传入 FHE 加密的总额和红包类型
3. 客户端可选：生成 Merkle root + per-invitee salt（TARGETED）或 hash 一个口令（PASSWORD）
4. 把生成的 `/r/[id]` 链接、per-invitee salt 链接、或口令通过线下渠道分享出去
5. 过期后调 `closeAndRefund(id)` 取回加密残值

**Sender 能解密的内容：**
- 自己的金库余额
- 自己最初加密的总额（毕竟是他自己加密的）
- 自己创建的每个红包的剩余金额（FHE ACL 授权）
- **看不到** 任何单个领取人的份额 —— 连发送者也看不到谁领了多少

<br/>

### 🙋 Claimer（领取者）

> 持有任意一种合法领取凭据：公开链接（RANDOM/EQUAL）、Merkle proof（TARGETED）、或口令（PASSWORD）。

**链上动作：**
1. 打开分享链接 `/r/[id]`，自动弹出 OpenModal
2. 调 `claim(id)`、`claimTargeted(id, salt, proof)`、或 `claimWithPassword(id, password)`
3. 在浏览器中通过 `userDecrypt` / `signUserDecrypt` 解密自己那份
4. 可选：调 `vault.requestWithdraw(...)` → `fulfillWithdraw(...)` 把加密余额提现成明文 ETH / ERC-20

**Claimer 能解密的内容：**
- 自己领过的每个红包的份额（FHE ACL 严格绑定到领取时的 `msg.sender`）
- 自己的加密金库余额
- **看不到** 其他领取人的份额、剩余金额、或其他红包的总额

<br/>

## 🏛️ 架构

```
┌─────────────────────────────────────────────────────────────────┐
│                       CipherGift PROTOCOL                       │
│                                                                 │
│  ┌────────────────────────────────────────────────────────┐     │
│  │                    BLOCKCHAIN LAYER                    │     │
│  │                  (Ethereum / Sepolia)                  │     │
│  │                                                        │     │
│  │  ┌──────────────────────────────────────────────────┐  │     │
│  │  │  ConfidentialETHVault   (Admin 部署)             │  │     │
│  │  │  加密 ETH 余额 (euint64, gwei 单位)              │  │     │
│  │  └──────────────────────────────────────────────────┘  │     │
│  │  ┌──────────────────────────────────────────────────┐  │     │
│  │  │  ConfidentialERC20Vault [cUSDC, cZAMA, …]        │  │     │
│  │  │  加密 ERC-20 余额 · 网关式提现                   │  │     │
│  │  └──────────────────────────────────────────────────┘  │     │
│  │                           │                            │     │
│  │  ┌──────────────────────────────────────────────────┐  │     │
│  │  │  CipherGift   (Admin 部署)                       │  │     │
│  │  │  叠加在任意 IConfidentialVault 之上的红包逻辑    │  │     │
│  │  │  EQUAL · RANDOM · TARGETED · PASSWORD            │  │     │
│  │  │  euint64 总额 · per-claimer FHE ACL · 退款       │  │     │
│  │  └──────────────────────────────────────────────────┘  │     │
│  └────────────────────────────────────────────────────────┘     │
│                                                                 │
│  ┌────────────────────────────────────────────────────────┐     │
│  │              INDEXING LAYER（可选）                    │     │
│  │                                                        │     │
│  │  packages/indexer  · viem 轮询 + Hono HTTP API         │     │
│  │  packages/subgraph · The Graph 子图（替代方案）        │     │
│  │                                                        │     │
│  │  前端优先使用 subgraph → REST indexer → 直读链         │     │
│  └────────────────────────────────────────────────────────┘     │
│                                                                 │
│  ┌────────────────────────────────────────────────────────┐     │
│  │          FRONTEND  (Next.js 15 / packages/site)        │     │
│  │                                                        │     │
│  │  /            连接钱包 · RainbowKit                    │     │
│  │  /dashboard   金库余额 · 已发 / 可领汇总               │     │
│  │  /send        SendWizard · 4 种红包 · SigningModal     │     │
│  │  /inbox       可领红包 · OpenModal · DecryptLog        │     │
│  │  /sent[/id]   创建者视图 · 分享链接 · 退款             │     │
│  │  /vault       存款 · 解密 · 两阶段提现                 │     │
│  │  /r/[id]      分享链接落地页                           │     │
│  │                                                        │     │
│  │  wagmi · RainbowKit · @zama-fhe/react-sdk              │     │
│  └────────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
```

<br/>

## 📜 合约

链上协议由四份合约组成。Platform Admin 每条链只部署一次；用户直接交互，不需要任何注册步骤。

<br/>

### `IConfidentialVault`

> **接口 · 与资产类型解耦的抽象**

`CipherGift` 调用的接口。任何暴露加密内部记账的金库都能接进来。

| 函数 | 说明 |
|---|---|
| `internalCredit(to, amountEnc)` | 仅 orchestrator · 增加加密单位 |
| `internalDebit(from, amountEnc)` | 仅 orchestrator · 减少加密单位 |
| `internalTransfer(from, to, amountEnc)` | 仅 orchestrator · 加密单位转账 |
| `balanceOf(user) → euint64` | 加密余额 handle |

资产精度、存款 / 提现链路、网关逻辑全部封在金库里 —— `CipherGift` 完全看不到。

<br/>

### `ConfidentialETHVault`

> **部署者：** Platform Admin · **承载 cETH 红包**

托管池化的 ETH，每个用户的余额存为 `mapping(address => euint64)`，单位是 **gwei**（1 ETH = 1e9 vault unit，正好塞进 `euint64`）。

| 函数 | 调用者 | 说明 |
|---|---|---|
| `depositETH() payable` | 任何人 | 把 ETH wrap 成加密余额 |
| `requestWithdraw(encryptedAmount, proof)` | 用户本人 | 把加密余额快照交给 KMS gateway 解密 |
| `fulfillWithdraw(...)` | KMS 回调 | 校验证明后释放明文 ETH |
| `internalCredit / internalDebit / internalTransfer` | 仅 `CipherGift` | 加密内部转账 |
| `balanceOf(user)` | 任何人（返回密文） | 加密余额 handle |

提现请求挂起期间，扣款路径会被阻断，避免最终释放的明文金额超过当前加密余额。

<br/>

### `ConfidentialERC20Vault`

> **部署者：** Platform Admin（每种资产一份）· **承载 cUSDC / cZAMA / 任意 ERC-20 红包**

ETH 金库的 ERC-20 镜像版本。`deposit(tokenAmount)` 通过 `transferFrom` 拉取已 approve 的代币，转换成 vault 单位（`unitDecimals = 6` 给 cUSDC / cZAMA），加密后入账。提现走相同的 KMS 网关 request / fulfill 流程。

<br/>

### `CipherGift`

> **部署者：** Platform Admin · **核心红包逻辑**

红包合约本体。架在任意 `IConfidentialVault` 之上，编排 create / claim / refund。

| 函数 | 调用者 | 说明 |
|---|---|---|
| `createPacket(...)` | Sender | 默认 cETH 红包 — EQUAL / RANDOM / TARGETED / PASSWORD |
| `createPacketWithAsset(assetId, ...)` | Sender | 把红包绑定到一个已注册的 ERC-20 vault |
| `claim(id)` | Claimer | 领取 RANDOM / EQUAL · 在 FHE 下抽份额 |
| `claimTargeted(id, salt, proof)` | Claimer | Merkle 守门的 TARGETED 红包 |
| `claimWithPassword(id, password)` | Claimer | hash 守门的 PASSWORD 红包 |
| `closeAndRefund(id)` | 创建者 | 过期后把加密残值退回创建者金库 |
| `registerAsset(vault)` / `unregisterAsset(vault)` | Owner | ERC-20 金库白名单管理 |
| `pause()` / `unpause()` | Owner | 紧急控制：仅阻断新建红包 |

**关键设计：**
- 每次领取生成的份额密文存在 `mapping(uint256 => mapping(address => euint64)) claimedAmount` 中，并以 `FHE.allow(share, claimer)` 授权 —— 只有领取人本人能解密
- `pause()` 仅阻断 `_createPacket` —— `claim`、`claimTargeted`、`claimWithPassword`、`closeAndRefund` 永远开放，资金永远不会被困死
- TARGETED 红包链上**只**存 Merkle root，邀请名单不会上链

<br/>

## 🔐 FHE ACL 链路

每一处加密变更点都会重新把新生成的密文授权给需要读取它的角色。

| 操作 | `FHE.allowThis` | `FHE.allow(_, claimer)` | `FHE.allow(_, vault)` |
|---|---|---|---|
| `createPacket → totalEnc` | ✓ | — | ✓ |
| `createPacket → equalShareEnc`（EQUAL/TARGETED） | ✓ | —（创建者已显式获得） | ✓ |
| `claim → share` | ✓ | ✓ | ✓（即使是 EQUAL 这一步也必须 re-allow —— RANDOM 路径会通过 `FHE.select` 产生全新的密文） |
| `claim → 更新后的 remainingAmount` | ✓ | （创建者） | ✓ |

> **为什么 EQUAL 也要重新 allow 一次？** 对于同一个 handle，`FHE.allow` 是幂等的，但 RANDOM 路径每次会通过 `FHE.select` 生成全新的密文。两个分支都统一走一遍 allow，可以让权限流可审计，并避免一类「份额已设置但未授权」的 bug。

<br/>

## 🎲 随机份额算法

```solidity
if (isLastClaimer) {
    share = remainingAmount;          // 取走加密残值
} else {
    randomVal  = FHE.randEuint64();
    capped     = FHE.rem(randomVal, maxShareScalar);   // scalar 明文上界
    overshoot  = FHE.lt(remainingAmount, capped);
    share      = FHE.select(overshoot, remainingAmount, capped);
}
```

`maxShareScalar` 是明文（由发送者提供，UI 默认设为 `2 × total / shares`）。这会**暴露每份金额的上界**，但每个份额本身仍然加密。最后一个领取人会拿走密文残值，所以总额一定能完全分完。

> **为什么是明文 scalar？** `fhevm-solidity 0.11` 中的 `FHE.rem` 只接受标量（明文）除数。加密除数版本需要一个开销大得多的库。让发送者明确选择这个上界，反而把权衡显式化了。

<br/>

## 🔀 链上 / 链下设计

CipherGift 把**所有敏感数据放在链上、用 FHE 加密**，只把白名单邀请列表留在链下 —— 因为本来就没有可枚举的内容。

<br/>

### 上链且加密

| 数据 | 类型 | 为什么用 FHE |
|---|---|---|
| 总额 | `euint64` | 必须上链才能信任分发；FHE 防止 `msg.value` 泄露 |
| 每份金额 | `euint64` | RANDOM 抽取在链上；EQUAL 在 FHE 下计算 |
| 每位领取人份额 | `euint64` | 领取记录证明资格但不暴露金额 |
| 金库余额（创建者 + 领取人） | `euint64` | 内部资金流动「创建者 → 红包 → 领取人」始终保密 |
| 每个红包的剩余金额 | `euint64` | 每次领取都更新；退款使用加密残值 |

<br/>

### 上链且明文（设计如此）

| 数据 | 为什么公开 |
|---|---|
| 创建者地址 | `closeAndRefund` 需要鉴权 |
| 过期时间戳 | 公开时间窗 · FHE 没有收益 |
| 份数 | 协调元数据 · 不是价值 |
| 备注（可选，发送者填） | UI 标签 · 由发送者自己决定要不要公开 |
| Asset ID（vault 地址） | 路由信息 · 红包必须知道入哪个金库 |
| Merkle root（TARGETED） | 校验只需要 root；salt 留在链下 |
| 口令哈希（PASSWORD） | `keccak256(packetId, keccak(password))` · 域分离防止跨包重放 |

<br/>

### 链下

| 数据 | 分发渠道 | 为什么不上链 |
|---|---|---|
| TARGETED 邀请人 salt + proof | per-invitee 链接 (`/r/[id]?s=…`) | 避免邀请名单广播上链 |
| PASSWORD 口令 | 由发送者自定义（线下） | 高熵秘密永远不该上链 |
| 包含敏感信息的 `note` | 发送者自定（推荐改放链下并加链接） | 备注默认是上链明文，是否公开由发送者决定 |

<br/>

## 🛡️ 关键设计取舍

1. **为什么用 vault 包一层，而不是每次红包都走 `msg.value`？**
   边界处的明文存款 / 提现是无法绕开的，但只要在加密 ledger 内部维持余额 + 红包流动，**「创建者 → 红包 → 领取人」的内部转账就能始终保密**。没有 vault 的话，总额会在创建时通过 `msg.value` 泄露。

2. **为什么 `foundry.toml` 里要 `via_ir = true`？**
   `Packet` struct + `createPacket` 内部多次 `FHE.allow` 调用，会让 EVM 栈在密文 locals（每个 32 字节 handle）下越过传统深度限制。`viaIR` 干净地解决了这一点。

3. **为什么 RANDOM 用明文 `maxShareScalar`？**
   `fhevm-solidity 0.11` 的 `FHE.rem` 只接受标量除数。让发送者明确选择上限，使权衡在 UX 层面变得显式可见。

4. **为什么用 Merkle salt 而不是链上白名单 mapping？**
   TARGETED 红包链上**只**存 `keccak(salt, address)` 叶子的 Merkle root。每位邀请人收到一条带自己 salt + proof 的私链。邀请人集合留在链下，但领取时校验依然便宜。

5. **为什么用 vault 地址作为 asset ID？**
   `CipherGift` 不需要代币精度、符号或 transfer 逻辑。把红包绑定到一个已注册的 vault 地址，让红包数学层与资产解耦 —— ETH、cUSDC、cZAMA 共用一份加密领取 / 退款代码。

6. **为什么是密码哈希而不是加密密码匹配？**
   合约存的是 `keccak256(abi.encode(packetId, keccak256(bytes(password))))`。这能拦住随意转发链接的场景，但**不能替代高熵秘密** —— 弱口令仍可被公开交易数据暴力破解。UI 会明确提示这个权衡。

7. **为什么提现要两阶段？**
   释放真实的 ETH / ERC-20 需要明文，但用户余额是加密的。金库通过 `FHE.makePubliclyDecryptable` 对加密 handle 做快照，`fulfillWithdraw` 在校验 KMS 证明后再释放明文。请求挂起期间扣款路径被阻断。

<br/>

## 🔒 安全与暂停策略

合约层应用纵深防御。

| 层 | 控制 |
|---|---|
| **金库** | 仅 orchestrator 可调 `internalCredit/Debit/Transfer` · 两阶段提现 · 提现挂起期间锁住扣款路径 · 严格 ACL 下的 per-user 加密余额 |
| **红包** | `FHE.allow(share, claimer)` 严格绑定到领取时的 `msg.sender` · per-packet `claimedAmount` mapping 防止重复领取 · 退款时校验过期 · 仅创建者可退款 · `_createPacket` 受 pause 守门 |
| **资产注册表** | 仅 owner 可 `registerAsset` / `unregisterAsset` · 红包的资产绑定在创建时锁定，之后不可变 |
| **所有权** | OpenZeppelin `Ownable2Step` —— 多签地址打错也不会把合约砖死 |

### 暂停策略

`CipherGift.pause()` 是合约 owner（通常是多签）持有的紧急控制。它**仅阻断 `_createPacket`** —— 领取与退款路径始终开放。意图是阻断**新增**敞口，但不困住已有资金。

| 函数 | 暂停态 |
|---|---|
| `createPacket` / `createPacketWithAsset` | ⛔ 阻断 |
| `claim` / `claimTargeted` / `claimWithPassword` | ✅ 始终可用 |
| `closeAndRefund` | ✅ 始终可用 |
| 金库 `depositETH` / `requestWithdraw` / `fulfillWithdraw` | ✅ 始终可用 |

> ⚠️ 本项目**未经过正式审计**。智能合约尚未接受独立审计。请勿在完成安全审计前用于承载大额资金。

<br/>

## 🗂️ 仓库结构

```
ciphergift/
│
├── packages/
│   ├── foundry/                        # Solidity + Forge
│   │   ├── src/
│   │   │   ├── IConfidentialVault.sol         # 加密余额金库接口
│   │   │   ├── ConfidentialETHVault.sol       # 每用户加密 ETH 余额
│   │   │   ├── ConfidentialERC20Vault.sol     # 每用户加密 ERC-20 余额
│   │   │   └── CipherGift.sol                 # 架在金库之上的红包逻辑
│   │   ├── script/DeployCipherGift.s.sol
│   │   └── test/{ConfidentialETHVault,ConfidentialERC20Vault,CipherGift}.t.sol
│   │
│   ├── site/                           # Next.js 15 App Router
│   │   ├── app/                        # 路由（一屏一页）
│   │   ├── components/
│   │   │   ├── chrome/                 # AppChrome, SideNav, Logo
│   │   │   ├── primitives/             # Btn, Cipher, Coin, Stat, …
│   │   │   ├── send/                   # SendWizard, SigningModal
│   │   │   └── inbox/                  # PacketCard, OpenModal, DecryptLog
│   │   ├── hooks/                      # FHE I/O (useEncryptUint, useUserBalance, useClaim, …)
│   │   ├── lib/                        # format, packet-types, share-link, allowlist, indexer
│   │   ├── contracts/                  # 自动生成的 TS ABI / 地址
│   │   └── services/web3/              # wagmi 配置 + signer
│   │
│   ├── indexer/                        # viem 轮询 + Hono HTTP server
│   │   └── src/{index,poller,store,abi}.ts
│   │
│   └── subgraph/                       # The Graph 子图（托管替代方案）
│
├── scripts/
│   ├── chain.sh                        # 本地 FHEVM 栈
│   ├── deploy-localhost.sh             # forge script + ABI 代码生成
│   ├── deploy-sepolia.sh
│   └── generateTsAbis.ts               # broadcast → packages/site/contracts/*.ts
│
└── docs/
    ├── README_zh.md                    # 中文 README
    └── images/                         # README 图片资源
```

<br/>

## 🛠️ 环境要求

| 工具 | 版本 | 安装 |
|---|---|---|
| **Node.js** | 20+ | [nodejs.org](https://nodejs.org/) |
| **pnpm** | 10+ | `npm i -g pnpm` |
| **Foundry** | latest | [getfoundry.sh](https://getfoundry.sh) |
| **MetaMask** *（或任意 RainbowKit 钱包）* | latest | [metamask.io](https://metamask.io/download/) |
| **Git** | 任意 | [git-scm.com](https://git-scm.com/) |

```bash
# 检查环境
node -v       # v20.x
pnpm -v       # 10.x
forge --version
```

<br/>

## 💻 本地部署

本地部署会跑一套 **本地 FHEVM 栈**（anvil + cleartext FHE host），不需要 Sepolia ETH。

<br/>

### Step 1 — 克隆并安装

```bash
git clone https://github.com/NavaFee/ciphergift.git
cd ciphergift
pnpm install
pnpm contracts:install   # forge soldeer install
pnpm contracts:build     # forge build
```

<br/>

### Step 2 — 起本地 FHEVM 链

打开 **Terminal A**，让它一直跑：

```bash
pnpm chain
```

这会启动 anvil + FHEVM cleartext host。终端会打印一批已注资的测试账户和私钥 —— 复制其中两个，准备分别作为 **Sender** 和 **Claimer** 导入钱包。

<br/>

### Step 3 — 部署合约

打开 **Terminal B**：

```bash
pnpm deploy:localhost
```

这会部署 `ConfidentialETHVault` + `CipherGift`，并自动跑 `generateTsAbis.ts` 把本地地址 + ABI 写到 `packages/site/contracts/*.ts`。前端下次启动会自动发现这些地址。

<br/>

### Step 4 — 启动前端 dApp

打开 **Terminal C**：

```bash
pnpm start
```

前端会跑在 [http://localhost:3000](http://localhost:3000)。

<br/>

### Step 5 *（可选）* — 跑 indexer

不跑也行 —— 没有 indexer 时前端会直接读链（本地 demo 够用，长寿命网络上会变慢）。配上 indexer 后，前端会优先调它，挂掉时透明降级到直读链。

打开 **Terminal D**：

```bash
cp packages/indexer/.env.example packages/indexer/.env.local
# 填写 CIPHERGIFT_ADDRESS / VAULT_ADDRESS
# 部署后查看 packages/site/contracts/CipherGift.local.ts
pnpm indexer:dev          # http://localhost:42069
```

然后在 `packages/site/.env.local` 中：

```bash
NEXT_PUBLIC_INDEXER_URL=http://localhost:42069
```

<br/>

### Step 6 — 钱包配置 localhost

| 字段 | 值 |
|---|---|
| Network Name | `FHEVM Localhost` |
| RPC URL | `http://127.0.0.1:8545` |
| Chain ID | `31337` |
| Currency Symbol | `ETH` |

用 Step 2 里打印的两个私钥导入两个账户 —— 一个发红包，一个领。

<br/>

### 跑合约测试

```bash
pnpm contracts:test       # forge test -vv
```

测试覆盖范围：

- 金库 deposit / withdraw / orchestrator 鉴权
- 等额红包给 N 个领取人精确分发 `total / shares`
- 随机红包总和等于 total · 最后一个领取人取残值 · 全部领完后残值 = 0
- 定向红包拒绝非白名单地址 · 要求非空白名单
- 过期 / 退款（仅创建者 · 仅过期后 · 幂等）
- 不能重复领 · 过期后不能领 · 全部领完后不能再领
- ERC-20 vault deposit / 网关式提现 / 提现挂起期间扣款锁
- ETH 与 cUSDC 红包共存且金库余额互不串

<br/>

## 🌐 Sepolia 部署

**Chain ID：** `11155111` · **FHEVM：** v0.11

<br/>

### Step 1 — 拿一个 Sepolia RPC URL

任选其一：

- **Infura：** [developer.metamask.io](https://developer.metamask.io/) → Ethereum → Sepolia → `https://sepolia.infura.io/v3/<KEY>`
- **Alchemy：** [alchemy.com](https://www.alchemy.com/) → Ethereum Sepolia → `https://eth-sepolia.g.alchemy.com/v2/<KEY>`

<br/>

### Step 2 — 给部署账户充 Sepolia ETH

任选其一：[Google Cloud Web3 Faucet](https://cloud.google.com/application/web3/faucet/ethereum/sepolia)、[Chainlink Faucet](https://faucets.chain.link/sepolia)、[Infura Faucet](https://www.infura.io/faucet/sepolia)。

<br/>

### Step 3 — 配环境变量

```bash
# packages/foundry/.env.local（或导出到 shell）
export SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_KEY
export DEPLOYER_PRIVATE_KEY=0x...
export ETHERSCAN_API_KEY=...        # 可选 — 启用合约验证
export CUSDC_TOKEN_ADDRESS=0x...    # 可选 — 部署并注册 cUSDC vault
export CZAMA_TOKEN_ADDRESS=0x...    # 可选 — 部署并注册 cZAMA vault
export MULTISIG_OWNER=0x...         # 可选 — 分阶段移交所有权
```

> **为什么 `MULTISIG_OWNER` 是分阶段而不是直接移交：** 设了之后部署脚本只**预备**移交 —— 部署 EOA 仍然是 owner，直到多签从自己地址调用 `acceptOwnership()`。这是有意为之 —— **多签地址打错也不会把合约砖死**。

<br/>

### Step 4 — 部署

```bash
pnpm deploy:sepolia
# 部署 + 自动重新生成 packages/site/contracts/*.ts
# 把生成的 CipherGift.ts / ConfidentialETHVault.ts 提交到仓库
```

<br/>

### Step 5 — 配置前端

```bash
# packages/site/.env.local
NEXT_PUBLIC_INDEXER_URL=https://...                       # 或托管子图用 NEXT_PUBLIC_SUBGRAPH_URL
NEXT_PUBLIC_CUSDC_VAULT_ADDRESS=0x...                     # 可选
NEXT_PUBLIC_CZAMA_VAULT_ADDRESS=0x...                     # 可选
NEXT_PUBLIC_POSTHOG_KEY=...                               # 可选 — 观测
NEXT_PUBLIC_SENTRY_DSN=...                                # 可选
```

托管索引方案见 [`packages/subgraph/README.md`](../packages/subgraph/README.md)。前端优先使用 `NEXT_PUBLIC_SUBGRAPH_URL`，失败时回退到 REST indexer，最后回退到直读链。

<br/>

### Step 6 — 烟雾测试

部署后建议覆盖：

1. `depositETH()` 进金库
2. 创建一个 EQUAL 红包
3. 用第二个钱包领取
4. 等过期后退款

<br/>

## 📍 前端路由

| 路由 | 用途 |
|---|---|
| `/` | 连接钱包页 · RainbowKit 选择器 · 连上之后跳转 `/dashboard` |
| `/dashboard` | 金库余额（密文 → 点击解密）· 已发红包 · 快速领取 · 汇总 |
| `/send` | 发送向导：资产 + 金额 + 类型 + 份数 + （定向时的白名单）+ 过期 + 备注 → SigningModal |
| `/inbox` | 双列网格列出可领红包 · `OpenModal` 跑 claim / 口令领取 + 解密 |
| `/sent` | 列出当前用户发过的所有红包 |
| `/sent/[id]` | 红包详情（创建者视图）· 加密总额 · 已领数 · 分享链接 · 过期后退款按钮 |
| `/history` | 完整活动表 |
| `/r/[id]` | 公开分享链接落地页 —— 连上钱包后自动弹领取弹窗 |
| `/status` | 运营状态页 · indexer 健康度 · 降级可见性 |
| `/vault` | 用户金库：针对 `ConfidentialETHVault` 的存款 / 解密 / 提现 |

<br/>

## 🧪 技术栈

| 层 | 技术 |
|---|---|
| **区块链** | Ethereum · Solidity `^0.8.27` · fhEVM v0.11（Zama） |
| **FHE** | `@fhevm/solidity` 0.11.1 · `@zama-fhe/react-sdk` 3.0.0 · `forge-fhevm` rev `eba2324` |
| **加密类型** | `euint64` · `FHE.fromExternal` · `add/sub/div/rem` · `allow/allowThis` · `randEuint64` · `select` · `makePubliclyDecryptable` |
| **合约工具** | Foundry · Forge · Soldeer |
| **前端** | Next.js 15.2 · React 19 · TypeScript |
| **链上客户端** | wagmi 2.19 · viem 2.48 · RainbowKit 2.2 |
| **索引** | viem 轮询 + Hono HTTP（REST）· The Graph 子图（可选托管） |
| **Monorepo** | pnpm workspaces |

<br/>

## 📄 附加文档

| 文档 | 说明 |
|---|---|
| [../README.md](../README.md) | English README |
| [../packages/foundry/README.md](../packages/foundry/README.md) | 合约包 — 编译、测试、部署细节 |
| [../packages/subgraph/README.md](../packages/subgraph/README.md) | The Graph 子图 |

<br/>

## 🚨 安全漏洞反馈

如果你发现了安全问题，请在公开披露前**私下**反馈。

报告中请包含：
- 受影响的层（金库合约 / 红包合约 / 前端 / indexer）以及具体函数或路由
- 问题描述
- 影响评估（资金损失 / 金额泄露 / FHE ACL 绕过 / DoS）
- 复现步骤
- 修复建议（如果有）

请给维护者足够的时间进行复现、修补并协调发版，再公开漏洞细节。

<br/>

## 📝 协议

BSD-3-Clause-Clear。详见 [LICENSE](../LICENSE)。

<br/>

## 🙏 致谢

- [zama-ai/fhevm-react-template](https://github.com/zama-ai/fhevm-react-template) — Next.js + Foundry 脚手架、wagmi + RainbowKit 配置、ABI 代码生成
- [zama-ai/forge-fhevm](https://github.com/zama-ai/forge-fhevm) — Solidity 测试辅助（FHE 加解密 cheatcode）

<br/>

---

<div align="center">

<br/>

为 [Zama FHEVM Bounty](https://www.zama.ai/) 而作 · 2026 年 5 月 · ❤️

<br/>

[![Zama](https://img.shields.io/badge/Powered%20by-Zama%20fhEVM-FFD208?style=flat-square&labelColor=000000)](https://www.zama.ai/)
[![OpenZeppelin](https://img.shields.io/badge/Secured%20by-OpenZeppelin-FFD208?style=flat-square&labelColor=000000)](https://www.openzeppelin.com/)
[![RainbowKit](https://img.shields.io/badge/Wallet-RainbowKit-FFD208?style=flat-square&labelColor=000000)](https://www.rainbowkit.com/)

<br/>

*CipherGift —— 让红包从此用数学保密。*

<br/>

</div>

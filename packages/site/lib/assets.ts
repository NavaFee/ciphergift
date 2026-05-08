import { type Address, getAddress, isAddress } from "viem";
import type { CoinKind } from "~~/components/primitives/Coin";

export type AssetKey = "ceth" | "cusdc" | "czama";

export interface AssetConfig {
  key: AssetKey;
  label: string;
  symbol: string;
  coin: CoinKind;
  unitDecimals: number;
  assetId?: Address;
  enabled: boolean;
  disabledReason?: string;
}

const envAddress = (value: string | undefined): Address | undefined =>
  value && isAddress(value) ? getAddress(value) : undefined;

const CUSDC_VAULT = envAddress(process.env.NEXT_PUBLIC_CUSDC_VAULT_ADDRESS);
const CZAMA_VAULT = envAddress(process.env.NEXT_PUBLIC_CZAMA_VAULT_ADDRESS);

export function assetOptions(defaultVault?: Address): AssetConfig[] {
  return [
    {
      key: "ceth",
      label: "Confidential ETH",
      symbol: "cETH",
      coin: "eth",
      unitDecimals: 9,
      assetId: defaultVault,
      enabled: Boolean(defaultVault),
      disabledReason: defaultVault ? undefined : "Deploy the ETH vault first",
    },
    {
      key: "cusdc",
      label: "Confidential USDC",
      symbol: "cUSDC",
      coin: "usdc",
      unitDecimals: 6,
      assetId: CUSDC_VAULT,
      enabled: Boolean(CUSDC_VAULT),
      disabledReason: "Set NEXT_PUBLIC_CUSDC_VAULT_ADDRESS after deploying the ERC-20 vault",
    },
    {
      key: "czama",
      label: "Confidential ZAMA",
      symbol: "cZAMA",
      coin: "czama",
      unitDecimals: 6,
      assetId: CZAMA_VAULT,
      enabled: Boolean(CZAMA_VAULT),
      disabledReason: "Set NEXT_PUBLIC_CZAMA_VAULT_ADDRESS after deploying the ERC-20 vault",
    },
  ];
}

export function assetForPacket(
  assetId?: Address,
): Pick<AssetConfig, "key" | "label" | "symbol" | "coin" | "unitDecimals"> {
  const normalized = assetId && isAddress(assetId) ? getAddress(assetId) : undefined;
  if (normalized && CUSDC_VAULT && normalized === CUSDC_VAULT) {
    return { key: "cusdc", label: "Confidential USDC", symbol: "cUSDC", coin: "usdc", unitDecimals: 6 };
  }
  if (normalized && CZAMA_VAULT && normalized === CZAMA_VAULT) {
    return { key: "czama", label: "Confidential ZAMA", symbol: "cZAMA", coin: "czama", unitDecimals: 6 };
  }
  return { key: "ceth", label: "Confidential ETH", symbol: "cETH", coin: "eth", unitDecimals: 9 };
}

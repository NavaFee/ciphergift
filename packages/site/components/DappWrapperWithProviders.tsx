"use client";

import { useEffect, useMemo } from "react";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ZamaProvider } from "@zama-fhe/react-sdk";
import { IndexedDBStorage, RelayerWeb, SepoliaConfig, type ZamaSDKEvent } from "@zama-fhe/sdk";
import { RelayerCleartext, hardhatCleartextConfig } from "@zama-fhe/sdk/cleartext";
import { Toaster } from "react-hot-toast";
import { WagmiProvider, useAccount, useChainId } from "wagmi";
import { BlockieAvatar } from "~~/components/helper";
import { trackEvent } from "~~/services/observability";
import { wagmiConfig } from "~~/services/web3/wagmiConfig";
import { WagmiSigner } from "~~/services/web3/wagmiSigner";

const signer = new WagmiSigner({ config: wagmiConfig });
const storage = new IndexedDBStorage("KeypairStore", 1);
const sessionStorage = new IndexedDBStorage("SignatureStore", 1);

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
});

const ZamaRuntimeProvider = ({ children }: { children: React.ReactNode }) => {
  const chainId = useChainId();

  const relayer = useMemo(() => {
    if (chainId === 31337) {
      return new RelayerCleartext(hardhatCleartextConfig);
    }
    return new RelayerWeb({
      getChainId: () => signer.getChainId(),
      transports: {
        [SepoliaConfig.chainId]: SepoliaConfig,
      },
    });
  }, [chainId]);

  useEffect(() => {
    return () => {
      relayer.terminate();
    };
  }, [relayer]);

  function dispatchEvent(event: ZamaSDKEvent) {
    window.dispatchEvent(new CustomEvent(event.type, { detail: event }));
  }

  return (
    <ZamaProvider
      relayer={relayer}
      signer={signer}
      storage={storage}
      sessionStorage={sessionStorage}
      onEvent={dispatchEvent}
    >
      {children}
    </ZamaProvider>
  );
};

const WalletTelemetry = () => {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();

  useEffect(() => {
    if (isConnected) trackEvent("connect", { wallet: address, chainId });
  }, [address, chainId, isConnected]);

  return null;
};

export const DappWrapperWithProviders = ({ children }: { children: React.ReactNode }) => {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          avatar={BlockieAvatar}
          theme={darkTheme({
            accentColor: "#FFD200",
            accentColorForeground: "#0a0a0a",
            borderRadius: "small",
            fontStack: "system",
            overlayBlur: "small",
          })}
        >
          <WalletTelemetry />
          <ZamaRuntimeProvider>
            <div className="cr-app">{children}</div>
            <Toaster
              position="bottom-right"
              toastOptions={{
                style: { background: "var(--bg-1)", color: "var(--ink)", border: "1px solid var(--line)" },
              }}
            />
          </ZamaRuntimeProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
};

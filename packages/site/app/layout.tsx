import "@rainbow-me/rainbowkit/styles.css";
import { DappProviderBoundary } from "~~/components/DappProviderBoundary";
import "~~/styles/globals.css";
import { getMetadata } from "~~/utils/helper/getMetadata";

export const metadata = getMetadata({
  title: "CipherGift — Confidential gifts on FHEVM",
  description:
    "Send on-chain gifts where amounts and recipients stay encrypted under FHE. Only the addressee can decrypt their share.",
});

const RootLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <html suppressHydrationWarning>
      <body suppressHydrationWarning>
        <DappProviderBoundary>{children}</DappProviderBoundary>
      </body>
    </html>
  );
};

export default RootLayout;

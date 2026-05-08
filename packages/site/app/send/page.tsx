"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { AppChrome } from "~~/components/chrome/AppChrome";
import { SideNav } from "~~/components/chrome/SideNav";
import { SendWizard } from "~~/components/send/SendWizard";

export default function SendPage() {
  const { isConnected } = useAccount();
  const router = useRouter();

  useEffect(() => {
    if (!isConnected) router.replace("/");
  }, [isConnected, router]);

  if (!isConnected) return null;

  return (
    <AppChrome sub="send">
      <SideNav />
      <SendWizard />
    </AppChrome>
  );
}

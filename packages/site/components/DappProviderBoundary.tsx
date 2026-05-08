"use client";

import type { ReactNode } from "react";
import dynamic from "next/dynamic";

type DappProviderProps = {
  children: ReactNode;
};

const BrowserDappWrapper = dynamic<DappProviderProps>(
  () => import("~~/components/DappWrapperWithProviders").then(mod => mod.DappWrapperWithProviders),
  {
    ssr: false,
    loading: () => <div className="cr-app" aria-hidden="true" />,
  },
);

export const DappProviderBoundary = ({ children }: DappProviderProps) => {
  return <BrowserDappWrapper>{children}</BrowserDappWrapper>;
};

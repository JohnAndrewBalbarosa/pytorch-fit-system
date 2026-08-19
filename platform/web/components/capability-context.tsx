"use client";

import { createContext, useContext } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Capability, CapabilityKey, CapabilityManifest } from "@/lib/capabilities";
import { lockedCapabilityManifest } from "@/lib/capabilities";
import { fetchJson, queryKeys } from "@/lib/client-api";

const CapabilityContext = createContext<CapabilityManifest>(lockedCapabilityManifest());

export function CapabilityProvider({ children }: { children: React.ReactNode }) {
  const query = useQuery({ queryKey: queryKeys.capabilities, queryFn: () => fetchJson<CapabilityManifest>("/api/dev-capabilities", { cache: "no-store" }) });
  return <CapabilityContext.Provider value={query.data || lockedCapabilityManifest()}>{children}</CapabilityContext.Provider>;
}

export function useCapability(key: CapabilityKey): Capability {
  return useContext(CapabilityContext).capabilities[key];
}

export function useCapabilities(): CapabilityManifest {
  return useContext(CapabilityContext);
}

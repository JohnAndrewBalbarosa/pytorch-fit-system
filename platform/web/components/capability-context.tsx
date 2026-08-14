"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { Capability, CapabilityKey, CapabilityManifest } from "@/lib/capabilities";
import { lockedCapabilityManifest } from "@/lib/capabilities";

const CapabilityContext = createContext<CapabilityManifest>(lockedCapabilityManifest());

export function CapabilityProvider({ children }: { children: React.ReactNode }) {
  const [manifest, setManifest] = useState<CapabilityManifest>(lockedCapabilityManifest());
  useEffect(() => {
    let mounted = true;
    void fetch("/api/dev-capabilities", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("capability service unavailable");
        const value = await response.json() as CapabilityManifest;
        if (mounted) setManifest(value);
      })
      .catch(() => undefined);
    return () => { mounted = false; };
  }, []);
  return <CapabilityContext.Provider value={manifest}>{children}</CapabilityContext.Provider>;
}

export function useCapability(key: CapabilityKey): Capability {
  return useContext(CapabilityContext).capabilities[key];
}

export function useCapabilities(): CapabilityManifest {
  return useContext(CapabilityContext);
}

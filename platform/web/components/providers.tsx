"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { HttpError } from "@/lib/client-api";

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: 5 * 60_000,
        retry: (count, error) => count < 1 && !(error instanceof HttpError && error.status < 500),
        staleTime: 30_000,
        refetchOnWindowFocus: false,
      },
      mutations: { retry: false },
    },
  }));
  return <QueryClientProvider client={queryClient}>{children}<Toaster /></QueryClientProvider>;
}

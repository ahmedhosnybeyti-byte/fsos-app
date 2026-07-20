"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { ApiError } from "@/lib/api-client";
import { useTheme } from "@/components/theme-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  // Toast theme now follows the user's light/dark choice (theme-provider.tsx)
  // instead of being hardcoded to "dark" — a leftover from before the July
  // 2026 light/dark toggle existed.
  const { theme } = useTheme();
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: (failureCount, error) => {
              if (error instanceof ApiError && (error.status === 401 || error.status === 403)) return false;
              return failureCount < 2;
            },
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster theme={theme} position="top-right" richColors />
    </QueryClientProvider>
  );
}

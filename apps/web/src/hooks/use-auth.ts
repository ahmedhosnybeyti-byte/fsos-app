"use client";

import { useQuery } from "@tanstack/react-query";
import { authApi } from "@/lib/api";
import { ApiError } from "@/lib/api-client";

export function useAuth() {
  const query = useQuery({
    queryKey: ["auth", "me"],
    queryFn: authApi.me,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const unauthenticated = query.error instanceof ApiError && query.error.status === 401;

  return {
    user: query.data,
    isLoading: query.isLoading,
    isAuthenticated: !!query.data && !unauthenticated,
    refetch: query.refetch,
  };
}

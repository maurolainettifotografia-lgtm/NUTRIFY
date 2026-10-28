import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "@/src/api";
export const queryClient = new QueryClient({ defaultOptions: {
  queries: { staleTime: 30000, gcTime: 10 * 60000,
    retry: (count, error) => count < 1 && !(error instanceof ApiError && error.status >= 400 && error.status < 500),
  },
  mutations: { retry: false },
} });

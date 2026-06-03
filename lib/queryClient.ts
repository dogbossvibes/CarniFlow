import { QueryClient } from '@tanstack/react-query';

// Singleton-Client für die App. staleTime hält frisch geladene Daten kurz
// gültig, sodass Wechsel zwischen Dashboard/Verlauf/Statistiken aus dem Cache
// rendern; refetchOnWindowFocus aus, da wir in RN gezielt via useFocusEffect
// neu laden.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime:            30_000,
      gcTime:               5 * 60_000,
      retry:                1,
      refetchOnWindowFocus: false,
    },
  },
});

import { QueryClient, dehydrate, hydrate } from '@tanstack/react-query';
import { safeStorage } from '@/services/safeStorage';

export const REACT_QUERY_CACHE_KEY = '@minuto_enem:react_query_cache_v2';

/**
 * Instância global do QueryClient configurada para arquitetura Offline-First do Minuto ENEM.
 * - networkMode: 'offlineFirst' garante que queries e mutações com cache local funcionem perfeitamente sem conexão.
 * - staleTime (5 min) e gcTime (24h) preservam as questões, aulas, trilhas e notas no dispositivo.
 * - refetchOnReconnect: sincroniza automaticamente quando a internet é restabelecida.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      networkMode: 'offlineFirst',
      staleTime: 1000 * 60 * 5, // 5 minutos de dados frescos
      gcTime: 1000 * 60 * 60 * 24, // 24 horas mantidos em memória/persistência
      retry: 2,
      refetchOnReconnect: true,
      refetchOnWindowFocus: false,
    },
    mutations: {
      networkMode: 'offlineFirst',
      retry: 1,
    },
  },
});

/**
 * Restaura o cache do React Query previamente salvo no armazenamento local do dispositivo (AsyncStorage).
 * Permite acesso offline completo a trilhas, matérias, aulas, estatísticas, notas e questões previamente baixadas.
 */
export async function restoreQueryClientCache(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  try {
    const raw = await safeStorage.getItem(REACT_QUERY_CACHE_KEY);
    if (!raw) return false;

    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.queries)) {
      hydrate(queryClient, parsed);
      return true;
    }
  } catch (err) {
    console.warn('[React Query Restore Cache Error]:', err);
  }
  return false;
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Persiste o cache do React Query no armazenamento local do dispositivo de forma otimizada.
 */
export function persistQueryClientCache(): void {
  if (typeof window === 'undefined') return;
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }

  debounceTimer = setTimeout(async () => {
    try {
      const dehydrated = dehydrate(queryClient, {
        shouldDehydrateQuery: (query) => {
          // Apenas queries com sucesso e dados válidos são persistidas
          return query.state.status === 'success' && query.state.data !== undefined;
        },
      });

      await safeStorage.setItem(
        REACT_QUERY_CACHE_KEY,
        JSON.stringify(dehydrated)
      );
    } catch (err) {
      console.warn('[React Query Persist Cache Error]:', err);
    }
  }, 800);
}

// Inscrição no QueryCache para persistir automaticamente após atualizações bem-sucedidas
queryClient.getQueryCache().subscribe((event) => {
  if (event?.type === 'updated' && event.query.state.status === 'success') {
    persistQueryClientCache();
  }
});

/**
 * Utilitários para invalidação de cache de estudo e sincronização de dados
 */
export const invalidateStudyQueries = async () => {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['questions'] }),
    queryClient.invalidateQueries({ queryKey: ['subjects'] }),
    queryClient.invalidateQueries({ queryKey: ['classroom-materials-subjects'] }),
    queryClient.invalidateQueries({ queryKey: ['trails'] }),
    queryClient.invalidateQueries({ queryKey: ['user-stats'] }),
    queryClient.invalidateQueries({ queryKey: ['streak'] }),
    queryClient.invalidateQueries({ queryKey: ['notes'] }),
    queryClient.invalidateQueries({ queryKey: ['classroom-tasks-list'] }),
    queryClient.invalidateQueries({ queryKey: ['classrooms'] }),
  ]);
};

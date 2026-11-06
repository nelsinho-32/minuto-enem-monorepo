import React, { useEffect, useRef } from 'react';
import { View, ActivityIndicator, StyleSheet, Platform, AppState } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { queryClient, restoreQueryClientCache, invalidateStudyQueries } from '@/services/queryClient';
import { useUserStore } from '@/store/useUserStore';
import { useOfflineQueueStore } from '@/store/useOfflineQueueStore';
import { initMobileSentry, Sentry } from '@/services/sentry';
import { initDatabase } from '@/database/schema';
import { useSyncManager } from '@/hooks/useSyncManager';

// Inicializa o Sentry no app mobile com rastreamento de erros e performance
initMobileSentry();

// Evita que a splash nativa suma antes da hidratação do Zustand/AsyncStorage
SplashScreen.preventAutoHideAsync().catch(() => {});

function RootLayout() {
  const router = useRouter();
  const segments = useSegments();
  const token = useUserStore((state) => state.token);
  const hasHydrated = useUserStore((state) => state.hasHydrated);
  const queue = useOfflineQueueStore((state) => state.queue);
  const isSyncing = useOfflineQueueStore((state) => state.isSyncing);

  // Hook central de sincronização offline-first (SQLite SyncQueue + Background Sync)
  const syncManager = useSyncManager();

  const isSyncingRef = useRef(false);
  isSyncingRef.current = isSyncing;

  // Inicializa o banco local SQLite (Task, Question, Option, SyncQueue)
  useEffect(() => {
    initDatabase().catch((err) => {
      console.warn('⚠️ [RootLayout] Falha ao inicializar SQLite:', err);
    });
  }, []);

  // 1. Restaura o cache do React Query armazenado no dispositivo (AsyncStorage) para permitir navegação offline
  useEffect(() => {
    restoreQueryClientCache().then((restored) => {
      if (restored) {
        console.log('📦 [Offline Cache] Cache local de consultas (questões, trilhas, aulas, notas) restaurado com sucesso.');
      }
    });
  }, []);

  // 2. Monitor de Conectividade de Rede e Sincronização Automática com POST /sync/batch
  useEffect(() => {
    const handleConnectivityRestore = async () => {
      if (isSyncingRef.current) return;

      const currentToken = useUserStore.getState().token;
      if (!currentToken) return;

      const pendingQueue = useOfflineQueueStore.getState().queue;
      if (pendingQueue.length === 0) return;

      console.log(
        `📡 [Monitor de Rede] Conexão ativa detectada! Enviando ${pendingQueue.length} ação(ões) pendente(s) para POST /sync/batch...`
      );

      try {
        const result = await useOfflineQueueStore.getState().flushQueue();
        if (result.success && result.syncedCount > 0) {
          console.log(
            `✅ [Monitor de Rede] Sincronização em lote concluída com sucesso! ${result.syncedCount} item(ns) sincronizados com o servidor.`
          );
          await invalidateStudyQueries();
        }
      } catch (err) {
        console.warn('[Monitor de Rede Error]: Falha no envio da fila offline:', err);
      }
    };

    // Monitoramento no ambiente Web (navegador/PWA)
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const onOnline = () => {
        onlineManager.setOnline(true);
        handleConnectivityRestore();
      };

      const onOffline = () => {
        onlineManager.setOnline(false);
        console.log('📴 [Monitor de Rede] Dispositivo desconectado da rede. Modo Offline ativado.');
      };

      window.addEventListener('online', onOnline);
      window.addEventListener('offline', onOffline);

      // Define estado inicial
      if (typeof navigator !== 'undefined' && 'onLine' in navigator) {
        onlineManager.setOnline(navigator.onLine);
        if (navigator.onLine) {
          handleConnectivityRestore();
        }
      }

      // Inscrição no onlineManager do React Query
      const unsubscribeOnline = onlineManager.subscribe((isOnline) => {
        if (isOnline) {
          handleConnectivityRestore();
        }
      });

      return () => {
        window.removeEventListener('online', onOnline);
        window.removeEventListener('offline', onOffline);
        unsubscribeOnline();
      };
    }

    // Monitoramento no ambiente Mobile Nativo via AppState (ao voltar ao primeiro plano)
    const appStateSub = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        onlineManager.setOnline(true);
        handleConnectivityRestore();
      }
    });

    const unsubscribeOnline = onlineManager.subscribe((isOnline) => {
      if (isOnline) {
        handleConnectivityRestore();
      }
    });

    // Dispara checagem inicial
    handleConnectivityRestore();

    return () => {
      appStateSub.remove();
      unsubscribeOnline();
    };
  }, []);

  // 3. Controle de Autenticação e Redirecionamento de Rotas
  useEffect(() => {
    if (!hasHydrated) return;

    SplashScreen.hideAsync().catch(() => {});

    const inAuthGroup = segments[0] === 'auth';

    if (!token && !inAuthGroup) {
      // Usuário não autenticado tentando acessar rota protegida -> redireciona para login
      router.replace('/auth/login' as any);
    } else if (token && inAuthGroup) {
      // Usuário já autenticado tentando acessar login/registro -> redireciona para seu painel principal
      const currentUser = useUserStore.getState().user;
      if (currentUser?.role === 'ADMIN') {
        router.replace('/admin/schools' as any);
      } else if (currentUser?.role === 'SCHOOL') {
        router.replace('/school/dashboard' as any);
      } else {
        router.replace('/');
      }
    }
  }, [token, hasHydrated, segments, router]);

  // Evita flash da tela protegida enquanto o estado persistido está hidratando
  if (!hasHydrated) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#1CB0F6" />
      </View>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <Stack screenOptions={{ headerShown: false }} />
    </QueryClientProvider>
  );
}

export default Sentry.wrap(RootLayout);

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F7F9FC',
  },
});

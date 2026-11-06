import { useEffect, useState, useCallback, useRef } from 'react';
import { Platform, AppState, AppStateStatus } from 'react-native';
import { onlineManager } from '@tanstack/react-query';
import {
  SyncBatchPayloadSchema,
  SyncActionSchema,
  type SyncAction,
  type StudentUpdatedState,
} from '@minuto-enem/shared';
import { api } from '@/services/api';
import { isDeviceOnline } from '@/services/network';
import {
  getPendingSyncQueue,
  markSyncQueueStatus,
  SyncQueueRecord,
} from '@/database/schema';
import { useUserStore } from '@/store/useUserStore';
import { invalidateStudyQueries } from '@/services/queryClient';

export interface UseSyncManagerReturn {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  lastSyncTime: Date | null;
  lastSyncError: string | null;
  syncNow: () => Promise<{
    success: boolean;
    syncedCount: number;
    error?: string;
  }>;
  refreshPendingCount: () => Promise<number>;
}

/**
 * Hook de sincronização em segundo plano (Background Sync) Offline-First.
 * Escuta transições de conectividade e sincroniza registros pendentes da SyncQueue com a API.
 */
export function useSyncManager(): UseSyncManagerReturn {
  const token = useUserStore((state) => state.token);
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);

  const isSyncingRef = useRef<boolean>(false);
  isSyncingRef.current = isSyncing;

  /**
   * Atualiza a contagem de mutações pendentes na SyncQueue do SQLite
   */
  const refreshPendingCount = useCallback(async () => {
    try {
      const pendingItems = await getPendingSyncQueue();
      setPendingCount(pendingItems.length);
      return pendingItems.length;
    } catch {
      return 0;
    }
  }, []);

  /**
   * Converte um registro local da SyncQueue para o contrato canônico SyncAction do @minuto-enem/shared
   */
  const mapRecordToSyncAction = (record: SyncQueueRecord): SyncAction | null => {
    let parsedPayload: any = {};
    try {
      parsedPayload =
        typeof record.payload === 'string'
          ? JSON.parse(record.payload)
          : record.payload;
    } catch {
      parsedPayload = {};
    }

    const { mutationType, id, createdAt } = record;

    if (mutationType === 'SUBMIT_ANSWER' || mutationType === 'QUESTION_ATTEMPT') {
      const candidate = {
        idempotencyKey: id,
        type: 'QUESTION_ATTEMPT' as const,
        payload: {
          questionId: String(parsedPayload.questionId),
          selectedAnswer: Number(
            parsedPayload.selectedAnswer ?? parsedPayload.selectedOption ?? 0
          ),
          timeSpentMs: Number(parsedPayload.timeSpentMs || 15000),
          answeredAt: parsedPayload.answeredAt || createdAt,
        },
      };

      const result = SyncActionSchema.safeParse(candidate);
      return result.success ? result.data : null;
    }

    if (mutationType === 'LESSON_PROGRESS') {
      const candidate = {
        idempotencyKey: id,
        type: 'LESSON_PROGRESS' as const,
        payload: {
          lessonId: String(parsedPayload.lessonId),
          trailId: parsedPayload.trailId ? String(parsedPayload.trailId) : undefined,
          completed: parsedPayload.completed !== undefined ? Boolean(parsedPayload.completed) : true,
          timestamp: parsedPayload.timestamp || createdAt,
        },
      };

      const result = SyncActionSchema.safeParse(candidate);
      return result.success ? result.data : null;
    }

    if (mutationType === 'NOTE_UPSERT') {
      const candidate = {
        idempotencyKey: id,
        type: 'NOTE_UPSERT' as const,
        payload: {
          id: parsedPayload.id || undefined,
          title: String(parsedPayload.title || ''),
          content: String(parsedPayload.content || ''),
          tags: Array.isArray(parsedPayload.tags) ? parsedPayload.tags : [],
          lessonId: parsedPayload.lessonId || null,
          updatedAt: parsedPayload.updatedAt || createdAt,
        },
      };

      const result = SyncActionSchema.safeParse(candidate);
      return result.success ? result.data : null;
    }

    if (mutationType === 'NOTE_DELETE') {
      const candidate = {
        idempotencyKey: id,
        type: 'NOTE_DELETE' as const,
        payload: {
          noteId: String(parsedPayload.noteId),
        },
      };

      const result = SyncActionSchema.safeParse(candidate);
      return result.success ? result.data : null;
    }

    // Se já foi salvo diretamente como SyncAction
    const genericParsed = SyncActionSchema.safeParse({
      idempotencyKey: id,
      type: mutationType,
      payload: parsedPayload,
    });

    return genericParsed.success ? genericParsed.data : null;
  };

  /**
   * Executa a sincronização em lote (batching) com a rota POST /sync/batch da API
   */
  const syncNow = useCallback(async (): Promise<{
    success: boolean;
    syncedCount: number;
    error?: string;
  }> => {
    if (isSyncingRef.current) {
      return { success: false, syncedCount: 0, error: 'Sincronização já em andamento.' };
    }

    const currentToken = useUserStore.getState().token;
    if (!currentToken) {
      return { success: false, syncedCount: 0, error: 'Usuário não autenticado.' };
    }

    const online = await isDeviceOnline();
    if (!online) {
      setIsOnline(false);
      return { success: false, syncedCount: 0, error: 'Dispositivo sem conexão à internet.' };
    }

    setIsOnline(true);
    setIsSyncing(true);
    setLastSyncError(null);

    try {
      const pendingRecords = await getPendingSyncQueue();

      if (pendingRecords.length === 0) {
        setPendingCount(0);
        setIsSyncing(false);
        return { success: true, syncedCount: 0 };
      }

      console.log(
        `📡 [SyncManager] Iniciando sincronização em lote de ${pendingRecords.length} registro(s) pendente(s)...`
      );

      const validActions: SyncAction[] = [];
      const validItemIds: string[] = [];

      for (const record of pendingRecords) {
        const action = mapRecordToSyncAction(record);
        if (action) {
          validActions.push(action);
          validItemIds.push(record.id);
        } else {
          console.warn(
            `⚠️ [SyncManager] Registro descartado por não atender ao schema canônico (ID: ${record.id})`
          );
        }
      }

      if (validActions.length === 0) {
        // Marca como sincronizados para não travar a fila
        await markSyncQueueStatus(
          pendingRecords.map((r) => r.id),
          'SYNCED'
        );
        await refreshPendingCount();
        setIsSyncing(false);
        return { success: true, syncedCount: 0 };
      }

      // Validação estrita do payload usando o Zod Schema de lote compartilhado
      const batchValidation = SyncBatchPayloadSchema.safeParse({
        idempotencyKey: `batch_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        actions: validActions,
      });

      if (!batchValidation.success) {
        const errorMsg = 'Falha na validação do lote de sincronização com o SyncBatchPayloadSchema.';
        console.error(`❌ [SyncManager] ${errorMsg}`, batchValidation.error);
        setLastSyncError(errorMsg);
        setIsSyncing(false);
        return { success: false, syncedCount: 0, error: errorMsg };
      }

      // Envia requisição em lote para POST /sync/batch
      const response = await api.post<{
        message: string;
        data: StudentUpdatedState;
      }>('/sync/batch', batchValidation.data);

      // Marca os registros locais como 'SYNCED' após HTTP 200
      await markSyncQueueStatus(validItemIds, 'SYNCED');

      // Atualiza o estado consolidado retornado pelo servidor
      if (response?.data) {
        const { user: updatedUser, streak: updatedStreak } = response.data;
        if (updatedStreak) {
          useUserStore.getState().completeQuestionStreakUpdate(updatedStreak);
        }
        if (updatedUser?.xp !== undefined) {
          useUserStore.setState((prev) => ({
            xp: updatedUser.xp,
            currentStreak: updatedUser.currentStreak,
            longestStreak: updatedUser.longestStreak,
          }));
        }
      }

      await invalidateStudyQueries();
      const remainingCount = await refreshPendingCount();
      const syncedNow = validItemIds.length;
      const now = new Date();

      setLastSyncTime(now);
      setIsSyncing(false);

      console.log(
        `✅ [SyncManager] Sincronização concluída com sucesso! ${syncedNow} item(ns) sincronizados. Pendentes: ${remainingCount}.`
      );

      return { success: true, syncedCount: syncedNow };
    } catch (err: any) {
      const errorMsg = err?.message || 'Erro durante a sincronização em segundo plano.';
      console.warn('⚠️ [SyncManager Error]:', errorMsg);
      setLastSyncError(errorMsg);
      setIsSyncing(false);
      return { success: false, syncedCount: 0, error: errorMsg };
    }
  }, [refreshPendingCount]);

  /**
   * Monitor de conectividade e acionamento automático de sincronização
   */
  useEffect(() => {
    let isMounted = true;

    const handleConnectivityChange = async (online: boolean) => {
      if (!isMounted) return;
      setIsOnline(online);

      if (online) {
        const pending = await refreshPendingCount();
        if (pending > 0 && !isSyncingRef.current) {
          console.log(
            `🌐 [SyncManager] Rede restabelecida! ${pending} ação(ões) pendente(s) na fila. Disparando sincronização...`
          );
          await syncNow();
        }
      }
    };

    // Checagem de conectividade inicial
    isDeviceOnline().then((online) => {
      if (isMounted) {
        setIsOnline(online);
        refreshPendingCount();
        if (online) {
          syncNow();
        }
      }
    });

    // Inscrição no onlineManager do React Query
    const unsubscribeOnlineManager = onlineManager.subscribe((online) => {
      handleConnectivityChange(Boolean(online));
    });

    // Monitoramento no navegador Web
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const onOnline = () => handleConnectivityChange(true);
      const onOffline = () => handleConnectivityChange(false);

      window.addEventListener('online', onOnline);
      window.addEventListener('offline', onOffline);

      return () => {
        isMounted = false;
        window.removeEventListener('online', onOnline);
        window.removeEventListener('offline', onOffline);
        unsubscribeOnlineManager();
      };
    }

    // Monitoramento no ambiente Mobile Nativo via ciclo de vida (AppState)
    const appStateSub = AppState.addEventListener('change', async (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        const online = await isDeviceOnline();
        handleConnectivityChange(online);
      }
    });

    // Polling preventivo a cada 20 segundos se houver itens pendentes
    const intervalId = setInterval(async () => {
      if (isMounted && !isSyncingRef.current) {
        const count = await refreshPendingCount();
        if (count > 0) {
          const online = await isDeviceOnline();
          if (online) {
            await syncNow();
          }
        }
      }
    }, 20000);

    return () => {
      isMounted = false;
      appStateSub.remove();
      unsubscribeOnlineManager();
      clearInterval(intervalId);
    };
  }, [syncNow, refreshPendingCount]);

  return {
    isOnline,
    isSyncing,
    pendingCount,
    lastSyncTime,
    lastSyncError,
    syncNow,
    refreshPendingCount,
  };
}


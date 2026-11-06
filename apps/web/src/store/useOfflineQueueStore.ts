import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { safeStorage } from '@/services/safeStorage';
import {
  type SyncAction,
  type StudentUpdatedState,
} from '@minuto-enem/shared';
import { api } from '@/services/api';
import { useUserStore } from './useUserStore';
import { invalidateStudyQueries } from '@/services/queryClient';

export interface OfflineQueueState {
  queue: SyncAction[];
  isSyncing: boolean;
  lastSyncAttempt: number | null;
  lastSuccessfulSync: number | null;
  lastSyncError: string | null;

  enqueueAction: (action: SyncAction) => Promise<void>;
  enqueueQuizAnswer: (data: {
    questionId: string;
    selectedAnswer: number;
    timeSpentMs?: number;
  }) => Promise<string>;
  enqueueNoteUpsert: (data: {
    id?: string;
    title: string;
    content: string;
    tags?: string[];
    lessonId?: string | null;
  }) => Promise<string>;
  enqueueLessonProgress: (data: {
    lessonId: string;
    trailId?: string;
    completed?: boolean;
  }) => Promise<string>;
  removeAction: (idempotencyKey: string) => void;
  clearQueue: () => void;
  flushQueue: () => Promise<{
    success: boolean;
    syncedCount: number;
    remainingCount: number;
    data?: StudentUpdatedState;
    error?: string;
  }>;
}

export const useOfflineQueueStore = create<OfflineQueueState>()(
  persist(
    (set, get) => ({
      queue: [],
      isSyncing: false,
      lastSyncAttempt: null,
      lastSuccessfulSync: null,
      lastSyncError: null,

      enqueueAction: async (action: SyncAction) => {
        set((state) => ({
          queue: [...state.queue.filter((a) => a.idempotencyKey !== action.idempotencyKey), action],
        }));
      },

      enqueueQuizAnswer: async ({ questionId, selectedAnswer, timeSpentMs = 15000 }) => {
        const idempotencyKey = `sync_q_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const action: SyncAction = {
          idempotencyKey,
          type: 'QUESTION_ATTEMPT',
          payload: {
            questionId: String(questionId),
            selectedAnswer: Number(selectedAnswer),
            timeSpentMs: Number(timeSpentMs),
            answeredAt: new Date().toISOString(),
          },
        };

        set((state) => ({
          queue: [...state.queue, action],
        }));

        return idempotencyKey;
      },

      enqueueNoteUpsert: async ({ id, title, content, tags = [], lessonId = null }) => {
        const idempotencyKey = `sync_n_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const action: SyncAction = {
          idempotencyKey,
          type: 'NOTE_UPSERT',
          payload: {
            id: id || undefined,
            title: title.trim(),
            content: content.trim(),
            tags: Array.isArray(tags) ? tags : [],
            lessonId: lessonId || null,
            updatedAt: new Date().toISOString(),
          },
        };

        set((state) => ({
          queue: [...state.queue, action],
        }));

        return idempotencyKey;
      },

      enqueueLessonProgress: async ({ lessonId, trailId, completed = true }) => {
        const idempotencyKey = `sync_l_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const action: SyncAction = {
          idempotencyKey,
          type: 'LESSON_PROGRESS',
          payload: {
            lessonId,
            trailId,
            completed,
            timestamp: new Date().toISOString(),
          },
        };

        set((state) => ({
          queue: [...state.queue, action],
        }));

        return idempotencyKey;
      },

      removeAction: (idempotencyKey: string) => {
        set((state) => ({
          queue: state.queue.filter((item) => item.idempotencyKey !== idempotencyKey),
        }));
      },

      clearQueue: () => {
        set({ queue: [], lastSyncError: null });
      },

      flushQueue: async () => {
        const { queue, isSyncing } = get();

        if (queue.length === 0) {
          return { success: true, syncedCount: 0, remainingCount: 0 };
        }

        if (isSyncing) {
          return { success: false, syncedCount: 0, remainingCount: queue.length, error: 'Sincronização em andamento' };
        }

        const token = useUserStore.getState().token;
        if (!token) {
          return { success: false, syncedCount: 0, remainingCount: queue.length, error: 'Usuário não autenticado' };
        }

        const actionsToSync = [...queue];
        set({ isSyncing: true, lastSyncAttempt: Date.now() });

        try {
          // Envia o lote de ações para a rota POST /sync/batch do back-end
          const res = await api.post<{
            message: string;
            data: StudentUpdatedState;
          }>('/sync/batch', {
            actions: actionsToSync,
          });

          const syncedKeys = new Set(actionsToSync.map((a) => a.idempotencyKey));

          // Remove do estado apenas as ações que foram enviadas com sucesso
          set((state) => ({
            queue: state.queue.filter((item) => !syncedKeys.has(item.idempotencyKey)),
            isSyncing: false,
            lastSuccessfulSync: Date.now(),
            lastSyncError: null,
          }));

          // Atualiza dados locais consolidados retornados pelo servidor
          if (res?.data) {
            const { user: updatedUser, streak: updatedStreak } = res.data;
            if (updatedStreak) {
              useUserStore.getState().completeQuestionStreakUpdate(updatedStreak);
            }
            if (updatedUser?.xp !== undefined) {
              useUserStore.setState((prev) => ({
                xp: updatedUser.xp,
                user: prev.user ? { ...prev.user, xp: updatedUser.xp } : null,
              }));
            }
          }

          // Invalida e atualiza os caches locais do React Query
          await invalidateStudyQueries();

          return {
            success: true,
            syncedCount: actionsToSync.length,
            remainingCount: get().queue.length,
            data: res?.data,
          };
        } catch (error: any) {
          console.warn('[Offline Queue Sync Failed]:', error?.message || error);
          const errorMsg = error?.message || 'Falha ao sincronizar fila offline com o servidor';

          set({
            isSyncing: false,
            lastSyncError: errorMsg,
          });

          return {
            success: false,
            syncedCount: 0,
            remainingCount: get().queue.length,
            error: errorMsg,
          };
        }
      },
    }),
    {
      name: '@minuto_enem:offline_sync_queue_v2',
      storage: createJSONStorage(() => safeStorage),
      partialize: (state) => ({
        queue: state.queue,
        lastSuccessfulSync: state.lastSuccessfulSync,
      }),
    }
  )
);


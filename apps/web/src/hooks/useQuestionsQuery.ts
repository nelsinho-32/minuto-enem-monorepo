import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { safeAsyncStorage as AsyncStorage } from '@/services/safeStorage';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type QuizQuestion,
  type PendingQuizAnswerPayload,
  type QuestionsQueryFilters,
  type StudentUpdatedState,
} from '@minuto-enem/shared';
import { api } from '@/services/api';
import { useUserStore } from '@/store/useUserStore';
import { enqueueSyncItem, saveQuestionsLocal } from '@/database/schema';

export type {
  QuizQuestion,
  PendingQuizAnswerPayload,
  QuestionsQueryFilters,
} from '@minuto-enem/shared';

const OFFLINE_QUESTIONS_STORAGE_KEY = '@minuto_enem:offline_questions_v1';
const OFFLINE_SYNC_QUEUE_STORAGE_KEY = '@minuto_enem:offline_quiz_sync_queue_v1';

async function getStoredQuestions(): Promise<QuizQuestion[]> {
  try {
    const raw = await AsyncStorage.getItem(OFFLINE_QUESTIONS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function saveQuestionsLocally(questions: QuizQuestion[]): Promise<void> {
  try {
    await AsyncStorage.setItem(
      OFFLINE_QUESTIONS_STORAGE_KEY,
      JSON.stringify(questions)
    );

    // Persiste também nas tabelas Question e Option do SQLite
    await saveQuestionsLocal(
      questions.map((q) => ({
        id: String(q.id),
        text: q.text,
        subject: q.subject || null,
        topic: q.topic || null,
        year: q.year || null,
        difficulty: q.difficulty || null,
        explanation: q.explanation || null,
        correctAnswer: q.correctAnswer ?? 0,
        options: q.options || [],
      }))
    );
  } catch {
    // Gravação tolerante a falhas
  }
}

export async function getPendingQuizSyncQueue(): Promise<PendingQuizAnswerPayload[]> {
  try {
    const raw = await AsyncStorage.getItem(OFFLINE_SYNC_QUEUE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function enqueueOfflineQuizAnswer(
  payload: Omit<PendingQuizAnswerPayload, 'id' | 'answeredAt'>
): Promise<PendingQuizAnswerPayload[]> {
  const queue = await getPendingQuizSyncQueue();
  const id = `sync_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const item: PendingQuizAnswerPayload = {
    ...payload,
    id,
    answeredAt: new Date().toISOString(),
  };
  const updated = [...queue, item];
  await AsyncStorage.setItem(
    OFFLINE_SYNC_QUEUE_STORAGE_KEY,
    JSON.stringify(updated)
  );

  // Registra simultaneamente na tabela SyncQueue do SQLite
  await enqueueSyncItem(
    'SUBMIT_ANSWER',
    {
      questionId: String(payload.questionId),
      selectedAnswer: payload.selectedOption,
      selectedOption: payload.selectedOption,
      timeSpentMs: 15000,
      answeredAt: item.answeredAt,
    },
    id
  ).catch(() => {});

  return updated;
}

/**
 * Sincroniza as respostas de quiz realizadas offline enviando um lote via POST /sync/batch
 * com fallback transparente para POST /questions/answer.
 */
export async function syncPendingQuizResults(): Promise<{
  syncedCount: number;
  remainingCount: number;
}> {
  const queue = await getPendingQuizSyncQueue();
  if (queue.length === 0) {
    return { syncedCount: 0, remainingCount: 0 };
  }

  // Tenta sincronizar primeiro via POST /sync/batch (idempotente e em lote único)
  try {
    const batchActions = queue.map((item) => ({
      idempotencyKey: item.id,
      type: 'QUESTION_ATTEMPT' as const,
      payload: {
        questionId: item.questionId,
        selectedAnswer: item.selectedOption,
        timeSpentMs: 15000,
        answeredAt: item.answeredAt,
      },
    }));

    const response = await api.post<{
      message: string;
      data: StudentUpdatedState;
    }>('/sync/batch', { actions: batchActions });

    if (response?.data) {
      await AsyncStorage.setItem(
        OFFLINE_SYNC_QUEUE_STORAGE_KEY,
        JSON.stringify([])
      );
      return {
        syncedCount: queue.length,
        remainingCount: 0,
      };
    }
  } catch {
    // Fallback item a item caso a rota de batch falhe
  }

  const remaining: PendingQuizAnswerPayload[] = [];
  let syncedCount = 0;

  for (const item of queue) {
    try {
      await api.post('/questions/answer', {
        userId: item.userId,
        questionId: item.questionId,
        selectedAnswer: item.selectedOption,
        selectedOption: item.selectedOption,
        idempotencyKey: item.id,
        answeredAt: item.answeredAt,
      });
      syncedCount += 1;
    } catch {
      remaining.push(item);
    }
  }

  await AsyncStorage.setItem(
    OFFLINE_SYNC_QUEUE_STORAGE_KEY,
    JSON.stringify(remaining)
  );

  return {
    syncedCount,
    remainingCount: remaining.length,
  };
}

function applyQuestionFilters(
  questions: QuizQuestion[],
  filters?: QuestionsQueryFilters
): QuizQuestion[] {
  if (!filters) return questions;

  let data = [...questions];
  const {
    day,
    difficulty,
    limit,
    subject,
    subjectId,
    topic,
    topicId,
    lessonId,
    area,
  } = filters;

  // Filtro por tópico ou lição específica
  if (topicId || lessonId) {
    const targetId = topicId || lessonId;
    const topicFiltered = data.filter(
      (q) =>
        q.topicId === targetId ||
        q.lessonId === targetId ||
        (q.topic && topic && q.topic.toLowerCase() === topic.toLowerCase())
    );
    // Se encontrou questões com correspondência direta de tópico, usa-as
    if (topicFiltered.length > 0) {
      data = topicFiltered;
    }
  } else if (topic) {
    const term = topic.toLowerCase();
    const topicMatches = data.filter(
      (q) =>
        q.topic?.toLowerCase().includes(term) ||
        q.text?.toLowerCase().includes(term)
    );
    if (topicMatches.length > 0) {
      data = topicMatches;
    }
  }

  // Filtro por matéria
  if (subjectId) {
    const subjectMatches = data.filter((q) => q.subjectId === subjectId);
    if (subjectMatches.length > 0) {
      data = subjectMatches;
    }
  } else if (subject) {
    const term = subject.toLowerCase();
    data = data.filter((q) => q.subject?.toLowerCase().includes(term));
  }

  if (area) {
    const term = area.toLowerCase();
    data = data.filter((q) => q.area?.toLowerCase().includes(term));
  }

  if (day === '1') {
    data = data.filter(
      (q) =>
        q.area?.toLowerCase().includes('humanas') ||
        q.area?.toLowerCase().includes('linguagens') ||
        q.area?.toLowerCase().includes('ch') ||
        q.area?.toLowerCase().includes('lc')
    );
  } else if (day === '2') {
    data = data.filter(
      (q) =>
        q.area?.toLowerCase().includes('natureza') ||
        q.area?.toLowerCase().includes('matemática') ||
        q.area?.toLowerCase().includes('cn') ||
        q.area?.toLowerCase().includes('mt')
    );
  }

  if (difficulty === 'facil' || difficulty === 'EASY') {
    data = data.filter((q) => q.errorRate !== undefined && q.errorRate < 45);
  } else if (difficulty === 'medio' || difficulty === 'MEDIUM') {
    data = data.filter(
      (q) => q.errorRate !== undefined && q.errorRate >= 45 && q.errorRate <= 65
    );
  } else if (difficulty === 'dificil' || difficulty === 'HARD') {
    data = data.filter((q) => q.errorRate !== undefined && q.errorRate > 65);
  }

  if (limit && limit > 0) {
    return data.slice(0, limit);
  }

  return data;
}

/**
 * Hook Offline-First para busca, cache local e resolução de questões do ENEM.
 */
export function useQuestionsQuery(filters?: QuestionsQueryFilters) {
  const queryClient = useQueryClient();
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOfflineData, setIsOfflineData] = useState(false);

  const refreshQueueCount = useCallback(async () => {
    const queue = await getPendingQuizSyncQueue();
    setPendingSyncCount(queue.length);
  }, []);

  useEffect(() => {
    refreshQueueCount();
  }, [refreshQueueCount]);

  const queryKey = [
    'questions',
    filters?.day ?? 'all',
    filters?.difficulty ?? 'all',
    filters?.subject ?? 'all',
    filters?.subjectId ?? 'all',
    filters?.topic ?? 'all',
    filters?.topicId ?? 'all',
    filters?.lessonId ?? 'all',
    filters?.area ?? 'all',
    filters?.limit ?? 'all',
  ];

  const query = useQuery<QuizQuestion[], Error>({
    queryKey,
    networkMode: 'offlineFirst',
    queryFn: async () => {
      try {
        const queryParams = new URLSearchParams();
        if (filters?.subject) queryParams.set('subject', filters.subject);
        if (filters?.area) queryParams.set('area', filters.area);
        if (filters?.difficulty) queryParams.set('difficulty', filters.difficulty);
        if (filters?.limit) queryParams.set('limit', String(filters.limit));

        let endpoint: string;

        // Se topicId ou lessonId foi informado, busca diretamente pelo endpoint otimizado por tópico/conteúdo
        const targetTopicOrLesson = filters?.topicId || filters?.lessonId;
        if (targetTopicOrLesson) {
          endpoint = `/questions/by-topic/${encodeURIComponent(targetTopicOrLesson)}`;
          const qs = queryParams.toString();
          if (qs) endpoint += `?${qs}`;
        } else {
          const qs = queryParams.toString();
          endpoint = qs ? `/questions?${qs}` : '/questions';
        }

        const remoteData = await api.get<QuizQuestion[]>(endpoint);
        if (Array.isArray(remoteData) && remoteData.length > 0) {
          await saveQuestionsLocally(remoteData);
          setIsOfflineData(false);
          return applyQuestionFilters(remoteData, filters);
        }

        // Se a busca por tópico não retornou nada da API, tenta buscar geral para filtrar
        if (targetTopicOrLesson) {
          const fallbackData = await api.get<QuizQuestion[]>('/questions');
          if (Array.isArray(fallbackData) && fallbackData.length > 0) {
            await saveQuestionsLocally(fallbackData);
            setIsOfflineData(false);
            return applyQuestionFilters(fallbackData, filters);
          }
        }

        throw new Error('Nenhum dado retornado pela API.');
      } catch (err) {
        const cachedLocal = await getStoredQuestions();
        if (cachedLocal.length > 0) {
          setIsOfflineData(true);
          return applyQuestionFilters(cachedLocal, filters);
        }
        throw err instanceof Error
          ? err
          : new Error(
              'Não foi possível carregar as questões e não há pacote salvo offline.'
            );
      }
    },
  });

  const downloadQuizzesLocally = useCallback(async () => {
    const remoteData = await api.get<QuizQuestion[]>('/questions');
    if (Array.isArray(remoteData)) {
      await saveQuestionsLocally(remoteData);
      queryClient.setQueryData(queryKey, remoteData);
      setIsOfflineData(false);
    }
    return remoteData;
  }, [queryClient, queryKey]);

  const queueAnswerOffline = useCallback(
    async (payload: Omit<PendingQuizAnswerPayload, 'id' | 'answeredAt'>) => {
      const updated = await enqueueOfflineQuizAnswer(payload);
      setPendingSyncCount(updated.length);
      return updated;
    },
    []
  );

  const syncPendingResults = useCallback(async () => {
    setIsSyncing(true);
    try {
      const result = await syncPendingQuizResults();
      setPendingSyncCount(result.remainingCount);
      if (result.syncedCount > 0) {
        queryClient.invalidateQueries({ queryKey: ['streak'] });
        queryClient.invalidateQueries({ queryKey: ['user-stats'] });
        queryClient.invalidateQueries({ queryKey: ['error-stats'] });
      }
      return result;
    } finally {
      setIsSyncing(false);
    }
  }, [queryClient]);

  // Sincroniza automaticamente quando o aplicativo ganha foco
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        syncPendingResults().catch(() => {});
      }
    });
    return () => subscription.remove();
  }, [syncPendingResults]);

  return {
    ...query,
    questions: query.data ?? [],
    isOfflineData,
    pendingSyncCount,
    isSyncing,
    downloadQuizzesLocally,
    queueAnswerOffline,
    syncPendingResults,
    refreshQueueCount,
  };
}

import { safeAsyncStorage as AsyncStorage } from '@/services/safeStorage';
import { api } from '@/services/api';
import { saveQuestionsLocal } from '@/database/schema';
import type { QuizQuestion } from '@minuto-enem/shared';

const OFFLINE_QUESTIONS_STORAGE_KEY = '@minuto_enem:offline_questions_v1';
const OFFLINE_PACK_META_KEY = '@minuto_enem:offline_pack_meta_v1';
const OFFLINE_SUBJECTS_KEY = '@minuto_enem:offline_subjects_v1';

export interface OfflinePackMetadata {
  downloadedAt: string;
  questionsCount: number;
  subjectsCount: number;
  sizeKb: number;
}

/**
 * Baixa um pacote completo de estudo offline (questões reais do ENEM + matérias/aulas)
 * e grava em AsyncStorage + SQLite local para uso sem internet.
 */
export async function downloadOfflineStudyPack(
  limit: number = 80
): Promise<OfflinePackMetadata> {
  const [questionsRes, subjectsRes] = await Promise.all([
    api.get<any>(`/questions?limit=${limit}`),
    api.get<any[]>('/subjects').catch(() => []),
  ]);

  const rawList: any[] = Array.isArray(questionsRes)
    ? questionsRes
    : Array.isArray(questionsRes?.data)
      ? questionsRes.data
      : Array.isArray(questionsRes?.questions)
        ? questionsRes.questions
        : [];

  const normalizedQuestions: QuizQuestion[] = rawList.slice(0, limit).map((q: any) => ({
    id: String(q.id),
    subject: String(q.subject || 'Geral'),
    area: String(q.area || 'Geral'),
    year: Number(q.year || 2023),
    difficulty: q.difficulty || 'MEDIUM',
    topic: q.topic || undefined,
    text: String(q.text || ''),
    options: Array.isArray(q.options) ? q.options.map(String) : [],
    correctAnswer: Number(q.correctAnswer ?? 0),
    explanation: q.explanation ? String(q.explanation) : undefined,
    errorRate: q.errorRate !== undefined ? Number(q.errorRate) : undefined,
  }));

  const questionsJson = JSON.stringify(normalizedQuestions);
  const subjectsJson = JSON.stringify(Array.isArray(subjectsRes) ? subjectsRes : []);

  await AsyncStorage.setItem(OFFLINE_QUESTIONS_STORAGE_KEY, questionsJson);
  await AsyncStorage.setItem(OFFLINE_SUBJECTS_KEY, subjectsJson);

  // Grava também nas tabelas SQLite nativas quando disponível
  try {
    await saveQuestionsLocal(
      normalizedQuestions.map((q) => ({
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
    // Em Web ou SQLite indisponível, AsyncStorage garante a persistência
  }

  const sizeKb = Math.max(
    1,
    Math.round((questionsJson.length + subjectsJson.length) / 1024)
  );

  const meta: OfflinePackMetadata = {
    downloadedAt: new Date().toISOString(),
    questionsCount: normalizedQuestions.length,
    subjectsCount: Array.isArray(subjectsRes) ? subjectsRes.length : 0,
    sizeKb,
  };

  await AsyncStorage.setItem(OFFLINE_PACK_META_KEY, JSON.stringify(meta));
  return meta;
}

export async function getOfflinePackMetadata(): Promise<OfflinePackMetadata | null> {
  try {
    const raw = await AsyncStorage.getItem(OFFLINE_PACK_META_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as OfflinePackMetadata;
  } catch {
    return null;
  }
}

export async function getOfflinePackQuestions(areaFilter?: string): Promise<QuizQuestion[]> {
  try {
    const raw = await AsyncStorage.getItem(OFFLINE_QUESTIONS_STORAGE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as QuizQuestion[];
    if (!Array.isArray(list)) return [];
    if (!areaFilter || areaFilter === 'TODAS') return list;
    const norm = areaFilter.toLowerCase();
    return list.filter(
      (q) =>
        (q.area || '').toLowerCase().includes(norm) ||
        (q.subject || '').toLowerCase().includes(norm)
    );
  } catch {
    return [];
  }
}

export async function clearOfflineStudyPack(): Promise<void> {
  await AsyncStorage.removeItem(OFFLINE_QUESTIONS_STORAGE_KEY);
  await AsyncStorage.removeItem(OFFLINE_SUBJECTS_KEY);
  await AsyncStorage.removeItem(OFFLINE_PACK_META_KEY);
}

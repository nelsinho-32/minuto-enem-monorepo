import * as SQLite from 'expo-sqlite';
import { Platform } from 'react-native';

export interface LocalTask {
  id: string;
  title: string;
  description?: string | null;
  topic: string;
  classId?: string | null;
  classroomId?: string | null;
  dueDate?: string | null;
  status: string;
  total: number;
  subjectId?: string | null;
  subjectName?: string | null;
  instructions?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface LocalQuestion {
  id: string;
  text: string;
  subject?: string | null;
  topic?: string | null;
  year?: number | null;
  difficulty?: string | null;
  explanation?: string | null;
  correctAnswer: number;
  taskId?: string | null;
  createdAt?: string | null;
}

export interface LocalOption {
  id: string;
  questionId: string;
  text: string;
  orderIndex: number;
  isCorrect: number; // 0 ou 1
}

export type SyncQueueStatus = 'PENDING' | 'SYNCED';

export interface SyncQueueRecord {
  id: string;
  mutationType: string; // Ex: 'SUBMIT_ANSWER', 'QUESTION_ATTEMPT', 'LESSON_PROGRESS'
  payload: string; // JSON serializado com a resposta e metadados
  status: SyncQueueStatus; // 'PENDING' | 'SYNCED'
  createdAt: string;
}

let dbInstance: SQLite.SQLiteDatabase | null = null;
let initPromise: Promise<SQLite.SQLiteDatabase> | null = null;

// Fallback em memória para ambientes Web/SSR onde o SQLite nativo não está disponível
const memorySyncQueue: SyncQueueRecord[] = [];
const memoryTasks: LocalTask[] = [];
const memoryQuestions: LocalQuestion[] = [];
const memoryOptions: LocalOption[] = [];

/**
 * Obtém ou abre a instância do banco de dados SQLite local
 */
export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (dbInstance) return dbInstance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const db = await SQLite.openDatabaseAsync('minuto_enem.db');
      await setupTables(db);
      dbInstance = db;
      return db;
    } catch (error) {
      console.warn(
        '⚠️ [SQLite] Falha ao inicializar banco nativo (esperado no navegador Web sem WASM). Utilizando fallback seguro:',
        error
      );
      throw error;
    } finally {
      initPromise = null;
    }
  })();

  return initPromise;
}

/**
 * Cria a estrutura das tabelas vitais: Task, Question, Option e SyncQueue
 */
async function setupTables(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    -- Tabela de Tarefas / Atividades da Escola
    CREATE TABLE IF NOT EXISTS Task (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      topic TEXT NOT NULL,
      classId TEXT,
      classroomId TEXT,
      dueDate TEXT,
      status TEXT DEFAULT 'PENDING_APPROVAL',
      total INTEGER DEFAULT 0,
      subjectId TEXT,
      subjectName TEXT,
      instructions TEXT,
      createdAt TEXT,
      updatedAt TEXT
    );

    -- Tabela de Questões
    CREATE TABLE IF NOT EXISTS Question (
      id TEXT PRIMARY KEY NOT NULL,
      text TEXT NOT NULL,
      subject TEXT,
      topic TEXT,
      year INTEGER,
      difficulty TEXT,
      explanation TEXT,
      correctAnswer INTEGER DEFAULT 0,
      taskId TEXT,
      createdAt TEXT
    );

    -- Tabela de Alternativas das Questões
    CREATE TABLE IF NOT EXISTS Option (
      id TEXT PRIMARY KEY NOT NULL,
      questionId TEXT NOT NULL,
      text TEXT NOT NULL,
      orderIndex INTEGER NOT NULL DEFAULT 0,
      isCorrect INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (questionId) REFERENCES Question (id) ON DELETE CASCADE
    );

    -- Tabela de Fila de Sincronização Offline (SyncQueue)
    CREATE TABLE IF NOT EXISTS SyncQueue (
      id TEXT PRIMARY KEY NOT NULL,
      mutationType TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      createdAt TEXT NOT NULL
    );

    -- Índices para otimização de consultas e ordenação
    CREATE INDEX IF NOT EXISTS idx_question_task ON Question (taskId);
    CREATE INDEX IF NOT EXISTS idx_option_question ON Option (questionId);
    CREATE INDEX IF NOT EXISTS idx_syncqueue_status ON SyncQueue (status);
  `);
}

/**
 * Inicializa formalmente o banco de dados local
 */
export async function initDatabase(): Promise<void> {
  try {
    await getDatabase();
    console.log('✅ [SQLite Database] Banco de dados local inicializado com sucesso.');
  } catch {
    console.log('ℹ️ [SQLite Database] Inicializado com adaptador de armazenamento seguro.');
  }
}

// ============================================================================
// MÉTODOS DE MANIPULAÇÃO: SyncQueue
// ============================================================================

/**
 * Enfileira uma mutação na SyncQueue local
 */
export async function enqueueSyncItem(
  mutationType: string,
  payload: Record<string, any> | string,
  customId?: string
): Promise<string> {
  const id = customId || `sync_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const createdAt = new Date().toISOString();

  try {
    const db = await getDatabase();
    await db.runAsync(
      `INSERT INTO SyncQueue (id, mutationType, payload, status, createdAt)
       VALUES (?, ?, ?, 'PENDING', ?)`,
      id,
      mutationType,
      payloadStr,
      createdAt
    );
  } catch {
    // Fallback em memória
    memorySyncQueue.push({
      id,
      mutationType,
      payload: payloadStr,
      status: 'PENDING',
      createdAt,
    });
  }

  return id;
}

/**
 * Recupera todos os registros com status 'PENDING' para sincronização
 */
export async function getPendingSyncQueue(): Promise<SyncQueueRecord[]> {
  try {
    const db = await getDatabase();
    const rows = await db.getAllAsync<SyncQueueRecord>(
      `SELECT id, mutationType, payload, status, createdAt
       FROM SyncQueue
       WHERE status = 'PENDING'
       ORDER BY createdAt ASC`
    );
    return rows;
  } catch {
    return memorySyncQueue.filter((item) => item.status === 'PENDING');
  }
}

/**
 * Atualiza o status de registros da SyncQueue (ex: 'SYNCED')
 */
export async function markSyncQueueStatus(
  ids: string[],
  status: SyncQueueStatus
): Promise<void> {
  if (ids.length === 0) return;

  try {
    const db = await getDatabase();
    const placeholders = ids.map(() => '?').join(',');
    await db.runAsync(
      `UPDATE SyncQueue SET status = ? WHERE id IN (${placeholders})`,
      status,
      ...ids
    );
  } catch {
    memorySyncQueue.forEach((item) => {
      if (ids.includes(item.id)) {
        item.status = status;
      }
    });
  }
}

/**
 * Remove um item individual da fila de sincronização
 */
export async function deleteSyncQueueItem(id: string): Promise<void> {
  try {
    const db = await getDatabase();
    await db.runAsync(`DELETE FROM SyncQueue WHERE id = ?`, id);
  } catch {
    const idx = memorySyncQueue.findIndex((item) => item.id === id);
    if (idx !== -1) memorySyncQueue.splice(idx, 1);
  }
}

/**
 * Retorna todos os registros da SyncQueue (para diagnóstico e depuração)
 */
export async function getAllSyncQueue(): Promise<SyncQueueRecord[]> {
  try {
    const db = await getDatabase();
    return await db.getAllAsync<SyncQueueRecord>(
      `SELECT id, mutationType, payload, status, createdAt FROM SyncQueue ORDER BY createdAt DESC`
    );
  } catch {
    return [...memorySyncQueue];
  }
}

// ============================================================================
// MÉTODOS DE MANIPULAÇÃO: Task
// ============================================================================

/**
 * Salva uma lista de tarefas baixadas da API no banco SQLite local
 */
export async function saveTasksLocal(tasks: LocalTask[]): Promise<void> {
  if (tasks.length === 0) return;

  try {
    const db = await getDatabase();
    await db.withTransactionAsync(async () => {
      for (const t of tasks) {
        await db.runAsync(
          `INSERT OR REPLACE INTO Task (
            id, title, description, topic, classId, classroomId,
            dueDate, status, total, subjectId, subjectName, instructions,
            createdAt, updatedAt
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          t.id,
          t.title || '',
          t.description || null,
          t.topic || '',
          t.classId || null,
          t.classroomId || null,
          t.dueDate || null,
          t.status || 'PENDING_APPROVAL',
          t.total || 0,
          t.subjectId || null,
          t.subjectName || null,
          t.instructions || null,
          t.createdAt || null,
          t.updatedAt || null
        );
      }
    });
  } catch {
    tasks.forEach((t) => {
      const idx = memoryTasks.findIndex((m) => m.id === t.id);
      if (idx !== -1) memoryTasks[idx] = t;
      else memoryTasks.push(t);
    });
  }
}

/**
 * Obtém as tarefas salvas localmente
 */
export async function getTasksLocal(classId?: string): Promise<LocalTask[]> {
  try {
    const db = await getDatabase();
    if (classId) {
      return await db.getAllAsync<LocalTask>(
        `SELECT * FROM Task WHERE classId = ? OR classroomId = ? ORDER BY createdAt DESC`,
        classId,
        classId
      );
    }
    return await db.getAllAsync<LocalTask>(`SELECT * FROM Task ORDER BY createdAt DESC`);
  } catch {
    if (classId) {
      return memoryTasks.filter((t) => t.classId === classId || t.classroomId === classId);
    }
    return [...memoryTasks];
  }
}

/**
 * Busca os detalhes de uma tarefa local pelo seu ID
 */
export async function getTaskByIdLocal(taskId: string): Promise<LocalTask | null> {
  try {
    const db = await getDatabase();
    const result = await db.getFirstAsync<LocalTask>(
      `SELECT * FROM Task WHERE id = ? LIMIT 1`,
      taskId
    );
    return result || null;
  } catch {
    return memoryTasks.find((t) => t.id === taskId) || null;
  }
}

// ============================================================================
// MÉTODOS DE MANIPULAÇÃO: Question e Option
// ============================================================================

export interface SaveQuestionInput extends LocalQuestion {
  options: string[] | LocalOption[];
}

/**
 * Salva questões e suas respectivas alternativas para resolução offline
 */
export async function saveQuestionsLocal(questions: SaveQuestionInput[]): Promise<void> {
  if (questions.length === 0) return;

  try {
    const db = await getDatabase();
    await db.withTransactionAsync(async () => {
      for (const q of questions) {
        await db.runAsync(
          `INSERT OR REPLACE INTO Question (
            id, text, subject, topic, year, difficulty, explanation, correctAnswer, taskId, createdAt
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          q.id,
          q.text,
          q.subject || null,
          q.topic || null,
          q.year || null,
          q.difficulty || null,
          q.explanation || null,
          q.correctAnswer ?? 0,
          q.taskId || null,
          q.createdAt || new Date().toISOString()
        );

        if (Array.isArray(q.options)) {
          // Remove opções anteriores
          await db.runAsync(`DELETE FROM Option WHERE questionId = ?`, q.id);

          for (let i = 0; i < q.options.length; i++) {
            const opt = q.options[i];
            const optText = typeof opt === 'string' ? opt : opt.text;
            const optId = typeof opt === 'string' ? `${q.id}_opt_${i}` : opt.id;
            const isCorrect = i === q.correctAnswer ? 1 : 0;

            await db.runAsync(
              `INSERT INTO Option (id, questionId, text, orderIndex, isCorrect)
               VALUES (?, ?, ?, ?, ?)`,
              optId,
              q.id,
              optText,
              i,
              isCorrect
            );
          }
        }
      }
    });
  } catch {
    questions.forEach((q) => {
      const qIdx = memoryQuestions.findIndex((mq) => mq.id === q.id);
      if (qIdx !== -1) memoryQuestions[qIdx] = q;
      else memoryQuestions.push(q);

      if (Array.isArray(q.options)) {
        for (let i = memoryOptions.length - 1; i >= 0; i--) {
          if (memoryOptions[i].questionId === q.id) {
            memoryOptions.splice(i, 1);
          }
        }
        q.options.forEach((opt, i) => {
          memoryOptions.push({
            id: typeof opt === 'string' ? `${q.id}_opt_${i}` : opt.id,
            questionId: q.id,
            text: typeof opt === 'string' ? opt : opt.text,
            orderIndex: i,
            isCorrect: i === q.correctAnswer ? 1 : 0,
          });
        });
      }
    });
  }
}

/**
 * Busca questões vinculadas a uma tarefa específica para resolução offline
 */
export async function getQuestionsByTaskIdLocal(
  taskId: string
): Promise<Array<LocalQuestion & { options: string[] }>> {
  try {
    const db = await getDatabase();
    const questions = await db.getAllAsync<LocalQuestion>(
      `SELECT * FROM Question WHERE taskId = ?`,
      taskId
    );

    const result: Array<LocalQuestion & { options: string[] }> = [];

    for (const q of questions) {
      const options = await db.getAllAsync<LocalOption>(
        `SELECT * FROM Option WHERE questionId = ? ORDER BY orderIndex ASC`,
        q.id
      );
      result.push({
        ...q,
        options: options.map((o) => o.text),
      });
    }

    return result;
  } catch {
    const questions = memoryQuestions.filter((q) => q.taskId === taskId);
    return questions.map((q) => {
      const opts = memoryOptions
        .filter((o) => o.questionId === q.id)
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map((o) => o.text);
      return {
        ...q,
        options: opts,
      };
    });
  }
}


import { z } from "zod";
import { StreakSchema } from "./streak.schema";
import { NoteSchema } from "./note.schema";

export const SyncActionTypeSchema = z.enum([
  "QUESTION_ATTEMPT",
  "LESSON_PROGRESS",
  "NOTE_UPSERT",
  "NOTE_DELETE",
]);

export type SyncActionType = z.infer<typeof SyncActionTypeSchema>;

export const SyncQuestionAttemptPayloadSchema = z.object({
  questionId: z.string().min(1, "O questionId é obrigatório."),
  selectedAnswer: z.coerce.number().int().nonnegative(),
  timeSpentMs: z.coerce.number().int().nonnegative().optional().default(15000),
  answeredAt: z.string().datetime().or(z.string()).optional(),
});

export type SyncQuestionAttemptPayload = z.infer<
  typeof SyncQuestionAttemptPayloadSchema
>;

export const SyncLessonProgressPayloadSchema = z.object({
  lessonId: z.string().min(1, "O lessonId é obrigatório."),
  trailId: z.string().optional(),
  completed: z.boolean().default(true),
  timestamp: z.string().datetime().or(z.string()).optional(),
});

export type SyncLessonProgressPayload = z.infer<
  typeof SyncLessonProgressPayloadSchema
>;

export const SyncNoteUpsertPayloadSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(1, "O título da anotação é obrigatório."),
  content: z.string().default(""),
  tags: z.array(z.string()).optional().default([]),
  lessonId: z.string().nullable().optional(),
  updatedAt: z.string().datetime().or(z.string()).optional(),
});

export type SyncNoteUpsertPayload = z.infer<typeof SyncNoteUpsertPayloadSchema>;

export const SyncNoteDeletePayloadSchema = z.object({
  noteId: z.string().uuid("ID da anotação inválido."),
});

export type SyncNoteDeletePayload = z.infer<typeof SyncNoteDeletePayloadSchema>;

export const SyncQuestionAttemptActionSchema = z.object({
  idempotencyKey: z.string().min(1, "A chave de idempotência é obrigatória."),
  type: z.literal("QUESTION_ATTEMPT"),
  payload: SyncQuestionAttemptPayloadSchema,
});

export const SyncLessonProgressActionSchema = z.object({
  idempotencyKey: z.string().min(1, "A chave de idempotência é obrigatória."),
  type: z.literal("LESSON_PROGRESS"),
  payload: SyncLessonProgressPayloadSchema,
});

export const SyncNoteUpsertActionSchema = z.object({
  idempotencyKey: z.string().min(1, "A chave de idempotência é obrigatória."),
  type: z.literal("NOTE_UPSERT"),
  payload: SyncNoteUpsertPayloadSchema,
});

export const SyncNoteDeleteActionSchema = z.object({
  idempotencyKey: z.string().min(1, "A chave de idempotência é obrigatória."),
  type: z.literal("NOTE_DELETE"),
  payload: SyncNoteDeletePayloadSchema,
});

export const SyncActionSchema = z.discriminatedUnion("type", [
  SyncQuestionAttemptActionSchema,
  SyncLessonProgressActionSchema,
  SyncNoteUpsertActionSchema,
  SyncNoteDeleteActionSchema,
]);

export type SyncAction = z.infer<typeof SyncActionSchema>;

export const SyncBatchPayloadSchema = z.object({
  idempotencyKey: z.string().optional(),
  actions: z
    .array(SyncActionSchema)
    .min(1, "O lote de sincronização deve conter pelo menos uma ação."),
});

export type SyncBatchPayload = z.infer<typeof SyncBatchPayloadSchema>;

export const StudentUpdatedStateSchema = z.object({
  user: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    xp: z.number().int().nonnegative(),
    currentStreak: z.number().int().nonnegative(),
    longestStreak: z.number().int().nonnegative(),
    iceFreezes: z.number().int().nonnegative(),
    lastStudyDate: z.date().nullable().or(z.string().nullable()),
  }),
  streak: StreakSchema.nullable().optional(),
  triScore: z.number().nullable().optional(),
  stats: z.object({
    totalAttempts: z.number().int().nonnegative(),
    correctAttempts: z.number().int().nonnegative(),
    accuracyRate: z.number().nonnegative(),
  }),
  notes: z.array(NoteSchema).optional(),
  processedActions: z.number().int().nonnegative(),
  skippedActions: z.number().int().nonnegative(),
  syncedAt: z.string(),
});

export type StudentUpdatedState = z.infer<typeof StudentUpdatedStateSchema>;


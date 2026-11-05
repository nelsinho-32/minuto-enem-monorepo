import { z } from "zod";
import { OptionSchema } from "./option.schema";

export const QuestionDifficultySchema = z.enum([
  "EASY",
  "MEDIUM",
  "HARD",
  "facil",
  "medio",
  "dificil",
  "misto",
]);

export type QuestionDifficulty = z.infer<typeof QuestionDifficultySchema>;

/**
 * Schema de Questão compatível com o front-end (`src/types/quiz.ts`)
 */
export const QuestionSchema = z.object({
  id: z.string().min(1),
  year: z.number().int().optional(),
  area: z.string().optional(),
  subject: z.string().min(1),
  difficulty: z.string().nullable().optional(),
  text: z.string().min(1),
  options: z.array(OptionSchema),
  correctOptionId: z.string().min(1),
  correctAnswer: z.number().int().nonnegative().optional(),
  explanation: z.string(),
  errorRate: z.number().nullable().optional(),
});

export type Question = z.infer<typeof QuestionSchema>;

/**
 * Schema da entidade `Question` do Prisma / API e hook `useQuestionsQuery`
 */
export const QuizQuestionSchema = z.object({
  id: z.union([z.string().min(1), z.number()]),
  year: z.number().int().optional(),
  area: z.string().default("Geral"),
  subject: z.string().min(1),
  subjectId: z.string().nullable().optional(),
  topic: z.string().nullable().optional(),
  topicId: z.string().nullable().optional(),
  lessonId: z.string().nullable().optional(),
  difficulty: z.string().optional(),
  text: z.string().min(1),
  options: z.array(z.string()),
  correctAnswer: z.number().int().nonnegative(),
  explanation: z.string().optional(),
  errorRate: z.number().optional(),
});

export type QuizQuestion = z.infer<typeof QuizQuestionSchema>;

/**
 * Schema do modelo `Question` no banco de dados (Prisma)
 */
export const DatabaseQuestionSchema = z.object({
  id: z.string().uuid(),
  year: z.number().int(),
  area: z.string().min(1),
  subject: z.string().min(1),
  difficulty: z.string().nullable().optional(),
  text: z.string().min(1),
  options: z.union([z.array(z.string()), z.array(OptionSchema), z.unknown()]),
  correctAnswer: z.number().int().nonnegative(),
  explanation: z.string().nullable().optional(),
  errorRate: z.number().nullable().optional(),
});

export type DatabaseQuestion = z.infer<typeof DatabaseQuestionSchema>;

export const AnswerQuestionInputSchema = z.object({
  userId: z.string().min(1, "O ID do usuário (userId) é obrigatório."),
  questionId: z
    .union([z.string().min(1), z.number()])
    .transform((v) => String(v)),
  selectedAnswer: z.coerce.number().int().nonnegative({
    message: "A alternativa selecionada (selectedAnswer) é obrigatória.",
  }),
  timeSpentMs: z.number().int().nonnegative().optional(),
  source: z.string().optional(),
  idempotencyKey: z.string().optional(),
});

export type AnswerQuestionInput = z.infer<typeof AnswerQuestionInputSchema>;

export const QuestionAttemptSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().min(1),
  questionId: z.string().min(1),
  selectedAnswer: z.number().int().nonnegative(),
  isCorrect: z.boolean(),
  timeSpentMs: z.number().int().nonnegative().nullable().optional(),
  xpEarned: z.number().int().nonnegative().default(0),
  source: z.string().default("QUIZ"),
  offlineSyncLogId: z.string().uuid().nullable().optional(),
  createdAt: z.union([z.coerce.date(), z.string()]).optional(),
});

export type QuestionAttempt = z.infer<typeof QuestionAttemptSchema>;

export const OfflineSyncLogSchema = z.object({
  id: z.string().uuid(),
  idempotencyKey: z.string().min(1),
  userId: z.string().min(1),
  status: z.enum(["PENDING", "SYNCED", "FAILED"]).default("SYNCED"),
  itemsCount: z.number().int().nonnegative().default(1),
  payload: z.unknown().optional(),
  errorMessage: z.string().nullable().optional(),
  clientAnsweredAt: z.union([z.coerce.date(), z.string()]).nullable().optional(),
  syncedAt: z.union([z.coerce.date(), z.string()]).optional(),
  createdAt: z.union([z.coerce.date(), z.string()]).optional(),
});

export type OfflineSyncLog = z.infer<typeof OfflineSyncLogSchema>;

export const FlashcardReviewSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().min(1),
  questionId: z.string().min(1),
  repetition: z.number().int().nonnegative().default(0),
  interval: z.number().int().nonnegative().default(0),
  easeFactor: z.number().default(2.5),
  nextReviewDate: z.union([z.coerce.date(), z.string()]),
  lastReviewedAt: z.union([z.coerce.date(), z.string()]).nullable().optional(),
  createdAt: z.union([z.coerce.date(), z.string()]).optional(),
  updatedAt: z.union([z.coerce.date(), z.string()]).optional(),
});

export type FlashcardReview = z.infer<typeof FlashcardReviewSchema>;

export const PendingQuizAnswerPayloadSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  questionId: z.union([z.string().min(1), z.number()]),
  selectedOption: z.number().int().nonnegative(),
  isCorrect: z.boolean(),
  xpEarned: z.number().nonnegative(),
  answeredAt: z.string(),
});

export type PendingQuizAnswerPayload = z.infer<
  typeof PendingQuizAnswerPayloadSchema
>;

export const QuestionsQueryFiltersSchema = z.object({
  day: z.string().optional(),
  difficulty: z.string().optional(),
  limit: z.number().int().positive().optional(),
  subject: z.string().optional(),
  subjectId: z.string().optional(),
  topic: z.string().optional(),
  topicId: z.string().optional(),
  lessonId: z.string().optional(),
  area: z.string().optional(),
});

export type QuestionsQueryFilters = z.infer<typeof QuestionsQueryFiltersSchema>;

export const WeakTopicSchema = z.object({
  subject: z.string(),
  area: z.string(),
  totalAttempts: z.number().int().nonnegative(),
  wrongCount: z.number().int().nonnegative(),
  correctCount: z.number().int().nonnegative(),
  errorRatePercent: z.number(),
  accuracyPercent: z.number(),
});

export type WeakTopic = z.infer<typeof WeakTopicSchema>;

export const AreaStatsItemSchema = z.object({
  total: z.number().int().nonnegative(),
  correct: z.number().int().nonnegative(),
  wrong: z.number().int().nonnegative(),
  accuracyPercent: z.number(),
  triEstimate: z.number(),
});

export type AreaStatsItem = z.infer<typeof AreaStatsItemSchema>;

export const UserQuestionStatsSchema = z.object({
  userId: z.string(),
  totalAttempts: z.number().int().nonnegative(),
  totalCorrect: z.number().int().nonnegative(),
  totalWrong: z.number().int().nonnegative(),
  accuracyPercent: z.number(),
  triEstimate: z.number(),
  byArea: z.record(AreaStatsItemSchema),
  topWeakTopics: z.array(WeakTopicSchema),
  recentAttempts: z.array(z.any()).optional(),
});

export type UserQuestionStats = z.infer<typeof UserQuestionStatsSchema>;


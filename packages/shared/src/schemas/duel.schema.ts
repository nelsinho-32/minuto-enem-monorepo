import { z } from "zod";
import { StreakSchema } from "./streak.schema";

export const DuelMatchStatusSchema = z.enum([
  "WAITING",
  "IN_PROGRESS",
  "FINISHED",
]);

export type DuelMatchStatus = z.infer<typeof DuelMatchStatusSchema>;

export const ArenaStatusSchema = z.enum([
  "LOBBY",
  "MATCHMAKING",
  "DUEL",
  "FINISHED",
]);

export type ArenaStatus = z.infer<typeof ArenaStatusSchema>;

export const DuelOutcomeSchema = z.enum(["VICTORY", "DEFEAT", "DRAW"]);

export type DuelOutcome = z.infer<typeof DuelOutcomeSchema>;

export const TriDifficultyTierSchema = z.enum(["EASY", "MEDIUM", "HARD"]);

export type TriDifficultyTier = z.infer<typeof TriDifficultyTierSchema>;

export const TriItemMetricsSchema = z.object({
  questionId: z.string().optional(),
  errorRate: z.number(),
  successRate: z.number(),
  difficultyTier: TriDifficultyTierSchema,
  difficultyLogitB: z.number(),
  dynamicWeight: z.number(),
  basePoints: z.number(),
});

export type TriItemMetrics = z.infer<typeof TriItemMetricsSchema>;

export const TriSimulationAnswerInputSchema = z.object({
  questionId: z.string().min(1),
  selectedAnswer: z.number().int().nonnegative().optional(),
  isCorrect: z.boolean().optional(),
});

export type TriSimulationAnswerInput = z.infer<
  typeof TriSimulationAnswerInputSchema
>;

export const DuelAnswerItemSchema = z.object({
  questionId: z.string().min(1),
  selectedAnswer: z.number().int().nonnegative(),
  isCorrect: z.boolean(),
  pointsEarned: z.number().nonnegative(),
});

export type DuelAnswerItem = z.infer<typeof DuelAnswerItemSchema>;

export const DuelPlayerStateSchema = z.object({
  userId: z.string().min(1),
  socketId: z.string().min(1),
  name: z.string().min(1),
  score: z.number().nonnegative().default(0),
  correctCount: z.number().int().nonnegative().default(0),
  answers: z.array(DuelAnswerItemSchema).default([]),
});

export type DuelPlayerState = z.infer<typeof DuelPlayerStateSchema>;

export const DuelQuestionSchema = z.object({
  id: z.string().min(1),
  year: z.number().int(),
  area: z.string(),
  subject: z.string(),
  text: z.string(),
  options: z.unknown(),
  correctAnswer: z.number().int().nonnegative(),
  errorRate: z.number().nullable(),
});

export type DuelQuestion = z.infer<typeof DuelQuestionSchema>;

export interface DuelMatchRoom {
  matchId: string;
  subject?: string;
  status: DuelMatchStatus;
  questions: DuelQuestion[];
  players: Map<string, DuelPlayerState>;
  createdAt: Date;
}

export const JoinMatchPayloadSchema = z.object({
  userId: z.string().min(1, "O userId é obrigatório para entrar em um duelo."),
  userName: z.string().optional(),
  matchId: z.string().optional(),
  subject: z.string().optional(),
  questionsCount: z.coerce.number().int().min(1).max(15).optional().default(5),
});

export type JoinMatchPayload = z.input<typeof JoinMatchPayloadSchema>;

export const SubmitDuelAnswerPayloadSchema = z.object({
  matchId: z.string().min(1, "O matchId é obrigatório."),
  userId: z.string().min(1, "O userId é obrigatório."),
  questionId: z.string().min(1, "O questionId é obrigatório."),
  selectedAnswer: z.coerce.number().int().nonnegative(),
  timeMs: z.coerce.number().nonnegative().optional().default(15000),
});

export type SubmitDuelAnswerPayload = z.input<
  typeof SubmitDuelAnswerPayloadSchema
>;

export const MatchEndPayloadSchema = z.object({
  matchId: z.string().min(1, "O matchId é obrigatório."),
});

export type MatchEndPayload = z.infer<typeof MatchEndPayloadSchema>;

export const DuelPlayerSummarySchema = z.object({
  userId: z.string(),
  name: z.string(),
  score: z.number(),
  correctCount: z.number().int().nonnegative(),
  xpEarned: z.number().int().nonnegative(),
  triScore: z.number().nullable(),
  streak: StreakSchema.nullable().optional(),
});

export type DuelPlayerSummary = z.infer<typeof DuelPlayerSummarySchema>;

export const DuelMatchResultSchema = z.object({
  matchId: z.string(),
  status: DuelMatchStatusSchema,
  winnerId: z.string().nullable(),
  winnerName: z.string().nullable(),
  isDraw: z.boolean(),
  players: z.array(DuelPlayerSummarySchema),
  finishedAt: z.string(),
});

export type DuelMatchResult = z.infer<typeof DuelMatchResultSchema>;

export const DatabaseDuelMatchSchema = z.object({
  id: z.string().uuid(),
  matchId: z.string().min(1),
  subject: z.string().nullable().optional(),
  status: DuelMatchStatusSchema.default("FINISHED"),
  winnerId: z.string().nullable().optional(),
  isDraw: z.boolean().default(false),
  totalQuestions: z.number().int().default(5),
  questionIds: z.array(z.string()).default([]),
  startedAt: z.union([z.coerce.date(), z.string()]).optional(),
  finishedAt: z.union([z.coerce.date(), z.string()]).nullable().optional(),
  createdAt: z.union([z.coerce.date(), z.string()]).optional(),
  updatedAt: z.union([z.coerce.date(), z.string()]).optional(),
});

export type DatabaseDuelMatch = z.infer<typeof DatabaseDuelMatchSchema>;

export const DatabaseDuelPlayerSchema = z.object({
  id: z.string().uuid(),
  duelMatchId: z.string().uuid(),
  userId: z.string().min(1),
  score: z.number().default(0),
  correctCount: z.number().int().default(0),
  xpEarned: z.number().int().default(0),
  triScore: z.number().nullable().optional(),
  answers: z.unknown().optional(),
  createdAt: z.union([z.coerce.date(), z.string()]).optional(),
});

export type DatabaseDuelPlayer = z.infer<typeof DatabaseDuelPlayerSchema>;


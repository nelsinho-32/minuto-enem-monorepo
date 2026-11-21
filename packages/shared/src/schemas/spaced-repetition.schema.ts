import { z } from "zod";

export const SpacedRepetitionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  questionId: z.string(),
  subjectId: z.string().nullable().optional(),
  interval: z.number().int().nonnegative().default(0),
  repetitions: z.number().int().nonnegative().default(0),
  easinessFactor: z.number().nonnegative().default(2.5),
  nextReviewDate: z.date().or(z.string()),
  lastReviewedAt: z.date().or(z.string()).nullable().optional(),
  createdAt: z.date().or(z.string()).optional(),
  updatedAt: z.date().or(z.string()).optional(),
});

export type SpacedRepetition = z.infer<typeof SpacedRepetitionSchema>;

export const SubmitReviewInputSchema = z.object({
  questionId: z.string().min(1, "O questionId é obrigatório."),
  grade: z.coerce.number().int().min(0).max(5).optional(),
  isCorrect: z.boolean().optional(),
  timeSpentMs: z.coerce.number().int().nonnegative().optional(),
  selectedAnswer: z.coerce.number().int().nonnegative().optional(),
});

export type SubmitReviewInput = z.infer<typeof SubmitReviewInputSchema>;

export const TodayReviewsResponseSchema = z.object({
  date: z.string(),
  totalDue: z.number().int().nonnegative(),
  count: z.number().int().nonnegative(),
  reviews: z.array(z.any()),
});

export type TodayReviewsResponse = z.infer<typeof TodayReviewsResponseSchema>;


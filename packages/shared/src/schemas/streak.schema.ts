import { z } from "zod";

export const DayStreakStatusSchema = z.enum([
  "COMPLETED",
  "FROZEN",
  "EMPTY",
  "FUTURE",
]);

export type DayStreakStatus = z.infer<typeof DayStreakStatusSchema>;

export const WeekDayStreakItemSchema = z.object({
  date: z.string(), // YYYY-MM-DD
  label: z.string(), // D, S, T, Q, Q, S, S
  status: DayStreakStatusSchema,
  isToday: z.boolean(),
});

export type WeekDayStreakItem = z.infer<typeof WeekDayStreakItemSchema>;

export const StreakSchema = z.object({
  id: z.string().optional(),
  userId: z.string().optional(),
  currentStreak: z.number().int().nonnegative().default(0),
  longestStreak: z.number().int().nonnegative().default(0),
  iceFreezes: z.number().int().nonnegative().default(0),
  lastStudyDate: z.union([z.coerce.date(), z.string()]).nullable().optional(),
  xp: z.number().int().nonnegative().optional(),
});

export type Streak = z.infer<typeof StreakSchema>;

export const StreakActivityInputSchema = z.object({
  userId: z.string().min(1, "O ID do usuário é obrigatório."),
});

export type StreakActivityInput = z.infer<typeof StreakActivityInputSchema>;

export const StreakLoginVerificationSchema = StreakSchema.extend({
  missedDays: z.number().int().nonnegative().default(0),
  iceFreezesUsed: z.number().int().nonnegative().default(0),
  streakReset: z.boolean().default(false),
});

export type StreakLoginVerification = z.infer<
  typeof StreakLoginVerificationSchema
>;

export const WeeklyStreakResponseSchema = StreakSchema.extend({
  weekDays: z.array(WeekDayStreakItemSchema).default([]),
});

export type WeeklyStreakResponse = z.infer<typeof WeeklyStreakResponseSchema>;

export const StreakLogSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().min(1),
  date: z.union([z.coerce.date(), z.string()]),
  status: z.enum(["COMPLETED", "FROZEN", "BROKEN"]).default("COMPLETED"),
  streakCount: z.number().int().nonnegative().default(0),
  iceFreezesLeft: z.number().int().nonnegative().default(0),
  activityType: z.string().nullable().optional(),
  createdAt: z.union([z.coerce.date(), z.string()]).optional(),
});

export type StreakLog = z.infer<typeof StreakLogSchema>;


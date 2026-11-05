import { z } from "zod";
import { SubjectSchema } from "./subject.schema";
import { LessonSummarySchema } from "./lesson.schema";

export const TrailProgressStatusSchema = z.enum([
  "NOT_STARTED",
  "IN_PROGRESS",
  "COMPLETED",
]);

export type TrailProgressStatus = z.infer<typeof TrailProgressStatusSchema>;

export const TrailProgressSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().min(1),
  trailId: z.string().uuid(),
  completedSteps: z.number().int().nonnegative().default(0),
  completedLessonIds: z.array(z.string()).default([]),
  progressPercent: z.number().min(0).max(100).default(0),
  status: TrailProgressStatusSchema.default("IN_PROGRESS"),
  createdAt: z.union([z.coerce.date(), z.string()]).optional(),
  updatedAt: z.union([z.coerce.date(), z.string()]).optional(),
});

export type TrailProgress = z.infer<typeof TrailProgressSchema>;

export const TrailSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1, "O título da trilha é obrigatório."),
  description: z.string().nullable().optional(),
  area: z.string().trim().min(1, "A área da trilha é obrigatória."),
  subjectId: z.string().uuid().nullable().optional(),
  subject: SubjectSchema.partial().nullable().optional(),
  lessonIds: z.array(z.string()).default([]),
  questionIds: z.array(z.string()).default([]),
  totalSteps: z.number().int().min(1).default(1),
  lessons: z.array(LessonSummarySchema).optional(),
  userProgress: TrailProgressSchema.nullable().optional(),
  createdAt: z.union([z.coerce.date(), z.string()]).optional(),
  updatedAt: z.union([z.coerce.date(), z.string()]).optional(),
});

export type Trail = z.infer<typeof TrailSchema>;

export const CreateTrailInputSchema = z.object({
  title: z.string().trim().min(1, "Título da trilha é obrigatório."),
  description: z.string().optional(),
  area: z.string().trim().min(1, "Área da trilha é obrigatória."),
  subjectId: z.string().optional(),
  lessonIds: z.array(z.string()).optional().default([]),
  questionIds: z.array(z.string()).optional().default([]),
  totalSteps: z.number().int().min(1).optional(),
});

export type CreateTrailInput = z.input<typeof CreateTrailInputSchema>;

export const UpdateTrailInputSchema = z.object({
  title: z.string().trim().min(1).optional(),
  description: z.string().optional(),
  area: z.string().trim().min(1).optional(),
  subjectId: z.string().nullable().optional(),
  lessonIds: z.array(z.string()).optional(),
  questionIds: z.array(z.string()).optional(),
  totalSteps: z.number().int().min(1).optional(),
});

export type UpdateTrailInput = z.infer<typeof UpdateTrailInputSchema>;

export const UpdateTrailProgressInputSchema = z.object({
  userId: z.string().min(1, "O userId é obrigatório."),
  trailId: z.string().min(1, "O trailId é obrigatório."),
  completedSteps: z.number().int().nonnegative().optional(),
  completedLessonIds: z.array(z.string()).optional(),
  lessonId: z.string().optional(),
  status: TrailProgressStatusSchema.optional(),
});

export type UpdateTrailProgressInput = z.infer<
  typeof UpdateTrailProgressInputSchema
>;


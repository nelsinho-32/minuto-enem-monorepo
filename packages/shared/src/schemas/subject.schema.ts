import { z } from "zod";

export const TopicSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1, "O nome do assunto/tópico é obrigatório."),
  slug: z.string().optional(),
  subjectId: z.string().nullable().optional(),
  createdAt: z.union([z.coerce.date(), z.string()]).optional(),
});

export type Topic = z.infer<typeof TopicSchema>;

export const SubjectSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1, "O nome da matéria é obrigatório."),
  slug: z.string().trim().min(1, "O slug da matéria é obrigatório."),
  icon: z.string().default("book"),
  topics: z.array(TopicSchema).optional(),
  createdAt: z.union([z.coerce.date(), z.string()]).optional(),
});

export type Subject = z.infer<typeof SubjectSchema>;

export const CreateSubjectInputSchema = z.object({
  name: z.string().trim().min(1, "O nome da matéria é obrigatório."),
  slug: z.string().trim().min(1, "O slug da matéria é obrigatório."),
  icon: z.string().optional().default("book"),
});

export type CreateSubjectInput = z.infer<typeof CreateSubjectInputSchema>;

export const UpdateSubjectInputSchema = CreateSubjectInputSchema.partial();

export type UpdateSubjectInput = z.infer<typeof UpdateSubjectInputSchema>;

import { z } from "zod";

export const NoteSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1, "O título da anotação é obrigatório."),
  content: z.string().trim().min(1, "O conteúdo da anotação é obrigatório."),
  tags: z.array(z.string()).default([]),
  lessonId: z.string().nullable().optional(),
  userId: z.string().min(1, "O ID do usuário (userId) é obrigatório."),
  createdAt: z.union([z.coerce.date(), z.string()]).optional(),
  updatedAt: z.union([z.coerce.date(), z.string()]).optional(),
});

export type Note = z.infer<typeof NoteSchema>;

export const CreateNoteInputSchema = z.object({
  userId: z.string().min(1, "O ID do usuário (userId) é obrigatório."),
  title: z.string().trim().min(1, "Título da anotação é obrigatório."),
  content: z.string().trim().min(1, "Conteúdo da anotação é obrigatório."),
  tags: z.array(z.string()).optional().default([]),
  lessonId: z.string().optional(),
});

export type CreateNoteInput = z.input<typeof CreateNoteInputSchema>;

export const UpdateNoteInputSchema = z.object({
  title: z.string().trim().min(1).optional(),
  content: z.string().trim().min(1).optional(),
  tags: z.array(z.string()).optional(),
  lessonId: z.string().nullable().optional(),
});

export type UpdateNoteInput = z.infer<typeof UpdateNoteInputSchema>;


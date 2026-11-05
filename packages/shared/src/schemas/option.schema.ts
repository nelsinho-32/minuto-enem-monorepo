import { z } from "zod";

/**
 * Schema para Alternativa (Option) extraído de `src/types/quiz.ts` e compatível
 * com o campo `options` (JSON) do modelo `Question` no Prisma.
 */
export const OptionSchema = z.object({
  id: z.string().min(1, "O ID da alternativa é obrigatório"),
  text: z.string().min(1, "O texto da alternativa é obrigatório"),
  label: z.string().optional(),
  isCorrect: z.boolean().optional(),
});

export const AlternativeSchema = OptionSchema;

export type Option = z.infer<typeof OptionSchema>;
export type Alternative = z.infer<typeof AlternativeSchema>;

export const QuestionOptionsSchema = z.union([
  z.array(OptionSchema),
  z.array(z.string()),
]);

export type QuestionOptions = z.infer<typeof QuestionOptionsSchema>;


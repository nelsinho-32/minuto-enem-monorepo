import { z } from "zod";

export const EssayStatusValues = ["PENDING", "CORRECTED"] as const;
export const EssayStatusSchema = z.enum(EssayStatusValues);
export type EssayStatus = z.infer<typeof EssayStatusSchema>;

export const CompetencyLevelValues = [0, 40, 80, 120, 160, 200] as const;
export const CompetencyLevelSchema = z.union([
  z.literal(0),
  z.literal(40),
  z.literal(80),
  z.literal(120),
  z.literal(160),
  z.literal(200),
]);

export const CompetencyScoreSchema = z
  .number()
  .int()
  .min(0, "A nota da competência deve ser no mínimo 0.")
  .max(200, "A nota da competência deve ser no máximo 200.");

// ============================================================================
// ENTIDADE DE SUBMISSÃO DE REDAÇÃO (EssaySubmission)
// ============================================================================
export const EssaySubmissionSchema = z.object({
  id: z.string().min(1),
  taskId: z.string().min(1, "O ID da tarefa é obrigatório."),
  studentId: z.string().min(1, "O ID do aluno é obrigatório."),
  imageUrl: z.string().min(1, "A URL da imagem da redação é obrigatória."),
  status: EssayStatusSchema.default("PENDING"),
  competency1: CompetencyScoreSchema.nullable().optional(),
  competency2: CompetencyScoreSchema.nullable().optional(),
  competency3: CompetencyScoreSchema.nullable().optional(),
  competency4: CompetencyScoreSchema.nullable().optional(),
  competency5: CompetencyScoreSchema.nullable().optional(),
  finalScore: z.number().int().min(0).max(1000).nullable().optional(),
  generalFeedback: z.string().nullable().optional(),
  correctedById: z.string().nullable().optional(),
  correctedAt: z.union([z.coerce.date(), z.string()]).nullable().optional(),
  submittedAt: z.union([z.coerce.date(), z.string()]).optional(),
  createdAt: z.union([z.coerce.date(), z.string()]).optional(),
  updatedAt: z.union([z.coerce.date(), z.string()]).optional(),
  student: z
    .object({
      id: z.string(),
      name: z.string(),
      email: z.string(),
    })
    .optional(),
  task: z
    .object({
      id: z.string(),
      title: z.string(),
      topic: z.string(),
      description: z.string().nullable().optional(),
      dueDate: z.union([z.coerce.date(), z.string()]).nullable().optional(),
    })
    .optional(),
});

export type EssaySubmission = z.infer<typeof EssaySubmissionSchema>;

// ============================================================================
// DTOs DE ENTRADA (Input Schemas)
// ============================================================================
export const SubmitEssayInputSchema = z.object({
  taskId: z.string().min(1, "O ID da tarefa (taskId) é obrigatório."),
  imageUrl: z.string().min(1, "A URL da imagem é obrigatória."),
});

export type SubmitEssayInput = z.infer<typeof SubmitEssayInputSchema>;

export const GradeEssayInputSchema = z.object({
  competency1: z.coerce.number().int().min(0).max(200),
  competency2: z.coerce.number().int().min(0).max(200),
  competency3: z.coerce.number().int().min(0).max(200),
  competency4: z.coerce.number().int().min(0).max(200),
  competency5: z.coerce.number().int().min(0).max(200),
  generalFeedback: z
    .string()
    .trim()
    .min(5, "Os comentários do professor devem ter pelo menos 5 caracteres."),
});

export type GradeEssayInput = z.infer<typeof GradeEssayInputSchema>;

// Definição das 5 competências do ENEM para exibição estruturada
export const ENEM_COMPETENCIES = [
  {
    index: 1,
    key: "competency1" as const,
    name: "Competência 1",
    title: "Norma-padrão da Língua Portuguesa",
    description: "Demonstrar domínio da modalidade escrita formal da língua portuguesa.",
  },
  {
    index: 2,
    key: "competency2" as const,
    name: "Competência 2",
    title: "Compreensão da Proposta e Repertório",
    description: "Compreender a proposta de redação e aplicar conceitos das várias áreas do conhecimento para desenvolver o tema.",
  },
  {
    index: 3,
    key: "competency3" as const,
    name: "Competência 3",
    title: "Argumentação e Projeto de Texto",
    description: "Selecionar, relacionar, organizar e interpretar informações, fatos, opiniões e argumentos em defesa de um ponto de vista.",
  },
  {
    index: 4,
    key: "competency4" as const,
    name: "Competência 4",
    title: "Coesão e Mecanismos Linguísticos",
    description: "Demonstrar conhecimento dos mecanismos linguísticos necessários para a construção da argumentação.",
  },
  {
    index: 5,
    key: "competency5" as const,
    name: "Competência 5",
    title: "Proposta de Intervenção Social",
    description: "Elaborar proposta de intervenção para o problema abordado, respeitando os direitos humanos (Agente, Ação, Meio, Efeito e Detalhamento).",
  },
] as const;

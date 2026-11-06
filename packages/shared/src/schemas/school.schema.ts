import { z } from "zod";

/**
 * Configurações personalizáveis da Escola / Instituição (settings flexível como Record)
 */
export const SchoolSettingsSchema = z.record(z.string(), z.unknown());
export type SchoolSettings = z.infer<typeof SchoolSettingsSchema>;

// ============================================================================
// ENTIDADE DE DOMÍNIO ESCOLA (SchoolSchema)
// ============================================================================
export const SchoolSchema = z.object({
  id: z.string().min(1, "O ID da escola é obrigatório."),
  name: z.string().trim().min(2, "O nome da escola deve ter no mínimo 2 caracteres."),
  cnpj: z.string().trim().nullable().optional(),
  code: z.string().trim().min(2, "O código identificador da escola é obrigatório."),
  slug: z.string().trim().min(2, "O slug da escola é obrigatório."),
  isActive: z.boolean().default(true),
  settings: SchoolSettingsSchema.default({}),
  createdAt: z.union([z.coerce.date(), z.string()]).optional(),
  updatedAt: z.union([z.coerce.date(), z.string()]).optional(),
});

export type School = z.infer<typeof SchoolSchema>;

// ============================================================================
// DTOs DE ENTRADA (Input Schemas)
// ============================================================================
export const CreateSchoolInputSchema = z.object({
  name: z.string().trim().min(2, "O nome da escola é obrigatório."),
  cnpj: z.string().trim().optional(),
  code: z
    .string()
    .trim()
    .min(2, "O código deve ter pelo menos 2 caracteres.")
    .transform((val) => val.toUpperCase())
    .optional(),
  slug: z
    .string()
    .trim()
    .min(2, "O slug deve ter pelo menos 2 caracteres.")
    .transform((val) => val.toLowerCase())
    .optional(),
  isActive: z.boolean().optional().default(true),
  settings: SchoolSettingsSchema.optional().default({}),
});

export type CreateSchoolInput = z.input<typeof CreateSchoolInputSchema>;

export const UpdateSchoolInputSchema = z.object({
  name: z.string().trim().min(2).optional(),
  cnpj: z.string().trim().nullable().optional(),
  code: z
    .string()
    .trim()
    .min(2)
    .transform((val) => val.toUpperCase())
    .optional(),
  slug: z
    .string()
    .trim()
    .min(2)
    .transform((val) => val.toLowerCase())
    .optional(),
  isActive: z.boolean().optional(),
  settings: SchoolSettingsSchema.optional(),
});

export type UpdateSchoolInput = z.input<typeof UpdateSchoolInputSchema>;

export const SchoolFilterInputSchema = z.object({
  search: z.string().optional(),
  isActive: z.boolean().optional(),
  page: z.number().int().positive().optional().default(1),
  limit: z.number().int().positive().max(100).optional().default(20),
});

export type SchoolFilterInput = z.infer<typeof SchoolFilterInputSchema>;

// ============================================================================
// DTOs DE SAÍDA / RESPONSE (Output Schemas)
// ============================================================================
export const SchoolResponseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  cnpj: z.string().nullable().optional(),
  code: z.string().min(1),
  slug: z.string().min(1),
  isActive: z.boolean(),
  settings: SchoolSettingsSchema,
  createdAt: z.union([z.coerce.date(), z.string()]).optional(),
  updatedAt: z.union([z.coerce.date(), z.string()]).optional(),
  classroomsCount: z.number().int().nonnegative().optional(),
  teachersCount: z.number().int().nonnegative().optional(),
  studentsCount: z.number().int().nonnegative().optional(),
});

export type SchoolResponse = z.infer<typeof SchoolResponseSchema>;

export const SchoolSummaryResponseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  code: z.string().min(1),
  slug: z.string().min(1),
  isActive: z.boolean(),
});

export type SchoolSummaryResponse = z.infer<typeof SchoolSummaryResponseSchema>;

export const SchoolDashboardMetricsSchema = z.object({
  totalStudents: z.number().int().nonnegative().default(0),
  totalTeachers: z.number().int().nonnegative().default(0),
  totalClassrooms: z.number().int().nonnegative().default(0),
  activeTasksCount: z.number().int().nonnegative().default(0),
  completedTasksCount: z.number().int().nonnegative().default(0),
  averageAccuracyPercent: z.number().nonnegative().default(0),
});

export type SchoolDashboardMetrics = z.infer<typeof SchoolDashboardMetricsSchema>;

export const SchoolDashboardResponseSchema = z.object({
  school: SchoolResponseSchema,
  metrics: SchoolDashboardMetricsSchema,
});

export type SchoolDashboardResponse = z.infer<typeof SchoolDashboardResponseSchema>;

export const SchoolListResponseSchema = z.object({
  schools: z.array(SchoolResponseSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive().optional(),
  limit: z.number().int().positive().optional(),
});

export type SchoolListResponse = z.infer<typeof SchoolListResponseSchema>;


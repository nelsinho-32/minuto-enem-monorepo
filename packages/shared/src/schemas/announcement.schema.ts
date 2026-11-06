import { z } from "zod";

// ============================================================================
// ENUM PÚBLICO-ALVO (Target Audience)
// ============================================================================
export const AnnouncementAudienceEnum = z.enum(["ALL", "TEACHERS_ONLY"]);
export type AnnouncementAudience = z.infer<typeof AnnouncementAudienceEnum>;

// ============================================================================
// ENTIDADE DE DOMÍNIO COMUNICADO (AnnouncementSchema)
// ============================================================================
export const AnnouncementSchema = z.object({
  id: z.string().min(1, "O ID do comunicado é obrigatório."),
  schoolId: z.string().min(1, "O ID da escola é obrigatório."),
  title: z
    .string()
    .trim()
    .min(3, "O título deve ter no mínimo 3 caracteres.")
    .max(150, "O título deve ter no máximo 150 caracteres."),
  content: z
    .string()
    .trim()
    .min(5, "O conteúdo do comunicado deve ter no mínimo 5 caracteres."),
  targetAudience: AnnouncementAudienceEnum.default("ALL"),
  authorId: z.string().nullable().optional(),
  createdAt: z.union([z.coerce.date(), z.string()]).optional(),
  updatedAt: z.union([z.coerce.date(), z.string()]).optional(),
  school: z
    .object({
      id: z.string(),
      name: z.string(),
      code: z.string().optional(),
      slug: z.string().optional(),
    })
    .optional(),
});

export type Announcement = z.infer<typeof AnnouncementSchema>;

// ============================================================================
// DTOs DE ENTRADA (Input Schemas)
// ============================================================================
export const CreateAnnouncementInputSchema = z.object({
  title: z
    .string()
    .trim()
    .min(3, "O título deve ter no mínimo 3 caracteres.")
    .max(150, "O título deve ter no máximo 150 caracteres."),
  content: z
    .string()
    .trim()
    .min(5, "O conteúdo deve ter no mínimo 5 caracteres."),
  targetAudience: AnnouncementAudienceEnum.default("ALL").optional(),
  schoolId: z.string().optional(),
});

export type CreateAnnouncementInput = z.infer<typeof CreateAnnouncementInputSchema>;

export const UpdateAnnouncementInputSchema = z.object({
  title: z.string().trim().min(3).max(150).optional(),
  content: z.string().trim().min(5).optional(),
  targetAudience: AnnouncementAudienceEnum.optional(),
});

export type UpdateAnnouncementInput = z.infer<typeof UpdateAnnouncementInputSchema>;

// ============================================================================
// DTOs DE SAÍDA / RESPONSE (Output Schemas)
// ============================================================================
export const AnnouncementResponseSchema = z.object({
  id: z.string().min(1),
  schoolId: z.string().min(1),
  title: z.string(),
  content: z.string(),
  targetAudience: AnnouncementAudienceEnum,
  authorId: z.string().nullable().optional(),
  createdAt: z.union([z.coerce.date(), z.string()]),
  updatedAt: z.union([z.coerce.date(), z.string()]).optional(),
  school: z
    .object({
      id: z.string(),
      name: z.string(),
      code: z.string().optional(),
      slug: z.string().optional(),
    })
    .optional(),
});

export type AnnouncementResponse = z.infer<typeof AnnouncementResponseSchema>;


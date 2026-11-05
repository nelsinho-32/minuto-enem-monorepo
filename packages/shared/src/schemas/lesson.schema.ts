import { z } from "zod";
import { SubjectSchema, TopicSchema } from "./subject.schema";

export const MaterialTypeValues = [
  "VIDEO",
  "PDF",
  "ARTICLE",
  "TIP",
  "EXTERNAL_LINK",
] as const;

export const MaterialTypeSchema = z.enum(MaterialTypeValues);

export const MaterialType = {
  VIDEO: "VIDEO",
  PDF: "PDF",
  ARTICLE: "ARTICLE",
  TIP: "TIP",
  EXTERNAL_LINK: "EXTERNAL_LINK",
} as const;

export type MaterialType = z.infer<typeof MaterialTypeSchema>;

export const LessonSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1, "O título da lição/material é obrigatório."),
  type: MaterialTypeSchema.default("ARTICLE"),
  description: z.string().nullable().optional(),
  content: z.string().default(""),
  fileUrl: z.string().nullable().optional(),
  externalUrl: z.string().nullable().optional(),
  youtubeUrl: z.string().nullable().optional(),
  videos: z.array(z.string()).default([]),
  references: z.array(z.string()).default([]),
  subjectId: z.string().nullable().optional(),
  topicId: z.string().nullable().optional(),
  topic: z.union([TopicSchema, z.string()]).nullable().optional(),
  subject: SubjectSchema.nullable().optional(),
  classroomId: z.string().nullable().optional(),
  createdAt: z.union([z.coerce.date(), z.string()]).optional(),
  updatedAt: z.union([z.coerce.date(), z.string()]).optional(),
});

export type Lesson = z.infer<typeof LessonSchema>;

export const MaterialSchema = LessonSchema;
export type Material = Lesson;

export const ClassroomMaterialSchema = LessonSchema;
export type ClassroomMaterial = Lesson;

export const LessonSummarySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  type: MaterialTypeSchema.optional(),
  fileUrl: z.string().nullable().optional(),
  externalUrl: z.string().nullable().optional(),
  youtubeUrl: z.string().nullable().optional(),
  subjectId: z.string().nullable().optional(),
  topicId: z.string().nullable().optional(),
  classroomId: z.string().nullable().optional(),
});

export type LessonSummary = z.infer<typeof LessonSummarySchema>;

export const CreateLessonBaseSchema = z.object({
  title: z.string().trim().min(1, "O título da lição/material é obrigatório."),
  type: MaterialTypeSchema.optional().default("ARTICLE"),
  description: z.string().nullable().optional(),
  content: z.string().optional().default(""),
  fileUrl: z.string().nullable().optional(),
  externalUrl: z.string().nullable().optional(),
  youtubeUrl: z.string().nullable().optional(),
  videos: z.array(z.string()).optional().default([]),
  references: z.array(z.string()).optional().default([]),
  subjectId: z.string().nullable().optional(),
  topicId: z.string().nullable().optional(),
  classroomId: z.string().nullable().optional(),
});

export const CreateLessonInputSchema = CreateLessonBaseSchema.superRefine(
  (data, ctx) => {
    if (data.type === "PDF") {
      const url = (data.fileUrl || data.externalUrl || "").trim();
      if (!url) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["fileUrl"],
          message:
            "Para materiais em formato PDF, forneça o arquivo PDF enviado (upload) ou um link/URL externo para o documento.",
        });
      }
    }
  }
);

export type CreateLessonInput = z.input<typeof CreateLessonInputSchema>;

export const CreateClassroomLessonBaseSchema = z.object({
  title: z.string().trim().min(1, "O título da aula/material é obrigatório."),
  type: MaterialTypeSchema.optional().default("VIDEO"),
  description: z.string().optional().default(""),
  content: z.string().optional().default(""),
  fileUrl: z.string().nullable().optional(),
  externalUrl: z.string().nullable().optional(),
  youtubeUrl: z.string().nullable().optional(),
  subjectId: z.string().nullable().optional(),
  topicId: z.string().nullable().optional(),
  classroomId: z.string().nullable().optional(),
});

export const CreateClassroomLessonInputSchema =
  CreateClassroomLessonBaseSchema.superRefine((data, ctx) => {
    if (data.type === "PDF") {
      const url = (data.fileUrl || data.externalUrl || "").trim();
      if (!url) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["fileUrl"],
          message:
            "Para materiais em formato PDF, forneça o arquivo PDF enviado (upload) ou um link/URL externo para o documento.",
        });
      }
    }
  });

export type CreateClassroomLessonInput = z.input<
  typeof CreateClassroomLessonInputSchema
>;

export const CreateMaterialInputSchema = CreateClassroomLessonInputSchema;
export type CreateMaterialInput = CreateClassroomLessonInput;

export const CreateClassroomMaterialInputSchema =
  CreateClassroomLessonInputSchema;
export type CreateClassroomMaterialInput = CreateClassroomLessonInput;

export const UpdateLessonInputSchema = CreateLessonBaseSchema.partial();

export type UpdateLessonInput = z.infer<typeof UpdateLessonInputSchema>;

export const UpdateMaterialInputSchema = UpdateLessonInputSchema;
export type UpdateMaterialInput = UpdateLessonInput;

import { z } from "zod";

// ============================================================================
// ENTIDADE DE DOMÍNIO TURMA / SALA DE AULA (Classroom)
// ============================================================================
/**
 * Schema unificado de Sala de Aula (`Classroom`) com vínculos obrigatórios
 * à instituição escolar (`schoolId`) e ao professor responsável (`teacherId`).
 */
export const ClassroomSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1, "O nome da sala é obrigatório."),
  code: z.string().trim().min(1, "O código da sala é obrigatório."),
  schoolId: z.string().nullable().optional(),
  teacherId: z.string().min(1, "O ID do professor responsável (teacherId) é obrigatório."),
  subject: z.string().default("Geral"),
  description: z.string().optional(),
  school: z.string().optional(), // Nome descritivo da escola para exibição
  schoolName: z.string().optional(),
  themeColor: z.string().default("#58CC02"),
  icon: z.string().default("book"),
  createdAt: z.union([z.coerce.date(), z.string()]).optional(),
  teacherName: z.string().default("Professor"),
  studentsCount: z.number().int().nonnegative().default(0),
  tasksCount: z.number().int().nonnegative().default(0),
  materialsCount: z.number().int().nonnegative().default(0),
});

export type Classroom = z.infer<typeof ClassroomSchema>;

/**
 * Schema do modelo `Class` legado presente em `prisma/schema.prisma`
 */
export const ClassSchema = z.object({
  id: z.string().uuid(),
  code: z.string().min(1),
  name: z.string().min(1),
  teacherId: z.string().min(1),
  schoolId: z.string().optional(),
});

export type Class = z.infer<typeof ClassSchema>;

// ============================================================================
// DTOs DE ENTRADA (Input Schemas)
// ============================================================================
export const CreateClassroomInputSchema = z.object({
  name: z.string().trim().min(1, "O nome da sala é obrigatório."),
  schoolId: z.string().optional(),
  teacherId: z.string().min(1, "O identificador do professor responsável (teacherId) é obrigatório."),
  code: z
    .string()
    .trim()
    .min(1)
    .transform((val) => val.toUpperCase())
    .optional(),
  subject: z.string().optional().default("Geral"),
  description: z.string().optional(),
  themeColor: z.string().optional().default("#58CC02"),
  icon: z.string().optional().default("book"),
});

export type CreateClassroomInput = z.input<typeof CreateClassroomInputSchema>;

export const UpdateClassroomInputSchema = z.object({
  name: z.string().trim().min(1).optional(),
  schoolId: z.string().min(1).optional(),
  teacherId: z.string().min(1).optional(),
  code: z
    .string()
    .trim()
    .min(1)
    .transform((val) => val.toUpperCase())
    .optional(),
  subject: z.string().optional(),
  description: z.string().optional(),
  themeColor: z.string().optional(),
  icon: z.string().optional(),
});

export type UpdateClassroomInput = z.input<typeof UpdateClassroomInputSchema>;

export const EnrollStudentInputSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "O código da sala é obrigatório.")
    .transform((val) => val.toUpperCase()),
  studentId: z.string().min(1).optional(),
});

export type EnrollStudentInput = z.input<typeof EnrollStudentInputSchema>;

// ============================================================================
// DTOs DE SAÍDA / RESPONSE (Output Schemas)
// ============================================================================
export const ClassroomResponseSchema = ClassroomSchema;
export type ClassroomResponse = z.infer<typeof ClassroomResponseSchema>;

export const ClassroomDetailResponseSchema = ClassroomResponseSchema.extend({
  teacher: z
    .object({
      id: z.string(),
      name: z.string(),
      email: z.string().email(),
    })
    .optional(),
  students: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        email: z.string().email(),
        xp: z.number().int().nonnegative().optional(),
        currentStreak: z.number().int().nonnegative().optional(),
        lastStudyDate: z.union([z.coerce.date(), z.string()]).nullable().optional(),
      })
    )
    .optional(),
  tasks: z.array(z.any()).optional(),
  lessons: z.array(z.any()).optional(),
});

export type ClassroomDetailResponse = z.infer<typeof ClassroomDetailResponseSchema>;

export const ClassroomListResponseSchema = z.object({
  classrooms: z.array(ClassroomResponseSchema),
  total: z.number().int().nonnegative(),
});

export type ClassroomListResponse = z.infer<typeof ClassroomListResponseSchema>;

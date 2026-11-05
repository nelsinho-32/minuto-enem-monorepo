import { z } from "zod";

/**
 * Schema unificado de Sala de Aula (`Classroom`) contemplando o modelo Prisma
 * do back-end e os metadados visuais do front-end (`useClassroomStore`).
 */
export const ClassroomSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1, "O nome da sala é obrigatório."),
  code: z.string().trim().min(1, "O código da sala é obrigatório."),
  teacherId: z.string().optional(),
  subject: z.string().default("Geral"),
  description: z.string().optional(),
  school: z.string().optional(),
  themeColor: z.string().default("#58CC02"),
  icon: z.string().default("book"),
  createdAt: z.union([z.coerce.date(), z.string()]).optional(),
  teacherName: z.string().default("Professor"),
  studentsCount: z.number().int().nonnegative().default(0),
  tasksCount: z.number().int().nonnegative().default(0),
  materialsCount: z.number().int().nonnegative().default(0),
});

export type Classroom = {
  id: string;
  name: string;
  subject: string;
  description?: string;
  code: string;
  school?: string;
  themeColor: string;
  icon: string;
  createdAt: string;
  teacherName: string;
  studentsCount: number;
  tasksCount: number;
  materialsCount: number;
  teacherId?: string;
};

/**
 * Schema do modelo `Class` presente em `prisma/schema.prisma`
 */
export const ClassSchema = z.object({
  id: z.string().uuid(),
  code: z.string().min(1),
  name: z.string().min(1),
  teacherId: z.string().min(1),
});

export type Class = z.infer<typeof ClassSchema>;

export const CreateClassroomInputSchema = z.object({
  name: z.string().trim().min(1, "O nome da sala é obrigatório."),
  teacherId: z.string().min(1, "O teacherId é obrigatório."),
  code: z
    .string()
    .trim()
    .min(1)
    .transform((val) => val.toUpperCase())
    .optional(),
});

export type CreateClassroomInput = z.input<typeof CreateClassroomInputSchema>;

export const EnrollStudentInputSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "O código da sala é obrigatório.")
    .transform((val) => val.toUpperCase()),
  studentId: z.string().min(1).optional(),
});

export type EnrollStudentInput = z.input<typeof EnrollStudentInputSchema>;


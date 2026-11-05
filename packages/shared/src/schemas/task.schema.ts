import { z } from "zod";
import { OptionSchema } from "./option.schema";

export const TaskStatusSchema = z.enum([
  "PENDING_APPROVAL",
  "APPROVED",
  "COMPLETED",
]);

export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const TaskCreationModeValues = [
  "MANUAL_SELECTION",
  "RANDOM_BY_TOPIC",
  "CUSTOM_TEACHER_QUESTIONS",
  "AI_GENERATED",
] as const;

export const TaskCreationModeSchema = z.enum(TaskCreationModeValues);

export const TaskCreationMode = {
  MANUAL_SELECTION: "MANUAL_SELECTION",
  RANDOM_BY_TOPIC: "RANDOM_BY_TOPIC",
  CUSTOM_TEACHER_QUESTIONS: "CUSTOM_TEACHER_QUESTIONS",
  AI_GENERATED: "AI_GENERATED",
} as const;

export type TaskCreationMode = z.infer<typeof TaskCreationModeSchema>;

export const CreationModeSchema = TaskCreationModeSchema;
export const CreationMode = TaskCreationMode;
export type CreationMode = TaskCreationMode;

export const CustomTeacherQuestionOptionSchema = z.union([
  z.string().min(1, "O texto da alternativa não pode ser vazio."),
  OptionSchema,
]);

export const CustomTeacherQuestionSchema = z.object({
  id: z.string().optional(),
  text: z.string().trim().min(1, "O enunciado da questão é obrigatório."),
  options: z
    .array(CustomTeacherQuestionOptionSchema)
    .min(2, "A questão deve possuir no mínimo 2 alternativas."),
  correctAnswer: z.number().int().nonnegative().default(0),
  correctOptionId: z.string().optional(),
  explanation: z.string().nullable().optional(),
  subject: z.string().optional().default("Geral"),
  topic: z.string().nullable().optional(),
  subjectId: z.string().nullable().optional(),
  topicId: z.string().nullable().optional(),
  area: z.string().optional().default("Geral"),
  difficulty: z.string().nullable().optional().default("MEDIUM"),
  year: z.number().int().optional(),
});

export type CustomTeacherQuestion = z.infer<typeof CustomTeacherQuestionSchema>;
export type CustomTeacherQuestionInput = z.input<
  typeof CustomTeacherQuestionSchema
>;

export const TaskSchema = z.object({
  id: z.string().min(1),
  title: z.string().default(""),
  description: z.string().nullable().optional(),
  topic: z.string().min(1, "O tópico da tarefa é obrigatório."),
  subjectId: z.string().nullable().optional(),
  topicId: z.string().nullable().optional(),
  creationMode: TaskCreationModeSchema.default("MANUAL_SELECTION"),
  total: z.number().int().nonnegative().default(0),
  questionIds: z.array(z.string()).default([]),
  customQuestions: z.array(CustomTeacherQuestionSchema).optional().default([]),
  dueDate: z.union([z.coerce.date(), z.string()]).nullable().optional(),
  status: TaskStatusSchema.default("PENDING_APPROVAL"),
  classId: z.string().min(1),
  classroomId: z.string().nullable().optional(),
  createdAt: z.union([z.coerce.date(), z.string()]).optional(),
  updatedAt: z.union([z.coerce.date(), z.string()]).optional(),
});

export type Task = z.infer<typeof TaskSchema>;

export const CreateTaskInputSchema = z.object({
  title: z.string().optional(),
  description: z.string().nullable().optional(),
  topic: z.string().min(1, "O tópico da tarefa é obrigatório."),
  subjectId: z.string().nullable().optional(),
  topicId: z.string().nullable().optional(),
  creationMode: TaskCreationModeSchema.optional().default("MANUAL_SELECTION"),
  total: z.number().int().nonnegative().optional(),
  questionIds: z.array(z.string()).optional().default([]),
  customQuestions: z.array(CustomTeacherQuestionSchema).optional().default([]),
  dueDate: z.union([z.coerce.date(), z.string(), z.date()]).nullable().optional(),
  status: TaskStatusSchema.optional(),
  classId: z.string().optional(),
  classroomId: z.string().nullable().optional(),
});

export type CreateTaskInput = z.input<typeof CreateTaskInputSchema>;

export const UpdateTaskInputSchema = z.object({
  title: z.string().optional(),
  description: z.string().nullable().optional(),
  topic: z.string().optional(),
  subjectId: z.string().nullable().optional(),
  topicId: z.string().nullable().optional(),
  creationMode: TaskCreationModeSchema.optional(),
  total: z.number().int().nonnegative().optional(),
  questionIds: z.array(z.string()).optional(),
  customQuestions: z.array(CustomTeacherQuestionSchema).optional(),
  dueDate: z.union([z.coerce.date(), z.string(), z.date()]).nullable().optional(),
  classId: z.string().optional(),
  classroomId: z.string().nullable().optional(),
  status: TaskStatusSchema.optional(),
});

export type UpdateTaskInput = z.infer<typeof UpdateTaskInputSchema>;

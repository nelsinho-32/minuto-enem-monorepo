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

// ============================================================================
// ENTIDADE DE DOMÍNIO TAREFA (Task)
// ============================================================================
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

// ============================================================================
// DTOs DE ENTRADA (Input Schemas)
// ============================================================================
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

/**
 * Schema explícito para atribuição e distribuição de tarefas para turmas
 */
export const AssignTaskInputSchema = CreateTaskInputSchema.extend({
  classroomId: z.string().min(1, "O ID da turma (classroomId) é obrigatório para atribuir a tarefa."),
});

export type AssignTaskInput = z.input<typeof AssignTaskInputSchema>;

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

export const SubmitTaskAnswerItemSchema = z.object({
  questionId: z.string().min(1),
  selectedAnswer: z.number().int().optional(),
  answer: z.number().int().optional(),
  selectedOption: z.number().int().optional(),
  optionIndex: z.number().int().optional(),
  timeSpentMs: z.number().int().nonnegative().optional(),
});

export type SubmitTaskAnswerItem = z.infer<typeof SubmitTaskAnswerItemSchema>;

export const SubmitTaskInputSchema = z.object({
  userId: z.string().optional(),
  studentId: z.string().optional(),
  answers: z
    .union([
      z.array(SubmitTaskAnswerItemSchema),
      z.record(z.string(), z.number().int()),
    ])
    .optional(),
  score: z.number().optional(),
  correctCount: z.number().int().nonnegative().optional(),
  totalQuestions: z.number().int().positive().optional(),
  timeSpentMs: z.number().int().nonnegative().optional(),
});

export type SubmitTaskInput = z.infer<typeof SubmitTaskInputSchema>;

export const TaskFilterInputSchema = z.object({
  classroomId: z.string().optional(),
  subjectId: z.string().optional(),
  topicId: z.string().optional(),
  status: TaskStatusSchema.optional(),
  page: z.number().int().positive().optional().default(1),
  limit: z.number().int().positive().max(100).optional().default(20),
});

export type TaskFilterInput = z.infer<typeof TaskFilterInputSchema>;

// ============================================================================
// DTOs DE SAÍDA / RESPONSE (Output Schemas)
// ============================================================================
export const TaskResponseSchema = TaskSchema;
export type TaskResponse = z.infer<typeof TaskResponseSchema>;

export const TaskSubmissionResponseSchema = z.object({
  id: z.string().min(1),
  taskId: z.string().min(1),
  studentId: z.string().min(1),
  score: z.number().default(0),
  correctCount: z.number().int().nonnegative().default(0),
  totalQuestions: z.number().int().nonnegative().default(0),
  accuracyPercent: z.number().nonnegative().default(0),
  timeSpentMs: z.number().int().nullable().optional(),
  status: z.string().default("CORRIGIDO"),
  answers: z.unknown().optional(),
  xpEarned: z.number().int().nonnegative().default(0),
  submittedAt: z.union([z.coerce.date(), z.string()]).optional(),
  updatedAt: z.union([z.coerce.date(), z.string()]).optional(),
});

export type TaskSubmissionResponse = z.infer<typeof TaskSubmissionResponseSchema>;

export const TaskTeacherTrackingItemSchema = z.object({
  studentId: z.string().min(1),
  studentName: z.string().min(1),
  submittedAt: z.string(),
  status: z.enum(["ENTREGUE", "PENDENTE", "CORRIGIDO"]),
  score: z.number().optional(),
  correctCount: z.number().int().optional(),
  totalQuestions: z.number().int().optional(),
  accuracyPercent: z.number().optional(),
  timeSpent: z.string(),
});

export type TaskTeacherTrackingItem = z.infer<typeof TaskTeacherTrackingItemSchema>;

export const TaskTeacherTrackingResponseSchema = z.object({
  taskId: z.string().min(1),
  taskTitle: z.string(),
  totalStudents: z.number().int().nonnegative(),
  submittedCount: z.number().int().nonnegative(),
  gradedCount: z.number().int().nonnegative(),
  averageScore: z.number().nonnegative(),
  submissions: z.array(TaskTeacherTrackingItemSchema),
  mostMissedQuestions: z.array(z.any()).optional(),
});

export type TaskTeacherTrackingResponse = z.infer<typeof TaskTeacherTrackingResponseSchema>;

export const TaskListResponseSchema = z.object({
  tasks: z.array(TaskResponseSchema),
  total: z.number().int().nonnegative(),
});

export type TaskListResponse = z.infer<typeof TaskListResponseSchema>;

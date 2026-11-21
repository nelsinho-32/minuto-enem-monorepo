import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AppError } from "../errors/AppError";
import { realtimeNotificationService } from "./realtime-notification.service";

export const CreateCustomQuestionSchema = z.object({
  year: z.coerce.number().int().min(2009).max(2035).default(2026),
  area: z.string().trim().min(2),
  subject: z.string().trim().min(2),
  topic: z.string().trim().optional(),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD"]).default("MEDIUM"),
  text: z.string().trim().min(10, "O enunciado deve ter pelo menos 10 caracteres."),
  options: z
    .array(z.string().trim().min(1))
    .length(5, "A questão autoral deve possuir exatamente 5 alternativas (A–E)."),
  correctAnswer: z.coerce.number().int().min(0).max(4),
  explanation: z.string().trim().optional(),
});

export const CreateTaskTemplateSchema = z.object({
  title: z.string().trim().min(3),
  topic: z.string().trim().min(2),
  description: z.string().trim().optional(),
  creationMode: z.enum(["CUSTOM", "AUTO", "ESSAY"]).default("CUSTOM"),
  questionIds: z.array(z.string().min(1)).default([]),
});

export class TeacherBankService {
  async createCustomQuestion(
    authorId: string,
    schoolId: string | null | undefined,
    rawInput: unknown
  ) {
    const parsed = CreateCustomQuestionSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new AppError(
        parsed.error.issues[0]?.message || "Dados inválidos para questão autoral.",
        400
      );
    }

    const d = parsed.data;
    const errorRate =
      d.difficulty === "EASY" ? 30 : d.difficulty === "HARD" ? 75 : 50;

    return prisma.question.create({
      data: {
        year: d.year,
        area: d.area,
        subject: d.subject,
        topic: d.topic || null,
        difficulty: d.difficulty,
        errorRate,
        text: d.text,
        options: d.options,
        correctAnswer: d.correctAnswer,
        explanation:
          d.explanation || "Questão autoral criada pelo docente da turma.",
        isCustom: true,
        authorId,
        schoolId: schoolId || null,
      },
    });
  }

  async listCustomQuestions(
    userId: string,
    role: string,
    schoolId?: string | null
  ) {
    const where: any = { isCustom: true };
    if (role === "TEACHER") {
      where.OR = [
        { authorId: userId },
        ...(schoolId ? [{ schoolId }] : []),
      ];
    } else if (role === "SCHOOL" && schoolId) {
      where.schoolId = schoolId;
    }

    return prisma.question.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 150,
    });
  }

  async deleteCustomQuestion(questionId: string, userId: string, role: string) {
    const existing = await prisma.question.findUnique({
      where: { id: questionId },
      select: { id: true, isCustom: true, authorId: true },
    });

    if (!existing || !existing.isCustom) {
      throw new AppError("Questão autoral não encontrada.", 404);
    }

    if (
      role !== "ADMIN" &&
      role !== "SCHOOL" &&
      existing.authorId !== userId
    ) {
      throw new AppError("Sem permissão para excluir esta questão.", 403);
    }

    await prisma.question.delete({ where: { id: questionId } });
    return { deleted: true };
  }

  async createTaskTemplate(
    teacherId: string,
    schoolId: string | null | undefined,
    rawInput: unknown
  ) {
    const parsed = CreateTaskTemplateSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new AppError(
        parsed.error.issues[0]?.message || "Dados inválidos para modelo de lista.",
        400
      );
    }

    return prisma.taskTemplate.create({
      data: {
        ...parsed.data,
        description: parsed.data.description || null,
        teacherId,
        schoolId: schoolId || null,
      },
    });
  }

  async listTaskTemplates(
    userId: string,
    role: string,
    schoolId?: string | null
  ) {
    const where: any = {};
    if (role === "TEACHER") {
      where.OR = [
        { teacherId: userId },
        ...(schoolId ? [{ schoolId }] : []),
      ];
    } else if (role === "SCHOOL" && schoolId) {
      where.schoolId = schoolId;
    }

    return prisma.taskTemplate.findMany({
      where,
      include: {
        teacher: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async applyTemplateToClassrooms(
    templateId: string,
    userId: string,
    classroomIds: string[],
    dueDate?: string
  ) {
    if (!Array.isArray(classroomIds) || classroomIds.length === 0) {
      throw new AppError("Selecione ao menos uma turma para aplicar o modelo.", 400);
    }

    const template = await prisma.taskTemplate.findUnique({
      where: { id: templateId },
    });
    if (!template) {
      throw new AppError("Modelo de lista não encontrado.", 404);
    }

    const parsedDueDate = dueDate ? new Date(dueDate) : null;
    const createdTasks = [];

    for (const classroomId of classroomIds) {
      const room = await prisma.classroom.findUnique({
        where: { id: classroomId },
        select: { id: true, code: true, name: true },
      });
      if (!room) continue;

      const task = await prisma.task.create({
        data: {
          title: template.title,
          topic: template.topic,
          description: template.description,
          creationMode: template.creationMode,
          questionIds: template.questionIds,
          classId: room.code,
          classroomId: room.id,
          dueDate: parsedDueDate,
          status: "PENDING",
        },
      });
      createdTasks.push(task);

      void realtimeNotificationService.notifyClassroomStudents(
        room.id,
        {
          type: "NEW_TASK",
          title: `Nova lista em ${room.name}`,
          body: `"${template.title}" já está disponível para resolução.`,
          route: `/classes/${room.id}`,
        },
        userId
      );
    }

    return { appliedCount: createdTasks.length, tasks: createdTasks };
  }
}

export const teacherBankService = new TeacherBankService();

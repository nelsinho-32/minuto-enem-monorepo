import { Role } from "@prisma/client";
import {
  GradeEssayInputSchema,
  SubmitEssayInputSchema,
  type GradeEssayInput,
  type SubmitEssayInput,
} from "@minuto-enem/shared";
import { prisma } from "../lib/prisma";
import { AppError } from "../errors/AppError";
import { storageService } from "./storage.service";
import { realtimeNotificationService } from "./realtime-notification.service";

export interface SubmitEssayParams {
  taskId: string;
  studentId: string;
  file?: Express.Multer.File;
  imageUrl?: string;
}

export interface ListEssaysFilter {
  userId: string;
  role?: string;
  classroomId?: string;
  status?: string;
}

export class EssayService {
  /**
   * Envia uma redação feita à mão (Oficina Nota 1000) por foto.
   * Suporta upload de arquivo multipart ou imageUrl pré-existente.
   */
  async submitEssay(params: SubmitEssayParams) {
    const { taskId, studentId, file, imageUrl: providedUrl } = params;

    if (!taskId) {
      throw new AppError("O identificador da tarefa (taskId) é obrigatório.", 400);
    }
    if (!studentId) {
      throw new AppError("O identificador do aluno é obrigatório.", 401);
    }

    // 1. Verifica se o aluno existe
    const student = await prisma.user.findUnique({
      where: { id: studentId },
      select: { id: true, name: true, email: true },
    });
    if (!student) {
      throw new AppError("Aluno não encontrado no sistema.", 404);
    }

    // 2. Verifica se a tarefa existe
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: {
        classroom: {
          select: { id: true, name: true, teacherId: true, schoolId: true },
        },
      },
    });
    if (!task) {
      throw new AppError("Tarefa/Tema de redação não encontrado.", 404);
    }

    // 3. Processa a imagem da folha de redação
    let finalImageUrl = providedUrl?.trim() || "";

    if (file) {
      const stored = await storageService.saveFile(file, {
        subfolder: "essays",
        allowedExtensions: [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"],
        maxSizeBytes: 15 * 1024 * 1024,
      });
      finalImageUrl = stored.fileUrl;
    }

    if (!finalImageUrl) {
      throw new AppError(
        "Nenhuma imagem válida da folha de redação foi fornecida.",
        400
      );
    }

    // 4. Salva ou atualiza a submissão da redação (status: PENDING)
    const essaySubmission = await prisma.essaySubmission.upsert({
      where: {
        taskId_studentId: {
          taskId,
          studentId,
        },
      },
      create: {
        taskId,
        studentId,
        imageUrl: finalImageUrl,
        status: "PENDING",
      },
      update: {
        imageUrl: finalImageUrl,
        status: "PENDING",
        competency1: null,
        competency2: null,
        competency3: null,
        competency4: null,
        competency5: null,
        finalScore: null,
        generalFeedback: null,
        correctedById: null,
        correctedAt: null,
        submittedAt: new Date(),
      },
      include: {
        student: {
          select: { id: true, name: true, email: true },
        },
        task: {
          select: {
            id: true,
            title: true,
            topic: true,
            description: true,
            dueDate: true,
            classroomId: true,
            classroom: {
              select: { id: true, name: true },
            },
          },
        },
      },
    });

    // 5. Atualiza o status correspondente na tabela TaskSubmission
    await prisma.taskSubmission.upsert({
      where: {
        taskId_studentId: {
          taskId,
          studentId,
        },
      },
      create: {
        taskId,
        studentId,
        score: 0,
        correctCount: 0,
        totalQuestions: 1,
        accuracyPercent: 0,
        status: "PENDENTE_CORRECAO",
        answers: [],
        xpEarned: 0,
      },
      update: {
        status: "PENDENTE_CORRECAO",
        submittedAt: new Date(),
      },
    });

    return essaySubmission;
  }

  /**
   * Lista redações pendentes de correção ("Oficina Nota 1000 - Correções Pendentes")
   * Filtrando rigorosamente pelo escopo do professor logado ou da escola.
   */
  async getPendingEssays(filter: ListEssaysFilter) {
    return this.listEssays({ ...filter, status: "PENDING" });
  }

  /**
   * Lista redações gerais com suporte a filtro por status e turma.
   */
  async listEssays(filter: ListEssaysFilter) {
    const { userId, role, classroomId, status } = filter;

    const whereClause: any = {};

    if (status && status !== "ALL") {
      whereClause.status = status;
    }

    // Isolamento por papel (Role)
    if (role === Role.TEACHER) {
      whereClause.task = {
        classroom: {
          teacherId: userId,
          ...(classroomId ? { id: classroomId } : {}),
        },
      };
    } else if (role === Role.SCHOOL) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { schoolId: true },
      });

      if (user?.schoolId) {
        whereClause.task = {
          classroom: {
            schoolId: user.schoolId,
            ...(classroomId ? { id: classroomId } : {}),
          },
        };
      }
    } else if (role === Role.STUDENT) {
      whereClause.studentId = userId;
      if (classroomId) {
        whereClause.task = { classroomId };
      }
    } else if (classroomId) {
      whereClause.task = { classroomId };
    }

    const essays = await prisma.essaySubmission.findMany({
      where: whereClause,
      include: {
        student: {
          select: { id: true, name: true, email: true },
        },
        task: {
          select: {
            id: true,
            title: true,
            topic: true,
            description: true,
            dueDate: true,
            classroomId: true,
            classroom: {
              select: { id: true, name: true, code: true },
            },
          },
        },
        correctedBy: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: {
        submittedAt: "desc",
      },
    });

    return essays;
  }

  /**
   * Busca os detalhes de uma redação submetida por ID.
   */
  async getEssayById(id: string, user?: { id: string; role?: string }) {
    if (!id) {
      throw new AppError("O identificador da redação é obrigatório.", 400);
    }

    const essay = await prisma.essaySubmission.findUnique({
      where: { id },
      include: {
        student: {
          select: { id: true, name: true, email: true },
        },
        task: {
          select: {
            id: true,
            title: true,
            topic: true,
            description: true,
            dueDate: true,
            classroomId: true,
            classroom: {
              select: {
                id: true,
                name: true,
                code: true,
                teacherId: true,
                schoolId: true,
              },
            },
          },
        },
        correctedBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (!essay) {
      throw new AppError("Submissão de redação não encontrada.", 404);
    }

    // Verificação de escopo caso o usuário seja aluno
    if (user?.role === Role.STUDENT && essay.studentId !== user.id) {
      throw new AppError("Você não tem permissão para visualizar esta redação.", 403);
    }

    return essay;
  }

  /**
   * Busca a redação de um aluno para uma tarefa específica.
   */
  async getStudentEssayByTask(taskId: string, studentId: string) {
    if (!taskId || !studentId) {
      throw new AppError("taskId e studentId são obrigatórios.", 400);
    }

    const essay = await prisma.essaySubmission.findUnique({
      where: {
        taskId_studentId: {
          taskId,
          studentId,
        },
      },
      include: {
        student: {
          select: { id: true, name: true, email: true },
        },
        task: {
          select: {
            id: true,
            title: true,
            topic: true,
            description: true,
            dueDate: true,
          },
        },
        correctedBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    return essay;
  }

  /**
   * Avalia/Corrige uma redação (Oficina Nota 1000 - Professor/Escola).
   * Calcula automaticamente o somatório das 5 competências (0 a 1000),
   * atualiza o status para 'CORRECTED', salva o feedback geral
   * e entrega a nota final para o aluno consultar no app.
   */
  async gradeEssay(
    essayId: string,
    teacherId: string,
    rawInput: unknown
  ) {
    if (!essayId) {
      throw new AppError("O identificador da redação é obrigatório.", 400);
    }
    if (!teacherId) {
      throw new AppError("O identificador do professor/avaliador é obrigatório.", 401);
    }

    const input = GradeEssayInputSchema.parse(rawInput);

    const existingEssay = await prisma.essaySubmission.findUnique({
      where: { id: essayId },
      include: {
        task: true,
      },
    });

    if (!existingEssay) {
      throw new AppError("Submissão de redação não encontrada.", 404);
    }

    // Cálculo automático da nota final somando as 5 competências do ENEM
    const finalScore =
      input.competency1 +
      input.competency2 +
      input.competency3 +
      input.competency4 +
      input.competency5;

    // Atualiza a submissão de redação
    const updatedEssay = await prisma.essaySubmission.update({
      where: { id: essayId },
      data: {
        status: "CORRECTED",
        competency1: input.competency1,
        competency2: input.competency2,
        competency3: input.competency3,
        competency4: input.competency4,
        competency5: input.competency5,
        finalScore,
        generalFeedback: input.generalFeedback,
        annotations: (input.annotations ?? []) as any,
        correctedById: teacherId,
        correctedAt: new Date(),
      },
      include: {
        student: {
          select: { id: true, name: true, email: true },
        },
        task: {
          select: { id: true, title: true, topic: true, classroomId: true },
        },
        correctedBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    // Sincroniza a nota com a TaskSubmission (nota de 0 a 10 na métrica do boletim)
    const normalizedScore = Number((finalScore / 100).toFixed(1));
    const xpBonus = Math.round(finalScore / 10) + 50;

    await prisma.taskSubmission.upsert({
      where: {
        taskId_studentId: {
          taskId: existingEssay.taskId,
          studentId: existingEssay.studentId,
        },
      },
      create: {
        taskId: existingEssay.taskId,
        studentId: existingEssay.studentId,
        score: normalizedScore,
        correctCount: Math.round(finalScore / 200),
        totalQuestions: 5,
        accuracyPercent: Number((finalScore / 10).toFixed(1)),
        status: "CORRIGIDO",
        xpEarned: xpBonus,
      },
      update: {
        score: normalizedScore,
        accuracyPercent: Number((finalScore / 10).toFixed(1)),
        status: "CORRIGIDO",
        xpEarned: xpBonus,
        updatedAt: new Date(),
      },
    });

    // Concede XP ao aluno pelo envio e avaliação da redação
    await prisma.user.update({
      where: { id: existingEssay.studentId },
      data: {
        xp: { increment: xpBonus },
      },
    });

    // Notifica o aluno em tempo real via Socket.IO / Expo Push
    realtimeNotificationService.notifyUser(existingEssay.studentId, {
      type: "ESSAY_GRADED",
      title: `Redação corrigida: ${finalScore}/1000 pontos!`,
      body: `Seu professor avaliou "${existingEssay.task.title}" na Oficina Nota 1000 (+${xpBonus} XP).`,
      route: existingEssay.task.classroomId
        ? `/classes/${existingEssay.task.classroomId}`
        : "/classes",
    });

    return updatedEssay;
  }

  /**
   * Lista as rubricas reutilizáveis (comentários frequentes C1–C5) do professor.
   */
  async listRubricPresets(teacherId: string) {
    return prisma.essayRubricPreset.findMany({
      where: { teacherId },
      orderBy: [{ competency: "asc" }, { createdAt: "desc" }],
    });
  }

  /**
   * Salva uma nova rubrica reutilizável para correção rápida de redações.
   */
  async createRubricPreset(
    teacherId: string,
    input: { title?: string; content?: string; competency?: number }
  ) {
    const title = String(input.title || "").trim();
    const content = String(input.content || "").trim();
    const competency = Math.min(5, Math.max(0, Number(input.competency) || 0));

    if (!title || !content) {
      throw new AppError("Título e texto da rubrica são obrigatórios.", 400);
    }

    return prisma.essayRubricPreset.create({
      data: {
        teacherId,
        competency,
        title,
        content,
      },
    });
  }

  /**
   * Remove uma rubrica do professor.
   */
  async deleteRubricPreset(teacherId: string, rubricId: string) {
    await prisma.essayRubricPreset.deleteMany({
      where: { id: rubricId, teacherId },
    });
    return { message: "Rubrica removida." };
  }
}

export const essayService = new EssayService();

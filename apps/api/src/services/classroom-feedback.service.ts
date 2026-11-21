import { Role } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { AppError } from "../errors/AppError";
import { realtimeNotificationService } from "./realtime-notification.service";
import { storageService } from "./storage.service";

export class ClassroomFeedbackService {
  /**
   * Lista as devolutivas (comentário em texto e/ou áudio) do professor sobre questões
   * erradas pela turma, incluindo resumo das questões com mais erros recentes.
   */
  async listClassroomFeedbacks(params: {
    classroomId: string;
    requesterId: string;
    role: Role;
    schoolId?: string | null;
  }) {
    const classroom = await prisma.classroom.findUnique({
      where: { id: params.classroomId },
      select: {
        id: true,
        name: true,
        schoolId: true,
        teacherId: true,
        students: { select: { id: true } },
      },
    });

    if (!classroom) {
      throw new AppError("Turma não encontrada.", 404);
    }

    const isStudent = classroom.students.some((s) => s.id === params.requesterId);
    const isTeacherOwner = classroom.teacherId === params.requesterId;
    const isSchoolAdmin =
      params.role === Role.ADMIN ||
      (params.role === Role.SCHOOL && classroom.schoolId === params.schoolId);

    if (!isStudent && !isTeacherOwner && !isSchoolAdmin) {
      throw new AppError("Você não tem acesso às devolutivas desta turma.", 403);
    }

    const feedbacks = await prisma.questionFeedback.findMany({
      where: { classroomId: classroom.id },
      include: {
        teacher: { select: { id: true, name: true } },
        question: {
          select: {
            id: true,
            subject: true,
            topic: true,
            year: true,
            text: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Busca as questões com mais erros nas tarefas desta turma para facilitar o filtro/envio do professor
    const tasks = await prisma.task.findMany({
      where: {
        OR: [{ classroomId: classroom.id }, { classId: classroom.id }],
      },
      select: { id: true, questionIds: true },
    });

    const taskIds = tasks.map((t) => t.id);
    const questionErrorCounts = new Map<string, number>();

    if (taskIds.length > 0) {
      const wrongAttempts = await prisma.questionAttempt.findMany({
        where: {
          taskId: { in: taskIds },
          isCorrect: false,
        },
        select: { questionId: true },
      });

      for (const att of wrongAttempts) {
        questionErrorCounts.set(
          att.questionId,
          (questionErrorCounts.get(att.questionId) || 0) + 1
        );
      }
    }

    const allCandidateQuestionIds = Array.from(
      new Set([
        ...questionErrorCounts.keys(),
        ...tasks.flatMap((t) => t.questionIds || []),
      ])
    ).slice(0, 30);

    const candidateQuestionsRaw =
      allCandidateQuestionIds.length > 0
        ? await prisma.question.findMany({
            where: { id: { in: allCandidateQuestionIds } },
            select: {
              id: true,
              subject: true,
              topic: true,
              year: true,
              text: true,
            },
          })
        : [];

    const missedQuestions = candidateQuestionsRaw
      .map((q) => ({
        ...q,
        errorCount: questionErrorCounts.get(q.id) || 0,
      }))
      .sort((a, b) => b.errorCount - a.errorCount);

    return {
      feedbacks,
      missedQuestions,
    };
  }

  /**
   * Publica uma devolutiva (comentário textual e/ou áudio gravado) para uma questão da turma.
   */
  async createQuestionFeedback(params: {
    classroomId: string;
    teacherId: string;
    role: Role;
    questionId: string;
    commentText: string;
    audioUrl?: string | null;
    audioFile?: Express.Multer.File;
  }) {
    const commentText = String(params.commentText || "").trim();
    let audioUrl = params.audioUrl ? String(params.audioUrl).trim() : null;

    if (!params.questionId) {
      throw new AppError("Selecione a questão para enviar a devolutiva.", 400);
    }
    if (!commentText && !audioUrl && !params.audioFile) {
      throw new AppError("Informe um comentário ou grave um áudio explicativo.", 400);
    }

    // Se veio arquivo multipart ou data:audio/...;base64,..., persiste no StorageService (local/S3)
    // em vez de armazenar blob base64 diretamente no PostgreSQL
    if (params.audioFile) {
      const saved = await storageService.saveFile(params.audioFile, {
        subfolder: "feedback-audio",
        allowedExtensions: [".webm", ".mp3", ".m4a", ".wav", ".ogg", ".aac", ".mp4"],
        maxSizeBytes: 8 * 1024 * 1024,
      });
      audioUrl = saved.fileUrl;
    } else if (audioUrl && audioUrl.startsWith("data:audio/")) {
      const match = audioUrl.match(/^data:(audio\/[a-zA-Z0-9.+-]+)(?:;[^,]*)?;base64,(.+)$/);
      if (match) {
        const mimeType = match[1];
        const base64Body = match[2];
        const buffer = Buffer.from(base64Body, "base64");
        if (buffer.length > 8 * 1024 * 1024) {
          throw new AppError("O áudio excede o tamanho máximo suportado (8MB).", 400);
        }
        const extMap: Record<string, string> = {
          "audio/webm": ".webm",
          "audio/mpeg": ".mp3",
          "audio/mp3": ".mp3",
          "audio/mp4": ".m4a",
          "audio/m4a": ".m4a",
          "audio/wav": ".wav",
          "audio/ogg": ".ogg",
        };
        const ext = extMap[mimeType] || ".webm";
        const syntheticFile = {
          fieldname: "audio",
          originalname: `devolutiva${ext}`,
          encoding: "7bit",
          mimetype: mimeType,
          size: buffer.length,
          buffer,
        } as Express.Multer.File;
        const saved = await storageService.saveFile(syntheticFile, {
          subfolder: "feedback-audio",
          maxSizeBytes: 8 * 1024 * 1024,
        });
        audioUrl = saved.fileUrl;
      }
    }

    const classroom = await prisma.classroom.findUnique({
      where: { id: params.classroomId },
      select: {
        id: true,
        name: true,
        teacherId: true,
        students: { select: { id: true } },
      },
    });

    if (!classroom) {
      throw new AppError("Turma não encontrada.", 404);
    }

    if (params.role !== Role.ADMIN && classroom.teacherId !== params.teacherId) {
      throw new AppError("Apenas o professor titular da turma pode enviar devolutivas.", 403);
    }

    const question = await prisma.question.findUnique({
      where: { id: params.questionId },
      select: { id: true, subject: true, topic: true },
    });

    if (!question) {
      throw new AppError("Questão não encontrada.", 404);
    }

    const created = await prisma.questionFeedback.create({
      data: {
        classroomId: classroom.id,
        questionId: question.id,
        teacherId: params.teacherId,
        commentText: commentText || "Comentário em áudio enviado pelo professor.",
        audioUrl,
      },
      include: {
        teacher: { select: { id: true, name: true } },
        question: {
          select: {
            id: true,
            subject: true,
            topic: true,
            year: true,
            text: true,
          },
        },
      },
    });

    try {
      const studentIds = classroom.students.map((s) => s.id);
      if (studentIds.length > 0) {
        await realtimeNotificationService.notifyUsers(studentIds, {
          type: "QUESTION_FEEDBACK",
          title: `Devolutiva do professor — ${question.subject}`,
          body: `${created.teacher.name} explicou uma questão na turma ${classroom.name}.`,
          route: `/classes/${classroom.id}`,
        });
      }
    } catch {
      // Não-bloqueante
    }

    return created;
  }
}

export const classroomFeedbackService = new ClassroomFeedbackService();

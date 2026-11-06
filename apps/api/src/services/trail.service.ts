import {
  CreateTrailInputSchema,
  UpdateTrailInputSchema,
  UpdateTrailProgressInputSchema,
  type CreateTrailInput,
  type UpdateTrailInput,
  type UpdateTrailProgressInput,
} from "@minuto-enem/shared";
import { prisma } from "../lib/prisma";
import { AppError } from "../errors/AppError";
import { streakService } from "./streak.service";
import { questionService } from "./question.service";

export {
  CreateTrailInputSchema,
  UpdateTrailInputSchema,
  UpdateTrailProgressInputSchema,
  type CreateTrailInput,
  type UpdateTrailInput,
  type UpdateTrailProgressInput,
} from "@minuto-enem/shared";

export class TrailService {
  /**
   * Lista todas as trilhas de estudo com metadados de matéria (Subject), tópicos
   * e avanço individual do aluno quando `userId` é informado.
   */
  async listTrails(userId?: string, area?: string) {
    const trails = await prisma.trail.findMany({
      where: area ? { area: { equals: area, mode: "insensitive" } } : undefined,
      include: {
        subject: {
          select: {
            id: true,
            name: true,
            slug: true,
            icon: true,
            topics: {
              select: { id: true, name: true, slug: true },
              orderBy: { createdAt: "asc" },
            },
          },
        },
        progresses: userId ? { where: { userId } } : false,
      },
      orderBy: { createdAt: "desc" },
    });

    return trails.map((trail) => {
      const userProgress = Array.isArray(trail.progresses)
        ? trail.progresses[0] || null
        : null;

      return {
        ...trail,
        userProgress,
      };
    });
  }

  /**
   * Busca os detalhes completos de uma trilha de estudo por ID, garantindo
   * que todas as lições e questões da trilha estejam sincronizadas e vinculadas
   * às suas respectivas Matérias (Subject) e Tópicos/Conteúdos (Topic / Lesson).
   */
  async getTrailById(id: string, userId?: string) {
    const trail = await prisma.trail.findUnique({
      where: { id },
      include: {
        subject: {
          include: {
            topics: {
              orderBy: { createdAt: "asc" },
            },
          },
        },
        progresses: userId ? { where: { userId } } : false,
      },
    });

    if (!trail) {
      throw new AppError("Trilha de estudo não encontrada.", 404);
    }

    // Se a trilha possui matéria vinculada, garante sincronização dos tópicos, aulas e questões
    if (trail.subjectId) {
      await questionService.ensureSubjectSynchronized(trail.subjectId);
    }

    const [lessons, questions] = await Promise.all([
      trail.lessonIds.length > 0
        ? prisma.lesson.findMany({
            where: { id: { in: trail.lessonIds } },
            select: {
              id: true,
              title: true,
              description: true,
              type: true,
              youtubeUrl: true,
              fileUrl: true,
              subjectId: true,
              topicId: true,
              classroomId: true,
              subject: {
                select: { id: true, name: true, slug: true, icon: true },
              },
              topic: {
                select: { id: true, name: true, slug: true },
              },
            },
          })
        : Promise.resolve([]),
      trail.questionIds.length > 0
        ? prisma.question.findMany({
            where: { id: { in: trail.questionIds } },
            select: {
              id: true,
              year: true,
              area: true,
              subject: true,
              subjectId: true,
              topic: true,
              topicId: true,
              lessonId: true,
              difficulty: true,
              errorRate: true,
              text: true,
              options: true,
              correctAnswer: true,
              explanation: true,
              topicRef: {
                select: { id: true, name: true, slug: true, subjectId: true },
              },
              subjectRef: {
                select: { id: true, name: true, slug: true, icon: true },
              },
            },
          })
        : Promise.resolve([]),
    ]);

    const userProgress = Array.isArray(trail.progresses)
      ? trail.progresses[0] || null
      : null;

    return {
      ...trail,
      lessons,
      questions,
      userProgress,
    };
  }

  /**
   * Cria uma nova trilha de estudo, garantindo o vínculo consistente com Subject,
   * Lições (Topic/Lesson) e Questões.
   */
  async createTrail(data: CreateTrailInput) {
    const {
      title,
      description,
      area,
      subjectId,
      lessonIds = [],
      questionIds = [],
      totalSteps,
    } = data;

    if (!title?.trim() || !area?.trim()) {
      throw new AppError("Título e área da trilha são obrigatórios.", 400);
    }

    let resolvedSubjectId: string | null = null;
    if (subjectId?.trim()) {
      const subject = await questionService.ensureSubjectSynchronized(
        subjectId.trim()
      );
      resolvedSubjectId = subject?.id || null;
    }

    // Caso subjectId não tenha sido informado explicitamente, infere a partir das lições ou área
    if (!resolvedSubjectId && lessonIds.length > 0) {
      const firstLesson = await prisma.lesson.findFirst({
        where: { id: { in: lessonIds }, subjectId: { not: null } },
        select: { subjectId: true },
      });
      if (firstLesson?.subjectId) {
        resolvedSubjectId = firstLesson.subjectId;
      }
    }

    if (!resolvedSubjectId) {
      const byAreaOrTitle =
        (await questionService.resolveSubject(area.trim())) ||
        (await questionService.resolveSubject(title.trim()));
      if (byAreaOrTitle) {
        await questionService.ensureSubjectSynchronized(byAreaOrTitle.id);
        resolvedSubjectId = byAreaOrTitle.id;
      }
    }

    const computedSteps =
      totalSteps ?? Math.max(lessonIds.length + questionIds.length, 1);

    return prisma.trail.create({
      data: {
        title: title.trim(),
        description: description?.trim() || null,
        area: area.trim(),
        subjectId: resolvedSubjectId,
        lessonIds,
        questionIds,
        totalSteps: computedSteps,
      },
      include: {
        subject: {
          select: { id: true, name: true, slug: true, icon: true },
        },
      },
    });
  }

  async updateTrail(id: string, data: UpdateTrailInput) {
    await this.getTrailById(id);

    let resolvedSubjectId = data.subjectId;
    if (typeof data.subjectId === "string" && data.subjectId.trim()) {
      const subject = await questionService.ensureSubjectSynchronized(
        data.subjectId.trim()
      );
      resolvedSubjectId = subject?.id || data.subjectId.trim();
    }

    return prisma.trail.update({
      where: { id },
      data: {
        ...(data.title !== undefined ? { title: data.title.trim() } : {}),
        ...(data.description !== undefined
          ? { description: data.description }
          : {}),
        ...(data.area !== undefined ? { area: data.area.trim() } : {}),
        ...(resolvedSubjectId !== undefined
          ? { subjectId: resolvedSubjectId }
          : {}),
        ...(data.lessonIds !== undefined ? { lessonIds: data.lessonIds } : {}),
        ...(data.questionIds !== undefined
          ? { questionIds: data.questionIds }
          : {}),
        ...(data.totalSteps !== undefined
          ? { totalSteps: data.totalSteps }
          : {}),
      },
      include: {
        subject: {
          select: { id: true, name: true, slug: true, icon: true },
        },
      },
    });
  }

  async deleteTrail(id: string) {
    await this.getTrailById(id);

    await prisma.trail.delete({
      where: { id },
    });

    return { message: "Trilha excluída com sucesso." };
  }

  /**
   * Atualiza ou cria o avanço do aluno (`TrailProgress`) em uma trilha
   * e atualiza a ofensiva caso uma etapa seja concluída.
   */
  async upsertProgress(input: UpdateTrailProgressInput) {
    const {
      userId,
      trailId,
      completedSteps,
      completedLessonIds,
      lessonId,
      status,
    } = input;

    if (!userId || !trailId) {
      throw new AppError("Os campos userId e trailId são obrigatórios.", 400);
    }

    const trail = await prisma.trail.findUnique({ where: { id: trailId } });
    if (!trail) {
      throw new AppError("Trilha não encontrada.", 404);
    }

    const existing = await prisma.trailProgress.findUnique({
      where: {
        userId_trailId: { userId, trailId },
      },
    });

    let updatedLessons = existing?.completedLessonIds || [];
    if (Array.isArray(completedLessonIds)) {
      updatedLessons = Array.from(new Set(completedLessonIds));
    } else if (lessonId && !updatedLessons.includes(lessonId)) {
      updatedLessons = [...updatedLessons, lessonId];
    }

    const newCompletedSteps =
      completedSteps !== undefined
        ? Number(completedSteps)
        : Math.max(updatedLessons.length, (existing?.completedSteps || 0) + 1);

    const totalSteps = Math.max(trail.totalSteps, 1);
    const progressPercent = Number(
      Math.min((newCompletedSteps / totalSteps) * 100, 100).toFixed(1)
    );

    const computedStatus =
      status ||
      (progressPercent >= 100
        ? "COMPLETED"
        : progressPercent > 0
        ? "IN_PROGRESS"
        : "NOT_STARTED");

    const progress = await prisma.trailProgress.upsert({
      where: {
        userId_trailId: { userId, trailId },
      },
      create: {
        userId,
        trailId,
        completedSteps: newCompletedSteps,
        completedLessonIds: updatedLessons,
        progressPercent,
        status: computedStatus,
      },
      update: {
        completedSteps: newCompletedSteps,
        completedLessonIds: updatedLessons,
        progressPercent,
        status: computedStatus,
      },
      include: {
        trail: {
          select: {
            id: true,
            title: true,
            area: true,
            subjectId: true,
            totalSteps: true,
          },
        },
      },
    });

    // Registra a atividade na ofensiva do aluno
    await streakService.registerActivity(userId).catch(() => null);

    return progress;
  }

  async listUserProgress(userId: string) {
    if (!userId) {
      throw new AppError("O userId é obrigatório.", 400);
    }

    return prisma.trailProgress.findMany({
      where: { userId },
      include: {
        trail: {
          include: {
            subject: { select: { id: true, name: true, slug: true, icon: true } },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });
  }
}

export const trailService = new TrailService();

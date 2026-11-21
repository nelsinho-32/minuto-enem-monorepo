import { Role, AnnouncementAudience } from "@prisma/client";
import {
  CreateAnnouncementInputSchema,
} from "@minuto-enem/shared";
import { prisma } from "../lib/prisma";
import { AppError } from "../errors/AppError";
import { realtimeNotificationService } from "./realtime-notification.service";

export class AnnouncementService {
  /**
   * Cria um novo comunicado institucional para a escola
   * (POST /schools/me/announcements)
   */
  async createAnnouncement(
    schoolId: string,
    authorId: string | undefined,
    rawInput: unknown
  ) {
    if (!schoolId) {
      throw new AppError("O identificador da escola é obrigatório.", 400);
    }

    const input = CreateAnnouncementInputSchema.parse(rawInput);

    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      select: { id: true, name: true, isActive: true },
    });

    if (!school) {
      throw new AppError("Escola não encontrada.", 404);
    }

    if (!school.isActive) {
      throw new AppError("Esta instituição escolar está inativa no sistema.", 403);
    }

    let audience = (input.targetAudience as AnnouncementAudience) || AnnouncementAudience.ALL;
    let validClassroomId: string | null = null;

    if (input.classroomId) {
      const targetClassroom = await prisma.classroom.findFirst({
        where: {
          id: input.classroomId,
          schoolId: school.id,
        },
        select: { id: true },
      });
      if (!targetClassroom) {
        throw new AppError("Turma de destino não encontrada nesta instituição.", 404);
      }
      validClassroomId = targetClassroom.id;
      audience = AnnouncementAudience.CLASSROOM;
    } else if (audience === AnnouncementAudience.CLASSROOM) {
      throw new AppError("Selecione uma turma específica para comunicados segmentados.", 400);
    }

    let parsedScheduledFor: Date | null = null;
    if (input.scheduledFor) {
      const candidate = new Date(input.scheduledFor);
      if (Number.isNaN(candidate.getTime())) {
        throw new AppError("Data/horário de agendamento inválido.", 400);
      }
      parsedScheduledFor = candidate;
    }

    let validAuthorId: string | null = null;
    if (authorId) {
      const userExists = await prisma.user.findUnique({
        where: { id: authorId },
        select: { id: true },
      });
      if (userExists) {
        validAuthorId = userExists.id;
      }
    }

    const isImmediate = !parsedScheduledFor || parsedScheduledFor.getTime() <= Date.now() + 60_000;

    const announcement = await prisma.announcement.create({
      data: {
        schoolId: school.id,
        authorId: validAuthorId,
        title: input.title,
        content: input.content,
        targetAudience: audience,
        classroomId: validClassroomId,
        scheduledFor: parsedScheduledFor,
        notificationSentAt: isImmediate ? new Date() : null,
      },
      include: {
        school: {
          select: { id: true, name: true, code: true, slug: true },
        },
        classroom: {
          select: { id: true, name: true },
        },
      },
    });

    if (isImmediate) {
      await this.notifyAnnouncementRecipients(announcement);
    }

    return announcement;
  }

  /**
   * Envia notificação persistida + tempo real para o público-alvo do comunicado.
   */
  private async notifyAnnouncementRecipients(announcement: {
    id: string;
    schoolId: string;
    title: string;
    content: string;
    targetAudience: AnnouncementAudience;
    classroomId: string | null;
  }) {
    try {
      let recipientIds: string[] = [];
      if (announcement.classroomId) {
        const room = await prisma.classroom.findUnique({
          where: { id: announcement.classroomId },
          select: {
            teacherId: true,
            students: { select: { id: true } },
          },
        });
        if (room) {
          recipientIds = [room.teacherId, ...room.students.map((s) => s.id)];
        }
      } else {
        const users = await prisma.user.findMany({
          where: {
            schoolId: announcement.schoolId,
            isActive: true,
            ...(announcement.targetAudience === AnnouncementAudience.TEACHERS_ONLY
              ? { role: Role.TEACHER }
              : { role: { in: [Role.STUDENT, Role.TEACHER] } }),
          },
          select: { id: true },
        });
        recipientIds = users.map((u) => u.id);
      }

      if (recipientIds.length > 0) {
        await realtimeNotificationService.notifyUsers(recipientIds, {
          type: "NEW_ANNOUNCEMENT",
          title: `Mural Escolar: ${announcement.title}`,
          body: announcement.content.slice(0, 140),
          route: "/",
        });
      }
      return recipientIds.length;
    } catch (err) {
      console.warn("[AnnouncementService] Falha não-bloqueante ao notificar:", err);
      return 0;
    }
  }

  /**
   * Worker periódico: dispara notificações de comunicados agendados cujo horário já chegou.
   */
  async dispatchDueScheduledAnnouncements() {
    const now = new Date();
    const dueList = await prisma.announcement.findMany({
      where: {
        scheduledFor: { lte: now },
        notificationSentAt: null,
      },
      select: {
        id: true,
        schoolId: true,
        title: true,
        content: true,
        targetAudience: true,
        classroomId: true,
      },
      take: 25,
    });

    let dispatched = 0;
    for (const ann of dueList) {
      const claim = await prisma.announcement.updateMany({
        where: { id: ann.id, notificationSentAt: null },
        data: { notificationSentAt: now },
      });
      if (claim.count > 0) {
        await this.notifyAnnouncementRecipients(ann);
        dispatched += 1;
      }
    }

    return { dispatched };
  }

  /**
   * Lista os comunicados institucionais com visibilidade contextual por perfil
   * (GET /announcements):
   * - STUDENT: comunicados da sua escola onde targetAudience === 'ALL'
   * - TEACHER: comunicados da sua escola onde targetAudience in ['ALL', 'TEACHERS_ONLY']
   * - SCHOOL: comunicados da sua própria escola
   * - ADMIN: todos os comunicados
   */
  async listAnnouncementsForUser(user?: {
    id: string;
    role: Role;
    schoolId?: string | null;
  }) {
    if (!user || !user.id) {
      return [];
    }

    const schoolIds: string[] = [];

    if (user.schoolId) {
      schoolIds.push(user.schoolId);
    }

    const now = new Date();
    const publishedWindow = {
      OR: [{ scheduledFor: null }, { scheduledFor: { lte: now } }],
    };

    // Para Alunos: se não tiver schoolId direto, busca pelas turmas matriculadas
    if (user.role === Role.STUDENT) {
      const studentWithRooms = await prisma.user.findUnique({
        where: { id: user.id },
        select: {
          schoolId: true,
          enrolledClassrooms: {
            select: { id: true, schoolId: true },
          },
        },
      });

      const enrolledRoomIds: string[] = [];

      if (studentWithRooms?.schoolId && !schoolIds.includes(studentWithRooms.schoolId)) {
        schoolIds.push(studentWithRooms.schoolId);
      }

      if (studentWithRooms?.enrolledClassrooms) {
        for (const room of studentWithRooms.enrolledClassrooms) {
          enrolledRoomIds.push(room.id);
          if (room.schoolId && !schoolIds.includes(room.schoolId)) {
            schoolIds.push(room.schoolId);
          }
        }
      }

      if (schoolIds.length === 0) {
        return prisma.announcement.findMany({
          where: {
            targetAudience: AnnouncementAudience.ALL,
            title: { contains: "ENEM 2026" },
            ...publishedWindow,
          },
          include: {
            school: {
              select: { id: true, name: true, code: true, slug: true },
            },
            classroom: {
              select: { id: true, name: true },
            },
          },
          orderBy: { createdAt: "desc" },
          take: 1,
        });
      }

      return prisma.announcement.findMany({
        where: {
          schoolId: { in: schoolIds },
          AND: [
            publishedWindow,
            {
              OR: [
                { targetAudience: AnnouncementAudience.ALL },
                ...(enrolledRoomIds.length > 0
                  ? [
                      {
                        targetAudience: AnnouncementAudience.CLASSROOM,
                        classroomId: { in: enrolledRoomIds },
                      },
                    ]
                  : []),
              ],
            },
          ],
        },
        include: {
          school: {
            select: { id: true, name: true, code: true, slug: true },
          },
          classroom: {
            select: { id: true, name: true },
          },
        },
        orderBy: { createdAt: "desc" },
      });
    }

    // Para Professores: se não tiver schoolId direto, busca pelas turmas lecionadas
    if (user.role === Role.TEACHER) {
      const teacherWithRooms = await prisma.user.findUnique({
        where: { id: user.id },
        select: {
          schoolId: true,
          createdClassrooms: {
            select: { id: true, schoolId: true },
          },
        },
      });

      const teacherRoomIds: string[] = [];

      if (teacherWithRooms?.schoolId && !schoolIds.includes(teacherWithRooms.schoolId)) {
        schoolIds.push(teacherWithRooms.schoolId);
      }

      if (teacherWithRooms?.createdClassrooms) {
        for (const room of teacherWithRooms.createdClassrooms) {
          teacherRoomIds.push(room.id);
          if (room.schoolId && !schoolIds.includes(room.schoolId)) {
            schoolIds.push(room.schoolId);
          }
        }
      }

      if (schoolIds.length === 0) {
        return prisma.announcement.findMany({
          where: {
            targetAudience: AnnouncementAudience.ALL,
            title: { contains: "ENEM 2026" },
            ...publishedWindow,
          },
          include: {
            school: {
              select: { id: true, name: true, code: true, slug: true },
            },
            classroom: {
              select: { id: true, name: true },
            },
          },
          orderBy: { createdAt: "desc" },
          take: 1,
        });
      }

      return prisma.announcement.findMany({
        where: {
          schoolId: { in: schoolIds },
          AND: [
            publishedWindow,
            {
              OR: [
                {
                  targetAudience: {
                    in: [AnnouncementAudience.ALL, AnnouncementAudience.TEACHERS_ONLY],
                  },
                },
                ...(teacherRoomIds.length > 0
                  ? [
                      {
                        targetAudience: AnnouncementAudience.CLASSROOM,
                        classroomId: { in: teacherRoomIds },
                      },
                    ]
                  : []),
              ],
            },
          ],
        },
        include: {
          school: {
            select: { id: true, name: true, code: true, slug: true },
          },
          classroom: {
            select: { id: true, name: true },
          },
        },
        orderBy: { createdAt: "desc" },
      });
    }

    // Para Gestores Escolares (role: SCHOOL)
    if (user.role === Role.SCHOOL) {
      if (!user.schoolId) {
        return [];
      }

      return prisma.announcement.findMany({
        where: { schoolId: user.schoolId },
        include: {
          school: {
            select: { id: true, name: true, code: true, slug: true },
          },
          classroom: {
            select: { id: true, name: true },
          },
        },
        orderBy: { createdAt: "desc" },
      });
    }

    // Para Administradores Globais (role: ADMIN)
    if (user.role === Role.ADMIN) {
      return prisma.announcement.findMany({
        include: {
          school: {
            select: { id: true, name: true, code: true, slug: true },
          },
          classroom: {
            select: { id: true, name: true },
          },
        },
        orderBy: { createdAt: "desc" },
      });
    }

    return [];
  }

  /**
   * Lista todos os comunicados da instituição escolar especificada
   * (GET /schools/me/announcements)
   */
  async listSchoolAnnouncements(schoolId: string) {
    if (!schoolId) {
      throw new AppError("O identificador da escola é obrigatório.", 400);
    }

    return prisma.announcement.findMany({
      where: { schoolId },
      include: {
        school: {
          select: { id: true, name: true, code: true, slug: true },
        },
        classroom: {
          select: { id: true, name: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Remove um comunicado institucional da escola
   * (DELETE /schools/me/announcements/:id)
   */
  async deleteAnnouncement(announcementId: string, schoolId: string) {
    if (!announcementId) {
      throw new AppError("ID do comunicado não fornecido.", 400);
    }

    const announcement = await prisma.announcement.findUnique({
      where: { id: announcementId },
    });

    if (!announcement) {
      throw new AppError("Comunicado não encontrado.", 404);
    }

    if (announcement.schoolId !== schoolId) {
      throw new AppError("Você não tem permissão para remover este comunicado.", 403);
    }

    await prisma.announcement.delete({
      where: { id: announcementId },
    });

    return { message: "Comunicado removido com sucesso." };
  }
}

export const announcementService = new AnnouncementService();

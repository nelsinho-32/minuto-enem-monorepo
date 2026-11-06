import { Role, AnnouncementAudience } from "@prisma/client";
import {
  CreateAnnouncementInputSchema,
  type CreateAnnouncementInput,
} from "@minuto-enem/shared";
import { prisma } from "../lib/prisma";
import { AppError } from "../errors/AppError";

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

    const audience = (input.targetAudience as AnnouncementAudience) || AnnouncementAudience.ALL;

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

    const announcement = await prisma.announcement.create({
      data: {
        schoolId: school.id,
        authorId: validAuthorId,
        title: input.title,
        content: input.content,
        targetAudience: audience,
      },
      include: {
        school: {
          select: { id: true, name: true, code: true, slug: true },
        },
      },
    });

    return announcement;
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

    // Para Alunos: se não tiver schoolId direto, busca pelas turmas matriculadas
    if (user.role === Role.STUDENT) {
      const studentWithRooms = await prisma.user.findUnique({
        where: { id: user.id },
        select: {
          schoolId: true,
          enrolledClassrooms: {
            select: { schoolId: true },
          },
        },
      });

      if (studentWithRooms?.schoolId && !schoolIds.includes(studentWithRooms.schoolId)) {
        schoolIds.push(studentWithRooms.schoolId);
      }

      if (studentWithRooms?.enrolledClassrooms) {
        for (const room of studentWithRooms.enrolledClassrooms) {
          if (room.schoolId && !schoolIds.includes(room.schoolId)) {
            schoolIds.push(room.schoolId);
          }
        }
      }

      if (schoolIds.length === 0) {
        return [];
      }

      return prisma.announcement.findMany({
        where: {
          schoolId: { in: schoolIds },
          targetAudience: AnnouncementAudience.ALL,
        },
        include: {
          school: {
            select: { id: true, name: true, code: true, slug: true },
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
            select: { schoolId: true },
          },
        },
      });

      if (teacherWithRooms?.schoolId && !schoolIds.includes(teacherWithRooms.schoolId)) {
        schoolIds.push(teacherWithRooms.schoolId);
      }

      if (teacherWithRooms?.createdClassrooms) {
        for (const room of teacherWithRooms.createdClassrooms) {
          if (room.schoolId && !schoolIds.includes(room.schoolId)) {
            schoolIds.push(room.schoolId);
          }
        }
      }

      if (schoolIds.length === 0) {
        return [];
      }

      return prisma.announcement.findMany({
        where: {
          schoolId: { in: schoolIds },
          targetAudience: {
            in: [AnnouncementAudience.ALL, AnnouncementAudience.TEACHERS_ONLY],
          },
        },
        include: {
          school: {
            select: { id: true, name: true, code: true, slug: true },
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

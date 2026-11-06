import bcrypt from "bcrypt";
import crypto from "crypto";
import { Role } from "@prisma/client";
import {
  CreateClassroomInputSchema,
  type CreateClassroomInput,
} from "@minuto-enem/shared";
import { prisma } from "../lib/prisma";
import { AppError } from "../errors/AppError";

const SALT_ROUNDS = 10;

export class SchoolService {
  /**
   * Retorna as métricas consolidadas de todas as turmas da escola (GET /schools/me/overview)
   */
  async getOverview(schoolId: string) {
    if (!schoolId) {
      throw new AppError("Identificador da escola não fornecido.", 400);
    }

    const school = await prisma.school.findUnique({
      where: { id: schoolId },
      include: {
        classrooms: {
          include: {
            teacher: {
              select: { id: true, name: true, email: true },
            },
            students: {
              select: {
                id: true,
                name: true,
                email: true,
                xp: true,
                currentStreak: true,
                lastStudyDate: true,
              },
            },
            tasks: {
              select: {
                id: true,
                title: true,
                total: true,
                submissions: {
                  select: {
                    id: true,
                    studentId: true,
                    score: true,
                    accuracyPercent: true,
                    status: true,
                  },
                },
              },
            },
            _count: {
              select: {
                students: true,
                tasks: true,
                lessons: true,
              },
            },
          },
        },
      },
    });

    if (!school) {
      throw new AppError("Escola não encontrada.", 404);
    }

    // 1. Identificar todos os alunos únicos matriculados nas turmas da escola ou vinculados a ela
    const studentMap = new Map<string, any>();

    for (const c of school.classrooms) {
      for (const student of c.students) {
        studentMap.set(student.id, student);
      }
    }

    // Buscar também alunos que possuam schoolId direto no User
    const directStudents = await prisma.user.findMany({
      where: {
        schoolId,
        role: Role.STUDENT,
      },
      select: {
        id: true,
        name: true,
        email: true,
        xp: true,
        currentStreak: true,
        lastStudyDate: true,
      },
    });

    for (const s of directStudents) {
      studentMap.set(s.id, s);
    }

    const allStudents = Array.from(studentMap.values());
    const totalStudents = allStudents.length;

    // 2. Taxa de Engajamento Semanal baseada na Ofensiva (Streak) e atividade recente
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const activeStudentsWeekly = allStudents.filter((student) => {
      const hasRecentStreak = student.currentStreak > 0;
      const studiedRecently =
        student.lastStudyDate && new Date(student.lastStudyDate) >= sevenDaysAgo;
      return hasRecentStreak || studiedRecently;
    });

    const weeklyEngagementRate =
      totalStudents > 0
        ? Number(((activeStudentsWeekly.length / totalStudents) * 100).toFixed(1))
        : 0;

    // 3. Média Geral de Acertos por Área do Conhecimento / Disciplina (subject) nas tarefas da escola
    const studentIds = allStudents.map((s) => s.id);
    const schoolTaskIds = school.classrooms.flatMap((c) => c.tasks.map((t) => t.id));

    let areaAccuracyMap: Record<
      string,
      { totalAttempts: number; correctAttempts: number; accuracyPercent: number }
    > = {
      "Matemática": { totalAttempts: 0, correctAttempts: 0, accuracyPercent: 0 },
      "Ciências da Natureza": { totalAttempts: 0, correctAttempts: 0, accuracyPercent: 0 },
      "Ciências Humanas": { totalAttempts: 0, correctAttempts: 0, accuracyPercent: 0 },
      "Linguagens e Códigos": { totalAttempts: 0, correctAttempts: 0, accuracyPercent: 0 },
    };

    if (studentIds.length > 0 && schoolTaskIds.length > 0) {
      const attempts = await prisma.questionAttempt.findMany({
        where: {
          taskId: { in: schoolTaskIds },
          userId: { in: studentIds },
        },
        include: {
          question: {
            select: {
              area: true,
              subject: true,
            },
          },
        },
        take: 5000,
      });

      for (const att of attempts) {
        const area = att.question?.area || att.question?.subject || "Geral";
        if (!areaAccuracyMap[area]) {
          areaAccuracyMap[area] = {
            totalAttempts: 0,
            correctAttempts: 0,
            accuracyPercent: 0,
          };
        }
        areaAccuracyMap[area].totalAttempts++;
        if (att.isCorrect) {
          areaAccuracyMap[area].correctAttempts++;
        }
      }

      for (const area of Object.keys(areaAccuracyMap)) {
        const item = areaAccuracyMap[area];
        item.accuracyPercent =
          item.totalAttempts > 0
            ? Number(((item.correctAttempts / item.totalAttempts) * 100).toFixed(1))
            : 0;
      }
    }

    // 4. Comparativo de Desempenho entre as Turmas da Escola
    const classroomComparisons = school.classrooms.map((c) => {
      let totalSubmissions = 0;
      let totalScoreSum = 0;
      let totalAccuracySum = 0;

      for (const t of c.tasks) {
        for (const sub of t.submissions) {
          totalSubmissions++;
          totalScoreSum += sub.score;
          totalAccuracySum += sub.accuracyPercent;
        }
      }

      const averageAccuracy =
        totalSubmissions > 0
          ? Number((totalAccuracySum / totalSubmissions).toFixed(1))
          : 0;

      const averageScore =
        totalSubmissions > 0
          ? Number((totalScoreSum / totalSubmissions).toFixed(1))
          : 0;

      const taskCompletionRate =
        c.tasks.length > 0 && c.students.length > 0
          ? Number(
              (
                (totalSubmissions / (c.tasks.length * c.students.length)) *
                100
              ).toFixed(1)
            )
          : 0;

      return {
        id: c.id,
        name: c.name,
        code: c.code,
        teacherId: c.teacherId,
        teacherName: c.teacher?.name || "Professor",
        studentsCount: c._count.students,
        tasksCount: c._count.tasks,
        materialsCount: c._count.lessons,
        totalSubmissions,
        averageAccuracy,
        averageScore,
        taskCompletionRate: Math.min(taskCompletionRate, 100),
      };
    });

    return {
      school: {
        id: school.id,
        name: school.name,
        code: school.code,
        slug: school.slug,
        cnpj: school.cnpj,
        isActive: school.isActive,
      },
      metrics: {
        totalClassrooms: school.classrooms.length,
        totalStudents,
        activeStudentsWeekly: activeStudentsWeekly.length,
        weeklyEngagementRate,
        generalAccuracyByArea: areaAccuracyMap,
      },
      classroomComparisons,
    };
  }

  /**
   * Cadastra um novo professor e o vincula à escola (role: TEACHER)
   */
  async createTeacher(
    schoolId: string,
    data: { name: string; email: string; password: string }
  ) {
    if (!data.name || !data.email || !data.password) {
      throw new AppError("Nome, e-mail e senha são obrigatórios.", 400);
    }

    const normalizedEmail = data.email.trim().toLowerCase();
    const existing = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existing) {
      throw new AppError("Este e-mail já está em uso.", 409);
    }

    const hashedPassword = await bcrypt.hash(data.password, SALT_ROUNDS);

    return prisma.user.create({
      data: {
        name: data.name.trim(),
        email: normalizedEmail,
        password: hashedPassword,
        role: Role.TEACHER,
        schoolId,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        schoolId: true,
        createdAt: true,
      },
    });
  }

  /**
   * Lista todos os professores vinculados à escola
   */
  async listTeachers(schoolId: string) {
    const teachers = await prisma.user.findMany({
      where: {
        schoolId,
        role: Role.TEACHER,
      },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        createdClassrooms: {
          select: {
            id: true,
            name: true,
            code: true,
            _count: {
              select: {
                students: true,
                tasks: true,
              },
            },
          },
        },
      },
      orderBy: { name: "asc" },
    });

    return teachers.map((t) => ({
      id: t.id,
      name: t.name,
      email: t.email,
      createdAt: t.createdAt,
      classroomsCount: t.createdClassrooms.length,
      classrooms: t.createdClassrooms,
    }));
  }

  /**
   * Cria uma nova turma associada a esta escola
   */
  async createClassroomForSchool(
    schoolId: string,
    data: Omit<CreateClassroomInput, "schoolId">
  ) {
    const validated = CreateClassroomInputSchema.parse({
      ...data,
      schoolId,
    });

    // Validação se o professor existe e, caso pertença a uma escola, se é desta escola
    const teacher = await prisma.user.findUnique({
      where: { id: validated.teacherId },
      select: { id: true, role: true, schoolId: true, name: true },
    });

    if (!teacher || teacher.role !== Role.TEACHER) {
      throw new AppError(
        "Professor responsável inválido ou não encontrado.",
        400
      );
    }

    if (teacher.schoolId && teacher.schoolId !== schoolId) {
      throw new AppError(
        "O professor informado pertence a outra instituição.",
        403
      );
    }

    let roomCode = validated.code?.trim().toUpperCase() || "";
    if (!roomCode) {
      let uniqueFound = false;
      let attempts = 0;
      while (!uniqueFound && attempts < 20) {
        attempts++;
        roomCode = crypto.randomBytes(3).toString("hex").toUpperCase();
        const existing = await prisma.classroom.findFirst({
          where: {
            code: { equals: roomCode, mode: "insensitive" },
          },
        });
        if (!existing) uniqueFound = true;
      }
      if (!uniqueFound) {
        roomCode = `TUR-${Date.now().toString(36).slice(-4).toUpperCase()}`;
      }
    } else {
      const existing = await prisma.classroom.findFirst({
        where: {
          code: { equals: roomCode, mode: "insensitive" },
        },
      });
      if (existing) {
        throw new AppError(
          `Já existe uma turma cadastrada com o código "${roomCode}".`,
          409
        );
      }
    }

    return prisma.classroom.create({
      data: {
        name: validated.name.trim(),
        code: roomCode,
        schoolId,
        teacherId: validated.teacherId,
      },
      include: {
        teacher: {
          select: { id: true, name: true, email: true },
        },
        _count: {
          select: { students: true, tasks: true },
        },
      },
    });
  }

  /**
   * Lista todas as turmas pertencentes à escola
   */
  async listClassroomsForSchool(schoolId: string) {
    return prisma.classroom.findMany({
      where: { schoolId },
      include: {
        teacher: {
          select: { id: true, name: true, email: true },
        },
        _count: {
          select: { students: true, tasks: true, lessons: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }
}

export const schoolService = new SchoolService();


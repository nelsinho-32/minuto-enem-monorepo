import { Role } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { AppError } from "../errors/AppError";

export class ClassroomAnalyticsService {
  /**
   * Comparativo de Desempenho Anônimo na Turma (para o ALUNO ou PROFESSOR):
   * Calcula a taxa de acerto do aluno comparada à média e ao percentil 75 da turma,
   * sem expor nomes ou notas individuais de colegas.
   */
  async getAnonymousBenchmark(params: {
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

    const studentIds = classroom.students.map((s) => s.id);
    const isEnrolled = studentIds.includes(params.requesterId);
    const isOwner = classroom.teacherId === params.requesterId;
    const isSchoolAdmin =
      params.role === Role.ADMIN ||
      (params.role === Role.SCHOOL && classroom.schoolId === params.schoolId);

    if (!isEnrolled && !isOwner && !isSchoolAdmin) {
      throw new AppError("Você não tem acesso a esta turma.", 403);
    }

    if (studentIds.length === 0) {
      return {
        classroomId: classroom.id,
        classroomName: classroom.name,
        participantsCount: 0,
        myAccuracyPercent: 0,
        myAnsweredCount: 0,
        classAverageAccuracyPercent: 0,
        classTop25AccuracyPercent: 0,
        percentileRank: 50,
        positionBand: "Sem dados suficientes",
        areaComparisons: [],
      };
    }

    const attempts = await prisma.questionAttempt.findMany({
      where: { userId: { in: studentIds } },
      select: {
        userId: true,
        isCorrect: true,
        question: { select: { area: true } },
      },
    });

    const byStudent = new Map<string, { total: number; correct: number }>();
    for (const stId of studentIds) {
      byStudent.set(stId, { total: 0, correct: 0 });
    }

    const byAreaClass = new Map<string, { total: number; correct: number }>();
    const byAreaMe = new Map<string, { total: number; correct: number }>();

    for (const att of attempts) {
      const s = byStudent.get(att.userId) || { total: 0, correct: 0 };
      s.total += 1;
      if (att.isCorrect) s.correct += 1;
      byStudent.set(att.userId, s);

      const area = att.question?.area || "Geral";
      const ac = byAreaClass.get(area) || { total: 0, correct: 0 };
      ac.total += 1;
      if (att.isCorrect) ac.correct += 1;
      byAreaClass.set(area, ac);

      if (att.userId === params.requesterId) {
        const am = byAreaMe.get(area) || { total: 0, correct: 0 };
        am.total += 1;
        if (att.isCorrect) am.correct += 1;
        byAreaMe.set(area, am);
      }
    }

    const accuracies: number[] = [];
    for (const [, stats] of byStudent.entries()) {
      const acc = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
      accuracies.push(acc);
    }
    accuracies.sort((a, b) => a - b);

    const myStats = byStudent.get(params.requesterId) || { total: 0, correct: 0 };
    const myAccuracyPercent =
      myStats.total > 0 ? Math.round((myStats.correct / myStats.total) * 100) : 0;

    const classAverageAccuracyPercent =
      accuracies.length > 0
        ? Math.round(accuracies.reduce((a, b) => a + b, 0) / accuracies.length)
        : 0;

    const p75Index = Math.min(
      accuracies.length - 1,
      Math.max(0, Math.floor(accuracies.length * 0.75))
    );
    const classTop25AccuracyPercent = accuracies[p75Index] ?? classAverageAccuracyPercent;

    const belowOrEqualCount = accuracies.filter((a) => a <= myAccuracyPercent).length;
    const percentileRank =
      accuracies.length > 0
        ? Math.min(99, Math.max(1, Math.round((belowOrEqualCount / accuracies.length) * 100)))
        : 50;

    const positionBand =
      percentileRank >= 85
        ? "Top 15% da Turma"
        : percentileRank >= 65
          ? "Acima da Média da Turma"
          : percentileRank >= 45
            ? "Na Média da Turma"
            : "Foco em Recuperação";

    const areaComparisons = Array.from(byAreaClass.entries()).map(([area, cStats]) => {
      const mStats = byAreaMe.get(area) || { total: 0, correct: 0 };
      return {
        area,
        classAccuracyPercent:
          cStats.total > 0 ? Math.round((cStats.correct / cStats.total) * 100) : 0,
        myAccuracyPercent:
          mStats.total > 0 ? Math.round((mStats.correct / mStats.total) * 100) : 0,
      };
    });

    return {
      classroomId: classroom.id,
      classroomName: classroom.name,
      participantsCount: studentIds.length,
      myAccuracyPercent,
      myAnsweredCount: myStats.total,
      classAverageAccuracyPercent,
      classTop25AccuracyPercent,
      percentileRank,
      positionBand,
      areaComparisons,
    };
  }

  /**
   * Mapa de Calor de Dificuldades da Turma (para o PROFESSOR / ESCOLA):
   * Agrupa erros dos alunos da turma por matéria e tópico indicando pontos críticos.
   */
  async getDifficultyHeatmap(params: {
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

    const isOwner = classroom.teacherId === params.requesterId;
    const isSchoolAdmin =
      params.role === Role.ADMIN ||
      (params.role === Role.SCHOOL && classroom.schoolId === params.schoolId);
    const isEnrolled = classroom.students.some((s) => s.id === params.requesterId);

    if (!isOwner && !isSchoolAdmin && !isEnrolled) {
      throw new AppError("Acesso negado ao mapa de calor desta turma.", 403);
    }

    const studentIds = classroom.students.map((s) => s.id);
    if (studentIds.length === 0) {
      return { classroomId: classroom.id, classroomName: classroom.name, cells: [] };
    }

    const attempts = await prisma.questionAttempt.findMany({
      where: { userId: { in: studentIds } },
      select: {
        isCorrect: true,
        question: {
          select: {
            subject: true,
            topic: true,
            area: true,
          },
        },
      },
      take: 1500,
      orderBy: { createdAt: "desc" },
    });

    const cellMap = new Map<
      string,
      {
        subject: string;
        topic: string;
        area: string;
        totalAttempts: number;
        wrongAttempts: number;
      }
    >();

    for (const att of attempts) {
      const subject = att.question?.subject || "Geral";
      const topic = att.question?.topic || `Tópicos gerais de ${subject}`;
      const area = att.question?.area || "Geral";
      const key = `${subject}::${topic}`;
      const cur = cellMap.get(key) || {
        subject,
        topic,
        area,
        totalAttempts: 0,
        wrongAttempts: 0,
      };
      cur.totalAttempts += 1;
      if (!att.isCorrect) cur.wrongAttempts += 1;
      cellMap.set(key, cur);
    }

    const cells = Array.from(cellMap.values())
      .map((cell) => {
        const errorRatePercent =
          cell.totalAttempts > 0
            ? Math.round((cell.wrongAttempts / cell.totalAttempts) * 100)
            : 0;
        const severity: "CRITICAL" | "WARNING" | "GOOD" =
          errorRatePercent >= 65
            ? "CRITICAL"
            : errorRatePercent >= 40
              ? "WARNING"
              : "GOOD";
        return {
          ...cell,
          errorRatePercent,
          accuracyPercent: 100 - errorRatePercent,
          severity,
        };
      })
      .sort((a, b) => b.errorRatePercent - a.errorRatePercent || b.totalAttempts - a.totalAttempts)
      .slice(0, 24);

    return {
      classroomId: classroom.id,
      classroomName: classroom.name,
      totalAnalyzedAttempts: attempts.length,
      criticalCount: cells.filter((c) => c.severity === "CRITICAL").length,
      warningCount: cells.filter((c) => c.severity === "WARNING").length,
      cells,
    };
  }
}

export const classroomAnalyticsService = new ClassroomAnalyticsService();

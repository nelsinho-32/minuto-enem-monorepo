import { prisma } from "../lib/prisma";
import { AppError } from "../errors/AppError";
import { streakService } from "./streak.service";

export interface StudyPlanGenerationInput {
  dailyMinutes?: number;
  targetCourse?: string;
  focusAreas?: string[];
}

function getMondayIsoDate(reference = new Date()): string {
  const d = new Date(reference);
  const day = d.getDay(); // 0=Dom..6=Sab
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

const DEFAULT_ENEM_POOL: Array<{
  subject: string;
  area: string;
  topic: string;
}> = [
  { subject: "Matemática", area: "Matemática", topic: "Porcentagem, Razão e Proporção" },
  { subject: "Biologia", area: "Natureza", topic: "Citologia e Ecologia no ENEM" },
  { subject: "Física", area: "Natureza", topic: "Cinemática, Energia e Eletrodinâmica" },
  { subject: "Química", area: "Natureza", topic: "Estequiometria e Físico-Química" },
  { subject: "História", area: "Humanas", topic: "Brasil República e Era Vargas" },
  { subject: "Geografia", area: "Humanas", topic: "Geopolítica e Questões Ambientais" },
  { subject: "Português", area: "Linguagens", topic: "Interpretação Textual e Figuras de Linguagem" },
  { subject: "Redação", area: "Linguagens", topic: "Estrutura Dissertativa e Proposta de Intervenção (C5)" },
];

export class StudyPlanService {
  /**
   * Retorna o cronograma semanal da semana atual.
   * Se o aluno ainda não gerou plano para esta semana, gera automaticamente com base nos erros reais.
   */
  async getCurrentWeekPlan(userId: string) {
    const weekStart = getMondayIsoDate();
    let items = await prisma.studyPlanItem.findMany({
      where: { userId, weekStart },
      orderBy: [{ dayOfWeek: "asc" }, { slotOrder: "asc" }],
    });

    if (items.length === 0) {
      const generated = await this.generateAdaptivePlan(userId, {});
      return generated;
    }

    const completedCount = items.filter((i) => i.completed).length;
    return {
      weekStart,
      totalItems: items.length,
      completedCount,
      progressPercent:
        items.length > 0 ? Math.round((completedCount / items.length) * 100) : 0,
      items,
    };
  }

  /**
   * Gera (ou regenera) o Cronograma Semanal Adaptativo cruzando:
   * - Taxa de erro real do aluno em `QuestionAttempt` (prioriza as 3 matérias com mais erros)
   * - Revisões pendentes do SM-2 (`SpacedRepetition`)
   * - Prática semanal de Redação (Oficina Nota 1000) e Mini-Simulado no fim de semana
   */
  async generateAdaptivePlan(
    userId: string,
    input: StudyPlanGenerationInput = {}
  ) {
    const weekStart = getMondayIsoDate();
    const dailyMinutes = Math.min(Math.max(Number(input.dailyMinutes) || 60, 30), 240);
    const slotMinutes = Math.max(20, Math.round(dailyMinutes / 2));

    // 1. Identifica matérias com maior índice de erro do aluno
    const attempts = await prisma.questionAttempt.findMany({
      where: { userId },
      take: 250,
      orderBy: { createdAt: "desc" },
      select: {
        isCorrect: true,
        question: { select: { subject: true, area: true, topic: true } },
      },
    });

    const subjectStats = new Map<
      string,
      { subject: string; area: string; topic: string; total: number; wrong: number }
    >();
    for (const att of attempts) {
      const subj = att.question?.subject || "Matemática";
      const current = subjectStats.get(subj) || {
        subject: subj,
        area: att.question?.area || "Geral",
        topic: att.question?.topic || `Revisão dirigida de ${subj}`,
        total: 0,
        wrong: 0,
      };
      current.total += 1;
      if (!att.isCorrect) current.wrong += 1;
      subjectStats.set(subj, current);
    }

    const prioritizedWeak = Array.from(subjectStats.values())
      .map((s) => ({ ...s, errorRate: s.total > 0 ? s.wrong / s.total : 0.5 }))
      .sort((a, b) => b.errorRate - a.errorRate);

    // 2. Combina fraquezas reais com grade essencial do ENEM
    const subjectQueue: Array<{ subject: string; area: string; topic: string }> = [];
    for (const weak of prioritizedWeak.slice(0, 4)) {
      subjectQueue.push({
        subject: weak.subject,
        area: weak.area,
        topic: weak.topic,
      });
    }
    for (const fallback of DEFAULT_ENEM_POOL) {
      if (!subjectQueue.some((s) => s.subject.toLowerCase() === fallback.subject.toLowerCase())) {
        subjectQueue.push(fallback);
      }
    }

    // 3. Verifica revisões SM-2 pendentes
    const dueSm2Count = await prisma.spacedRepetition.count({
      where: { userId, nextReviewDate: { lte: new Date() } },
    });

    // Monta os blocos de Segunda (1) a Domingo (7)
    const newItems: Array<{
      userId: string;
      dayOfWeek: number;
      slotOrder: number;
      subject: string;
      area: string;
      topic: string;
      durationMinutes: number;
      activityType: string;
      weekStart: string;
    }> = [];

    for (let day = 1; day <= 5; day++) {
      const primary = subjectQueue[(day - 1) % subjectQueue.length];
      const secondary = subjectQueue[(day + 2) % subjectQueue.length];

      newItems.push({
        userId,
        dayOfWeek: day,
        slotOrder: 0,
        subject: primary.subject,
        area: primary.area,
        topic: primary.topic,
        durationMinutes: slotMinutes,
        activityType: day % 2 === 1 ? "LESSON" : "QUESTIONS",
        weekStart,
      });

      newItems.push({
        userId,
        dayOfWeek: day,
        slotOrder: 1,
        subject: dueSm2Count > 0 && day % 2 === 0 ? "Revisão SM-2" : secondary.subject,
        area: dueSm2Count > 0 && day % 2 === 0 ? "Multidisciplinar" : secondary.area,
        topic:
          dueSm2Count > 0 && day % 2 === 0
            ? `Reforço espaçado (${Math.min(dueSm2Count, 10)} questões prioritárias)`
            : `Bateria de 10 questões — ${secondary.topic}`,
        durationMinutes: slotMinutes,
        activityType: dueSm2Count > 0 && day % 2 === 0 ? "SM2" : "QUESTIONS",
        weekStart,
      });
    }

    // Sábado (6): Oficina de Redação Nota 1000 + Revisão
    newItems.push({
      userId,
      dayOfWeek: 6,
      slotOrder: 0,
      subject: "Redação",
      area: "Linguagens",
      topic: "Prática Dissertativa-Argumentativa (Oficina Nota 1000)",
      durationMinutes: Math.max(45, slotMinutes),
      activityType: "ESSAY",
      weekStart,
    });
    newItems.push({
      userId,
      dayOfWeek: 6,
      slotOrder: 1,
      subject: subjectQueue[0].subject,
      area: subjectQueue[0].area,
      topic: `Reforço no maior ponto de atenção: ${subjectQueue[0].subject}`,
      durationMinutes: slotMinutes,
      activityType: "QUESTIONS",
      weekStart,
    });

    // Domingo (7): Mini-Simulado Cronometrado + Análise TRI
    newItems.push({
      userId,
      dayOfWeek: 7,
      slotOrder: 0,
      subject: "Simulado ENEM",
      area: "Todas as Áreas",
      topic: `Simulado Cronometrado + Simulador SISU${input.targetCourse ? ` (${input.targetCourse})` : ""}`,
      durationMinutes: Math.max(45, dailyMinutes),
      activityType: "SIMULADO",
      weekStart,
    });

    await prisma.$transaction(async (tx) => {
      await tx.studyPlanItem.deleteMany({
        where: { userId, weekStart },
      });
      await tx.studyPlanItem.createMany({
        data: newItems,
      });
    });

    const saved = await prisma.studyPlanItem.findMany({
      where: { userId, weekStart },
      orderBy: [{ dayOfWeek: "asc" }, { slotOrder: "asc" }],
    });

    return {
      weekStart,
      totalItems: saved.length,
      completedCount: 0,
      progressPercent: 0,
      prioritizedSubjects: prioritizedWeak.slice(0, 3).map((w) => w.subject),
      items: saved,
    };
  }

  /**
   * Marca ou desmarca um bloco do cronograma como concluído.
   * Ao concluir, credita +20 XP e registra atividade diária na ofensiva.
   */
  async togglePlanItem(itemId: string, userId: string) {
    const existing = await prisma.studyPlanItem.findFirst({
      where: { id: itemId, userId },
    });

    if (!existing) {
      throw new AppError("Bloco do plano de estudos não encontrado.", 404);
    }

    const nextCompleted = !existing.completed;
    const updated = await prisma.studyPlanItem.update({
      where: { id: existing.id },
      data: {
        completed: nextCompleted,
        completedAt: nextCompleted ? new Date() : null,
      },
    });

    let xpAwarded = 0;
    if (nextCompleted) {
      xpAwarded = 20;
      await prisma.user.update({
        where: { id: userId },
        data: { xp: { increment: xpAwarded } },
      });
      await streakService.registerActivity(userId, "STUDY_PLAN").catch(() => {});
    }

    return { item: updated, xpAwarded };
  }

  /**
   * Registra uma sessão de foco concluída (Pomodoro) e credita XP proporcional.
   */
  async recordFocusSession(
    userId: string,
    input: { subject?: string; mode?: string; durationMinutes?: number }
  ) {
    const durationMinutes = Math.min(
      180,
      Math.max(1, Math.round(Number(input.durationMinutes) || 25))
    );
    const mode = String(input.mode || "FOCUS_25").trim();
    const subject = input.subject?.trim() || "Geral";

    const session = await prisma.focusSession.create({
      data: {
        userId,
        subject,
        mode,
        durationMinutes,
      },
    });

    const xpEarned = Math.max(5, Math.round(durationMinutes * 0.8));
    await prisma.user.update({
      where: { id: userId },
      data: { xp: { increment: xpEarned } },
    });
    await streakService.registerActivity(userId, "FOCUS_POMODORO").catch(() => {});

    return { session, xpEarned };
  }

  /**
   * Atualiza as metas diárias e semanais personalizadas de estudo do aluno.
   */
  async updateStudyGoals(
    userId: string,
    input: { dailyStudyGoalMinutes?: number; weeklyStudyGoalMinutes?: number }
  ) {
    const daily =
      input.dailyStudyGoalMinutes !== undefined
        ? Math.min(480, Math.max(15, Math.round(Number(input.dailyStudyGoalMinutes))))
        : undefined;
    const weekly =
      input.weeklyStudyGoalMinutes !== undefined
        ? Math.min(3360, Math.max(60, Math.round(Number(input.weeklyStudyGoalMinutes))))
        : undefined;

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(daily !== undefined ? { dailyStudyGoalMinutes: daily } : {}),
        ...(weekly !== undefined ? { weeklyStudyGoalMinutes: weekly } : {}),
      },
      select: {
        id: true,
        dailyStudyGoalMinutes: true,
        weeklyStudyGoalMinutes: true,
      },
    });

    return updated;
  }

  /**
   * Relatório de Tempo & Rendimento por Hora Estudada:
   * cruza sessões de foco + tempo em questões com a taxa de acertos na semana.
   */
  async getStudyTimeReport(userId: string) {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(now.getTime() - 7 * 86_400_000);

    const [user, sessionsWeek, attemptsWeek] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          dailyStudyGoalMinutes: true,
          weeklyStudyGoalMinutes: true,
        },
      }),
      prisma.focusSession.findMany({
        where: { userId, createdAt: { gte: startOfWeek } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.questionAttempt.findMany({
        where: { userId, createdAt: { gte: startOfWeek } },
        select: { isCorrect: true, timeSpentMs: true, createdAt: true },
      }),
    ]);

    const dailyGoalMinutes = user?.dailyStudyGoalMinutes || 60;
    const weeklyGoalMinutes = user?.weeklyStudyGoalMinutes || 360;

    const focusMinutesToday = sessionsWeek
      .filter((s) => s.createdAt >= startOfToday)
      .reduce((acc, s) => acc + s.durationMinutes, 0);
    const focusMinutesWeek = sessionsWeek.reduce((acc, s) => acc + s.durationMinutes, 0);

    const questionTimeMinutesToday = Math.round(
      attemptsWeek
        .filter((a) => a.createdAt >= startOfToday)
        .reduce((acc, a) => acc + (a.timeSpentMs || 45_000), 0) / 60_000
    );
    const questionTimeMinutesWeek = Math.round(
      attemptsWeek.reduce((acc, a) => acc + (a.timeSpentMs || 45_000), 0) / 60_000
    );

    const totalMinutesToday = focusMinutesToday + questionTimeMinutesToday;
    const totalMinutesWeek = focusMinutesWeek + questionTimeMinutesWeek;

    const totalQuestionsWeek = attemptsWeek.length;
    const correctQuestionsWeek = attemptsWeek.filter((a) => a.isCorrect).length;
    const accuracyPercentWeek =
      totalQuestionsWeek > 0
        ? Math.round((correctQuestionsWeek / totalQuestionsWeek) * 100)
        : 0;

    const hoursStudiedWeek = Math.max(0.25, totalMinutesWeek / 60);
    const questionsPerStudyHour =
      totalMinutesWeek > 0 ? Math.round(totalQuestionsWeek / hoursStudiedWeek) : 0;
    const correctPerStudyHour =
      totalMinutesWeek > 0 ? Math.round(correctQuestionsWeek / hoursStudiedWeek) : 0;

    return {
      dailyGoalMinutes,
      weeklyGoalMinutes,
      focusMinutesToday,
      focusMinutesWeek,
      totalMinutesToday,
      totalMinutesWeek,
      dailyProgressPercent: Math.min(
        100,
        Math.round((totalMinutesToday / Math.max(1, dailyGoalMinutes)) * 100)
      ),
      weeklyProgressPercent: Math.min(
        100,
        Math.round((totalMinutesWeek / Math.max(1, weeklyGoalMinutes)) * 100)
      ),
      sessionsCountWeek: sessionsWeek.length,
      totalQuestionsWeek,
      correctQuestionsWeek,
      accuracyPercentWeek,
      questionsPerStudyHour,
      correctPerStudyHour,
    };
  }
}

export const studyPlanService = new StudyPlanService();

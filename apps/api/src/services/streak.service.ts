import {
  StreakSchema,
  StreakActivityInputSchema,
  StreakLoginVerificationSchema,
  type Streak,
  type StreakActivityInput,
  type StreakLoginVerification,
} from "@minuto-enem/shared";
import { prisma } from "../lib/prisma";
import { AppError } from "../errors/AppError";

export {
  StreakSchema,
  StreakActivityInputSchema,
  StreakLoginVerificationSchema,
  type Streak,
  type StreakActivityInput,
  type StreakLoginVerification,
} from "@minuto-enem/shared";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function startOfDayUTC(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
}

function getDaysDifference(dateA: Date, dateB: Date): number {
  const startA = startOfDayUTC(dateA).getTime();
  const startB = startOfDayUTC(dateB).getTime();
  return Math.floor((startA - startB) / MS_PER_DAY);
}

export class StreakService {
  /**
   * Regra de Atividade (Conclusão de Aula, Tarefa ou Resolução de Questão):
   * - Se o aluno ainda NÃO teve ofensiva contabilizada hoje:
   *   - Incrementa o `currentStreak` em 1
   *   - Reseta o `iceFreezes` para 0
   *   - Atualiza o `longestStreak` se a ofensiva atual o superar
   *   - Define o `lastStudyDate` para a data/hora de hoje
   * - Se o aluno JÁ estudou hoje (mesmo dia civil):
   *   - Mantém o `currentStreak` atual sem duplicar para cada nova atividade feita no dia
   *   - Atualiza apenas o `lastStudyDate` e preserva o `StreakLog` diário como COMPLETED
   */
  async registerActivity(userId: string, activityType = "STUDY_ACTIVITY") {
    if (!userId) {
      throw new AppError("O ID do usuário é obrigatório.", 400);
    }

    return prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new AppError("Usuário não encontrado.", 404);
      }

      const now = new Date();
      const todayDate = startOfDayUTC(now);

      const existingTodayLog = await tx.streakLog.findUnique({
        where: {
          userId_date: {
            userId,
            date: todayDate,
          },
        },
      });

      const studiedSameDayByDate =
        Boolean(user.lastStudyDate) &&
        getDaysDifference(now, user.lastStudyDate!) === 0 &&
        user.currentStreak > 0;

      const alreadyCompletedToday =
        existingTodayLog?.status === "COMPLETED" || studiedSameDayByDate;

      const newCurrentStreak = alreadyCompletedToday
        ? Math.max(user.currentStreak, 1)
        : user.currentStreak + 1;
      const newLongestStreak = Math.max(newCurrentStreak, user.longestStreak);

      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: {
          currentStreak: newCurrentStreak,
          iceFreezes: 0,
          longestStreak: newLongestStreak,
          lastStudyDate: now,
        },
        select: {
          id: true,
          currentStreak: true,
          longestStreak: true,
          iceFreezes: true,
          lastStudyDate: true,
          xp: true,
        },
      });

      // Registra/atualiza a atividade no histórico relacional de ofensiva (StreakLog)
      await tx.streakLog
        .upsert({
          where: {
            userId_date: {
              userId,
              date: todayDate,
            },
          },
          create: {
            userId,
            date: todayDate,
            status: "COMPLETED",
            streakCount: newCurrentStreak,
            iceFreezesLeft: 0,
            activityType,
          },
          update: {
            status: "COMPLETED",
            streakCount: newCurrentStreak,
            iceFreezesLeft: 0,
            activityType,
          },
        })
        .catch(() => null);

      return {
        ...updatedUser,
        streakIncremented: !alreadyCompletedToday,
        alreadyCompletedToday,
        message: alreadyCompletedToday
          ? "Atividade registrada! A ofensiva de hoje já estava contabilizada."
          : "Atividade registrada! Ofensiva incrementada e iceFreezes zerado.",
      };
    });
  }

  /**
   * Alias de compatibilidade para conclusão de aula
   */
  async completeLesson(userId: string) {
    return this.registerActivity(userId);
  }

  /**
   * Regra de Inatividade (Verificação no Login):
   * - Se o usuário não estudou no dia anterior (`diffInDays > 1`),
   *   incrementa o `iceFreezes` em 1.
   * - Se o `iceFreezes` for maior que 2 (`newIceFreezes > 2`),
   *   reseta o `currentStreak` para 0.
   */
  async verifyStreakOnLogin(userId: string) {
    if (!userId) {
      throw new AppError("O ID do usuário é obrigatório.", 400);
    }

    return prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new AppError("Usuário não encontrado.", 404);
      }

      // Se o usuário nunca estudou antes, mantém o estado inicial
      if (!user.lastStudyDate) {
        return {
          id: user.id,
          currentStreak: user.currentStreak,
          longestStreak: user.longestStreak,
          iceFreezes: user.iceFreezes,
          lastStudyDate: user.lastStudyDate,
          missedDays: 0,
          iceFreezesUsed: 0,
          streakReset: false,
        };
      }

      const today = new Date();
      const diffInDays = getDaysDifference(today, user.lastStudyDate);

      // Estudou hoje (0) ou estudou ontem (1): manteve a atividade em dia
      if (diffInDays <= 1) {
        return {
          id: user.id,
          currentStreak: user.currentStreak,
          longestStreak: user.longestStreak,
          iceFreezes: user.iceFreezes,
          lastStudyDate: user.lastStudyDate,
          missedDays: 0,
          iceFreezesUsed: 0,
          streakReset: false,
        };
      }

      // Não estudou no dia anterior: incrementa iceFreezes em 1
      const newIceFreezes = user.iceFreezes + 1;
      const shouldResetStreak = newIceFreezes > 2;
      const newCurrentStreak = shouldResetStreak ? 0 : user.currentStreak;

      const updatedUser = await tx.user.update({
        where: { id: userId },
        data: {
          iceFreezes: newIceFreezes,
          currentStreak: newCurrentStreak,
        },
        select: {
          id: true,
          currentStreak: true,
          longestStreak: true,
          iceFreezes: true,
          lastStudyDate: true,
        },
      });

      // Registra o status de congelamento / quebra no histórico (StreakLog)
      const yesterday = new Date(today);
      yesterday.setDate(today.getDate() - 1);
      const freezeDate = startOfDayUTC(yesterday);

      await tx.streakLog
        .upsert({
          where: {
            userId_date: {
              userId,
              date: freezeDate,
            },
          },
          create: {
            userId,
            date: freezeDate,
            status: shouldResetStreak ? "BROKEN" : "FROZEN",
            streakCount: newCurrentStreak,
            iceFreezesLeft: newIceFreezes,
            activityType: "LOGIN_VERIFICATION",
          },
          update: {
            status: shouldResetStreak ? "BROKEN" : "FROZEN",
            streakCount: newCurrentStreak,
            iceFreezesLeft: newIceFreezes,
            activityType: "LOGIN_VERIFICATION",
          },
        })
        .catch(() => null);

      return {
        ...updatedUser,
        missedDays: diffInDays - 1,
        iceFreezesUsed: 1,
        streakReset: shouldResetStreak,
      };
    });
  }

  /**
   * Retorna os dados da ofensiva do usuário e o status de cada dia da semana corrente
   * consultando o histórico relacional `StreakLog`.
   */
  async getWeeklyStreak(userId: string) {
    if (!userId) {
      throw new AppError("O ID do usuário é obrigatório.", 400);
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        currentStreak: true,
        longestStreak: true,
        iceFreezes: true,
        lastStudyDate: true,
        xp: true,
      },
    });

    if (!user) {
      throw new AppError("Usuário não encontrado.", 404);
    }

    const today = new Date();
    const currentDayOfWeek = today.getDay(); // 0 = Domingo
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - currentDayOfWeek);
    startOfWeek.setHours(0, 0, 0, 0);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    const streakLogs = await prisma.streakLog.findMany({
      where: {
        userId,
        date: {
          gte: startOfWeek,
          lte: endOfWeek,
        },
      },
    });

    const logMap = new Map(
      streakLogs.map((log) => [
        log.date.toISOString().split("T")[0],
        log.status,
      ])
    );

    const labels = ["D", "S", "T", "Q", "Q", "S", "S"];
    const todayStr = today.toISOString().split("T")[0];

    const weekDays = labels.map((label, index) => {
      const cellDate = new Date(startOfWeek);
      cellDate.setDate(startOfWeek.getDate() + index);
      const dateStr = cellDate.toISOString().split("T")[0];

      const isToday = dateStr === todayStr;
      const isFuture = cellDate.getTime() > today.getTime() && !isToday;
      const recorded = logMap.get(dateStr);

      let status = "EMPTY";
      if (recorded === "COMPLETED") {
        status = "COMPLETED";
      } else if (recorded === "FROZEN") {
        status = "FROZEN";
      } else if (isFuture) {
        status = "FUTURE";
      }

      return {
        date: dateStr,
        label,
        status,
        isToday,
      };
    });

    return {
      currentStreak: user.currentStreak,
      longestStreak: user.longestStreak,
      iceFreezes: user.iceFreezes,
      lastStudyDate: user.lastStudyDate,
      xp: user.xp,
      weekDays,
    };
  }

  /**
   * Job Diário (Cron) para processar a regra de inatividade de todos os usuários:
   * - Verifica quem não estudou no dia anterior
   * - Incrementa `iceFreezes` em 1 e, se `iceFreezes > 2`, reseta `currentStreak` para 0
   */
  async processDailyInactivityJob() {
    const today = new Date();
    const users = await prisma.user.findMany({
      where: {
        lastStudyDate: { not: null },
      },
    });

    for (const user of users) {
      if (!user.lastStudyDate) continue;

      const diffInDays = getDaysDifference(today, user.lastStudyDate);
      if (diffInDays > 1) {
        const newIceFreezes = user.iceFreezes + 1;
        const newCurrentStreak = newIceFreezes > 2 ? 0 : user.currentStreak;

        await prisma.user.update({
          where: { id: user.id },
          data: {
            iceFreezes: newIceFreezes,
            currentStreak: newCurrentStreak,
          },
        });
      }
    }
  }
}

export const streakService = new StreakService();

import {
  type SyncAction,
  type StudentUpdatedState,
  SyncActionSchema,
} from "@minuto-enem/shared";
import { prisma } from "../lib/prisma";
import { streakService } from "./streak.service";
import { triService } from "./tri.service";
import { AppError } from "../errors/AppError";

export class SyncService {
  /**
   * Processa em lote (`batch`) as ações realizadas offline pelo estudante no aplicativo.
   * Garante idempotência através da tabela `OfflineSyncLog` e do `idempotencyKey` de cada ação,
   * executando tudo de forma atômica em uma transação do Prisma e retornando o estado consolidado.
   */
  async processBatchSync(
    userId: string,
    actions: SyncAction[]
  ): Promise<StudentUpdatedState> {
    if (!userId) {
      throw new AppError("O ID do estudante autenticado é obrigatório.", 401);
    }

    if (!Array.isArray(actions) || actions.length === 0) {
      throw new AppError(
        "O lote de sincronização deve conter pelo menos uma ação válida.",
        400
      );
    }

    // 1. Verifica a existência do estudante
    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!existingUser) {
      throw new AppError("Estudante não encontrado no banco de dados.", 404);
    }

    // 2. Coleta as chaves de idempotência para evitar reprocessamento duplicado
    const idempotencyKeys = actions.map((a) => a.idempotencyKey);
    const existingLogs = await prisma.offlineSyncLog.findMany({
      where: {
        idempotencyKey: { in: idempotencyKeys },
      },
      select: { idempotencyKey: true },
    });

    const existingKeysSet = new Set(existingLogs.map((l) => l.idempotencyKey));

    const actionsToProcess: SyncAction[] = [];
    let skippedActionsCount = 0;

    for (const action of actions) {
      if (existingKeysSet.has(action.idempotencyKey)) {
        skippedActionsCount++;
      } else {
        actionsToProcess.push(action);
      }
    }

    let hasStudyActivity = false;

    // 3. Execução Atômica via Prisma Transaction
    if (actionsToProcess.length > 0) {
      await prisma.$transaction(async (tx) => {
        for (const action of actionsToProcess) {
          switch (action.type) {
            case "QUESTION_ATTEMPT": {
              const { questionId, selectedAnswer, timeSpentMs, answeredAt } =
                action.payload;

              const question = await tx.question.findUnique({
                where: { id: questionId },
                select: { id: true, correctAnswer: true, errorRate: true },
              });

              if (question) {
                const isCorrect =
                  Number(selectedAnswer) === Number(question.correctAnswer);
                const xpEarned = isCorrect ? 20 : 5;
                const clientDate = answeredAt ? new Date(answeredAt) : new Date();

                // Cria o log de sincronização offline idempotente
                const syncLog = await tx.offlineSyncLog.create({
                  data: {
                    idempotencyKey: action.idempotencyKey,
                    userId,
                    status: "SYNCED",
                    itemsCount: 1,
                    clientAnsweredAt: clientDate,
                    payload: action as any,
                  },
                });

                // Cria a tentativa da questão vinculada ao log
                await tx.questionAttempt.create({
                  data: {
                    userId,
                    questionId,
                    selectedAnswer: Number(selectedAnswer),
                    isCorrect,
                    timeSpentMs: timeSpentMs ?? 15000,
                    xpEarned,
                    source: "OFFLINE_SYNC",
                    offlineSyncLogId: syncLog.id,
                    createdAt: clientDate,
                  },
                });

                // Atualiza o XP do estudante
                await tx.user.update({
                  where: { id: userId },
                  data: { xp: { increment: xpEarned } },
                });

                // Atualiza dinamicamente a taxa de erro da questão (errorRate)
                const currentError = question.errorRate ?? 50;
                const newError = isCorrect
                  ? Math.max(5, currentError - 0.5)
                  : Math.min(95, currentError + 0.8);

                await tx.question.update({
                  where: { id: questionId },
                  data: { errorRate: Number(newError.toFixed(2)) },
                });

                hasStudyActivity = true;
              } else {
                // Registra log para não reprocessar questão inexistente
                await tx.offlineSyncLog.create({
                  data: {
                    idempotencyKey: action.idempotencyKey,
                    userId,
                    status: "FAILED",
                    errorMessage: `Questão ${questionId} não encontrada.`,
                    payload: action as any,
                  },
                });
              }
              break;
            }

            case "LESSON_PROGRESS": {
              const { lessonId, trailId } = action.payload;

              // Registra log de sincronização
              await tx.offlineSyncLog.create({
                data: {
                  idempotencyKey: action.idempotencyKey,
                  userId,
                  status: "SYNCED",
                  itemsCount: 1,
                  payload: action as any,
                },
              });

              if (trailId) {
                const existingProgress = await tx.trailProgress.findUnique({
                  where: { userId_trailId: { userId, trailId } },
                });

                const completedLessonIds = Array.from(
                  new Set([
                    ...(existingProgress?.completedLessonIds || []),
                    lessonId,
                  ])
                );

                const trail = await tx.trail.findUnique({
                  where: { id: trailId },
                  select: { totalSteps: true, lessonIds: true },
                });

                const totalSteps =
                  trail?.totalSteps || trail?.lessonIds?.length || 1;
                const progressPercent = Math.min(
                  100,
                  Number(
                    ((completedLessonIds.length / totalSteps) * 100).toFixed(1)
                  )
                );
                const status =
                  progressPercent >= 100 ? "COMPLETED" : "IN_PROGRESS";

                await tx.trailProgress.upsert({
                  where: { userId_trailId: { userId, trailId } },
                  create: {
                    userId,
                    trailId,
                    completedSteps: completedLessonIds.length,
                    completedLessonIds,
                    progressPercent,
                    status,
                  },
                  update: {
                    completedSteps: completedLessonIds.length,
                    completedLessonIds,
                    progressPercent,
                    status,
                  },
                });
              }

              // Concede bônus de XP pelo avanço na lição
              await tx.user.update({
                where: { id: userId },
                data: { xp: { increment: 30 } },
              });

              hasStudyActivity = true;
              break;
            }

            case "NOTE_UPSERT": {
              const { id, title, content, tags, lessonId, updatedAt } =
                action.payload;

              await tx.offlineSyncLog.create({
                data: {
                  idempotencyKey: action.idempotencyKey,
                  userId,
                  status: "SYNCED",
                  itemsCount: 1,
                  payload: action as any,
                },
              });

              if (id) {
                const noteExists = await tx.note.findFirst({
                  where: { id, userId },
                });

                if (noteExists) {
                  await tx.note.update({
                    where: { id },
                    data: {
                      title,
                      content: content || "",
                      tags: tags || [],
                      lessonId: lessonId || null,
                      updatedAt: updatedAt ? new Date(updatedAt) : new Date(),
                    },
                  });
                } else {
                  await tx.note.create({
                    data: {
                      id,
                      userId,
                      title,
                      content: content || "",
                      tags: tags || [],
                      lessonId: lessonId || null,
                      updatedAt: updatedAt ? new Date(updatedAt) : new Date(),
                    },
                  });
                }
              } else {
                await tx.note.create({
                  data: {
                    userId,
                    title,
                    content: content || "",
                    tags: tags || [],
                    lessonId: lessonId || null,
                  },
                });
              }
              break;
            }

            case "NOTE_DELETE": {
              const { noteId } = action.payload;

              await tx.offlineSyncLog.create({
                data: {
                  idempotencyKey: action.idempotencyKey,
                  userId,
                  status: "SYNCED",
                  itemsCount: 1,
                  payload: action as any,
                },
              });

              await tx.note.deleteMany({
                where: {
                  id: noteId,
                  userId,
                },
              });
              break;
            }
          }
        }
      });
    }

    // 4. Se houve resolução de questões ou aulas, atualiza a ofensiva do aluno
    if (hasStudyActivity) {
      await streakService.registerActivity(userId).catch(() => null);
    }

    // 5. Coleta o estado mais atualizado do estudante
    const updatedUser = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        xp: true,
        currentStreak: true,
        longestStreak: true,
        iceFreezes: true,
        lastStudyDate: true,
      },
    });

    if (!updatedUser) {
      throw new AppError("Erro ao recuperar perfil atualizado.", 500);
    }

    // Busca anotações do aluno
    const notes = await prisma.note.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      take: 50,
    });

    // Calcula estatísticas reais de desempenho do aluno
    const totalAttempts = await prisma.questionAttempt.count({
      where: { userId },
    });

    const correctAttempts = await prisma.questionAttempt.count({
      where: { userId, isCorrect: true },
    });

    const accuracyRate =
      totalAttempts > 0
        ? Number(((correctAttempts / totalAttempts) * 100).toFixed(1))
        : 0;

    // Simula a nota TRI baseada nas últimas tentativas do aluno
    const recentAttempts = await prisma.questionAttempt.findMany({
      where: { userId },
      take: 15,
      orderBy: { createdAt: "desc" },
      select: {
        questionId: true,
        selectedAnswer: true,
        isCorrect: true,
      },
    });

    let simulatedTriScore: number | null = null;
    if (recentAttempts.length > 0) {
      try {
        const triResult = await triService.simulateTriScore(recentAttempts);
        simulatedTriScore = triResult.triScore;
      } catch {
        simulatedTriScore = null;
      }
    }

    return {
      user: updatedUser,
      streak: {
        currentStreak: updatedUser.currentStreak,
        longestStreak: updatedUser.longestStreak,
        iceFreezes: updatedUser.iceFreezes,
        lastStudyDate: updatedUser.lastStudyDate,
      },
      triScore: simulatedTriScore,
      stats: {
        totalAttempts,
        correctAttempts,
        accuracyRate,
      },
      notes: notes.map((n) => ({
        id: n.id,
        title: n.title,
        content: n.content,
        tags: n.tags,
        lessonId: n.lessonId,
        userId: n.userId,
        createdAt: n.createdAt,
        updatedAt: n.updatedAt,
      })),
      processedActions: actionsToProcess.length,
      skippedActions: skippedActionsCount,
      syncedAt: new Date().toISOString(),
    };
  }
}

export const syncService = new SyncService();


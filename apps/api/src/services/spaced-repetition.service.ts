import { prisma } from "../lib/prisma";
import { AppError } from "../errors/AppError";
import { streakService } from "./streak.service";
import { triService } from "./tri.service";

export interface SM2ReviewInput {
  userId: string;
  questionId: string;
  grade?: number | null; // 0 a 5 (escala oficial SuperMemo-2)
  isCorrect?: boolean | null; // alternativo para grade
  timeSpentMs?: number | null;
  selectedAnswer?: number | null;
}

export interface SM2CalculationResult {
  repetitions: number;
  interval: number;
  easinessFactor: number;
  nextReviewDate: Date;
  quality: number;
}

export interface SpacedRepetitionReviewItem {
  id: string;
  questionId: string;
  interval: number;
  repetitions: number;
  easinessFactor: number;
  nextReviewDate: Date;
  lastReviewedAt: Date | null;
  question: {
    id: string;
    year: number;
    area: string;
    subject: string;
    topic: string | null;
    difficulty: string | null;
    text: string;
    options: unknown;
    correctAnswer: number;
    explanation: string | null;
    errorRate: number | null;
    subjectRef?: { id: string; name: string; slug: string; icon: string } | null;
    topicRef?: { id: string; name: string; slug: string } | null;
  };
  triMetrics?: any;
}

export class SpacedRepetitionService {
  /**
   * Classifica a qualidade da resposta do aluno em uma escala de 0 a 5:
   * 0: "Errou feio" / blecaute total / chute imediato (< 4 segundos)
   * 1: Errou após tentativa consciente
   * 2: Errou, mas com resposta próxima / hesitação severa
   * 3: Acertou com bastante dificuldade / hesitação prolongada (> 40 segundos)
   * 4: Acertou com esforço moderado / tempo razoável (15 a 40 segundos)
   * 5: Acertou com facilidade / resposta rápida e segura (< 15 segundos)
   */
  classifyQuality({
    isCorrect,
    timeSpentMs,
    grade,
  }: {
    isCorrect?: boolean | null;
    timeSpentMs?: number | null;
    grade?: number | null;
  }): number {
    // Se a nota foi fornecida explicitamente (0 a 5), valida e respeita a escolha
    if (grade !== undefined && grade !== null && !Number.isNaN(Number(grade))) {
      return Math.max(0, Math.min(5, Math.round(Number(grade))));
    }

    // Se o aluno errou a questão
    if (isCorrect === false) {
      // Se errou em menos de 4 segundos, chutou sem ler -> 0 ("Errou feio")
      if (timeSpentMs && timeSpentMs < 4000) {
        return 0;
      }
      return 1;
    }

    // Se o aluno acertou a questão
    if (!timeSpentMs || timeSpentMs <= 15000) {
      return 5; // Acertou com extrema facilidade (< 15s)
    }

    if (timeSpentMs <= 40000) {
      return 4; // Acertou com facilidade normal (15s a 40s)
    }

    // Acertou, mas levou mais de 40 segundos refletindo/hesitando
    return 3;
  }

  /**
   * Implementação estrita do Algoritmo SuperMemo-2 (SM-2):
   * 1. Atualização do Fator de Facilidade:
   *    EF' = EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
   *    Piso mínimo: EF' >= 1.3
   * 2. Intervalo em dias:
   *    - q < 3 (falha): repetitions = 0, interval = 1
   *    - q >= 3 (sucesso):
   *      - se repetitions == 0 -> interval = 1
   *      - se repetitions == 1 -> interval = 6
   *      - se repetitions >= 2 -> interval = round(interval * EF')
   *      repetitions = repetitions + 1
   * 3. Nova data de revisão:
   *    nextReviewDate = now + interval (dias)
   */
  calculateSM2(
    currentRepetitions: number,
    currentInterval: number,
    currentEaseFactor: number,
    quality: number
  ): SM2CalculationResult {
    const q = Math.max(0, Math.min(5, Math.round(quality)));

    // 1. Atualização do Fator de Facilidade (EF)
    let newEaseFactor =
      currentEaseFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));

    // Piso mínimo definido pelo criador do algoritmo SM-2 (P. Wozniak)
    if (newEaseFactor < 1.3) {
      newEaseFactor = 1.3;
    }

    newEaseFactor = Number(newEaseFactor.toFixed(4));

    let newRepetitions: number;
    let newInterval: number;

    // 2. Cálculo do Intervalo (em dias) e Repetições Consecutivas
    if (q >= 3) {
      // Sucesso na recordação
      if (currentRepetitions === 0) {
        newInterval = 1;
      } else if (currentRepetitions === 1) {
        newInterval = 6;
      } else {
        newInterval = Math.round(
          Math.max(currentInterval, 1) * newEaseFactor
        );
      }
      newRepetitions = currentRepetitions + 1;
    } else {
      // Falha na recordação: zera as repetições e revisa no dia seguinte
      newRepetitions = 0;
      newInterval = 1;
    }

    const nextReviewDate = new Date();
    nextReviewDate.setDate(nextReviewDate.getDate() + newInterval);
    nextReviewDate.setHours(4, 0, 0, 0); // Define a revisão para o início da madrugada do dia previsto

    return {
      repetitions: newRepetitions,
      interval: newInterval,
      easinessFactor: newEaseFactor,
      nextReviewDate,
      quality: q,
    };
  }

  /**
   * Processa a resposta de uma questão (livre, tarefa ou revisão) atualizando
   * o model SpacedRepetition no banco com base no SM-2.
   */
  async processAnswer(input: SM2ReviewInput) {
    const { userId, questionId, isCorrect, timeSpentMs, grade } = input;

    if (!userId || !questionId) {
      throw new AppError("userId e questionId são obrigatórios.", 400);
    }

    // 1. Classifica a qualidade da resposta de 0 a 5
    const quality = this.classifyQuality({ isCorrect, timeSpentMs, grade });

    // 2. Busca registro atual de repetição espaçada
    const existing = await prisma.spacedRepetition.findUnique({
      where: {
        userId_questionId: { userId, questionId },
      },
      include: {
        question: { select: { subjectId: true } },
      },
    });

    const currentRep = existing?.repetitions ?? 0;
    const currentInt = existing?.interval ?? 0;
    const currentEF = existing?.easinessFactor ?? 2.5;

    // 3. Executa o algoritmo SM-2
    const sm2Result = this.calculateSM2(
      currentRep,
      currentInt,
      currentEF,
      quality
    );

    // Identifica o subjectId da questão caso ainda não esteja associado
    let subjectId = existing?.subjectId;
    if (!subjectId) {
      const qData = await prisma.question.findUnique({
        where: { id: questionId },
        select: { subjectId: true },
      });
      subjectId = qData?.subjectId || null;
    }

    const now = new Date();

    // 4. Salva ou atualiza o registro no model SpacedRepetition
    const spacedRecord = await prisma.spacedRepetition.upsert({
      where: {
        userId_questionId: { userId, questionId },
      },
      create: {
        userId,
        questionId,
        subjectId,
        interval: sm2Result.interval,
        repetitions: sm2Result.repetitions,
        easinessFactor: sm2Result.easinessFactor,
        nextReviewDate: sm2Result.nextReviewDate,
        lastReviewedAt: now,
      },
      update: {
        interval: sm2Result.interval,
        repetitions: sm2Result.repetitions,
        easinessFactor: sm2Result.easinessFactor,
        nextReviewDate: sm2Result.nextReviewDate,
        lastReviewedAt: now,
      },
      include: {
        question: {
          select: { id: true, subject: true, area: true, errorRate: true },
        },
      },
    });

    // 5. Mantém sincronia no model legado FlashcardReview
    await prisma.flashcardReview
      .upsert({
        where: {
          userId_questionId: { userId, questionId },
        },
        create: {
          userId,
          questionId,
          repetition: sm2Result.repetitions,
          interval: sm2Result.interval,
          easeFactor: sm2Result.easinessFactor,
          nextReviewDate: sm2Result.nextReviewDate,
          lastReviewedAt: now,
        },
        update: {
          repetition: sm2Result.repetitions,
          interval: sm2Result.interval,
          easeFactor: sm2Result.easinessFactor,
          nextReviewDate: sm2Result.nextReviewDate,
          lastReviewedAt: now,
        },
      })
      .catch(() => null);

    // 6. Registra atividade para streak
    await streakService.registerActivity(userId).catch(() => null);

    const feedbackMessage =
      sm2Result.repetitions > 0
        ? `Excelente! Próxima revisão agendada para daqui a ${sm2Result.interval} dia(s).`
        : "Revisão agendada para amanhã para reforçar o aprendizado.";

    return {
      message: feedbackMessage,
      sm2: sm2Result,
      record: spacedRecord,
    };
  }

  /**
   * Mantém retrocompatibilidade com chamadas de reviewCard
   */
  async reviewCard(input: SM2ReviewInput) {
    return this.processAnswer(input);
  }

  /**
   * Alias de compatibilidade com chamadas legadas de getDueFlashcards
   */
  async getDueFlashcards(userId: string, limit: number = 20) {
    const result = await this.getTodayReviews(userId, limit);
    return {
      dueCount: result.count,
      cards: result.reviews,
    };
  }

  /**
   * Alias de compatibilidade com syncMistakesToSpacedRepetition
   */
  async syncMistakesToFlashcards(userId: string): Promise<number> {
    return this.syncMistakesToSpacedRepetition(userId);
  }

  /**
   * Sincroniza questões que o aluno errou para dentro do SpacedRepetition,
   * disponibilizando-as para revisão imediata caso ainda não estejam na trilha.
   */
  async syncMistakesToSpacedRepetition(userId: string): Promise<number> {
    if (!userId) return 0;

    const wrongAttempts = await prisma.questionAttempt.findMany({
      where: {
        userId,
        isCorrect: false,
      },
      select: {
        questionId: true,
        question: { select: { subjectId: true } },
      },
      distinct: ["questionId"],
    });

    if (wrongAttempts.length === 0) return 0;

    const existingRecords = await prisma.spacedRepetition.findMany({
      where: { userId },
      select: { questionId: true },
    });

    const existingSet = new Set(existingRecords.map((r) => r.questionId));
    const newItems = wrongAttempts.filter((a) => !existingSet.has(a.questionId));

    if (newItems.length === 0) return 0;

    await prisma.spacedRepetition.createMany({
      data: newItems.map((item) => ({
        userId,
        questionId: item.questionId,
        subjectId: item.question?.subjectId || null,
        interval: 0,
        repetitions: 0,
        easinessFactor: 2.5,
        nextReviewDate: new Date(), // Pronto para revisão hoje
      })),
      skipDuplicates: true,
    });

    return newItems.length;
  }

  /**
   * Endpoint de Feed Diário:
   * Retorna até 20 questões programadas para revisão hoje (`nextReviewDate <= now`).
   */
  async getTodayReviews(
    userId: string,
    limit: number = 20
  ): Promise<{
    date: string;
    totalDue: number;
    count: number;
    reviews: SpacedRepetitionReviewItem[];
  }> {
    if (!userId) {
      throw new AppError("O ID do usuário é obrigatório.", 400);
    }

    // 1. Sincroniza erros pendentes para garantir que o aluno tenha revisões inteligentes
    await this.syncMistakesToSpacedRepetition(userId).catch(() => 0);

    // Considera o fim do dia atual (23:59:59) para abranger todas as revisões agendadas para hoje
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 20);

    // 2. Consulta o total devido hoje
    const totalDue = await prisma.spacedRepetition.count({
      where: {
        userId,
        nextReviewDate: { lte: endOfToday },
      },
    });

    // 3. Busca até 20 questões priorizando as mais atrasadas
    const dueRecords = await prisma.spacedRepetition.findMany({
      where: {
        userId,
        nextReviewDate: { lte: endOfToday },
      },
      include: {
        question: {
          include: {
            subjectRef: {
              select: { id: true, name: true, slug: true, icon: true },
            },
            topicRef: {
              select: { id: true, name: true, slug: true },
            },
          },
        },
      },
      orderBy: { nextReviewDate: "asc" },
      take: safeLimit,
    });

    // 4. Formata os itens com métricas pedagógicas TRI
    const reviews: SpacedRepetitionReviewItem[] = dueRecords.map((r) => {
      const triMetrics = triService.calculateQuestionWeight(
        r.question.errorRate,
        r.question.id
      );

      return {
        id: r.id,
        questionId: r.questionId,
        interval: r.interval,
        repetitions: r.repetitions,
        easinessFactor: r.easinessFactor,
        nextReviewDate: r.nextReviewDate,
        lastReviewedAt: r.lastReviewedAt,
        question: {
          id: r.question.id,
          year: r.question.year,
          area: r.question.area,
          subject: r.question.subject,
          topic: r.question.topic,
          difficulty: r.question.difficulty,
          text: r.question.text,
          options: r.question.options,
          correctAnswer: r.question.correctAnswer,
          explanation: r.question.explanation,
          errorRate: r.question.errorRate,
          subjectRef: r.question.subjectRef,
          topicRef: r.question.topicRef,
        },
        triMetrics,
      };
    });

    return {
      date: new Date().toISOString(),
      totalDue,
      count: reviews.length,
      reviews,
    };
  }

  /**
   * Métricas de retenção e resumo de revisão espaçada do aluno
   */
  async getStudentStats(userId: string) {
    if (!userId) {
      throw new AppError("O ID do usuário é obrigatório.", 400);
    }

    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    const [totalCards, dueToday, masteredCards] = await Promise.all([
      prisma.spacedRepetition.count({ where: { userId } }),
      prisma.spacedRepetition.count({
        where: {
          userId,
          nextReviewDate: { lte: endOfToday },
        },
      }),
      prisma.spacedRepetition.count({
        where: {
          userId,
          repetitions: { gte: 3 },
        },
      }),
    ]);

    const learningCards = Math.max(0, totalCards - masteredCards);

    return {
      userId,
      totalCards,
      dueToday,
      masteredCards,
      learningCards,
      retentionRatePercent:
        totalCards > 0
          ? Number(((masteredCards / totalCards) * 100).toFixed(1))
          : 0,
    };
  }
}

export const spacedRepetitionService = new SpacedRepetitionService();

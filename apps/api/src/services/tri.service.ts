import {
  TriItemMetricsSchema,
  TriSimulationAnswerInputSchema,
  type TriItemMetrics,
  type TriSimulationAnswerInput,
} from "@minuto-enem/shared";
import { prisma } from "../lib/prisma";
import { AppError } from "../errors/AppError";

export {
  TriItemMetricsSchema,
  TriSimulationAnswerInputSchema,
  type TriItemMetrics,
  type TriSimulationAnswerInput,
} from "@minuto-enem/shared";

export class TriService {
  /**
   * Calcula o peso dinâmico e os parâmetros psicométricos da questão
   * com base na coluna `errorRate` (adicionada na migration `20260823230342_add_error_rate`).
   *
   * Na TRI do ENEM:
   * - Questões com menor taxa de erro (fáceis) possuem maior peso de consistência basal.
   * - Questões com maior taxa de erro (difíceis) elevam o teto de proficiência, mas
   *   são ponderadas pela coerência pedagógica do aluno.
   */
  calculateQuestionWeight(
    errorRateInput: number | null | undefined,
    questionId?: string
  ): TriItemMetrics {
    // Fallback neutro (50%) caso alguma questão não tenha errorRate preenchido
    const clampedErrorRate = Math.min(
      Math.max(Number(errorRateInput ?? 50), 5),
      95
    );
    const successRate = Number((100 - clampedErrorRate).toFixed(2));

    // Parâmetro de dificuldade b (escala logit [-3, +3])
    const pError = clampedErrorRate / 100;
    const rawLogit = Math.log(pError / (1 - pError));
    const difficultyLogitB = Number(
      Math.max(Math.min(rawLogit, 3), -3).toFixed(4)
    );

    let difficultyTier: "EASY" | "MEDIUM" | "HARD" = "MEDIUM";
    if (clampedErrorRate < 45) {
      difficultyTier = "EASY";
    } else if (clampedErrorRate > 70) {
      difficultyTier = "HARD";
    }

    // Peso dinâmico: itens mais acessíveis têm maior peso estrutural na coerência (1.0 a 1.95)
    const dynamicWeight = Number((1 + (100 - clampedErrorRate) / 100).toFixed(4));

    // Pontuação base de referência na escala ENEM para o item
    const basePoints = Number((dynamicWeight * 25).toFixed(2));

    return {
      ...(questionId ? { questionId } : {}),
      errorRate: clampedErrorRate,
      successRate,
      difficultyTier,
      difficultyLogitB,
      dynamicWeight,
      basePoints,
    };
  }

  /**
   * Simula a nota TRI (escala 300 a 1000 do ENEM) para uma bateria de respostas,
   * aplicando o cálculo de coerência pedagógica (penalização de provável chute em itens
   * de alta `errorRate` quando o aluno erra itens de baixa `errorRate`).
   */
  async simulateTriScore(answers: TriSimulationAnswerInput[]) {
    if (!Array.isArray(answers) || answers.length === 0) {
      throw new AppError(
        "Envie ao menos uma resposta para calcular a simulação TRI.",
        400
      );
    }

    const questionIds = answers.map((a) => a.questionId);
    const questions = await prisma.question.findMany({
      where: { id: { in: questionIds } },
      select: {
        id: true,
        errorRate: true,
        correctAnswer: true,
        area: true,
        subject: true,
      },
    });

    if (questions.length === 0) {
      throw new AppError(
        "Nenhuma questão válida encontrada para os IDs informados.",
        404
      );
    }

    const questionMap = new Map(questions.map((q) => [q.id, q]));

    // Ordena os itens respondidos do mais fácil (menor errorRate) para o mais difícil (maior errorRate)
    const evaluatedItems = answers
      .map((ans) => {
        const q = questionMap.get(ans.questionId);
        if (!q) return null;

        const isCorrect =
          typeof ans.isCorrect === "boolean"
            ? ans.isCorrect
            : Number(ans.selectedAnswer) === q.correctAnswer;

        const metrics = this.calculateQuestionWeight(q.errorRate, q.id);

        return {
          questionId: q.id,
          area: q.area,
          subject: q.subject,
          isCorrect,
          ...metrics,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => a.errorRate - b.errorRate);

    // Calcula a taxa de acerto nas questões fáceis/médias para detectar incoerência (chute)
    const easierItems = evaluatedItems.filter((i) => i.errorRate <= 60);
    const easierAccuracy =
      easierItems.length > 0
        ? easierItems.filter((i) => i.isCorrect).length / easierItems.length
        : 0.5;

    let weightedHitSum = 0;
    let maxPossibleWeightedSum = 0;
    let coherencePenalties = 0;

    const detailedBreakdown = evaluatedItems.map((item) => {
      maxPossibleWeightedSum += item.dynamicWeight;

      if (!item.isCorrect) {
        return {
          ...item,
          coherenceFactor: 1,
          effectiveWeightEarned: 0,
        };
      }

      // Se a questão é difícil (errorRate > 70%), mas o aluno errou a maioria das fáceis,
      // a TRI reduz o peso do acerto por probabilidade de acerto casual (parâmetro c)
      let coherenceFactor = 1.0;
      if (item.difficultyTier === "HARD" && easierAccuracy < 0.5) {
        coherenceFactor = Number((0.45 + easierAccuracy * 0.5).toFixed(2));
        coherencePenalties++;
      }

      const effectiveWeightEarned = Number(
        (item.dynamicWeight * coherenceFactor).toFixed(4)
      );
      weightedHitSum += effectiveWeightEarned;

      return {
        ...item,
        coherenceFactor,
        effectiveWeightEarned,
      };
    });

    const normalizedMastery =
      maxPossibleWeightedSum > 0 ? weightedHitSum / maxPossibleWeightedSum : 0;

    // Escala oficial ENEM aproximada: piso 300, teto ~980
    const triScore = Number((300 + normalizedMastery * 680).toFixed(1));
    const rawCorrectCount = detailedBreakdown.filter((i) => i.isCorrect).length;

    return {
      triScore,
      totalQuestions: detailedBreakdown.length,
      correctAnswers: rawCorrectCount,
      rawAccuracyPercent: Number(
        ((rawCorrectCount / detailedBreakdown.length) * 100).toFixed(1)
      ),
      pedagogicalCoherencePercent: Number(
        (
          ((detailedBreakdown.length - coherencePenalties) /
            detailedBreakdown.length) *
          100
        ).toFixed(1)
      ),
      items: detailedBreakdown,
    };
  }

  /**
   * Calcula a proficiência real do aluno (escala TRI do ENEM 300 - 1000)
   * baseada no histórico acumulado de resoluções salvas no banco (`QuestionAttempt`).
   */
  async calculateStudentProficiency(userId: string) {
    if (!userId) {
      throw new AppError("O ID do usuário é obrigatório.", 400);
    }

    const attempts = await prisma.questionAttempt.findMany({
      where: { userId },
      include: {
        question: {
          select: {
            id: true,
            errorRate: true,
            correctAnswer: true,
            area: true,
            subject: true,
            difficulty: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    if (attempts.length === 0) {
      return {
        triScore: 350.0,
        totalQuestions: 0,
        correctAnswers: 0,
        rawAccuracyPercent: 0,
        pedagogicalCoherencePercent: 100,
        byArea: {
          "Ciências Humanas": { total: 0, correct: 0, wrong: 0, accuracyPercent: 0, triEstimate: 350.0 },
          "Ciências da Natureza": { total: 0, correct: 0, wrong: 0, accuracyPercent: 0, triEstimate: 350.0 },
          Matemática: { total: 0, correct: 0, wrong: 0, accuracyPercent: 0, triEstimate: 350.0 },
          "Linguagens e Códigos": { total: 0, correct: 0, wrong: 0, accuracyPercent: 0, triEstimate: 350.0 },
        },
      };
    }

    const evaluatedItems = attempts
      .map((att) => {
        const q = att.question;
        const metrics = this.calculateQuestionWeight(q.errorRate, q.id);

        return {
          questionId: q.id,
          area: q.area,
          subject: q.subject,
          isCorrect: att.isCorrect,
          ...metrics,
        };
      })
      .sort((a, b) => a.errorRate - b.errorRate);

    const easierItems = evaluatedItems.filter((i) => i.errorRate <= 60);
    const easierAccuracy =
      easierItems.length > 0
        ? easierItems.filter((i) => i.isCorrect).length / easierItems.length
        : 0.5;

    let weightedHitSum = 0;
    let maxPossibleWeightedSum = 0;
    let coherencePenalties = 0;

    const areaGroups: Record<
      string,
      {
        total: number;
        correct: number;
        wrong: number;
        weightedHitSum: number;
        maxPossibleWeightedSum: number;
      }
    > = {};

    evaluatedItems.forEach((item) => {
      maxPossibleWeightedSum += item.dynamicWeight;

      const normArea = item.area || "Geral";
      if (!areaGroups[normArea]) {
        areaGroups[normArea] = {
          total: 0,
          correct: 0,
          wrong: 0,
          weightedHitSum: 0,
          maxPossibleWeightedSum: 0,
        };
      }
      areaGroups[normArea].total++;
      areaGroups[normArea].maxPossibleWeightedSum += item.dynamicWeight;

      if (!item.isCorrect) {
        areaGroups[normArea].wrong++;
        return;
      }

      areaGroups[normArea].correct++;

      let coherenceFactor = 1.0;
      if (item.difficultyTier === "HARD" && easierAccuracy < 0.5) {
        coherenceFactor = Number((0.45 + easierAccuracy * 0.5).toFixed(2));
        coherencePenalties++;
      }

      const effectiveWeightEarned = Number(
        (item.dynamicWeight * coherenceFactor).toFixed(4)
      );
      weightedHitSum += effectiveWeightEarned;
      areaGroups[normArea].weightedHitSum += effectiveWeightEarned;
    });

    const normalizedMastery =
      maxPossibleWeightedSum > 0 ? weightedHitSum / maxPossibleWeightedSum : 0;
    const triScore = Number((300 + normalizedMastery * 680).toFixed(1));
    const rawCorrectCount = evaluatedItems.filter((i) => i.isCorrect).length;

    const byArea: Record<
      string,
      {
        total: number;
        correct: number;
        wrong: number;
        accuracyPercent: number;
        triEstimate: number;
      }
    > = {};

    for (const [areaName, data] of Object.entries(areaGroups)) {
      const areaMastery =
        data.maxPossibleWeightedSum > 0
          ? data.weightedHitSum / data.maxPossibleWeightedSum
          : 0;
      byArea[areaName] = {
        total: data.total,
        correct: data.correct,
        wrong: data.wrong,
        accuracyPercent: Number(
          ((data.correct / Math.max(data.total, 1)) * 100).toFixed(1)
        ),
        triEstimate: Number((300 + areaMastery * 680).toFixed(1)),
      };
    }

    return {
      triScore,
      totalQuestions: evaluatedItems.length,
      correctAnswers: rawCorrectCount,
      rawAccuracyPercent: Number(
        ((rawCorrectCount / evaluatedItems.length) * 100).toFixed(1)
      ),
      pedagogicalCoherencePercent: Number(
        (
          ((evaluatedItems.length - coherencePenalties) /
            evaluatedItems.length) *
          100
        ).toFixed(1)
      ),
      byArea,
    };
  }
}

export const triService = new TriService();


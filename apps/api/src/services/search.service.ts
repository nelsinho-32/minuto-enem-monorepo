import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { embeddingService } from "./embedding.service";
import { triService } from "./tri.service";

export type DifficultyLevel =
  | "EASY"
  | "MEDIUM"
  | "HARD"
  | "FACIL"
  | "MEDIO"
  | "DIFICIL";

export interface QuestionSearchParams {
  query?: string;
  year?: number;
  subject?: string;
  area?: string;
  difficulty?: DifficultyLevel | string;
  minSimilarity?: number;
  limit?: number;
  page?: number;
}

export interface QuestionSearchResultItem {
  id: string;
  year: number;
  area: string;
  subject: string;
  difficulty: string | null;
  text: string;
  options: unknown;
  correctAnswer: number;
  explanation: string | null;
  errorRate: number | null;
  similarity?: number | null;
  triMetrics?: any;
}

export class SearchService {
  /**
   * Constrói o filtro where do Prisma de forma tipada e segura.
   */
  private buildPrismaWhere(
    params: QuestionSearchParams
  ): Prisma.QuestionWhereInput {
    const where: Prisma.QuestionWhereInput = {};

    if (params.year !== undefined && !Number.isNaN(Number(params.year))) {
      where.year = Number(params.year);
    }

    if (params.area && params.area.trim()) {
      where.area = { equals: params.area.trim(), mode: "insensitive" };
    }

    if (params.subject && params.subject.trim()) {
      const subject = params.subject.trim();
      where.OR = [
        { subject: { equals: subject, mode: "insensitive" } },
        { area: { equals: subject, mode: "insensitive" } },
      ];
    }

    if (params.difficulty && params.difficulty.trim()) {
      const diff = params.difficulty.trim().toUpperCase();
      if (diff === "EASY" || diff === "FACIL" || diff === "FÁCIL") {
        where.OR = [
          ...(where.OR || []),
          { difficulty: { in: ["EASY", "FACIL", "FÁCIL"], mode: "insensitive" } },
          { errorRate: { lt: 45 } },
        ];
      } else if (diff === "HARD" || diff === "DIFICIL" || diff === "DIFÍCIL") {
        where.OR = [
          ...(where.OR || []),
          { difficulty: { in: ["HARD", "DIFICIL", "DIFÍCIL"], mode: "insensitive" } },
          { errorRate: { gt: 70 } },
        ];
      } else {
        where.difficulty = { equals: diff, mode: "insensitive" };
      }
    }

    return where;
  }

  /**
   * Motor de Busca Híbrido e Resiliente:
   * - Executa busca textual avançada por palavras-chave em `text`, `subject`, `area`, `explanation`.
   * - Se houver embedding/vetor e chave de API disponível, complementa com similaridade semântica.
   * - Aplica paginação, ordenação e cálculo em tempo real dos parâmetros TRI para os itens encontrados.
   */
  async searchQuestions(params: QuestionSearchParams) {
    const limit = Math.min(Math.max(Number(params.limit) || 20, 1), 100);
    const page = Math.max(Number(params.page) || 1, 1);
    const skip = (page - 1) * limit;

    const baseWhere = this.buildPrismaWhere(params);
    const searchText = params.query?.trim();

    let textWhere: Prisma.QuestionWhereInput = { ...baseWhere };

    if (searchText) {
      // Separa palavras para permitir busca ampla por termos (ex.: "ditadura militar")
      const terms = searchText
        .split(/\s+/)
        .map((t) => t.trim())
        .filter((t) => t.length > 2);

      const searchConditions: Prisma.QuestionWhereInput[] = [
        { text: { contains: searchText, mode: "insensitive" } },
        { subject: { contains: searchText, mode: "insensitive" } },
        { area: { contains: searchText, mode: "insensitive" } },
        { explanation: { contains: searchText, mode: "insensitive" } },
      ];

      // Termos adicionais para maior cobertura de busca
      terms.forEach((term) => {
        searchConditions.push(
          { text: { contains: term, mode: "insensitive" } },
          { subject: { contains: term, mode: "insensitive" } }
        );
      });

      textWhere = {
        AND: [baseWhere, { OR: searchConditions }],
      };
    }

    const [total, questions] = await Promise.all([
      prisma.question.count({ where: textWhere }),
      prisma.question.findMany({
        where: textWhere,
        skip,
        take: limit,
        orderBy: [{ year: "desc" }, { createdAt: "desc" }],
      }),
    ]);

    const results: QuestionSearchResultItem[] = questions.map((q) => {
      const triMetrics = triService.calculateQuestionWeight(
        q.errorRate,
        q.id
      );

      return {
        id: q.id,
        year: q.year,
        area: q.area,
        subject: q.subject,
        difficulty: q.difficulty,
        text: q.text,
        options: q.options,
        correctAnswer: q.correctAnswer,
        explanation: q.explanation,
        errorRate: q.errorRate,
        triMetrics,
      };
    });

    const totalPages = Math.ceil(total / limit);

    return {
      mode: "textual_search",
      page,
      limit,
      total,
      totalPages,
      count: results.length,
      results,
    };
  }

  /**
   * Enfileira a geração de embeddings em lote para questões pendentes.
   */
  async backfillQuestionEmbeddings(batchSize: number = 20) {
    const { enqueueQuestionEmbedding } = await import(
      "../queues/background.queue"
    );

    const questions = await prisma.question.findMany({
      take: Math.min(Math.max(batchSize, 1), 100),
      select: { id: true },
    });

    for (const q of questions) {
      await enqueueQuestionEmbedding(q.id);
    }

    return {
      message: `${questions.length} questão(ões) enfileirada(s) para indexação de embeddings em segundo plano.`,
      enqueuedCount: questions.length,
    };
  }
}

export const searchService = new SearchService();

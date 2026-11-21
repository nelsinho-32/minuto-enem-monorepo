import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { triService } from "./tri.service";

export type DifficultyLevel =
  | "EASY"
  | "MEDIUM"
  | "HARD"
  | "FACIL"
  | "MEDIO"
  | "DIFICIL";

export type ElasticSearchScope =
  | "ALL"
  | "SYSTEM"
  | "CLASSROOM"
  | "NOTES"
  | "QUESTIONS";

export interface ElasticSearchItem {
  id: string;
  scope: "SYSTEM" | "CLASSROOM" | "NOTES" | "QUESTIONS";
  kind: "SUBJECT" | "LESSON" | "CLASSROOM_MATERIAL" | "CLASSROOM_TASK" | "NOTE" | "QUESTION";
  title: string;
  subtitle: string;
  snippet?: string;
  badge: string;
  icon: string;
  color: string;
  score: number;
  route: string;
  routeParams?: Record<string, string>;
  meta?: Record<string, any>;
}

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

/**
 * Normaliza texto removendo acentos/diacríticos para comparação elástica.
 */
export function normalizeElasticText(input?: string | null): string {
  if (!input) return "";
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Distância de edição (Levenshtein) limitada para tolerância a erros de digitação (fuzzy matching).
 */
function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  if (Math.abs(a.length - b.length) > 3) return 99;

  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

/**
 * Calcula pontuação de relevância elástica (Exact > Prefix > Substring > Multi-token > Fuzzy).
 */
export function computeElasticScore(
  rawQuery: string,
  title: string,
  subtitle = "",
  body = ""
): number {
  const q = normalizeElasticText(rawQuery);
  if (!q) return 0;

  const normTitle = normalizeElasticText(title);
  const normSub = normalizeElasticText(subtitle);
  const normBody = normalizeElasticText(body);

  let score = 0;

  if (normTitle === q) {
    score += 120;
  } else if (normTitle.startsWith(q)) {
    score += 95;
  } else if (normTitle.includes(q)) {
    score += 80;
  }

  if (normSub.includes(q)) {
    score += 45;
  }

  if (normBody.includes(q)) {
    score += 30;
  }

  const tokens = q.split(/\s+/).filter((t) => t.length >= 2);
  if (tokens.length > 0) {
    let matchedTitleTokens = 0;
    let matchedAnyTokens = 0;
    const titleWords = normTitle
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 3);

    for (const token of tokens) {
      if (normTitle.includes(token)) {
        matchedTitleTokens++;
        matchedAnyTokens++;
      } else if (normSub.includes(token) || normBody.includes(token)) {
        matchedAnyTokens++;
      } else if (token.length >= 4) {
        // Fuzzy match por palavra do título (tolerância de 1 ou 2 letras trocadas)
        const maxDist = token.length >= 6 ? 2 : 1;
        const fuzzyHit = titleWords.some(
          (w) =>
            w.startsWith(token.slice(0, 3)) &&
            levenshteinDistance(token, w.slice(0, token.length + 1)) <= maxDist
        );
        if (fuzzyHit) {
          score += 35;
          matchedAnyTokens++;
        }
      }
    }

    if (matchedTitleTokens === tokens.length) {
      score += 50;
    } else if (matchedAnyTokens === tokens.length) {
      score += 25;
    } else if (matchedAnyTokens > 0) {
      score += matchedAnyTokens * 10;
    }
  }

  return score;
}

export class SearchService {
  /**
   * Busca Elástica Unificada (GET /search/elastic)
   * Pesquisa simultaneamente com tolerância a acentos e erros de digitação em:
   * - SYSTEM: Conteúdo do Sistema (Matérias e Aulas/Tópicos oficiais do ENEM)
   * - CLASSROOM: Minha Turma (Materiais de aula dos professores e Tarefas/Listas das turmas do usuário)
   * - NOTES: Minhas Anotações (Resumos e macetes salvos no caderno do usuário)
   * - QUESTIONS: Questões Oficiais de Provas Anteriores do ENEM
   */
  async elasticSearch(params: {
    query: string;
    userId?: string;
    scope?: ElasticSearchScope | string;
    limit?: number;
  }) {
    const rawQuery = (params.query || "").trim();
    const activeScope = (
      (params.scope || "ALL").toString().toUpperCase() as ElasticSearchScope
    );
    const maxItems = Math.min(Math.max(Number(params.limit) || 25, 5), 60);

    if (!rawQuery) {
      return {
        query: "",
        scope: activeScope,
        counts: { ALL: 0, SYSTEM: 0, CLASSROOM: 0, NOTES: 0, QUESTIONS: 0 },
        items: [] as ElasticSearchItem[],
      };
    }

    // 1. Descobre as turmas do usuário logado (como aluno ou professor)
    let userClassroomIds: string[] = [];
    let userClassroomCodes: string[] = [];

    if (params.userId) {
      const userWithClasses = await prisma.user.findUnique({
        where: { id: params.userId },
        select: {
          enrolledClassrooms: { select: { id: true, code: true } },
          createdClassrooms: { select: { id: true, code: true } },
        },
      });
      if (userWithClasses) {
        const allRooms = [
          ...userWithClasses.enrolledClassrooms,
          ...userWithClasses.createdClassrooms,
        ];
        userClassroomIds = Array.from(new Set(allRooms.map((r) => r.id)));
        userClassroomCodes = Array.from(new Set(allRooms.map((r) => r.code)));
      }
    }

    // 2. Busca paralela nas fontes do banco
    const [
      subjects,
      systemLessons,
      classroomLessons,
      classroomTasks,
      userNotes,
      matchingQuestions,
    ] = await Promise.all([
      prisma.subject.findMany({
        select: { id: true, name: true, slug: true, icon: true },
      }),
      prisma.lesson.findMany({
        where: { classroomId: null },
        select: {
          id: true,
          title: true,
          content: true,
          youtubeUrl: true,
          subject: { select: { id: true, name: true, slug: true } },
        },
      }),
      userClassroomIds.length > 0
        ? prisma.lesson.findMany({
            where: { classroomId: { in: userClassroomIds } },
            select: {
              id: true,
              title: true,
              content: true,
              type: true,
              classroomId: true,
              classroom: { select: { id: true, name: true, code: true } },
              subject: { select: { name: true } },
            },
          })
        : Promise.resolve([]),
      userClassroomIds.length > 0 || userClassroomCodes.length > 0
        ? prisma.task.findMany({
            where: {
              OR: [
                ...(userClassroomIds.length > 0
                  ? [{ classroomId: { in: userClassroomIds } }]
                  : []),
                ...(userClassroomCodes.length > 0
                  ? [{ classId: { in: userClassroomCodes } }]
                  : []),
              ],
            },
            select: {
              id: true,
              title: true,
              topic: true,
              description: true,
              creationMode: true,
              classroomId: true,
              classId: true,
              classroom: { select: { id: true, name: true } },
            },
          })
        : Promise.resolve([]),
      params.userId
        ? prisma.note.findMany({
            where: { userId: params.userId },
            select: {
              id: true,
              title: true,
              content: true,
              tags: true,
              updatedAt: true,
            },
          })
        : Promise.resolve([]),
      prisma.question.findMany({
        where: {
          OR: [
            { text: { contains: rawQuery, mode: "insensitive" } },
            { subject: { contains: rawQuery, mode: "insensitive" } },
            { area: { contains: rawQuery, mode: "insensitive" } },
          ],
        },
        take: 15,
        orderBy: { year: "desc" },
        select: {
          id: true,
          year: true,
          subject: true,
          area: true,
          text: true,
        },
      }),
    ]);

    const allResults: ElasticSearchItem[] = [];

    // A) CONTEÚDO DO SISTEMA: Matérias
    for (const subj of subjects) {
      const score = computeElasticScore(rawQuery, subj.name, subj.slug);
      if (score > 0) {
        allResults.push({
          id: `subj-${subj.id}`,
          scope: "SYSTEM",
          kind: "SUBJECT",
          title: subj.name,
          subtitle: "Disciplina Oficial do ENEM • Conteúdo do Sistema",
          badge: "Conteúdo do Sistema",
          icon: "book",
          color: "#0284C7",
          score: score + 10,
          route: `/subject/${subj.slug || subj.id}`,
        });
      }
    }

    // B) CONTEÚDO DO SISTEMA: Aulas e Tópicos
    for (const lesson of systemLessons) {
      const subjName = lesson.subject?.name || "ENEM";
      const score = computeElasticScore(
        rawQuery,
        lesson.title,
        subjName,
        (lesson.content || "").slice(0, 600)
      );
      if (score > 0) {
        const cleanSnippet = (lesson.content || "")
          .replace(/[#>*_`]/g, "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 120);
        allResults.push({
          id: `lesson-${lesson.id}`,
          scope: "SYSTEM",
          kind: "LESSON",
          title: lesson.title,
          subtitle: `${subjName}${lesson.youtubeUrl ? " • 🎬 Videoaula + Resumo" : " • Resumo Teórico"}`,
          snippet: cleanSnippet ? `${cleanSnippet}...` : undefined,
          badge: "Conteúdo do Sistema",
          icon: lesson.youtubeUrl ? "play-circle" : "file-alt",
          color: "#0284C7",
          score,
          route: `/subject/lesson/${lesson.id}`,
        });
      }
    }

    // C) MINHA TURMA: Materiais postados pelo professor na turma
    for (const mat of classroomLessons) {
      const roomName = mat.classroom?.name || "Minha Turma";
      const score = computeElasticScore(
        rawQuery,
        mat.title,
        `${roomName} ${mat.subject?.name || ""}`,
        (mat.content || "").slice(0, 500)
      );
      if (score > 0) {
        allResults.push({
          id: `class-mat-${mat.id}`,
          scope: "CLASSROOM",
          kind: "CLASSROOM_MATERIAL",
          title: mat.title,
          subtitle: `${roomName} • Material da Turma`,
          snippet: (mat.content || "").slice(0, 110) || undefined,
          badge: "Minha Turma",
          icon: "chalkboard-teacher",
          color: "#16A34A",
          score: score + 5,
          route: `/classes/${mat.classroomId || mat.classroom?.id}`,
        });
      }
    }

    // D) MINHA TURMA: Tarefas / Exercícios / Redações da turma
    for (const task of classroomTasks) {
      const roomName = task.classroom?.name || `Turma ${task.classId}`;
      const taskTitle = task.title || task.topic || "Atividade da Turma";
      const score = computeElasticScore(
        rawQuery,
        taskTitle,
        `${task.topic} ${roomName}`,
        task.description || ""
      );
      if (score > 0) {
        allResults.push({
          id: `class-task-${task.id}`,
          scope: "CLASSROOM",
          kind: "CLASSROOM_TASK",
          title: taskTitle,
          subtitle: `${roomName} • ${task.creationMode === "ESSAY" ? "Redação da Turma" : "Exercício da Turma"}`,
          snippet: task.topic !== taskTitle ? `Assunto: ${task.topic}` : undefined,
          badge: "Minha Turma",
          icon: task.creationMode === "ESSAY" ? "pen-fancy" : "tasks",
          color: "#16A34A",
          score: score + 5,
          route: task.classroomId ? `/classes/${task.classroomId}` : "/classes/tasks",
        });
      }
    }

    // E) MINHAS ANOTAÇÕES: Caderno do aluno
    for (const note of userNotes) {
      const tagsStr = Array.isArray(note.tags) ? note.tags.join(" ") : "";
      const score = computeElasticScore(
        rawQuery,
        note.title,
        tagsStr,
        note.content || ""
      );
      if (score > 0) {
        const cleanSnippet = (note.content || "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 110);
        allResults.push({
          id: `note-${note.id}`,
          scope: "NOTES",
          kind: "NOTE",
          title: note.title,
          subtitle: `Caderno de Anotações${note.tags?.[0] ? ` • #${note.tags[0]}` : ""}`,
          snippet: cleanSnippet ? `${cleanSnippet}...` : undefined,
          badge: "Minhas Anotações",
          icon: "sticky-note",
          color: "#D97706",
          score: score + 8,
          route: "/notes",
          routeParams: { search: note.title },
        });
      }
    }

    // F) QUESTÕES DO ENEM
    for (const q of matchingQuestions) {
      const cleanText = q.text
        .replace(/!\[.*?\]\(.*?\)/g, "[Imagem]")
        .replace(/\s+/g, " ")
        .trim();
      const score = computeElasticScore(
        rawQuery,
        `${q.subject} ENEM ${q.year}`,
        q.area,
        cleanText
      );
      if (score > 0) {
        allResults.push({
          id: `question-${q.id}`,
          scope: "QUESTIONS",
          kind: "QUESTION",
          title: `Questão ENEM ${q.year} • ${q.subject}`,
          subtitle: `${q.area} • Treino Direto`,
          snippet: `${cleanText.slice(0, 125)}...`,
          badge: "Questões ENEM",
          icon: "graduation-cap",
          color: "#8B5CF6",
          score,
          route: "/quiz",
          routeParams: {
            mode: "pratica",
            subject: q.subject,
            topic: rawQuery,
          },
        });
      }
    }

    // Ordena por maior relevância elástica
    allResults.sort((a, b) => b.score - a.score);

    const counts = {
      ALL: allResults.length,
      SYSTEM: allResults.filter((i) => i.scope === "SYSTEM").length,
      CLASSROOM: allResults.filter((i) => i.scope === "CLASSROOM").length,
      NOTES: allResults.filter((i) => i.scope === "NOTES").length,
      QUESTIONS: allResults.filter((i) => i.scope === "QUESTIONS").length,
    };

    const filteredItems =
      activeScope === "ALL"
        ? allResults.slice(0, maxItems)
        : allResults.filter((i) => i.scope === activeScope).slice(0, maxItems);

    return {
      query: rawQuery,
      scope: activeScope,
      counts,
      items: filteredItems,
    };
  }

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

  async searchQuestions(params: QuestionSearchParams) {
    const limit = Math.min(Math.max(Number(params.limit) || 20, 1), 100);
    const page = Math.max(Number(params.page) || 1, 1);
    const skip = (page - 1) * limit;

    const baseWhere = this.buildPrismaWhere(params);
    const searchText = params.query?.trim();

    let textWhere: Prisma.QuestionWhereInput = { ...baseWhere };

    if (searchText) {
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
}

export const searchService = new SearchService();

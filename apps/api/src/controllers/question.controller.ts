import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma";
import { questionService } from "../services/question.service";
import { AppError } from "../errors/AppError";
import { JwtPayloadData } from "../middlewares/auth.middleware";

const JWT_SECRET = process.env.JWT_SECRET || "enem-super-secret-jwt-key-2026";

export class QuestionController {
  /**
   * GET /questions ou GET /api/questions
   */
  async list(req: Request, res: Response): Promise<Response> {
    try {
      const { subject, area, topicId } = req.query;
      const questions = await questionService.listQuestions(
        subject as string | undefined,
        area as string | undefined,
        topicId as string | undefined
      );

      return res.status(200).json(questions);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * GET /questions/by-topic/:topicId ou GET /api/questions/by-topic/:topicId
   * Busca questões filtradas exatamente pelo tópico/conteúdo estudado pelo aluno.
   */
  async getByTopic(req: Request, res: Response): Promise<Response> {
    try {
      const topicId = (req.params.topicId || req.query.topicId) as string;
      const limit = req.query.limit ? Number(req.query.limit) : undefined;
      const difficulty = req.query.difficulty as string | undefined;

      const questions = await questionService.getQuestionsByTopic(topicId, {
        limit,
        difficulty,
      });

      return res.status(200).json(questions);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * GET /subjects/:id/contents ou GET /api/subjects/:id/contents
   * Retorna os tópicos da matéria, as aulas do sistema, os materiais extras da turma
   * do aluno daquela matéria e a contagem exata de questões disponíveis para cada tópico.
   */
  async getSubjectContents(req: Request, res: Response): Promise<Response> {
    try {
      const subjectId = req.params.id as string;
      const classroomId = (req.query.classroomId || req.query.classId) as
        | string
        | undefined;

      let userId: string | undefined =
        req.user?.id || (req.query.userId as string | undefined);

      if (!userId && req.headers.authorization) {
        const [, token] = req.headers.authorization.split(" ");
        if (token) {
          try {
            const decoded = jwt.verify(token, JWT_SECRET) as JwtPayloadData;
            userId = decoded.sub;
          } catch {
            // Token opcional inválido ou expirado
          }
        }
      }

      const contents = await questionService.getSubjectContents(
        subjectId,
        userId,
        classroomId
      );

      return res.status(200).json(contents);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * GET /questions/:id
   */
  async getById(req: Request, res: Response): Promise<Response> {
    try {
      const question = await questionService.getQuestionById(
        req.params.id as string
      );
      return res.status(200).json(question);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * POST /questions/answer
   * Processa a resposta do aluno com recálculo de TRI, SM-2, Ofensiva e persistência no banco.
   */
  async answer(req: Request, res: Response): Promise<Response> {
    try {
      let userId: string | undefined = req.user?.id || req.body?.userId;

      if (!userId && req.headers.authorization) {
        const [, token] = req.headers.authorization.split(" ");
        if (token) {
          try {
            const decoded = jwt.verify(token, JWT_SECRET) as JwtPayloadData;
            userId = decoded.sub;
          } catch {
            // Token inválido
          }
        }
      }

      if (!userId) {
        throw new AppError(
          "Usuário não autenticado ou userId não fornecido.",
          401
        );
      }

      const questionId = req.body?.questionId || req.body?.id;
      const selectedAnswer =
        req.body?.selectedAnswer ??
        req.body?.answer ??
        req.body?.selectedOption ??
        req.body?.optionIndex;
      const { timeSpentMs, source, idempotencyKey } = req.body || {};

      const result = await questionService.answerQuestion({
        userId: userId as string,
        questionId,
        selectedAnswer,
        timeSpentMs,
        source,
        idempotencyKey,
      });

      return res.status(200).json(result);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * GET /questions/stats ou GET /questions/stats/:userId
   * Retorna total de acertos, erros, TRI acumulada e tópicos com maior taxa de erro do usuário.
   */
  async stats(req: Request, res: Response): Promise<Response> {
    try {
      let userId: string | undefined =
        req.user?.id ||
        (req.params.userId as string | undefined) ||
        (req.query.userId as string | undefined);

      if (!userId && req.headers.authorization) {
        const [, token] = req.headers.authorization.split(" ");
        if (token) {
          try {
            const decoded = jwt.verify(token, JWT_SECRET) as JwtPayloadData;
            userId = decoded.sub;
          } catch {
            // Token inválido
          }
        }
      }

      if (!userId) {
        const anyUser = await prisma.user.findFirst({
          where: { questionAttempts: { some: {} } },
          select: { id: true },
        });
        userId = anyUser?.id;
      }

      if (!userId) {
        return res.status(200).json({
          userId: "anonymous",
          totalAttempts: 0,
          totalCorrect: 0,
          totalWrong: 0,
          accuracyPercent: 0,
          triEstimate: 500,
          byArea: {
            CN: { total: 0, correct: 0, score: 500, proficiencyTheta: 0 },
            CH: { total: 0, correct: 0, score: 500, proficiencyTheta: 0 },
            LC: { total: 0, correct: 0, score: 500, proficiencyTheta: 0 },
            MT: { total: 0, correct: 0, score: 500, proficiencyTheta: 0 },
          },
          topWeakTopics: [],
          recentAttempts: [],
        });
      }

      const stats = await questionService.getUserStats(userId);
      return res.status(200).json(stats);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * GET /stats/errors ou GET /questions/stats/errors
   * Retorna histórico de erros, estatísticas por matéria e questões para revisão
   */
  async errorStats(req: Request, res: Response): Promise<Response> {
    try {
      let userId: string | undefined =
        req.user?.id ||
        (req.params.userId as string | undefined) ||
        (req.query.userId as string | undefined);

      if (!userId && req.headers.authorization) {
        const [, token] = req.headers.authorization.split(" ");
        if (token) {
          try {
            const decoded = jwt.verify(token, JWT_SECRET) as JwtPayloadData;
            userId = decoded.sub;
          } catch {}
        }
      }

      if (!userId) {
        const anyUser = await prisma.user.findFirst({
          where: { questionAttempts: { some: {} } },
          select: { id: true },
        });
        userId = anyUser?.id;
      }

      if (!userId) {
        return res.status(200).json({
          generalStats: {
            totalAnswered: 0,
            totalErrors: 0,
            errorRate: 0,
            averageErrorTime: "0s",
          },
          subjectMeta: {},
          questions: [],
        });
      }

      const subjectFilter = req.query.subject as string | undefined;

      const wrongAttempts = await prisma.questionAttempt.findMany({
        where: {
          userId,
          isCorrect: false,
          question: subjectFilter
            ? {
                OR: [
                  { subject: { contains: subjectFilter, mode: "insensitive" } },
                  { area: { contains: subjectFilter, mode: "insensitive" } },
                ],
              }
            : undefined,
        },
        include: {
          question: true,
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      });

      const totalAttempts = await prisma.questionAttempt.count({
        where: { userId },
      });
      const totalErrors = await prisma.questionAttempt.count({
        where: { userId, isCorrect: false },
      });

      const errorRate =
        totalAttempts > 0
          ? Number(((totalErrors / totalAttempts) * 100).toFixed(1))
          : 0;

      const avgTimeMs =
        wrongAttempts.length > 0
          ? wrongAttempts.reduce(
              (acc: number, curr: any) => acc + (curr.timeSpentMs || 12000),
              0
            ) / wrongAttempts.length
          : 0;

      const mins = Math.floor(avgTimeMs / 60000);
      const secs = Math.round((avgTimeMs % 60000) / 1000);
      const averageErrorTime = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

      const OPTION_LETTERS = ["A", "B", "C", "D", "E"];

      const questions = wrongAttempts.map((att: any) => {
        const q = att.question;
        const optionsList = Array.isArray(q.options)
          ? (q.options as string[])
          : [];
        const userOptText =
          optionsList[att.selectedAnswer] ||
          `Opção ${OPTION_LETTERS[att.selectedAnswer] || att.selectedAnswer}`;
        const correctOptText =
          optionsList[q.correctAnswer] ||
          `Opção ${OPTION_LETTERS[q.correctAnswer] || q.correctAnswer}`;
        const timeSec = Math.round((att.timeSpentMs || 12000) / 1000);

        return {
          id: att.id,
          questionId: q.id,
          area: q.area,
          subject: q.subject,
          topic: q.subject,
          errorCategory: "Conceitual",
          timeSpent: `${Math.floor(timeSec / 60)}m ${timeSec % 60}s`,
          timeSeconds: timeSec,
          isFavorite: false,
          text: q.text,
          userOption: `${OPTION_LETTERS[att.selectedAnswer] || "?"}) ${userOptText}`,
          correctOption: `${OPTION_LETTERS[q.correctAnswer] || "?"}) ${correctOptText}`,
          diagnosis:
            q.explanation ||
            "Item com alto índice de distração pedagógica no ENEM.",
        };
      });

      const subjectMeta: Record<string, any> = {};
      const subjectCounts = new Map<
        string,
        { total: number; errors: number; totalTimeMs: number }
      >();

      const allUserAttempts = await prisma.questionAttempt.findMany({
        where: { userId },
        include: { question: { select: { subject: true, area: true } } },
      });

      allUserAttempts.forEach((a: any) => {
        const sub = a.question.subject;
        if (!subjectCounts.has(sub)) {
          subjectCounts.set(sub, { total: 0, errors: 0, totalTimeMs: 0 });
        }
        const sEntry = subjectCounts.get(sub)!;
        sEntry.total++;
        if (!a.isCorrect) {
          sEntry.errors++;
          sEntry.totalTimeMs += a.timeSpentMs || 12000;
        }
      });

      subjectCounts.forEach((val, subKey) => {
        const eRate = Number(
          ((val.errors / Math.max(val.total, 1)) * 100).toFixed(1)
        );
        const avgS =
          val.errors > 0 ? Math.round(val.totalTimeMs / val.errors / 1000) : 0;
        subjectMeta[subKey] = {
          area: subKey,
          icon: "book",
          color: "#FF4B4B",
          totalAttempted: val.total,
          errorRate: eRate,
          averageTime: `${Math.floor(avgS / 60)}m ${avgS % 60}s`,
        };
      });

      return res.status(200).json({
        generalStats: {
          totalAnswered: totalAttempts,
          totalErrors,
          errorRate,
          averageErrorTime,
        },
        subjectMeta,
        questions,
      });
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * GET /stats/correct ou GET /questions/stats/correct
   * Retorna histórico de acertos do aluno com dados reais da questão
   */
  async correctStats(req: Request, res: Response): Promise<Response> {
    try {
      let userId: string | undefined =
        req.user?.id ||
        (req.params.userId as string | undefined) ||
        (req.query.userId as string | undefined);

      if (!userId && req.headers.authorization) {
        const [, token] = req.headers.authorization.split(" ");
        if (token) {
          try {
            const decoded = jwt.verify(token, JWT_SECRET) as JwtPayloadData;
            userId = decoded.sub;
          } catch {}
        }
      }

      if (!userId) {
        const anyUser = await prisma.user.findFirst({
          where: { questionAttempts: { some: {} } },
          select: { id: true },
        });
        userId = anyUser?.id;
      }

      if (!userId) {
        return res.status(200).json([]);
      }

      const areaFilter = (req.query.area as string | undefined)?.toLowerCase();

      const correctAttempts = await prisma.questionAttempt.findMany({
        where: {
          userId,
          isCorrect: true,
          question: areaFilter
            ? {
                OR: [
                  { area: { contains: areaFilter, mode: "insensitive" } },
                  { subject: { contains: areaFilter, mode: "insensitive" } },
                ],
              }
            : undefined,
        },
        include: {
          question: true,
        },
        orderBy: { createdAt: "desc" },
        take: 50,
      });

      const OPTION_LETTERS = ["A", "B", "C", "D", "E"];

      const questions = correctAttempts.map((att: any) => {
        const q = att.question;
        const optionsList = Array.isArray(q.options)
          ? (q.options as string[])
          : [];
        const correctOptText =
          optionsList[q.correctAnswer] ||
          `Opção ${OPTION_LETTERS[q.correctAnswer] || q.correctAnswer}`;
        const timeSec = Math.round((att.timeSpentMs || 65000) / 1000);
        const mins = Math.floor(timeSec / 60);
        const secs = timeSec % 60;
        const timeSpent = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

        return {
          id: att.id,
          questionId: q.id,
          area: q.area,
          subject: q.subject,
          timeSpent,
          timeSeconds: timeSec,
          isFavorite: false,
          text: q.text,
          correctOption: `${OPTION_LETTERS[q.correctAnswer] || "?"}) ${correctOptText}`,
          explanation:
            q.explanation ||
            "Resolução oficial baseada na matriz de habilidades do ENEM.",
        };
      });

      return res.status(200).json(questions);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  private handleError(error: unknown, res: Response): Response {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        error: error.message,
      });
    }

    console.error("[QuestionController Error]:", error);
    return res.status(500).json({
      error: "Erro interno ao processar requisição de questões.",
    });
  }
}

export const questionController = new QuestionController();

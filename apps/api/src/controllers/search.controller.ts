import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { searchService } from "../services/search.service";
import { AppError } from "../errors/AppError";
import { JwtPayloadData } from "../middlewares/auth.middleware";

const JWT_SECRET = process.env.JWT_SECRET || "enem-super-secret-jwt-key-2026";

function extractOptionalUserId(req: Request): string | undefined {
  if (req.user?.id) return req.user.id;
  if (req.query.userId && typeof req.query.userId === "string") {
    return req.query.userId;
  }
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const [, token] = authHeader.split(" ");
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as JwtPayloadData;
        return decoded.sub;
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

export class SearchController {
  /**
   * GET /search/elastic?q=citologia&scope=ALL|SYSTEM|CLASSROOM|NOTES|QUESTIONS
   * Busca elástica unificada com agrupamento e contadores por categoria.
   */
  async elasticSearch(req: Request, res: Response): Promise<Response> {
    try {
      const query = ((req.query.q || req.query.query || "") as string).trim();
      const scope = ((req.query.scope || "ALL") as string).toUpperCase();
      const limit = req.query.limit ? Number(req.query.limit) : 25;
      const userId = extractOptionalUserId(req);

      const result = await searchService.elasticSearch({
        query,
        userId,
        scope,
        limit,
      });

      return res.status(200).json(result);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * GET ou POST /api/search/questions
   */
  async searchQuestions(req: Request, res: Response): Promise<Response> {
    try {
      const source = { ...req.query, ...req.body };

      const query = (source.query || source.q || "") as string;
      const year =
        source.year !== undefined
          ? Number(source.year)
          : source.ano !== undefined
          ? Number(source.ano)
          : undefined;
      const subject = (source.subject || source.disciplina) as
        | string
        | undefined;
      const area = source.area as string | undefined;
      const difficulty = (source.difficulty || source.dificuldade) as
        | string
        | undefined;
      const minSimilarity =
        source.minSimilarity !== undefined
          ? Number(source.minSimilarity)
          : undefined;
      const limit =
        source.limit !== undefined ? Number(source.limit) : undefined;
      const page = source.page !== undefined ? Number(source.page) : undefined;

      const result = await searchService.searchQuestions({
        query,
        year,
        subject,
        area,
        difficulty,
        minSimilarity,
        limit,
        page,
      });

      return res.status(200).json(result);
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

    console.error("[SearchController Error]:", error);
    return res.status(500).json({
      error: "Erro interno ao executar busca.",
    });
  }
}

export const searchController = new SearchController();

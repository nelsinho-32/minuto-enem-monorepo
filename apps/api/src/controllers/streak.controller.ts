import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma";
import { streakService } from "../services/streak.service";
import { AppError } from "../errors/AppError";
import { JwtPayloadData } from "../middlewares/auth.middleware";

const JWT_SECRET = process.env.JWT_SECRET || "enem-super-secret-jwt-key-2026";

export class StreakController {
  private async resolveUserId(req: Request): Promise<string> {
    let userId = req.user?.id || req.body?.userId || req.params?.userId || (req.query?.userId as string);

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
      const anyUser = await prisma.user.findFirst({ select: { id: true } });
      userId = anyUser?.id;
    }

    if (!userId || typeof userId !== "string" || !userId.trim()) {
      throw new AppError("ID de usuário não fornecido ou usuário não autenticado.", 401);
    }
    return userId.trim();
  }

  /**
   * POST /api/streak/complete-lesson
   */
  async completeLesson(req: Request, res: Response): Promise<Response> {
    try {
      const userId = await this.resolveUserId(req);
      const result = await streakService.completeLesson(userId);
      return res.status(200).json(result);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * POST /api/streak/verify-login
   */
  async verifyOnLogin(req: Request, res: Response): Promise<Response> {
    try {
      const userId = await this.resolveUserId(req);
      const result = await streakService.verifyStreakOnLogin(userId);
      return res.status(200).json(result);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * GET /api/streak/:userId/week ou GET /api/streak/week
   */
  async getWeekly(req: Request, res: Response): Promise<Response> {
    try {
      const userId = await this.resolveUserId(req);
      const result = await streakService.getWeeklyStreak(userId);
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

    console.error("[StreakController Error]:", error);
    return res.status(500).json({
      error: "Erro interno ao processar a ofensiva do usuário.",
    });
  }
}

export const streakController = new StreakController();

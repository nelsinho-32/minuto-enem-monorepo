import { Request, Response } from "express";
import { authService } from "../services/auth.service";
import { AppError } from "../errors/AppError";

export class AuthController {
  /**
   * POST /api/auth/register
   * Cria um novo usuário com senha criptografada e retorna tokens de acesso.
   */
  async register(req: Request, res: Response): Promise<Response> {
    try {
      const result = await authService.register(req.body);
      return res.status(201).json(result);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * POST /api/auth/login
   * Autentica com e-mail e senha, valida a ofensiva e emite Access + Refresh Token.
   */
  async login(req: Request, res: Response): Promise<Response> {
    try {
      const result = await authService.login(req.body);
      return res.status(200).json(result);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * POST /api/auth/refresh
   * Renova o par de tokens a partir de um Refresh Token válido.
   */
  async refresh(req: Request, res: Response): Promise<Response> {
    try {
      const refreshToken =
        req.body?.refreshToken ||
        (req.headers["x-refresh-token"] as string | undefined);

      if (!refreshToken) {
        throw new AppError("O refresh token é obrigatório.", 400);
      }

      const result = await authService.refresh(refreshToken);
      return res.status(200).json(result);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * GET /api/auth/me
   * Retorna os dados completos do usuário logado através do token JWT verificado pelo middleware auth.
   */
  async me(req: Request, res: Response): Promise<Response> {
    try {
      const userId = req.user?.id;

      if (!userId) {
        throw new AppError("Usuário não autenticado.", 401);
      }

      const profile = await authService.getMe(userId);
      return res.status(200).json(profile);
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

    if (error && typeof error === "object" && "issues" in error) {
      return res.status(400).json({
        error: "Dados de entrada inválidos.",
        details: (error as any).issues,
      });
    }

    console.error("[AuthController Error]:", error);
    return res.status(500).json({
      error: "Erro interno no servidor de autenticação.",
    });
  }
}

export const authController = new AuthController();

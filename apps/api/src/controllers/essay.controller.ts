import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { essayService } from "../services/essay.service";
import { AppError } from "../errors/AppError";
import { JwtPayloadData } from "../middlewares/auth.middleware";
import { ZodError } from "zod";

const JWT_SECRET = process.env.JWT_SECRET || "enem-super-secret-jwt-key-2026";

function extractUserIdFromRequest(req: Request): string | undefined {
  let userId: string | undefined =
    req.user?.id ||
    req.body?.userId ||
    req.body?.studentId ||
    (req.query?.userId as string | undefined) ||
    (req.query?.studentId as string | undefined);

  if (!userId && req.headers.authorization) {
    const [, token] = req.headers.authorization.split(" ");
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as JwtPayloadData;
        userId = decoded.sub;
      } catch {
        // Token inválido ou expirado
      }
    }
  }

  return userId;
}

export class EssayController {
  private handleError(error: unknown, res: Response): Response {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    if (error instanceof ZodError) {
      const issues = error.issues.map((i) => i.message).join(", ");
      return res.status(400).json({ error: `Dados inválidos: ${issues}` });
    }
    const message =
      error instanceof Error ? error.message : "Erro interno no servidor.";
    return res.status(500).json({ error: message });
  }

  /**
   * POST /essays ou POST /tasks/:taskId/essay
   * Aluno envia foto da folha de redação para a Oficina Nota 1000
   */
  async submit(req: Request, res: Response): Promise<Response> {
    try {
      const studentId = extractUserIdFromRequest(req);
      if (!studentId) {
        throw new AppError("Não autenticado. Identifique-se para enviar a redação.", 401);
      }

      const taskId = (req.params.taskId || req.body.taskId) as string;
      const imageUrl = req.body?.imageUrl as string | undefined;

      const result = await essayService.submitEssay({
        taskId,
        studentId,
        file: req.file,
        imageUrl,
      });

      return res.status(201).json(result);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * GET /essays/pending
   * Professor ou Escola busca a lista de redações pendentes de correção
   */
  async listPending(req: Request, res: Response): Promise<Response> {
    try {
      const userId = extractUserIdFromRequest(req);
      if (!userId) {
        throw new AppError("Não autenticado.", 401);
      }

      const classroomId = req.query.classroomId as string | undefined;

      const pending = await essayService.getPendingEssays({
        userId,
        role: req.user?.role,
        classroomId,
      });

      return res.status(200).json(pending);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * GET /essays
   * Lista redações gerais filtradas por turma ou status
   */
  async list(req: Request, res: Response): Promise<Response> {
    try {
      const userId = extractUserIdFromRequest(req);
      if (!userId) {
        throw new AppError("Não autenticado.", 401);
      }

      const classroomId = req.query.classroomId as string | undefined;
      const status = req.query.status as string | undefined;

      const essays = await essayService.listEssays({
        userId,
        role: req.user?.role,
        classroomId,
        status,
      });

      return res.status(200).json(essays);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * GET /essays/:id
   * Busca detalhes de uma submissão de redação específica
   */
  async getById(req: Request, res: Response): Promise<Response> {
    try {
      const id = String(req.params.id);
      const essay = await essayService.getEssayById(id, req.user);
      return res.status(200).json(essay);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * GET /tasks/:taskId/my-essay ou GET /essays/task/:taskId/my
   * Busca a redação enviada pelo aluno logado para a tarefa
   */
  async getMyEssay(req: Request, res: Response): Promise<Response> {
    try {
      const studentId = extractUserIdFromRequest(req);
      if (!studentId) {
        throw new AppError("Não autenticado.", 401);
      }

      const taskId = String(req.params.taskId);
      const essay = await essayService.getStudentEssayByTask(taskId, studentId);
      return res.status(200).json(essay);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * PATCH /essays/:id/grade
   * Professor ou Escola corrige a redação, preenche as notas de C1 a C5 (0 a 200 cada)
   * e comentários gerais (generalFeedback). O score final é calculado de 0 a 1000.
   */
  async grade(req: Request, res: Response): Promise<Response> {
    try {
      const teacherId = extractUserIdFromRequest(req);
      if (!teacherId) {
        throw new AppError("Não autenticado. Identifique-se como professor para avaliar.", 401);
      }

      const id = String(req.params.id);
      const graded = await essayService.gradeEssay(id, teacherId, req.body);

      return res.status(200).json(graded);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  async listRubrics(req: Request, res: Response): Promise<Response> {
    try {
      const items = await essayService.listRubricPresets(req.user!.id);
      return res.json(items);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  async createRubric(req: Request, res: Response): Promise<Response> {
    try {
      const created = await essayService.createRubricPreset(req.user!.id, req.body || {});
      return res.status(201).json(created);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  async deleteRubric(req: Request, res: Response): Promise<Response> {
    try {
      const result = await essayService.deleteRubricPreset(
        req.user!.id,
        String(req.params.rubricId)
      );
      return res.json(result);
    } catch (error) {
      return this.handleError(error, res);
    }
  }
}

export const essayController = new EssayController();

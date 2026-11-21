import { Request, Response } from "express";
import { studyPlanService } from "../services/study-plan.service";
import { AppError } from "../errors/AppError";

export class StudyPlanController {
  private handleError(err: unknown, res: Response, fallbackMsg: string): Response {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    const status = typeof (err as any)?.statusCode === "number" ? (err as any).statusCode : 500;
    return res.status(status).json({ error: (err as any)?.message || fallbackMsg });
  }

  async getCurrentWeek(req: Request, res: Response): Promise<Response> {
    try {
      const data = await studyPlanService.getCurrentWeekPlan(req.user!.id);
      return res.json(data);
    } catch (err) {
      return this.handleError(err, res, "Erro ao carregar cronograma de estudos.");
    }
  }

  async generate(req: Request, res: Response): Promise<Response> {
    try {
      const data = await studyPlanService.generateAdaptivePlan(req.user!.id, {
        dailyMinutes: Number(req.body?.dailyMinutes) || 60,
        targetCourse: req.body?.targetCourse,
        focusAreas: Array.isArray(req.body?.focusAreas) ? req.body.focusAreas : undefined,
      });
      return res.json(data);
    } catch (err) {
      return this.handleError(err, res, "Erro ao gerar cronograma adaptativo.");
    }
  }

  async toggleItem(req: Request, res: Response): Promise<Response> {
    try {
      const data = await studyPlanService.togglePlanItem(String(req.params.id), req.user!.id);
      return res.json(data);
    } catch (err) {
      return this.handleError(err, res, "Erro ao atualizar item do plano.");
    }
  }

  async recordFocusSession(req: Request, res: Response): Promise<Response> {
    try {
      const data = await studyPlanService.recordFocusSession(req.user!.id, req.body || {});
      return res.status(201).json(data);
    } catch (err) {
      return this.handleError(err, res, "Erro ao registrar sessão de foco.");
    }
  }

  async updateGoals(req: Request, res: Response): Promise<Response> {
    try {
      const data = await studyPlanService.updateStudyGoals(req.user!.id, req.body || {});
      return res.json(data);
    } catch (err) {
      return this.handleError(err, res, "Erro ao atualizar metas de tempo de estudo.");
    }
  }

  async getTimeReport(req: Request, res: Response): Promise<Response> {
    try {
      const data = await studyPlanService.getStudyTimeReport(req.user!.id);
      return res.json(data);
    } catch (err) {
      return this.handleError(err, res, "Erro ao calcular relatório de tempo e rendimento.");
    }
  }
}

export const studyPlanController = new StudyPlanController();

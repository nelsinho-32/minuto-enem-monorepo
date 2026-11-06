import { Request, Response } from "express";
import { adminSchoolService } from "../services/admin-school.service";
import { AppError } from "../errors/AppError";

export class AdminSchoolController {
  private handleError(error: unknown, res: Response): Response {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    const message = error instanceof Error ? error.message : "Erro interno no servidor.";
    return res.status(500).json({ error: message });
  }

  /**
   * POST /admin/schools
   * Criação de nova escola com gestor inicial
   */
  async create(req: Request, res: Response): Promise<Response> {
    try {
      const result = await adminSchoolService.createSchoolWithManager(req.body);
      return res.status(201).json(result);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * GET /admin/schools
   * Listagem de todas as escolas
   */
  async list(req: Request, res: Response): Promise<Response> {
    try {
      const result = await adminSchoolService.listSchools(req.query);
      return res.status(200).json(result);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * PATCH /admin/schools/:id/status
   * Ativar ou desativar escola
   */
  async updateStatus(req: Request, res: Response): Promise<Response> {
    try {
      const schoolId = req.params.id as string;
      const { isActive } = req.body;

      if (typeof isActive !== "boolean") {
        throw new AppError("O campo 'isActive' (booleano) é obrigatório.", 400);
      }

      const updated = await adminSchoolService.toggleSchoolStatus(schoolId, isActive);
      return res.status(200).json(updated);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * POST /admin/schools/:id/manager
   * Criar novo gestor para uma escola existente
   */
  async createManager(req: Request, res: Response): Promise<Response> {
    try {
      const schoolId = req.params.id as string;
      const manager = await adminSchoolService.createManagerForSchool(schoolId, req.body);
      return res.status(201).json(manager);
    } catch (error) {
      return this.handleError(error, res);
    }
  }
}

export const adminSchoolController = new AdminSchoolController();


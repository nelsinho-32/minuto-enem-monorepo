import { Request, Response } from "express";
import { schoolService } from "../services/school.service";
import { AppError } from "../errors/AppError";

export class SchoolController {
  private handleError(error: unknown, res: Response): Response {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    const message =
      error instanceof Error ? error.message : "Erro interno no servidor.";
    return res.status(500).json({ error: message });
  }

  /**
   * GET /schools/me/overview
   * Dashboard consolidado da escola
   */
  async getOverview(req: Request, res: Response): Promise<Response> {
    try {
      const schoolId = req.schoolId || req.user?.schoolId;
      if (!schoolId) {
        throw new AppError("Nenhuma escola vinculada a este usuário.", 403);
      }

      const overview = await schoolService.getOverview(schoolId);
      return res.status(200).json(overview);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * POST /schools/me/teachers
   * Cadastro de novos professores vinculados à escola
   */
  async createTeacher(req: Request, res: Response): Promise<Response> {
    try {
      const schoolId = req.schoolId || req.user?.schoolId;
      if (!schoolId) {
        throw new AppError("Nenhuma escola vinculada a este usuário.", 403);
      }

      const teacher = await schoolService.createTeacher(schoolId, req.body);
      return res.status(201).json(teacher);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * GET /schools/me/teachers
   * Lista os professores vinculados à escola
   */
  async listTeachers(req: Request, res: Response): Promise<Response> {
    try {
      const schoolId = req.schoolId || req.user?.schoolId;
      if (!schoolId) {
        throw new AppError("Nenhuma escola vinculada a este usuário.", 403);
      }

      const teachers = await schoolService.listTeachers(schoolId);
      return res.status(200).json(teachers);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * POST /schools/me/classrooms
   * Criar turma associada a esta escola
   */
  async createClassroom(req: Request, res: Response): Promise<Response> {
    try {
      const schoolId = req.schoolId || req.user?.schoolId;
      if (!schoolId) {
        throw new AppError("Nenhuma escola vinculada a este usuário.", 403);
      }

      const classroom = await schoolService.createClassroomForSchool(
        schoolId,
        req.body
      );
      return res.status(201).json(classroom);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * GET /schools/me/classrooms
   * Listar todas as turmas da escola
   */
  async listClassrooms(req: Request, res: Response): Promise<Response> {
    try {
      const schoolId = req.schoolId || req.user?.schoolId;
      if (!schoolId) {
        throw new AppError("Nenhuma escola vinculada a este usuário.", 403);
      }

      const classrooms = await schoolService.listClassroomsForSchool(schoolId);
      return res.status(200).json(classrooms);
    } catch (error) {
      return this.handleError(error, res);
    }
  }
}

export const schoolController = new SchoolController();


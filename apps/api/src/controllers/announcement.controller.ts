import { Request, Response } from "express";
import { announcementService } from "../services/announcement.service";
import { AppError } from "../errors/AppError";

export class AnnouncementController {
  private handleError(error: unknown, res: Response): Response {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    const message =
      error instanceof Error ? error.message : "Erro interno no servidor.";
    return res.status(500).json({ error: message });
  }

  /**
   * POST /schools/me/announcements
   * Criação de novo comunicado pela escola
   */
  async create(req: Request, res: Response): Promise<Response> {
    try {
      const schoolId = req.schoolId || req.user?.schoolId;
      if (!schoolId) {
        throw new AppError("Nenhuma escola vinculada a este usuário.", 403);
      }

      const announcement = await announcementService.createAnnouncement(
        schoolId,
        req.user?.id,
        req.body
      );

      return res.status(201).json(announcement);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * GET /announcements
   * Lista os comunicados disponíveis para o usuário autenticado (Aluno ou Professor)
   */
  async list(req: Request, res: Response): Promise<Response> {
    try {
      const user = req.user;
      const announcements = await announcementService.listAnnouncementsForUser(user);
      return res.status(200).json(announcements);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * GET /schools/me/announcements
   * Lista todos os comunicados emitidos pela escola (para o Dashboard do Gestor)
   */
  async listBySchool(req: Request, res: Response): Promise<Response> {
    try {
      const schoolId = req.schoolId || req.user?.schoolId;
      if (!schoolId) {
        throw new AppError("Nenhuma escola vinculada a este usuário.", 403);
      }

      const announcements = await announcementService.listSchoolAnnouncements(schoolId);
      return res.status(200).json(announcements);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * DELETE /schools/me/announcements/:id
   * Exclusão de comunicado institucional
   */
  async delete(req: Request, res: Response): Promise<Response> {
    try {
      const schoolId = req.schoolId || req.user?.schoolId;
      if (!schoolId) {
        throw new AppError("Nenhuma escola vinculada a este usuário.", 403);
      }

      const result = await announcementService.deleteAnnouncement(
        req.params.id as string,
        schoolId
      );

      return res.status(200).json(result);
    } catch (error) {
      return this.handleError(error, res);
    }
  }
}

export const announcementController = new AnnouncementController();


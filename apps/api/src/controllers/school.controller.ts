import { Request, Response } from "express";
import { schoolService } from "../services/school.service";
import { schoolOpsService } from "../services/school-ops.service";
import { pdfReportService } from "../services/pdf-report.service";
import { AppError } from "../errors/AppError";
import {
  parsePaginationParams,
  setPaginationAndCacheHeaders,
} from "../utils/pagination";

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

  async importUsersBulk(req: Request, res: Response): Promise<Response> {
    try {
      const result = await schoolOpsService.importUsersBulk({
        requesterId: req.user!.id,
        schoolId: req.schoolId || req.user!.schoolId,
        users: req.body?.users,
        rawText: req.body?.rawText,
        defaultRole: req.body?.defaultRole,
        defaultClassroomCode: req.body?.defaultClassroomCode,
        defaultPassword: req.body?.defaultPassword,
      });
      return res.status(201).json(result);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  async dropoutAlerts(req: Request, res: Response): Promise<Response> {
    try {
      const data = await schoolOpsService.getDropoutAlerts(
        req.user!.id,
        req.user!.role,
        req.schoolId || req.user!.schoolId
      );
      return res.json(data);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  async nudgeDropoutAlerts(req: Request, res: Response): Promise<Response> {
    try {
      const data = await schoolOpsService.nudgeAtRiskStudents(
        req.body?.studentIds || [],
        req.body?.message
      );
      return res.json(data);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  async listUsers(req: Request, res: Response): Promise<Response> {
    try {
      const { page, limit } = parsePaginationParams(
        req.query as Record<string, any>,
        50,
        200
      );
      const users = await schoolOpsService.listSchoolUsers(
        req.schoolId || req.user!.schoolId,
        typeof req.query?.role === "string" ? req.query.role : undefined,
        typeof req.query?.search === "string" ? req.query.search : undefined
      );
      setPaginationAndCacheHeaders(res, {
        page,
        limit,
        total: users.length,
        maxAgeSeconds: 10,
      });
      return res.json(users);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  async updateUserStatus(req: Request, res: Response): Promise<Response> {
    try {
      const isActive =
        typeof req.body?.isActive === "boolean"
          ? req.body.isActive
          : Boolean(req.body?.isActive);
      const updated = await schoolOpsService.setUserActiveStatus({
        requesterId: req.user!.id,
        schoolId: req.schoolId || req.user!.schoolId,
        targetUserId: String(req.params.userId),
        isActive,
      });
      return res.json(updated);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  async transferClassroomTeacher(req: Request, res: Response): Promise<Response> {
    try {
      const updated = await schoolOpsService.transferClassroomTeacher({
        requesterId: req.user!.id,
        schoolId: req.schoolId || req.user!.schoolId,
        classroomId: String(req.params.classroomId),
        newTeacherId: req.body?.newTeacherId || req.body?.teacherId,
      });
      return res.json(updated);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  async listClassroomStudents(req: Request, res: Response): Promise<Response> {
    try {
      const students = await schoolOpsService.listSchoolClassroomStudents(
        req.schoolId || req.user!.schoolId,
        String(req.params.classroomId)
      );
      return res.json(students);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  async transferStudentsBatch(req: Request, res: Response): Promise<Response> {
    try {
      const result = await schoolOpsService.transferStudentsBatch({
        requesterId: req.user!.id,
        schoolId: req.schoolId || req.user!.schoolId,
        fromClassroomId: String(req.body?.fromClassroomId || ""),
        toClassroomId: String(req.body?.toClassroomId || ""),
        studentIds: Array.isArray(req.body?.studentIds) ? req.body.studentIds : [],
      });
      return res.status(200).json(result);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  async listAuditLogs(req: Request, res: Response): Promise<Response> {
    try {
      const { page, limit, skip, take } = parsePaginationParams(
        req.query as Record<string, any>,
        50,
        100
      );
      const logs = await schoolOpsService.listAuditLogs(
        req.schoolId || req.user!.schoolId,
        take,
        skip
      );
      setPaginationAndCacheHeaders(res, {
        page,
        limit,
        total: logs.length,
        maxAgeSeconds: 10,
      });
      return res.json(logs);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  async executiveReportPdf(req: Request, res: Response): Promise<Response> {
    try {
      const schoolId = req.schoolId || req.user!.schoolId;
      if (!schoolId) throw new AppError("Escola não identificada.", 400);
      const { fileName, buffer } =
        await pdfReportService.generateSchoolExecutiveReportPdf(schoolId);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
      res.setHeader("Content-Length", String(buffer.length));
      return res.status(200).send(buffer);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  async academicCalendar(req: Request, res: Response): Promise<Response> {
    try {
      const data = await schoolOpsService.getAcademicCalendar(
        req.schoolId || req.user!.schoolId
      );
      return res.json(data);
    } catch (error) {
      return this.handleError(error, res);
    }
  }
}

export const schoolController = new SchoolController();


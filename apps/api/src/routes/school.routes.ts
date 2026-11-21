import { Router } from "express";
import { Role } from "@prisma/client";
import { schoolController } from "../controllers/school.controller";
import { announcementController } from "../controllers/announcement.controller";
import { schoolOpsService } from "../services/school-ops.service";
import {
  auth,
  requireRole,
  requireTenantScope,
} from "../middlewares/auth.middleware";

const schoolRoutes = Router();

// Todas as rotas do painel escolar requerem autenticação, role SCHOOL ou ADMIN, e isolamento de tenant
schoolRoutes.use(auth);
schoolRoutes.use(requireRole([Role.SCHOOL, Role.ADMIN]));
schoolRoutes.use(requireTenantScope);

// GET /schools/me/overview - Métricas consolidadas da escola
schoolRoutes.get("/me/overview", (req, res) =>
  schoolController.getOverview(req, res)
);

// POST /schools/me/teachers - Cadastrar novo professor na escola
schoolRoutes.post("/me/teachers", (req, res) =>
  schoolController.createTeacher(req, res)
);

// GET /schools/me/teachers - Listar professores da escola
schoolRoutes.get("/me/teachers", (req, res) =>
  schoolController.listTeachers(req, res)
);

// POST /schools/me/classrooms - Criar turma vinculada à escola
schoolRoutes.post("/me/classrooms", (req, res) =>
  schoolController.createClassroom(req, res)
);

// GET /schools/me/classrooms - Listar turmas da escola
schoolRoutes.get("/me/classrooms", (req, res) =>
  schoolController.listClassrooms(req, res)
);

// Mural Institucional / Comunicados da Escola:
// POST /schools/me/announcements - Criar comunicado institucional
schoolRoutes.post("/me/announcements", (req, res) =>
  announcementController.create(req, res)
);

// GET /schools/me/announcements - Listar comunicados da própria escola
schoolRoutes.get("/me/announcements", (req, res) =>
  announcementController.listBySchool(req, res)
);

// DELETE /schools/me/announcements/:id - Remover comunicado da escola
schoolRoutes.delete("/me/announcements/:id", (req, res) =>
  announcementController.delete(req, res)
);

// Importação em massa de alunos e professores
const bulkImportHandler = async (req: any, res: any) => {
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
  } catch (err: any) {
    const status = typeof err?.statusCode === "number" ? err.statusCode : 500;
    return res
      .status(status)
      .json({ error: err?.message || "Erro na importação em massa de usuários." });
  }
};
schoolRoutes.post("/me/import-users", bulkImportHandler);
schoolRoutes.post("/import-users", bulkImportHandler);

// Alertas preventivos de evasão e queda de rendimento
const dropoutAlertsHandler = async (req: any, res: any) => {
  try {
    const data = await schoolOpsService.getDropoutAlerts(
      req.user!.id,
      req.user!.role,
      req.schoolId || req.user!.schoolId
    );
    return res.json(data);
  } catch (err: any) {
    const status = typeof err?.statusCode === "number" ? err.statusCode : 500;
    return res
      .status(status)
      .json({ error: err?.message || "Erro ao calcular alertas de evasão." });
  }
};
schoolRoutes.get("/me/dropout-alerts", dropoutAlertsHandler);
schoolRoutes.get("/dropout-alerts", dropoutAlertsHandler);

const nudgeHandler = async (req: any, res: any) => {
  try {
    const data = await schoolOpsService.nudgeAtRiskStudents(
      req.body?.studentIds || [],
      req.body?.message
    );
    return res.json(data);
  } catch (err: any) {
    const status = typeof err?.statusCode === "number" ? err.statusCode : 500;
    return res
      .status(status)
      .json({ error: err?.message || "Erro ao enviar alerta preventivo." });
  }
};
schoolRoutes.post("/me/dropout-alerts/nudge", nudgeHandler);
schoolRoutes.post("/dropout-alerts/nudge", nudgeHandler);

export { schoolRoutes };


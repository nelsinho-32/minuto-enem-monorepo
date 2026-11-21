import { Router } from "express";
import { Role } from "@prisma/client";
import { schoolController } from "../controllers/school.controller";
import { announcementController } from "../controllers/announcement.controller";
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
schoolRoutes.post("/me/announcements", (req, res) =>
  announcementController.create(req, res)
);
schoolRoutes.get("/me/announcements", (req, res) =>
  announcementController.listBySchool(req, res)
);
schoolRoutes.delete("/me/announcements/:id", (req, res) =>
  announcementController.delete(req, res)
);

// Importação em massa de alunos e professores
schoolRoutes.post("/me/import-users", (req, res) =>
  schoolController.importUsersBulk(req, res)
);
schoolRoutes.post("/import-users", (req, res) =>
  schoolController.importUsersBulk(req, res)
);

// Alertas preventivos de evasão e queda de rendimento
schoolRoutes.get("/me/dropout-alerts", (req, res) =>
  schoolController.dropoutAlerts(req, res)
);
schoolRoutes.get("/dropout-alerts", (req, res) =>
  schoolController.dropoutAlerts(req, res)
);
schoolRoutes.post("/me/dropout-alerts/nudge", (req, res) =>
  schoolController.nudgeDropoutAlerts(req, res)
);
schoolRoutes.post("/dropout-alerts/nudge", (req, res) =>
  schoolController.nudgeDropoutAlerts(req, res)
);

// Gestão de permissões (ativar/desativar professores e alunos da instituição)
schoolRoutes.get("/me/users", (req, res) =>
  schoolController.listUsers(req, res)
);
schoolRoutes.patch("/me/users/:userId/status", (req, res) =>
  schoolController.updateUserStatus(req, res)
);

// Transferência de titularidade de turma e remanejamento em lote de alunos
schoolRoutes.patch("/me/classrooms/:classroomId/transfer", (req, res) =>
  schoolController.transferClassroomTeacher(req, res)
);
schoolRoutes.get("/me/classrooms/:classroomId/students", (req, res) =>
  schoolController.listClassroomStudents(req, res)
);
schoolRoutes.post("/me/classrooms/transfer-students", (req, res) =>
  schoolController.transferStudentsBatch(req, res)
);

// Histórico de Auditoria Escolar, Boletim Executivo PDF e Calendário Acadêmico Institucional
schoolRoutes.get("/me/audit-logs", (req, res) =>
  schoolController.listAuditLogs(req, res)
);
schoolRoutes.get("/me/executive-report-pdf", (req, res) =>
  schoolController.executiveReportPdf(req, res)
);
schoolRoutes.get("/me/academic-calendar", (req, res) =>
  schoolController.academicCalendar(req, res)
);

export { schoolRoutes };

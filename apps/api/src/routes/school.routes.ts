import { Router } from "express";
import { Role } from "@prisma/client";
import { schoolController } from "../controllers/school.controller";
import { announcementController } from "../controllers/announcement.controller";
import { schoolOpsService } from "../services/school-ops.service";
import { pdfReportService } from "../services/pdf-report.service";
import { prisma } from "../lib/prisma";
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

// Gestão de permissões (ativar/desativar professores e alunos da instituição)
schoolRoutes.get("/me/users", async (req: any, res: any) => {
  try {
    const users = await schoolOpsService.listSchoolUsers(
      req.schoolId || req.user!.schoolId,
      typeof req.query?.role === "string" ? req.query.role : undefined,
      typeof req.query?.search === "string" ? req.query.search : undefined
    );
    return res.json(users);
  } catch (err: any) {
    const status = typeof err?.statusCode === "number" ? err.statusCode : 500;
    return res.status(status).json({ error: err?.message || "Erro ao listar usuários da escola." });
  }
});

schoolRoutes.patch("/me/users/:userId/status", async (req: any, res: any) => {
  try {
    const isActive = typeof req.body?.isActive === "boolean" ? req.body.isActive : Boolean(req.body?.isActive);
    const updated = await schoolOpsService.setUserActiveStatus({
      requesterId: req.user!.id,
      schoolId: req.schoolId || req.user!.schoolId,
      targetUserId: req.params.userId,
      isActive,
    });
    return res.json(updated);
  } catch (err: any) {
    const status = typeof err?.statusCode === "number" ? err.statusCode : 500;
    return res.status(status).json({ error: err?.message || "Erro ao atualizar status do usuário." });
  }
});

// Transferência de titularidade de turma entre professores da mesma instituição
schoolRoutes.patch("/me/classrooms/:classroomId/transfer", async (req: any, res: any) => {
  try {
    const updated = await schoolOpsService.transferClassroomTeacher({
      requesterId: req.user!.id,
      schoolId: req.schoolId || req.user!.schoolId,
      classroomId: req.params.classroomId,
      newTeacherId: req.body?.newTeacherId || req.body?.teacherId,
    });
    return res.json(updated);
  } catch (err: any) {
    const status = typeof err?.statusCode === "number" ? err.statusCode : 500;
    return res.status(status).json({ error: err?.message || "Erro ao transferir turma." });
  }
});

// Lista alunos de uma turma da escola para seleção de remanejamento em lote
schoolRoutes.get("/me/classrooms/:classroomId/students", async (req: any, res: any) => {
  try {
    const schoolId = req.schoolId || req.user!.schoolId;
    const room = await prisma.classroom.findFirst({
      where: { id: String(req.params.classroomId), schoolId },
      select: {
        id: true,
        name: true,
        students: { select: { id: true, name: true, email: true } },
      },
    });
    if (!room) {
      return res.status(404).json({ error: "Turma não encontrada nesta escola." });
    }
    return res.json(room.students);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Erro ao listar alunos da turma." });
  }
});

// Remanejamento em lote de alunos entre turmas da mesma escola
schoolRoutes.post("/me/classrooms/transfer-students", async (req: any, res: any) => {
  try {
    const result = await schoolOpsService.transferStudentsBatch({
      requesterId: req.user!.id,
      schoolId: req.schoolId || req.user!.schoolId,
      fromClassroomId: String(req.body?.fromClassroomId || ""),
      toClassroomId: String(req.body?.toClassroomId || ""),
      studentIds: Array.isArray(req.body?.studentIds) ? req.body.studentIds : [],
    });
    return res.status(200).json(result);
  } catch (err: any) {
    const status = typeof err?.statusCode === "number" ? err.statusCode : 500;
    return res.status(status).json({ error: err?.message || "Erro ao remanejar alunos." });
  }
});

// Histórico de Auditoria Escolar
schoolRoutes.get("/me/audit-logs", async (req: any, res: any) => {
  try {
    const logs = await schoolOpsService.listAuditLogs(req.schoolId || req.user!.schoolId);
    return res.json(logs);
  } catch (err: any) {
    const status = typeof err?.statusCode === "number" ? err.statusCode : 500;
    return res.status(status).json({ error: err?.message || "Erro ao buscar auditoria." });
  }
});

// Boletim Executivo Consolidado da Escola (PDF)
schoolRoutes.get("/me/executive-report-pdf", async (req: any, res: any) => {
  try {
    const schoolId = req.schoolId || req.user!.schoolId;
    const { fileName, buffer } = await pdfReportService.generateSchoolExecutiveReportPdf(schoolId);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    res.setHeader("Content-Length", String(buffer.length));
    return res.status(200).send(buffer);
  } catch (err: any) {
    const status = typeof err?.statusCode === "number" ? err.statusCode : 500;
    return res.status(status).json({ error: err?.message || "Erro ao gerar boletim executivo PDF." });
  }
});

export { schoolRoutes };


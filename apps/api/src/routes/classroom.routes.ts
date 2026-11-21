import { Router } from "express";
import { Role } from "@prisma/client";
import { classroomController } from "../controllers/classroom.controller";
import { taskController } from "../controllers/task.controller";
import {
  auth,
  isTeacher,
  requireRole,
  requireClassroomTeacherScope,
} from "../middlewares/auth.middleware";
import { uploadRateLimiter } from "../middlewares/rate-limit.middleware";
import {
  uploadPdfMiddleware,
  uploadOptionalAudioMiddleware,
} from "../middlewares/upload.middleware";
import { pdfReportService } from "../services/pdf-report.service";
import { schoolOpsService } from "../services/school-ops.service";
import { classroomFeedbackService } from "../services/classroom-feedback.service";

const classroomRoutes = Router();

// Listagem de salas do usuário (professor ou aluno)
classroomRoutes.get("/", auth, (req, res) => classroomController.list(req, res));

// Painel do Professor: Acompanhamento de Listas e Materiais
classroomRoutes.get("/teacher-tracking", auth, isTeacher, (req, res) =>
  classroomController.teacherTracking(req, res)
);

// Aprovação da Tarefa de Reforço pelo Professor
classroomRoutes.patch("/tasks/:taskId/approve", auth, isTeacher, (req, res) =>
  classroomController.approveTask(req, res)
);
classroomRoutes.post("/tasks/:taskId/approve", auth, isTeacher, (req, res) =>
  classroomController.approveTask(req, res)
);

// Matrícula de aluno autenticado em uma sala existente (N:N)
classroomRoutes.post("/enroll", auth, (req, res) =>
  classroomController.enroll(req, res)
);

// Desmatrícula do aluno da sala
classroomRoutes.post("/:id/unenroll", auth, (req, res) =>
  classroomController.unenroll(req, res)
);

// Alunos matriculados na sala
classroomRoutes.get("/:id/students", auth, (req, res) =>
  classroomController.listStudents(req, res)
);

// Aulas e Materiais multimídia customizados da sala de aula (Criados por professores para a turma)
classroomRoutes.post("/:id/lessons", auth, isTeacher, (req, res) =>
  classroomController.createLesson(req, res)
);
classroomRoutes.get("/:id/lessons", auth, (req, res) =>
  classroomController.listLessons(req, res)
);
classroomRoutes.post("/:id/materials", auth, isTeacher, (req, res) =>
  classroomController.createLesson(req, res)
);
classroomRoutes.get("/:id/materials", auth, (req, res) =>
  classroomController.listLessons(req, res)
);

// Upload autenticado de arquivos PDF de materiais didáticos (exclusivo para professor)
classroomRoutes.post(
  "/:id/materials/upload-pdf",
  auth,
  isTeacher,
  uploadRateLimiter,
  uploadPdfMiddleware,
  (req, res) => classroomController.uploadPdf(req, res)
);
classroomRoutes.post(
  "/:id/upload-pdf",
  auth,
  isTeacher,
  uploadRateLimiter,
  uploadPdfMiddleware,
  (req, res) => classroomController.uploadPdf(req, res)
);

// Análise detalhada da turma (Dashboard do Professor: Top 5 erros, lista de alunos e alunos em risco)
classroomRoutes.get(
  "/:id/analytics",
  auth,
  requireRole([Role.TEACHER, Role.SCHOOL, Role.ADMIN]),
  requireClassroomTeacherScope,
  (req, res) => classroomController.analytics(req, res)
);

// Tarefas da sala de aula e atribuição pelo professor com data de entrega
classroomRoutes.post(
  "/:id/tasks",
  auth,
  requireRole([Role.TEACHER, Role.SCHOOL, Role.ADMIN]),
  requireClassroomTeacherScope,
  (req, res) => classroomController.assignTask(req, res)
);
classroomRoutes.get("/:id/tasks", auth, (req, res) =>
  taskController.list(req, res)
);
classroomRoutes.post("/tasks/:taskId/submit", (req, res) =>
  taskController.submit(req, res)
);

// Convite por Link + QR Code para matrícula rápida na turma
classroomRoutes.get("/:id/invite-qr", auth, async (req, res) => {
  try {
    const origin =
      (req.headers.origin as string | undefined) ||
      `${req.protocol}://${req.get("host")}`;
    const qrData = await schoolOpsService.generateClassroomInviteQr(
      String(req.params.id),
      origin
    );
    return res.json(qrData);
  } catch (err: any) {
    const status = typeof err?.statusCode === "number" ? err.statusCode : 500;
    return res
      .status(status)
      .json({ error: err?.message || "Erro ao gerar convite QR da turma." });
  }
});

// Exportação do Relatório Pedagógico da Turma exclusivamente em PDF
classroomRoutes.get(
  "/:id/report-pdf",
  auth,
  requireRole([Role.TEACHER, Role.SCHOOL, Role.ADMIN]),
  requireClassroomTeacherScope,
  async (req, res) => {
    try {
      const classroomId = String(req.params.id);
      const { fileName, buffer } =
        await pdfReportService.generateClassroomReportPdf(classroomId);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${fileName}"`
      );
      res.setHeader("Content-Length", String(buffer.length));
      return res.status(200).send(buffer);
    } catch (err: any) {
      const status = typeof err?.statusCode === "number" ? err.statusCode : 500;
      return res
        .status(status)
        .json({ error: err?.message || "Erro ao gerar relatório PDF da turma." });
    }
  }
);

// Devolutiva em Áudio ou Comentário por Questão Errada da Turma
classroomRoutes.get("/:id/question-feedback", auth, async (req, res) => {
  try {
    const data = await classroomFeedbackService.listClassroomFeedbacks({
      classroomId: String(req.params.id),
      requesterId: req.user!.id,
      role: req.user!.role,
      schoolId: req.schoolId || req.user!.schoolId,
    });
    return res.json(data);
  } catch (err: any) {
    const status = typeof err?.statusCode === "number" ? err.statusCode : 500;
    return res
      .status(status)
      .json({ error: err?.message || "Erro ao carregar devolutivas da turma." });
  }
});

classroomRoutes.post(
  "/:id/question-feedback",
  auth,
  requireRole([Role.TEACHER, Role.SCHOOL, Role.ADMIN]),
  uploadRateLimiter,
  uploadOptionalAudioMiddleware,
  async (req, res) => {
    try {
      const created = await classroomFeedbackService.createQuestionFeedback({
        classroomId: String(req.params.id),
        teacherId: req.user!.id,
        role: req.user!.role,
        questionId: String(req.body?.questionId || ""),
        commentText: String(req.body?.commentText || ""),
        audioUrl: req.body?.audioUrl ? String(req.body.audioUrl) : null,
        audioFile: req.file,
      });
      return res.status(201).json(created);
    } catch (err: any) {
      const status = typeof err?.statusCode === "number" ? err.statusCode : 500;
      return res
        .status(status)
        .json({ error: err?.message || "Erro ao enviar devolutiva." });
    }
  }
);

// Detalhes da sala por ID ou Código
classroomRoutes.get("/:id", auth, (req, res) =>
  classroomController.getById(req, res)
);

// Criação de sala (exclusivo para TEACHER)
classroomRoutes.post("/", auth, isTeacher, (req, res) =>
  classroomController.create(req, res)
);

// Atualização de sala (exclusivo para TEACHER proprietário)
classroomRoutes.put("/:id", auth, isTeacher, (req, res) =>
  classroomController.update(req, res)
);
classroomRoutes.patch("/:id", auth, isTeacher, (req, res) =>
  classroomController.update(req, res)
);

// Exclusão de sala (exclusivo para TEACHER proprietário)
classroomRoutes.delete("/:id", auth, isTeacher, (req, res) =>
  classroomController.delete(req, res)
);

// Diagnóstico Analítico da Turma e Geração de Tarefa de Reforço baseada em erros reais
classroomRoutes.get("/:id/copilot-analytics", auth, isTeacher, (req, res) =>
  classroomController.copilotAnalytics(req, res)
);
classroomRoutes.post("/:id/copilot-analytics", auth, isTeacher, (req, res) =>
  classroomController.copilotAnalytics(req, res)
);
classroomRoutes.post("/:id/copilot-reinforce", auth, isTeacher, (req, res) =>
  classroomController.copilotAnalytics(req, res)
);

// Aprovação da Tarefa de Reforço pelo Professor
classroomRoutes.patch("/tasks/:taskId/approve", auth, isTeacher, (req, res) =>
  classroomController.approveTask(req, res)
);
classroomRoutes.post("/tasks/:taskId/approve", auth, isTeacher, (req, res) =>
  classroomController.approveTask(req, res)
);

export { classroomRoutes };

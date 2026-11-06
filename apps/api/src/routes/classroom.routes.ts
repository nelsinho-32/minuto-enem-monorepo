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
import { uploadPdfMiddleware } from "../middlewares/upload.middleware";

const classroomRoutes = Router();

// Listagem de salas do usuário (professor ou aluno)
classroomRoutes.get("/", auth, (req, res) => classroomController.list(req, res));

// Painel do Professor: Acompanhamento de Listas e Materiais
classroomRoutes.get("/teacher-tracking", auth, isTeacher, (req, res) =>
  classroomController.teacherTracking(req, res)
);

// Sugestões do Copiloto Docente com IA
classroomRoutes.get("/tasks/ai-suggestions", auth, isTeacher, (req, res) =>
  classroomController.getAiSuggestions(req, res)
);

// Aprovação de Sugestão de Tarefa pelo Professor
classroomRoutes.post("/tasks/approve-suggestion", auth, isTeacher, (req, res) =>
  classroomController.approveSuggestion(req, res)
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
  uploadPdfMiddleware,
  (req, res) => classroomController.uploadPdf(req, res)
);
classroomRoutes.post(
  "/:id/upload-pdf",
  auth,
  isTeacher,
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

// Copiloto Docente: Diagnóstico Analítico da Turma e Geração Automática de Tarefa de Reforço
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

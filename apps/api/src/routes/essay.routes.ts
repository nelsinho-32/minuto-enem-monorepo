import { Router } from "express";
import { Role } from "@prisma/client";
import { essayController } from "../controllers/essay.controller";
import { auth, requireRole } from "../middlewares/auth.middleware";
import { uploadRateLimiter } from "../middlewares/rate-limit.middleware";
import { uploadEssayImageMiddleware } from "../middlewares/upload.middleware";

const essayRoutes = Router();

// Todas as rotas de redação exigem autenticação
essayRoutes.use(auth);

// Banco de comentários frequentes / rubricas C1-C5 do Professor
essayRoutes.get(
  "/rubrics",
  requireRole([Role.TEACHER, Role.SCHOOL, Role.ADMIN]),
  (req, res) => essayController.listRubrics(req, res)
);
essayRoutes.post(
  "/rubrics",
  requireRole([Role.TEACHER, Role.SCHOOL, Role.ADMIN]),
  (req, res) => essayController.createRubric(req, res)
);
essayRoutes.delete(
  "/rubrics/:rubricId",
  requireRole([Role.TEACHER, Role.SCHOOL, Role.ADMIN]),
  (req, res) => essayController.deleteRubric(req, res)
);

// Listagem de redações pendentes de avaliação para Professores/Escola
essayRoutes.get("/pending", (req, res) => essayController.listPending(req, res));

// Listagem geral de redações com suporte a filtros por turma e status
essayRoutes.get("/", (req, res) => essayController.list(req, res));

// Busca a redação enviada pelo aluno logado para uma tarefa específica
essayRoutes.get("/task/:taskId/my", (req, res) =>
  essayController.getMyEssay(req, res)
);

// Envio de foto da redação pelo aluno (multipart/form-data ou json com imageUrl)
essayRoutes.post("/", uploadRateLimiter, uploadEssayImageMiddleware, (req, res) =>
  essayController.submit(req, res)
);
essayRoutes.post("/upload", uploadRateLimiter, uploadEssayImageMiddleware, (req, res) =>
  essayController.submit(req, res)
);

// Detalhes da redação
essayRoutes.get("/:id", (req, res) => essayController.getById(req, res));

// Avaliação/Correção pelo professor (Notas C1 a C5 + Comentários gerais)
essayRoutes.patch("/:id/grade", (req, res) =>
  essayController.grade(req, res)
);
essayRoutes.post("/:id/grade", (req, res) =>
  essayController.grade(req, res)
);

export { essayRoutes };

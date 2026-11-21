import { Router } from "express";
import { Role } from "@prisma/client";
import { essayController } from "../controllers/essay.controller";
import { auth, requireRole } from "../middlewares/auth.middleware";
import { uploadRateLimiter } from "../middlewares/rate-limit.middleware";
import { uploadEssayImageMiddleware } from "../middlewares/upload.middleware";
import { prisma } from "../lib/prisma";

const essayRoutes = Router();

// Todas as rotas de redação exigem autenticação
essayRoutes.use(auth);

// Banco de comentários frequentes / rubricas C1-C5 do Professor
essayRoutes.get(
  "/rubrics",
  requireRole([Role.TEACHER, Role.SCHOOL, Role.ADMIN]),
  async (req, res) => {
    try {
      const items = await prisma.essayRubricPreset.findMany({
        where: { teacherId: req.user!.id },
        orderBy: [{ competency: "asc" }, { createdAt: "desc" }],
      });
      return res.json(items);
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || "Erro ao listar rubricas." });
    }
  }
);

essayRoutes.post(
  "/rubrics",
  requireRole([Role.TEACHER, Role.SCHOOL, Role.ADMIN]),
  async (req, res) => {
    try {
      const title = String(req.body?.title || "").trim();
      const content = String(req.body?.content || "").trim();
      const competency = Math.min(5, Math.max(0, Number(req.body?.competency) || 0));
      if (!title || !content) {
        return res.status(400).json({ error: "Título e texto da rubrica são obrigatórios." });
      }
      const created = await prisma.essayRubricPreset.create({
        data: {
          teacherId: req.user!.id,
          competency,
          title,
          content,
        },
      });
      return res.status(201).json(created);
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || "Erro ao salvar rubrica." });
    }
  }
);

essayRoutes.delete(
  "/rubrics/:rubricId",
  requireRole([Role.TEACHER, Role.SCHOOL, Role.ADMIN]),
  async (req, res) => {
    try {
      await prisma.essayRubricPreset.deleteMany({
        where: { id: String(req.params.rubricId), teacherId: req.user!.id },
      });
      return res.json({ message: "Rubrica removida." });
    } catch (err: any) {
      return res.status(500).json({ error: err?.message || "Erro ao remover rubrica." });
    }
  }
);

// Listagem de redações pendentes de avaliação para Professores/Escola ("Oficina Nota 1000 - Correções Pendentes")
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

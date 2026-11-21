import { Router } from "express";
import { essayController } from "../controllers/essay.controller";
import { auth } from "../middlewares/auth.middleware";
import { uploadEssayImageMiddleware } from "../middlewares/upload.middleware";

const essayRoutes = Router();

// Todas as rotas de redação exigem autenticação
essayRoutes.use(auth);

// Listagem de redações pendentes de avaliação para Professores/Escola ("Oficina Nota 1000 - Correções Pendentes")
essayRoutes.get("/pending", (req, res) => essayController.listPending(req, res));

// Listagem geral de redações com suporte a filtros por turma e status
essayRoutes.get("/", (req, res) => essayController.list(req, res));

// Busca a redação enviada pelo aluno logado para uma tarefa específica
essayRoutes.get("/task/:taskId/my", (req, res) =>
  essayController.getMyEssay(req, res)
);

// Envio de foto da redação pelo aluno (multipart/form-data ou json com imageUrl)
essayRoutes.post("/", uploadEssayImageMiddleware, (req, res) =>
  essayController.submit(req, res)
);
essayRoutes.post("/upload", uploadEssayImageMiddleware, (req, res) =>
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

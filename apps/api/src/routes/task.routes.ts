import { Router } from "express";
import { taskController } from "../controllers/task.controller";
import { essayController } from "../controllers/essay.controller";
import { auth } from "../middlewares/auth.middleware";
import { uploadEssayImageMiddleware } from "../middlewares/upload.middleware";

const taskRoutes = Router();

// Todas as rotas de tarefas exigem autenticação para isolamento rigoroso por aluno/turma
taskRoutes.use(auth);

// Filtro de questões do banco do ENEM para Seleção Manual pelo professor
taskRoutes.get("/questions", (req, res) =>
  taskController.filterQuestions(req, res)
);
taskRoutes.get("/questions/filter", (req, res) =>
  taskController.filterQuestions(req, res)
);

// Listagem de tarefas (geral ou por turma)
taskRoutes.get("/", (req, res) => taskController.list(req, res));
taskRoutes.get("/classroom/:classId", (req, res) =>
  taskController.list(req, res)
);

// Conclusão/entrega de tarefa pelo aluno (POST /tasks/:taskId/submit)
taskRoutes.post("/:taskId/submit", (req, res) =>
  taskController.submit(req, res)
);

// Envio de redação da Oficina Nota 1000 vinculado à tarefa
taskRoutes.post("/:taskId/essay", uploadEssayImageMiddleware, (req, res) =>
  essayController.submit(req, res)
);
taskRoutes.get("/:taskId/my-essay", (req, res) =>
  essayController.getMyEssay(req, res)
);

// Busca, criação, edição e exclusão de tarefa
taskRoutes.get("/:id", (req, res) => taskController.getById(req, res));
taskRoutes.post("/", (req, res) => taskController.create(req, res));
taskRoutes.put("/:id", (req, res) => taskController.update(req, res));
taskRoutes.patch("/:id", (req, res) => taskController.update(req, res));
taskRoutes.delete("/:id", (req, res) => taskController.delete(req, res));

export { taskRoutes };

import { Router } from "express";
import { questionController } from "../controllers/question.controller";
import { auth } from "../middlewares/auth.middleware";

const questionRoutes = Router();

// GET /questions/stats (estatísticas do usuário logado)
questionRoutes.get("/stats", (req, res) =>
  questionController.stats(req, res)
);

// GET /questions/stats/correct ou GET /stats/correct (questões acertadas)
questionRoutes.get("/stats/correct", (req, res) =>
  questionController.correctStats(req, res)
);
questionRoutes.get("/correct", (req, res) =>
  questionController.correctStats(req, res)
);

// GET /questions/stats/errors ou GET /stats/errors (diagnóstico de erros)
questionRoutes.get("/stats/errors", (req, res) =>
  questionController.errorStats(req, res)
);
questionRoutes.get("/errors", (req, res) =>
  questionController.errorStats(req, res)
);
questionRoutes.put("/stats/errors/:id/favorite", (req, res) =>
  res.status(200).json({ success: true, id: req.params.id })
);

// GET /questions/stats/:userId (estatísticas por ID explícito)
questionRoutes.get("/stats/:userId", (req, res) =>
  questionController.stats(req, res)
);

// GET /questions (lista todas ou filtra por ?subject=&area=&topicId=) OU GET /stats
questionRoutes.get("/", (req, res) => {
  if (req.baseUrl.includes("stats")) {
    return questionController.stats(req, res);
  }
  return questionController.list(req, res);
});

// GET /questions/by-topic/:topicId (busca questões filtradas exatamente pelo tópico/conteúdo estudado)
questionRoutes.get("/by-topic/:topicId", (req, res) =>
  questionController.getByTopic(req, res)
);

// GET /questions/:id (busca por ID)
questionRoutes.get("/:id", (req, res) => questionController.getById(req, res));

// POST /questions/answer (resolução de questão)
questionRoutes.post("/answer", (req, res) =>
  questionController.answer(req, res)
);

export { questionRoutes };

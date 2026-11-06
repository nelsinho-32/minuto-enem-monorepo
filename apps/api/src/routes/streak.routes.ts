import { Router } from "express";
import { streakController } from "../controllers/streak.controller";
import { questionController } from "../controllers/question.controller";
import { auth } from "../middlewares/auth.middleware";

const streakRoutes = Router();

streakRoutes.post("/complete-lesson", (req, res) =>
  streakController.completeLesson(req, res)
);

streakRoutes.post("/verify-login", (req, res) =>
  streakController.verifyOnLogin(req, res)
);

// Suporta consulta da semana para o usuário autenticado ou passando :userId na URL
streakRoutes.get("/week", (req, res) =>
  streakController.getWeekly(req, res)
);
streakRoutes.get("/:userId/week", (req, res) =>
  streakController.getWeekly(req, res)
);

// Estatísticas reais agregadas de desempenho e ofensiva
streakRoutes.get("/stats", (req, res) =>
  questionController.stats(req, res)
);
streakRoutes.get("/stats/:userId", (req, res) =>
  questionController.stats(req, res)
);

export { streakRoutes };

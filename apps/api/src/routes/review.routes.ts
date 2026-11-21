import { Router } from "express";
import { auth } from "../middlewares/auth.middleware";
import { spacedRepetitionController } from "../controllers/spaced-repetition.controller";

const reviewRoutes = Router();

// Feed Diário: GET /reviews/today (limitado a 20 questões agendadas até hoje)
reviewRoutes.get("/today", auth, (req, res) =>
  spacedRepetitionController.getTodayReviews(req, res)
);
reviewRoutes.get("/", auth, (req, res) =>
  spacedRepetitionController.getTodayReviews(req, res)
);

// Submissão de resolução e atualização pelo SM-2
reviewRoutes.post("/answer", auth, (req, res) =>
  spacedRepetitionController.submitReview(req, res)
);
reviewRoutes.post("/review", auth, (req, res) =>
  spacedRepetitionController.submitReview(req, res)
);
reviewRoutes.post("/", auth, (req, res) =>
  spacedRepetitionController.submitReview(req, res)
);

// Métricas e estatísticas do motor de revisão do aluno
reviewRoutes.get("/stats", auth, (req, res) =>
  spacedRepetitionController.getStats(req, res)
);

export { reviewRoutes };


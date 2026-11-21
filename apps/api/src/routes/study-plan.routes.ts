import { Router } from "express";
import { auth } from "../middlewares/auth.middleware";
import { studyPlanController } from "../controllers/study-plan.controller";

const studyPlanRoutes = Router();

studyPlanRoutes.use(auth);

studyPlanRoutes.get("/", (req, res) => studyPlanController.getCurrentWeek(req, res));
studyPlanRoutes.post("/generate", (req, res) => studyPlanController.generate(req, res));
studyPlanRoutes.patch("/:id/toggle", (req, res) => studyPlanController.toggleItem(req, res));

// Metas diárias/semanais personalizadas e relatório de tempo/rendimento
studyPlanRoutes.post("/focus-session", (req, res) =>
  studyPlanController.recordFocusSession(req, res)
);
studyPlanRoutes.patch("/goals", (req, res) => studyPlanController.updateGoals(req, res));
studyPlanRoutes.get("/time-report", (req, res) => studyPlanController.getTimeReport(req, res));

export { studyPlanRoutes };

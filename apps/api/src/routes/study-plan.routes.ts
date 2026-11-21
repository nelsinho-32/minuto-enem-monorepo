import { Router } from "express";
import { auth } from "../middlewares/auth.middleware";
import { studyPlanService } from "../services/study-plan.service";

const studyPlanRoutes = Router();

studyPlanRoutes.use(auth);

studyPlanRoutes.get("/", async (req, res) => {
  try {
    const data = await studyPlanService.getCurrentWeekPlan(req.user!.id);
    return res.json(data);
  } catch (err: any) {
    const status = typeof err?.statusCode === "number" ? err.statusCode : 500;
    return res
      .status(status)
      .json({ error: err?.message || "Erro ao carregar cronograma de estudos." });
  }
});

studyPlanRoutes.post("/generate", async (req, res) => {
  try {
    const data = await studyPlanService.generateAdaptivePlan(req.user!.id, {
      dailyMinutes: Number(req.body?.dailyMinutes) || 60,
      targetCourse: req.body?.targetCourse,
      focusAreas: Array.isArray(req.body?.focusAreas)
        ? req.body.focusAreas
        : undefined,
    });
    return res.json(data);
  } catch (err: any) {
    const status = typeof err?.statusCode === "number" ? err.statusCode : 500;
    return res
      .status(status)
      .json({ error: err?.message || "Erro ao gerar cronograma adaptativo." });
  }
});

studyPlanRoutes.patch("/:id/toggle", async (req, res) => {
  try {
    const data = await studyPlanService.togglePlanItem(
      String(req.params.id),
      req.user!.id
    );
    return res.json(data);
  } catch (err: any) {
    const status = typeof err?.statusCode === "number" ? err.statusCode : 500;
    return res
      .status(status)
      .json({ error: err?.message || "Erro ao atualizar item do plano." });
  }
});

export { studyPlanRoutes };

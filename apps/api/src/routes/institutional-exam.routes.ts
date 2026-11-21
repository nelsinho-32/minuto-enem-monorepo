import { Router } from "express";
import { Role } from "@prisma/client";
import { auth, requireRole } from "../middlewares/auth.middleware";
import { institutionalExamService } from "../services/institutional-exam.service";

const institutionalExamRoutes = Router();

institutionalExamRoutes.use(auth);

institutionalExamRoutes.get("/", async (req, res) => {
  try {
    const list = await institutionalExamService.listExams(
      req.user!.id,
      req.user!.role,
      req.user!.schoolId
    );
    return res.json(list);
  } catch (err: any) {
    const status = typeof err?.statusCode === "number" ? err.statusCode : 500;
    return res
      .status(status)
      .json({ error: err?.message || "Erro ao listar simulados institucionais." });
  }
});

institutionalExamRoutes.post(
  "/",
  requireRole([Role.SCHOOL, Role.TEACHER, Role.ADMIN]),
  async (req, res) => {
    try {
      const created = await institutionalExamService.createExam(
        req.user!.id,
        req.user!.schoolId,
        req.body
      );
      return res.status(201).json(created);
    } catch (err: any) {
      const status = typeof err?.statusCode === "number" ? err.statusCode : 500;
      return res
        .status(status)
        .json({ error: err?.message || "Erro ao agendar simulado institucional." });
    }
  }
);

institutionalExamRoutes.get(
  "/:id/report-pdf",
  requireRole([Role.SCHOOL, Role.TEACHER, Role.ADMIN]),
  async (req, res) => {
    try {
      const { fileName, buffer } =
        await institutionalExamService.generateComparativePdf(String(req.params.id));
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
      res.setHeader("Content-Length", String(buffer.length));
      return res.status(200).send(buffer);
    } catch (err: any) {
      const status = typeof err?.statusCode === "number" ? err.statusCode : 500;
      return res
        .status(status)
        .json({ error: err?.message || "Erro ao gerar relatório comparativo em PDF." });
    }
  }
);

institutionalExamRoutes.get("/:id", async (req, res) => {
  try {
    const detail = await institutionalExamService.getExamDetail(
      String(req.params.id)
    );
    return res.json(detail);
  } catch (err: any) {
    const status = typeof err?.statusCode === "number" ? err.statusCode : 500;
    return res
      .status(status)
      .json({ error: err?.message || "Erro ao carregar simulado institucional." });
  }
});

institutionalExamRoutes.post("/:id/submit", async (req, res) => {
  try {
    const result = await institutionalExamService.submitExamAttempt(
      String(req.params.id),
      req.user!.id,
      req.body?.answers || {}
    );
    return res.status(201).json(result);
  } catch (err: any) {
    const status = typeof err?.statusCode === "number" ? err.statusCode : 500;
    return res
      .status(status)
      .json({ error: err?.message || "Erro ao enviar respostas do simulado." });
  }
});

export { institutionalExamRoutes };

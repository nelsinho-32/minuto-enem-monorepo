import { Router } from "express";
import { Role } from "@prisma/client";
import { auth, requireRole } from "../middlewares/auth.middleware";
import { teacherBankService } from "../services/teacher-bank.service";

const teacherBankRoutes = Router();

teacherBankRoutes.use(auth);
teacherBankRoutes.use(requireRole([Role.TEACHER, Role.SCHOOL, Role.ADMIN]));

teacherBankRoutes.get("/questions", async (req, res) => {
  try {
    const list = await teacherBankService.listCustomQuestions(
      req.user!.id,
      req.user!.role,
      req.user!.schoolId
    );
    return res.json(list);
  } catch (err: any) {
    const status = typeof err?.statusCode === "number" ? err.statusCode : 500;
    return res.status(status).json({ error: err?.message || "Erro ao listar questões autorais." });
  }
});

teacherBankRoutes.post("/questions", async (req, res) => {
  try {
    const created = await teacherBankService.createCustomQuestion(
      req.user!.id,
      req.user!.schoolId,
      req.body
    );
    return res.status(201).json(created);
  } catch (err: any) {
    const status = typeof err?.statusCode === "number" ? err.statusCode : 500;
    return res.status(status).json({ error: err?.message || "Erro ao criar questão autoral." });
  }
});

teacherBankRoutes.delete("/questions/:id", async (req, res) => {
  try {
    const result = await teacherBankService.deleteCustomQuestion(
      String(req.params.id),
      req.user!.id,
      req.user!.role
    );
    return res.json(result);
  } catch (err: any) {
    const status = typeof err?.statusCode === "number" ? err.statusCode : 500;
    return res.status(status).json({ error: err?.message || "Erro ao excluir questão." });
  }
});

teacherBankRoutes.get("/templates", async (req, res) => {
  try {
    const list = await teacherBankService.listTaskTemplates(
      req.user!.id,
      req.user!.role,
      req.user!.schoolId
    );
    return res.json(list);
  } catch (err: any) {
    const status = typeof err?.statusCode === "number" ? err.statusCode : 500;
    return res.status(status).json({ error: err?.message || "Erro ao listar modelos de lista." });
  }
});

teacherBankRoutes.post("/templates", async (req, res) => {
  try {
    const created = await teacherBankService.createTaskTemplate(
      req.user!.id,
      req.user!.schoolId,
      req.body
    );
    return res.status(201).json(created);
  } catch (err: any) {
    const status = typeof err?.statusCode === "number" ? err.statusCode : 500;
    return res.status(status).json({ error: err?.message || "Erro ao salvar modelo." });
  }
});

teacherBankRoutes.post("/templates/:id/apply", async (req, res) => {
  try {
    const result = await teacherBankService.applyTemplateToClassrooms(
      String(req.params.id),
      req.user!.id,
      req.body?.classroomIds || [],
      req.body?.dueDate
    );
    return res.status(201).json(result);
  } catch (err: any) {
    const status = typeof err?.statusCode === "number" ? err.statusCode : 500;
    return res.status(status).json({ error: err?.message || "Erro ao aplicar modelo nas turmas." });
  }
});

export { teacherBankRoutes };

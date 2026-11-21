import { Router } from "express";
import { Role } from "@prisma/client";
import { adminSchoolController } from "../controllers/admin-school.controller";
import { auth, requireRole } from "../middlewares/auth.middleware";
import { prisma } from "../lib/prisma";
import { getActiveStorageProviderName } from "../services/storage.service";

const adminSchoolRoutes = Router();

// Todas as rotas administrativas exigem autenticação e Role ADMIN
adminSchoolRoutes.use(auth);
adminSchoolRoutes.use(requireRole(Role.ADMIN));

// POST /admin/schools - Cadastrar nova escola e gestor inicial
adminSchoolRoutes.post("/schools", (req, res) =>
  adminSchoolController.create(req, res)
);

// GET /admin/schools - Listar todas as escolas
adminSchoolRoutes.get("/schools", (req, res) =>
  adminSchoolController.list(req, res)
);

// PATCH /admin/schools/:id/status - Ativar / Desativar escola
adminSchoolRoutes.patch("/schools/:id/status", (req, res) =>
  adminSchoolController.updateStatus(req, res)
);

// POST /admin/schools/:id/manager - Criar gestor adicional para a escola
adminSchoolRoutes.post("/schools/:id/manager", (req, res) =>
  adminSchoolController.createManager(req, res)
);

// ============================================================================
// CURADORIA E SAÚDE DO BANCO DE QUESTÕES (ADMIN)
// ============================================================================
adminSchoolRoutes.get("/questions/health", async (_req, res) => {
  try {
    const [
      totalQuestions,
      withoutExplanation,
      withoutDifficulty,
      highErrorCount,
      byDifficulty,
    ] = await Promise.all([
      prisma.question.count(),
      prisma.question.count({ where: { OR: [{ explanation: null }, { explanation: "" }] } }),
      prisma.question.count({ where: { difficulty: null } }),
      prisma.question.count({ where: { errorRate: { gte: 0.8 } } }),
      prisma.question.groupBy({ by: ["difficulty"], _count: true }),
    ]);

    const flaggedQuestions = await prisma.question.findMany({
      where: {
        OR: [
          { explanation: null },
          { explanation: "" },
          { errorRate: { gte: 0.8 } },
        ],
      },
      select: {
        id: true,
        subject: true,
        year: true,
        difficulty: true,
        errorRate: true,
        explanation: true,
        text: true,
      },
      orderBy: [{ errorRate: "desc" }, { year: "desc" }],
      take: 25,
    });

    return res.json({
      totalQuestions,
      withoutExplanation,
      withoutDifficulty,
      highErrorCount,
      byDifficulty: byDifficulty.map((d) => ({
        difficulty: d.difficulty || "UNSET",
        count: d._count,
      })),
      flaggedQuestions,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Erro ao auditar banco de questões." });
  }
});

adminSchoolRoutes.post("/questions/recalibrate", async (_req, res) => {
  try {
    // Recalibra errorRate e difficulty com base nas tentativas reais registradas
    const grouped = await prisma.questionAttempt.groupBy({
      by: ["questionId", "isCorrect"],
      _count: true,
    });

    const statsMap = new Map<string, { total: number; wrong: number }>();
    for (const row of grouped) {
      const cur = statsMap.get(row.questionId) || { total: 0, wrong: 0 };
      cur.total += row._count;
      if (!row.isCorrect) cur.wrong += row._count;
      statsMap.set(row.questionId, cur);
    }

    let recalibratedCount = 0;
    for (const [questionId, st] of statsMap.entries()) {
      if (st.total < 3) continue;
      const errRate = Number((st.wrong / st.total).toFixed(3));
      const difficulty = errRate >= 0.65 ? "HARD" : errRate <= 0.35 ? "EASY" : "MEDIUM";
      await prisma.question.update({
        where: { id: questionId },
        data: { errorRate: errRate, difficulty },
      });
      recalibratedCount += 1;
    }

    return res.json({
      recalibratedCount,
      message: `${recalibratedCount} questão(ões) recalibrada(s) com base no histórico real.`,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Erro ao recalibrar questões." });
  }
});

// ============================================================================
// ATUALIZAÇÃO DINÂMICA DE NOTAS DE CORTE SISU (ADMIN)
// ============================================================================
adminSchoolRoutes.get("/sisu/overrides", async (_req, res) => {
  try {
    const items = await prisma.sisuCutoffOverride.findMany({
      orderBy: [{ updatedAt: "desc" }],
    });
    return res.json(items);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Erro ao listar notas SISU." });
  }
});

adminSchoolRoutes.put("/sisu/overrides", async (req, res) => {
  try {
    const institution = String(req.body?.institution || "").trim().toUpperCase();
    const courseSlug = String(req.body?.courseSlug || "").trim().toLowerCase();
    const modality = String(req.body?.modality || "AC").trim().toUpperCase();
    const cutoffScore = Math.min(900, Math.max(400, Math.round(Number(req.body?.cutoffScore) || 700)));
    const referenceEdition = String(req.body?.referenceEdition || "SISU 2026").trim();

    if (!institution || !courseSlug) {
      return res.status(400).json({ error: "Instituição e slug do curso são obrigatórios." });
    }

    const saved = await prisma.sisuCutoffOverride.upsert({
      where: {
        institution_courseSlug_modality: { institution, courseSlug, modality },
      },
      update: {
        cutoffScore,
        referenceEdition,
        updatedById: req.user!.id,
      },
      create: {
        institution,
        courseSlug,
        modality,
        cutoffScore,
        referenceEdition,
        updatedById: req.user!.id,
      },
    });

    return res.status(200).json(saved);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Erro ao atualizar nota de corte SISU." });
  }
});

// ============================================================================
// MONITORAMENTO DE TENANTS E STORAGE (ADMIN)
// ============================================================================
adminSchoolRoutes.get("/tenants/overview", async (_req, res) => {
  try {
    const [
      schoolsTotal,
      schoolsActive,
      usersActive,
      essaysCount,
      audioFeedbacksCount,
      pdfsCount,
      schoolsBreakdown,
    ] = await Promise.all([
      prisma.school.count(),
      prisma.school.count({ where: { isActive: true } }),
      prisma.user.count({ where: { isActive: true } }),
      prisma.essaySubmission.count(),
      prisma.questionFeedback.count({ where: { audioUrl: { not: null } } }),
      prisma.lesson.count({ where: { type: "PDF" } }),
      prisma.school.findMany({
        select: {
          id: true,
          name: true,
          code: true,
          isActive: true,
          _count: {
            select: { users: true, classrooms: true, institutionalExams: true },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
    ]);

    return res.json({
      storageProvider: getActiveStorageProviderName(),
      summary: {
        schoolsTotal,
        schoolsActive,
        schoolsInactive: schoolsTotal - schoolsActive,
        usersActive,
        essaysCount,
        audioFeedbacksCount,
        pdfsCount,
      },
      tenants: schoolsBreakdown.map((s) => ({
        id: s.id,
        name: s.name,
        code: s.code,
        isActive: s.isActive,
        usersCount: s._count.users,
        classroomsCount: s._count.classrooms,
        examsCount: s._count.institutionalExams,
      })),
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Erro ao carregar monitoramento de tenants." });
  }
});

export { adminSchoolRoutes };


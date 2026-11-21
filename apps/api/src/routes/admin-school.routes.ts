import { Router } from "express";
import { Role } from "@prisma/client";
import { adminSchoolController } from "../controllers/admin-school.controller";
import { auth, requireRole } from "../middlewares/auth.middleware";

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

// Curadoria e saúde do banco de questões
adminSchoolRoutes.get("/questions/health", (req, res) =>
  adminSchoolController.questionsHealth(req, res)
);
adminSchoolRoutes.post("/questions/recalibrate", (req, res) =>
  adminSchoolController.recalibrateQuestions(req, res)
);

// Atualização dinâmica de notas de corte SISU
adminSchoolRoutes.get("/sisu/overrides", (req, res) =>
  adminSchoolController.listSisuOverrides(req, res)
);
adminSchoolRoutes.put("/sisu/overrides", (req, res) =>
  adminSchoolController.upsertSisuOverride(req, res)
);

// Monitoramento global de tenants e uso de storage
adminSchoolRoutes.get("/tenants/overview", (req, res) =>
  adminSchoolController.tenantsOverview(req, res)
);

export { adminSchoolRoutes };

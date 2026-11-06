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

export { adminSchoolRoutes };


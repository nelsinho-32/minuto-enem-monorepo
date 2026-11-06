import { Router } from "express";
import { Role } from "@prisma/client";
import { schoolController } from "../controllers/school.controller";
import { announcementController } from "../controllers/announcement.controller";
import {
  auth,
  requireRole,
  requireTenantScope,
} from "../middlewares/auth.middleware";

const schoolRoutes = Router();

// Todas as rotas do painel escolar requerem autenticação, role SCHOOL ou ADMIN, e isolamento de tenant
schoolRoutes.use(auth);
schoolRoutes.use(requireRole([Role.SCHOOL, Role.ADMIN]));
schoolRoutes.use(requireTenantScope);

// GET /schools/me/overview - Métricas consolidadas da escola
schoolRoutes.get("/me/overview", (req, res) =>
  schoolController.getOverview(req, res)
);

// POST /schools/me/teachers - Cadastrar novo professor na escola
schoolRoutes.post("/me/teachers", (req, res) =>
  schoolController.createTeacher(req, res)
);

// GET /schools/me/teachers - Listar professores da escola
schoolRoutes.get("/me/teachers", (req, res) =>
  schoolController.listTeachers(req, res)
);

// POST /schools/me/classrooms - Criar turma vinculada à escola
schoolRoutes.post("/me/classrooms", (req, res) =>
  schoolController.createClassroom(req, res)
);

// GET /schools/me/classrooms - Listar turmas da escola
schoolRoutes.get("/me/classrooms", (req, res) =>
  schoolController.listClassrooms(req, res)
);

// Mural Institucional / Comunicados da Escola:
// POST /schools/me/announcements - Criar comunicado institucional
schoolRoutes.post("/me/announcements", (req, res) =>
  announcementController.create(req, res)
);

// GET /schools/me/announcements - Listar comunicados da própria escola
schoolRoutes.get("/me/announcements", (req, res) =>
  announcementController.listBySchool(req, res)
);

// DELETE /schools/me/announcements/:id - Remover comunicado da escola
schoolRoutes.delete("/me/announcements/:id", (req, res) =>
  announcementController.delete(req, res)
);

export { schoolRoutes };


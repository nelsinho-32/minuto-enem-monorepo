import { Router } from "express";
import { announcementController } from "../controllers/announcement.controller";
import { auth } from "../middlewares/auth.middleware";

const announcementRoutes = Router();

// GET /announcements (e /api/announcements) - Listagem filtrada por escola e targetAudience
announcementRoutes.get("/", auth, (req, res) =>
  announcementController.list(req, res)
);

export { announcementRoutes };


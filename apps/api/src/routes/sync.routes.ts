import { Router } from "express";
import { auth } from "../middlewares/auth.middleware";
import { syncController } from "../controllers/sync.controller";

const router = Router();

// Protegido com JWT
router.post("/batch", auth, (req, res) => syncController.batchSync(req, res));
router.post("/", auth, (req, res) => syncController.batchSync(req, res));

export const syncRoutes = router;


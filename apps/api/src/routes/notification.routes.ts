import { Router } from "express";
import { auth } from "../middlewares/auth.middleware";
import { realtimeNotificationService } from "../services/realtime-notification.service";
import {
  parsePaginationParams,
  setPaginationAndCacheHeaders,
} from "../utils/pagination";

const notificationRoutes = Router();

notificationRoutes.use(auth);

notificationRoutes.get("/", async (req, res) => {
  try {
    const userId = req.user!.id;
    const { page, limit } = parsePaginationParams(
      req.query as Record<string, any>,
      40,
      100
    );
    const data = await realtimeNotificationService.listUserNotifications(
      userId,
      limit
    );
    setPaginationAndCacheHeaders(res, {
      page,
      limit,
      total: Array.isArray(data?.items) ? data.items.length : undefined,
      maxAgeSeconds: 5,
    });
    return res.json(data);
  } catch (err: any) {
    return res
      .status(500)
      .json({ error: err?.message || "Erro ao listar notificações." });
  }
});

notificationRoutes.patch("/:id/read", async (req, res) => {
  try {
    const updated = await realtimeNotificationService.markAsRead(
      String(req.params.id),
      req.user!.id
    );
    return res.json({ updated });
  } catch (err: any) {
    return res
      .status(500)
      .json({ error: err?.message || "Erro ao marcar notificação como lida." });
  }
});

notificationRoutes.post("/read-all", async (req, res) => {
  try {
    const count = await realtimeNotificationService.markAllAsRead(req.user!.id);
    return res.json({ markedCount: count });
  } catch (err: any) {
    return res
      .status(500)
      .json({ error: err?.message || "Erro ao marcar todas como lidas." });
  }
});

notificationRoutes.post("/push-token", async (req, res) => {
  try {
    const token = String(req.body?.token || "").trim();
    const platform = String(req.body?.platform || "expo");
    const registered = await realtimeNotificationService.registerPushToken(
      req.user!.id,
      token,
      platform
    );
    if (!registered) {
      return res.status(400).json({ error: "Token Expo Push inválido." });
    }
    return res.json({ registered: true });
  } catch (err: any) {
    return res
      .status(500)
      .json({ error: err?.message || "Erro ao salvar push token." });
  }
});

export { notificationRoutes };

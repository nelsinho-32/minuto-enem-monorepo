import type { Server } from "socket.io";
import { prisma } from "../lib/prisma";

export type RealtimeNotificationType =
  | "ESSAY_GRADED"
  | "NEW_TASK"
  | "NEW_ANNOUNCEMENT"
  | "NEW_MESSAGE"
  | "DROPOUT_ALERT"
  | "INSTITUTIONAL_EXAM"
  | "QUESTION_FEEDBACK"
  | "CLASSROOM_TRANSFER"
  | "SYSTEM";

export interface RealtimeNotificationPayload {
  id: string;
  type: RealtimeNotificationType;
  title: string;
  body: string;
  route?: string;
  routeParams?: Record<string, string>;
  isRead?: boolean;
  createdAt: string;
}

/**
 * Serviço persistente + tempo real de Notificações e Push Tokens.
 * - Salva `PushToken` e `Notification` no PostgreSQL (Prisma).
 * - Emite imediatamente no canal pessoal `user:<id>` via Socket.IO.
 * - Encaminha opcionalmente para Expo Push API quando houver tokens cadastrados.
 */
class RealtimeNotificationService {
  private io: Server | null = null;

  registerSocketServer(ioServer: Server): void {
    this.io = ioServer;
  }

  async registerPushToken(
    userId: string,
    token: string,
    platform: string = "expo"
  ): Promise<boolean> {
    const trimmed = String(token || "").trim();
    if (!userId || !trimmed) return false;
    if (
      !trimmed.startsWith("ExponentPushToken[") &&
      !trimmed.startsWith("ExpoPushToken[")
    ) {
      return false;
    }

    await prisma.pushToken.upsert({
      where: { token: trimmed },
      create: {
        userId,
        token: trimmed,
        platform,
      },
      update: {
        userId,
        platform,
      },
    });
    return true;
  }

  async getPushTokens(userId: string): Promise<string[]> {
    try {
      const rows = await prisma.pushToken.findMany({
        where: { userId },
        select: { token: true },
      });
      return rows.map((r) => r.token);
    } catch {
      return [];
    }
  }

  private async dispatchExpoPush(
    tokens: string[],
    payload: RealtimeNotificationPayload
  ): Promise<void> {
    if (tokens.length === 0) return;

    const messages = tokens.map((to) => ({
      to,
      sound: "default",
      title: payload.title,
      body: payload.body,
      data: {
        id: payload.id,
        type: payload.type,
        route: payload.route || "/",
        routeParams: payload.routeParams || {},
      },
    }));

    try {
      await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(messages),
      });
    } catch {
      // Falha silenciosa em ambiente offline
    }
  }

  async notifyUser(
    userId: string,
    input: Omit<RealtimeNotificationPayload, "id" | "createdAt">
  ): Promise<RealtimeNotificationPayload> {
    let persistedId = `notif_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    let createdAt = new Date().toISOString();

    try {
      const saved = await prisma.notification.create({
        data: {
          userId,
          type: input.type,
          title: input.title,
          body: input.body,
          route: input.route || null,
          routeParams: input.routeParams ? (input.routeParams as any) : undefined,
        },
      });
      persistedId = saved.id;
      createdAt = saved.createdAt.toISOString();
    } catch {
      // Tolerante caso o usuário seja de teste/memória
    }

    const payload: RealtimeNotificationPayload = {
      ...input,
      id: persistedId,
      isRead: false,
      createdAt,
    };

    if (this.io) {
      this.io.to(`user:${userId}`).emit("notification:new", payload);
    }

    const tokens = await this.getPushTokens(userId);
    if (tokens.length > 0) {
      void this.dispatchExpoPush(tokens, payload);
    }

    return payload;
  }

  async notifyUsers(
    userIds: string[],
    input: Omit<RealtimeNotificationPayload, "id" | "createdAt">
  ): Promise<void> {
    const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
    await Promise.all(uniqueIds.map((uid) => this.notifyUser(uid, input)));
  }

  async notifyClassroomStudents(
    classroomId: string,
    input: Omit<RealtimeNotificationPayload, "id" | "createdAt">,
    excludeUserId?: string
  ): Promise<void> {
    try {
      const classroom = await prisma.classroom.findUnique({
        where: { id: classroomId },
        select: {
          students: { select: { id: true } },
        },
      });
      if (!classroom) return;

      const targets = classroom.students
        .map((s) => s.id)
        .filter((id) => id !== excludeUserId);

      await this.notifyUsers(targets, input);
    } catch {
      // Não bloqueia fluxo principal
    }
  }

  async listUserNotifications(userId: string, limit: number = 40) {
    const items = await prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(limit, 1), 100),
    });

    const unreadCount = await prisma.notification.count({
      where: { userId, isRead: false },
    });

    return {
      unreadCount,
      items: items.map((n) => ({
        id: n.id,
        type: n.type as RealtimeNotificationType,
        title: n.title,
        body: n.body,
        route: n.route || "/",
        routeParams: (n.routeParams as Record<string, string>) || undefined,
        isRead: n.isRead,
        readAt: n.readAt,
        createdAt: n.createdAt.toISOString(),
      })),
    };
  }

  async markAsRead(notificationId: string, userId: string): Promise<boolean> {
    const result = await prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { isRead: true, readAt: new Date() },
    });
    return result.count > 0;
  }

  async markAllAsRead(userId: string): Promise<number> {
    const result = await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return result.count;
  }
}

export const realtimeNotificationService = new RealtimeNotificationService();

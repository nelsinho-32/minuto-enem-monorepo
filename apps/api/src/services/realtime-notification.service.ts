import type { Server } from "socket.io";
import { prisma } from "../lib/prisma";

export type RealtimeNotificationType =
  | "ESSAY_GRADED"
  | "NEW_TASK"
  | "NEW_ANNOUNCEMENT"
  | "NEW_MESSAGE"
  | "SYSTEM";

export interface RealtimeNotificationPayload {
  id: string;
  type: RealtimeNotificationType;
  title: string;
  body: string;
  route?: string;
  routeParams?: Record<string, string>;
  createdAt: string;
}

/**
 * Serviço central de Notificações em Tempo Real (Socket.IO `user:<id>`)
 * + encaminhamento opcional para Expo Push Notifications quando o dispositivo
 * registra seu `ExponentPushToken[...]`.
 */
class RealtimeNotificationService {
  private io: Server | null = null;
  private pushTokensByUser = new Map<string, Set<string>>();

  registerSocketServer(ioServer: Server): void {
    this.io = ioServer;
  }

  registerPushToken(userId: string, token: string): boolean {
    const trimmed = String(token || "").trim();
    if (!userId || !trimmed) return false;
    if (
      !trimmed.startsWith("ExponentPushToken[") &&
      !trimmed.startsWith("ExpoPushToken[")
    ) {
      return false;
    }

    if (!this.pushTokensByUser.has(userId)) {
      this.pushTokensByUser.set(userId, new Set());
    }
    this.pushTokensByUser.get(userId)!.add(trimmed);
    return true;
  }

  getPushTokens(userId: string): string[] {
    return Array.from(this.pushTokensByUser.get(userId) || []);
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
      // Falha silenciosa em ambientes offline/sem internet
    }
  }

  notifyUser(
    userId: string,
    input: Omit<RealtimeNotificationPayload, "id" | "createdAt">
  ): RealtimeNotificationPayload {
    const payload: RealtimeNotificationPayload = {
      ...input,
      id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      createdAt: new Date().toISOString(),
    };

    if (this.io) {
      this.io.to(`user:${userId}`).emit("notification:new", payload);
    }

    const tokens = this.getPushTokens(userId);
    if (tokens.length > 0) {
      void this.dispatchExpoPush(tokens, payload);
    }

    return payload;
  }

  notifyUsers(
    userIds: string[],
    input: Omit<RealtimeNotificationPayload, "id" | "createdAt">
  ): void {
    const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
    for (const uid of uniqueIds) {
      this.notifyUser(uid, input);
    }
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

      this.notifyUsers(targets, input);
    } catch {
      // Não bloqueia operação principal se notificação falhar
    }
  }
}

export const realtimeNotificationService = new RealtimeNotificationService();

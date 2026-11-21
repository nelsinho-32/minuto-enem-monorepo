import { Server, Socket } from "socket.io";
import { chatService } from "../services/chat.service";
import type { SocketUserContext } from "./socket-auth.middleware";

/**
 * Configura eventos em tempo real do Chat entre Usuários via Socket.IO.
 * Eventos suportados:
 * - chat:join_room   -> valida autenticação JWT + acesso à sala e entra em `chat:<roomId>`
 * - chat:leave_room  -> sai da sala `chat:<roomId>`
 * - chat:typing      -> notifica outros participantes apenas se o socket já ingressou na sala
 */
export function setupChatWebSocket(io: Server): void {
  io.on("connection", (socket: Socket) => {
    const authUser = socket.data?.user as SocketUserContext | undefined;

    socket.on("chat:join_room", async (payload: { roomId?: string }) => {
      const roomId = payload?.roomId;
      if (!roomId || typeof roomId !== "string") return;

      if (!authUser?.isAuthenticated || !authUser.id) {
        socket.emit("chat:error", {
          error: "Autenticação JWT obrigatória para acessar salas do chat.",
          roomId,
        });
        return;
      }

      try {
        await chatService.assertRoomAccess(roomId, authUser.id);
        await socket.join(`chat:${roomId}`);
        socket.emit("chat:room_joined", { roomId });
      } catch (err: any) {
        socket.emit("chat:error", {
          error: err?.message || "Acesso negado à sala de chat.",
          roomId,
        });
      }
    });

    socket.on("chat:leave_room", (payload: { roomId?: string }) => {
      const roomId = payload?.roomId;
      if (roomId && typeof roomId === "string") {
        socket.leave(`chat:${roomId}`);
      }
    });

    socket.on(
      "chat:typing",
      (payload: { roomId?: string; userName?: string; isTyping?: boolean }) => {
        const roomId = payload?.roomId;
        if (!roomId || !authUser?.isAuthenticated) return;

        // Só propaga indicador de digitação se o socket estiver legitimamente na sala
        if (!socket.rooms.has(`chat:${roomId}`)) return;

        socket.to(`chat:${roomId}`).emit("chat:user_typing", {
          roomId,
          userName: authUser.name || payload.userName || "Estudante",
          isTyping: Boolean(payload.isTyping),
        });
      }
    );
  });
}

import { Server, Socket } from "socket.io";

/**
 * Configura eventos em tempo real do Chat entre Usuários via Socket.IO.
 * Eventos suportados:
 * - chat:join_room   -> entra na sala `chat:<roomId>`
 * - chat:leave_room  -> sai da sala `chat:<roomId>`
 * - chat:typing      -> notifica outros participantes que o usuário está digitando
 */
export function setupChatWebSocket(io: Server): void {
  io.on("connection", (socket: Socket) => {
    socket.on("chat:join_room", (payload: { roomId?: string }) => {
      const roomId = payload?.roomId;
      if (roomId && typeof roomId === "string") {
        socket.join(`chat:${roomId}`);
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
        if (payload?.roomId) {
          socket.to(`chat:${payload.roomId}`).emit("chat:user_typing", {
            roomId: payload.roomId,
            userName: payload.userName || "Alguém",
            isTyping: Boolean(payload.isTyping),
          });
        }
      }
    );
  });
}

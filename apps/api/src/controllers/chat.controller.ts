import { Request, Response } from "express";
import { chatService } from "../services/chat.service";
import { AppError } from "../errors/AppError";
import { io } from "../server";

export class ChatController {
  private handleError(error: unknown, res: Response): Response {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    const message =
      error instanceof Error ? error.message : "Erro interno no servidor.";
    return res.status(500).json({ error: message });
  }

  /**
   * GET /chat/rooms
   */
  async listRooms(req: Request, res: Response): Promise<Response> {
    try {
      const userId = req.user?.id;
      if (!userId) throw new AppError("Usuário não autenticado.", 401);

      const rooms = await chatService.listUserRooms(userId);
      return res.status(200).json(rooms);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * GET /chat/users?q=...
   */
  async searchUsers(req: Request, res: Response): Promise<Response> {
    try {
      const userId = req.user?.id;
      if (!userId) throw new AppError("Usuário não autenticado.", 401);

      const query = (req.query.q || req.query.search || "") as string;
      const users = await chatService.searchUsersForChat(userId, query);
      return res.status(200).json(users);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * POST /chat/direct
   */
  async createDirectRoom(req: Request, res: Response): Promise<Response> {
    try {
      const userId = req.user?.id;
      if (!userId) throw new AppError("Usuário não autenticado.", 401);

      const targetUserId = String(req.body?.targetUserId || "");
      const room = await chatService.getOrCreateDirectRoom(userId, targetUserId);
      return res.status(200).json(room);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * GET /chat/rooms/:roomId/messages
   */
  async getMessages(req: Request, res: Response): Promise<Response> {
    try {
      const userId = req.user?.id;
      if (!userId) throw new AppError("Usuário não autenticado.", 401);

      const roomId = String(req.params.roomId);
      const limit = req.query.limit ? Number(req.query.limit) : 60;
      const messages = await chatService.getRoomMessages(roomId, userId, limit);
      return res.status(200).json(messages);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * POST /chat/rooms/:roomId/messages
   */
  async sendMessage(req: Request, res: Response): Promise<Response> {
    try {
      const userId = req.user?.id;
      if (!userId) throw new AppError("Usuário não autenticado.", 401);

      const roomId = String(req.params.roomId);
      const { content, category, subjectTag } = req.body || {};

      const message = await chatService.sendMessage({
        roomId,
        senderId: userId,
        content,
        category,
        subjectTag,
      });

      // Transmite em tempo real via Socket.IO para todos os usuários conectados na sala
      io.to(`chat:${roomId}`).emit("chat:new_message", message);

      return res.status(201).json(message);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * POST /chat/messages/:messageId/like
   */
  async toggleLike(req: Request, res: Response): Promise<Response> {
    try {
      const userId = req.user?.id;
      if (!userId) throw new AppError("Usuário não autenticado.", 401);

      const messageId = String(req.params.messageId);
      const result = await chatService.toggleLikeMessage(messageId, userId);

      io.to(`chat:${result.roomId}`).emit("chat:message_liked", {
        messageId: result.id,
        likesCount: result.likesCount,
      });

      return res.status(200).json(result);
    } catch (error) {
      return this.handleError(error, res);
    }
  }
}

export const chatController = new ChatController();

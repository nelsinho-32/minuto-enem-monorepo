import { Router } from "express";
import { chatController } from "../controllers/chat.controller";
import { auth } from "../middlewares/auth.middleware";

const chatRoutes = Router();

// Todas as rotas de chat entre usuários exigem autenticação
chatRoutes.use(auth);

chatRoutes.get("/rooms", (req, res) => chatController.listRooms(req, res));
chatRoutes.get("/users", (req, res) => chatController.searchUsers(req, res));
chatRoutes.post("/direct", (req, res) =>
  chatController.createDirectRoom(req, res)
);
chatRoutes.get("/rooms/:roomId/messages", (req, res) =>
  chatController.getMessages(req, res)
);
chatRoutes.post("/rooms/:roomId/messages", (req, res) =>
  chatController.sendMessage(req, res)
);
chatRoutes.post("/messages/:messageId/like", (req, res) =>
  chatController.toggleLike(req, res)
);

export { chatRoutes };

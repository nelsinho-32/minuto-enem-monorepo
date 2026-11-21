import { ChatRoomType } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { AppError } from "../errors/AppError";
import { realtimeNotificationService } from "./realtime-notification.service";

export const VALID_CHAT_CATEGORIES = ["GERAL", "DUVIDA", "MACETE", "QUESTAO"] as const;
export type ChatCategoryType = (typeof VALID_CHAT_CATEGORIES)[number];

export class ChatService {
  /**
   * Garante que a sala global "Comunidade ENEM" exista no banco de dados.
   */
  async ensureGlobalRoom() {
    let globalRoom = await prisma.chatRoom.findFirst({
      where: { type: ChatRoomType.GLOBAL },
    });

    if (!globalRoom) {
      globalRoom = await prisma.chatRoom.create({
        data: {
          name: "Comunidade ENEM",
          type: ChatRoomType.GLOBAL,
        },
      });
    }

    return globalRoom;
  }

  /**
   * Garante que uma turma específica tenha uma sala de chat vinculada.
   */
  async ensureClassroomRoom(classroomId: string) {
    const classroom = await prisma.classroom.findUnique({
      where: { id: classroomId },
      select: { id: true, name: true, code: true },
    });

    if (!classroom) {
      throw new AppError("Turma não encontrada.", 404);
    }

    let room = await prisma.chatRoom.findUnique({
      where: { classroomId: classroom.id },
    });

    if (!room) {
      room = await prisma.chatRoom.create({
        data: {
          name: `Turma: ${classroom.name}`,
          type: ChatRoomType.CLASSROOM,
          classroomId: classroom.id,
        },
      });
    }

    return room;
  }

  /**
   * Lista todas as salas disponíveis para o usuário autenticado:
   * 1. Comunidade ENEM (Global)
   * 2. Salas das Turmas em que o usuário está matriculado ou leciona
   * 3. Conversas Diretas (DM 1-a-1) iniciadas pelo ou com o usuário
   */
  async listUserRooms(userId: string) {
    const globalRoom = await this.ensureGlobalRoom();

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        enrolledClassrooms: {
          select: { id: true, name: true, code: true },
        },
        createdClassrooms: {
          select: { id: true, name: true, code: true },
        },
      },
    });

    if (!user) {
      throw new AppError("Usuário não encontrado.", 404);
    }

    // Garante salas para todas as turmas do usuário (como aluno ou professor)
    const allClassroomsMap = new Map<string, { id: string; name: string; code: string }>();
    for (const c of user.enrolledClassrooms) allClassroomsMap.set(c.id, c);
    for (const c of user.createdClassrooms) allClassroomsMap.set(c.id, c);

    const classroomRooms = [];
    for (const c of allClassroomsMap.values()) {
      const room = await this.ensureClassroomRoom(c.id);
      classroomRooms.push(room);
    }

    // Busca salas de Mensagens Diretas (DM) em que o usuário participa
    const directRooms = await prisma.chatRoom.findMany({
      where: {
        type: ChatRoomType.DIRECT,
        participants: {
          some: { id: userId },
        },
      },
      include: {
        participants: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    const allRoomIds = [
      globalRoom.id,
      ...classroomRooms.map((r) => r.id),
      ...directRooms.map((r) => r.id),
    ];

    // Busca a última mensagem de cada sala para exibição na sidebar
    const lastMessages = await Promise.all(
      allRoomIds.map(async (roomId) => {
        const msg = await prisma.chatMessage.findFirst({
          where: { roomId },
          orderBy: { createdAt: "desc" },
          include: {
            sender: { select: { id: true, name: true, role: true } },
          },
        });
        const count = await prisma.chatMessage.count({ where: { roomId } });
        return { roomId, lastMessage: msg, messagesCount: count };
      })
    );

    const metaMap = new Map(lastMessages.map((m) => [m.roomId, m]));

    const formatRoom = (room: any, extra: Record<string, any> = {}) => {
      const meta = metaMap.get(room.id);
      return {
        id: room.id,
        name: room.name,
        type: room.type,
        classroomId: room.classroomId || null,
        messagesCount: meta?.messagesCount ?? 0,
        lastMessage: meta?.lastMessage
          ? {
              id: meta.lastMessage.id,
              content: meta.lastMessage.content,
              senderName: meta.lastMessage.sender.name,
              createdAt: meta.lastMessage.createdAt,
            }
          : null,
        updatedAt: room.updatedAt,
        ...extra,
      };
    };

    const formattedDirects = directRooms.map((dr) => {
      const other = dr.participants.find((p) => p.id !== userId) || dr.participants[0];
      return formatRoom(
        { ...dr, name: other ? other.name : dr.name },
        {
          peer: other || null,
        }
      );
    });

    return {
      global: formatRoom(globalRoom),
      classrooms: classroomRooms.map((cr) => formatRoom(cr)),
      directs: formattedDirects,
    };
  }

  /**
   * Busca outros usuários do sistema (colegas, professores, escola) para iniciar conversa direta.
   */
  async searchUsersForChat(currentUserId: string, query?: string) {
    const trimmed = (query || "").trim();

    const users = await prisma.user.findMany({
      where: {
        id: { not: currentUserId },
        ...(trimmed
          ? {
              OR: [
                { name: { contains: trimmed, mode: "insensitive" } },
                { email: { contains: trimmed, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        school: { select: { name: true } },
      },
      orderBy: { name: "asc" },
      take: 30,
    });

    return users;
  }

  /**
   * Cria ou recupera uma sala de Mensagem Direta (1-a-1) entre dois usuários.
   */
  async getOrCreateDirectRoom(currentUserId: string, targetUserId: string) {
    if (!targetUserId || targetUserId === currentUserId) {
      throw new AppError("Selecione outro usuário válido para conversar.", 400);
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, name: true, email: true, role: true },
    });

    if (!targetUser) {
      throw new AppError("Usuário destinatário não encontrado.", 404);
    }

    const directKey = [currentUserId, targetUserId].sort().join("_");

    let room = await prisma.chatRoom.findUnique({
      where: { directKey },
      include: {
        participants: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
    });

    if (!room) {
      room = await prisma.chatRoom.create({
        data: {
          name: targetUser.name,
          type: ChatRoomType.DIRECT,
          directKey,
          participants: {
            connect: [{ id: currentUserId }, { id: targetUserId }],
          },
        },
        include: {
          participants: {
            select: { id: true, name: true, email: true, role: true },
          },
        },
      });
    }

    return {
      id: room.id,
      name: targetUser.name,
      type: room.type,
      peer: targetUser,
    };
  }

  /**
   * Verifica se o usuário tem permissão para acessar a sala.
   */
  async assertRoomAccess(roomId: string, userId: string) {
    const room = await prisma.chatRoom.findUnique({
      where: { id: roomId },
      include: {
        participants: { select: { id: true } },
        classroom: {
          select: {
            id: true,
            teacherId: true,
            students: { select: { id: true } },
          },
        },
      },
    });

    if (!room) {
      throw new AppError("Sala de chat não encontrada.", 404);
    }

    if (room.type === ChatRoomType.GLOBAL) {
      return room;
    }

    if (room.type === ChatRoomType.DIRECT) {
      const isParticipant = room.participants.some((p) => p.id === userId);
      if (!isParticipant) {
        throw new AppError("Você não tem permissão para acessar esta conversa.", 403);
      }
      return room;
    }

    if (room.type === ChatRoomType.CLASSROOM && room.classroom) {
      const isMember =
        room.classroom.teacherId === userId ||
        room.classroom.students.some((s) => s.id === userId);
      if (!isMember) {
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { role: true },
        });
        if (user?.role !== "ADMIN" && user?.role !== "SCHOOL") {
          throw new AppError("Você não pertence a esta turma.", 403);
        }
      }
      return room;
    }

    return room;
  }

  /**
   * Lista as mensagens de uma sala em ordem cronológica.
   */
  async getRoomMessages(roomId: string, userId: string, limit = 60) {
    await this.assertRoomAccess(roomId, userId);

    const safeLimit = Math.min(Math.max(Number(limit) || 60, 1), 150);

    const messages = await prisma.chatMessage.findMany({
      where: { roomId },
      orderBy: { createdAt: "desc" },
      take: safeLimit,
      include: {
        sender: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
    });

    return messages.reverse().map((m) => ({
      id: m.id,
      roomId: m.roomId,
      senderId: m.senderId,
      senderName: m.sender.name,
      senderRole: m.sender.role,
      content: m.content,
      category: m.category,
      subjectTag: m.subjectTag,
      likesCount: m.likedByIds.length,
      likedByMe: m.likedByIds.includes(userId),
      createdAt: m.createdAt,
    }));
  }

  /**
   * Envia e persiste uma nova mensagem em uma sala.
   */
  async sendMessage(params: {
    roomId: string;
    senderId: string;
    content: string;
    category?: string;
    subjectTag?: string;
  }) {
    const { roomId, senderId, content, category, subjectTag } = params;

    const cleanContent = (content || "").trim();
    if (!cleanContent) {
      throw new AppError("A mensagem não pode estar vazia.", 400);
    }
    if (cleanContent.length > 2000) {
      throw new AppError("A mensagem excede o limite de 2000 caracteres.", 400);
    }

    const room = await this.assertRoomAccess(roomId, senderId);

    const normalizedCategory = VALID_CHAT_CATEGORIES.includes(
      (category || "").toUpperCase() as ChatCategoryType
    )
      ? (category || "GERAL").toUpperCase()
      : "GERAL";

    const created = await prisma.chatMessage.create({
      data: {
        roomId,
        senderId,
        content: cleanContent,
        category: normalizedCategory,
        subjectTag: subjectTag?.trim() || null,
      },
      include: {
        sender: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
    });

    await prisma.chatRoom.update({
      where: { id: roomId },
      data: { updatedAt: new Date() },
    });

    // Notifica destinatários em tempo real quando for mensagem direta (DM)
    if (room.type === ChatRoomType.DIRECT) {
      const recipientIds = room.participants
        .map((p) => p.id)
        .filter((id) => id !== senderId);
      if (recipientIds.length > 0) {
        realtimeNotificationService.notifyUsers(recipientIds, {
          type: "NEW_MESSAGE",
          title: `Nova mensagem de ${created.sender.name}`,
          body: cleanContent.slice(0, 100),
          route: "/chat",
        });
      }
    }

    return {
      id: created.id,
      roomId: created.roomId,
      senderId: created.senderId,
      senderName: created.sender.name,
      senderRole: created.sender.role,
      content: created.content,
      category: created.category,
      subjectTag: created.subjectTag,
      likesCount: 0,
      likedByMe: false,
      createdAt: created.createdAt,
    };
  }

  /**
   * Curte ou descurte uma mensagem no chat (toggle).
   */
  async toggleLikeMessage(messageId: string, userId: string) {
    const msg = await prisma.chatMessage.findUnique({
      where: { id: messageId },
    });

    if (!msg) {
      throw new AppError("Mensagem não encontrada.", 404);
    }

    await this.assertRoomAccess(msg.roomId, userId);

    const alreadyLiked = msg.likedByIds.includes(userId);
    const updatedLikedByIds = alreadyLiked
      ? msg.likedByIds.filter((id) => id !== userId)
      : [...msg.likedByIds, userId];

    const updated = await prisma.chatMessage.update({
      where: { id: messageId },
      data: { likedByIds: updatedLikedByIds },
    });

    return {
      id: updated.id,
      roomId: updated.roomId,
      likesCount: updated.likedByIds.length,
      likedByMe: !alreadyLiked,
    };
  }
}

export const chatService = new ChatService();

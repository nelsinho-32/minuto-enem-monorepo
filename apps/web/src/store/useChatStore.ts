import { create } from 'zustand';
import { api } from '@/services/api';

export type ChatCategory = 'GERAL' | 'DUVIDA' | 'MACETE' | 'QUESTAO';
export type ChatRoomType = 'GLOBAL' | 'CLASSROOM' | 'DIRECT';

export interface ChatRoomItem {
  id: string;
  name: string;
  type: ChatRoomType;
  classroomId?: string | null;
  messagesCount?: number;
  lastMessage?: {
    id: string;
    content: string;
    senderName: string;
    createdAt: string;
  } | null;
  peer?: {
    id: string;
    name: string;
    email: string;
    role: string;
  } | null;
  updatedAt?: string;
}

export interface ChatMessageItem {
  id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  content: string;
  category: ChatCategory;
  subjectTag?: string | null;
  likesCount: number;
  likedByMe: boolean;
  createdAt: string;
}

export interface ChatUserOption {
  id: string;
  name: string;
  email: string;
  role: string;
  school?: { name: string } | null;
}

interface ChatState {
  globalRoom: ChatRoomItem | null;
  classroomRooms: ChatRoomItem[];
  directRooms: ChatRoomItem[];
  activeRoomId: string | null;
  messagesByRoom: Record<string, ChatMessageItem[]>;
  isLoadingRooms: boolean;
  isLoadingMessages: boolean;
  isSending: boolean;
  error: string | null;

  fetchRooms: () => Promise<void>;
  setActiveRoomId: (roomId: string) => void;
  fetchMessages: (roomId: string) => Promise<void>;
  sendMessage: (params: {
    roomId: string;
    content: string;
    category?: ChatCategory;
    subjectTag?: string;
  }) => Promise<ChatMessageItem | null>;
  appendIncomingMessage: (msg: ChatMessageItem) => void;
  updateMessageLikes: (messageId: string, likesCount: number, likedByMe?: boolean) => void;
  toggleLike: (messageId: string) => Promise<void>;
  startDirectChat: (targetUserId: string) => Promise<ChatRoomItem | null>;
  searchUsers: (query: string) => Promise<ChatUserOption[]>;
}

export const useChatStore = create<ChatState>((set, get) => ({
  globalRoom: null,
  classroomRooms: [],
  directRooms: [],
  activeRoomId: null,
  messagesByRoom: {},
  isLoadingRooms: false,
  isLoadingMessages: false,
  isSending: false,
  error: null,

  fetchRooms: async () => {
    set({ isLoadingRooms: true, error: null });
    try {
      const data = await api.get<{
        global: ChatRoomItem;
        classrooms: ChatRoomItem[];
        directs: ChatRoomItem[];
      }>('/chat/rooms');

      const currentActive = get().activeRoomId;
      const privateAndClassRooms = [
        ...(data.directs || []),
        ...(data.classrooms || []),
      ];
      const allRooms = [
        ...privateAndClassRooms,
        ...(data.global ? [data.global] : []),
      ];
      const stillExists = allRooms.some((r) => r.id === currentActive);
      // Prioriza chats com colegas/professores/escola e turmas no lugar do chat global
      const nextActive = stillExists
        ? currentActive
        : privateAndClassRooms[0]?.id || null;

      set({
        globalRoom: data.global || null,
        classroomRooms: data.classrooms || [],
        directRooms: data.directs || [],
        activeRoomId: nextActive,
        isLoadingRooms: false,
      });

      if (nextActive) {
        await get().fetchMessages(nextActive);
      }
    } catch (err: any) {
      set({
        isLoadingRooms: false,
        error: err?.message || 'Não foi possível carregar as conversas.',
      });
    }
  },

  setActiveRoomId: (roomId: string) => {
    set({ activeRoomId: roomId });
    get().fetchMessages(roomId);
  },

  fetchMessages: async (roomId: string) => {
    if (!roomId) return;
    set({ isLoadingMessages: true });
    try {
      const msgs = await api.get<ChatMessageItem[]>(
        `/chat/rooms/${roomId}/messages?limit=80`
      );
      set((state) => ({
        messagesByRoom: {
          ...state.messagesByRoom,
          [roomId]: Array.isArray(msgs) ? msgs : [],
        },
        isLoadingMessages: false,
      }));
    } catch {
      set({ isLoadingMessages: false });
    }
  },

  sendMessage: async ({ roomId, content, category = 'GERAL', subjectTag }) => {
    const trimmed = content.trim();
    if (!trimmed || !roomId) return null;

    set({ isSending: true, error: null });
    try {
      const created = await api.post<ChatMessageItem>(
        `/chat/rooms/${roomId}/messages`,
        {
          content: trimmed,
          category,
          subjectTag: subjectTag?.trim() || undefined,
        }
      );

      get().appendIncomingMessage(created);
      set({ isSending: false });
      return created;
    } catch (err: any) {
      set({
        isSending: false,
        error: err?.message || 'Erro ao enviar mensagem.',
      });
      return null;
    }
  },

  appendIncomingMessage: (msg: ChatMessageItem) => {
    set((state) => {
      const existing = state.messagesByRoom[msg.roomId] || [];
      if (existing.some((m) => m.id === msg.id)) {
        return state;
      }

      const updateRoomMeta = (room: ChatRoomItem) =>
        room.id === msg.roomId
          ? {
              ...room,
              messagesCount: (room.messagesCount || 0) + 1,
              lastMessage: {
                id: msg.id,
                content: msg.content,
                senderName: msg.senderName,
                createdAt: msg.createdAt,
              },
            }
          : room;

      return {
        messagesByRoom: {
          ...state.messagesByRoom,
          [msg.roomId]: [...existing, msg],
        },
        globalRoom: state.globalRoom ? updateRoomMeta(state.globalRoom) : null,
        classroomRooms: state.classroomRooms.map(updateRoomMeta),
        directRooms: state.directRooms.map(updateRoomMeta),
      };
    });
  },

  updateMessageLikes: (messageId, likesCount, likedByMe) => {
    set((state) => {
      const updatedMap: Record<string, ChatMessageItem[]> = {};
      for (const [roomId, list] of Object.entries(state.messagesByRoom)) {
        updatedMap[roomId] = list.map((m) =>
          m.id === messageId
            ? {
                ...m,
                likesCount,
                ...(likedByMe !== undefined ? { likedByMe } : {}),
              }
            : m
        );
      }
      return { messagesByRoom: updatedMap };
    });
  },

  toggleLike: async (messageId: string) => {
    try {
      const res = await api.post<{
        id: string;
        likesCount: number;
        likedByMe: boolean;
      }>(`/chat/messages/${messageId}/like`);
      get().updateMessageLikes(res.id, res.likesCount, res.likedByMe);
    } catch {
      // Falha silenciosa
    }
  },

  startDirectChat: async (targetUserId: string) => {
    try {
      const room = await api.post<ChatRoomItem>('/chat/direct', {
        targetUserId,
      });
      await get().fetchRooms();
      if (room?.id) {
        set({ activeRoomId: room.id });
        await get().fetchMessages(room.id);
      }
      return room;
    } catch (err: any) {
      set({ error: err?.message || 'Não foi possível iniciar conversa.' });
      return null;
    }
  },

  searchUsers: async (query: string) => {
    try {
      const users = await api.get<ChatUserOption[]>(
        `/chat/users?q=${encodeURIComponent(query)}`
      );
      return Array.isArray(users) ? users : [];
    } catch {
      return [];
    }
  },
}));

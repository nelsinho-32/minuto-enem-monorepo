import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { safeStorage } from '@/services/safeStorage';
import { api, BASE_URL } from '@/services/api';
import { useUserStore } from './useUserStore';

export type ChatCategory = 'MACETE' | 'QUESTAO' | 'DUVIDA' | 'GERAL';

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  isMe?: boolean;
  category: ChatCategory;
  subjectTag?: string;
  content: string;
  timestamp: string;
  likes: number;
  likedByMe?: boolean;
}

export interface SocraticMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  subjectTag?: string;
  timestamp: string;
  isStreaming?: boolean;
  questionId?: string;
  relatedLessons?: { id: string; title: string; subject: string }[];
}

export interface QuestionSearchResult {
  id: string;
  year: number;
  area: string;
  subject: string;
  text: string;
  errorRate?: number;
  similarityScore?: number;
}

const INITIAL_COMMUNITY_MESSAGES: ChatMessage[] = [
  {
    id: 'msg-1',
    senderId: 'user-carlos',
    senderName: 'Carlos Eduardo',
    category: 'MACETE',
    subjectTag: 'Matemática',
    content:
      'Macete para Vértice da Parábola: Xv = -b / (2a) e Yv = -Δ / (4a). Sempre cai para calcular pontos máximos de lucro ou altitude!',
    timestamp: '14:20',
    likes: 5,
    likedByMe: true,
  },
  {
    id: 'msg-2',
    senderId: 'user-ana',
    senderName: 'Ana Beatriz',
    category: 'QUESTAO',
    subjectTag: 'Física',
    content:
      'Alguém conseguiu resolver a questão de Termodinâmica sobre rendimento do ciclo de Carnot?',
    timestamp: '15:05',
    likes: 3,
  },
  {
    id: 'msg-3',
    senderId: 'user-lucas',
    senderName: 'Lucas Silva',
    category: 'DUVIDA',
    subjectTag: 'Literatura',
    content:
      'Qual a diferença crucial entre a 1ª fase (destruição) e a 2ª fase (construção/social) do Modernismo no ENEM?',
    timestamp: '16:12',
    likes: 2,
  },
];

const INITIAL_SOCRATIC_MESSAGES: SocraticMessage[] = [
  {
    id: 'welcome-socratic',
    role: 'assistant',
    subjectTag: 'Método Socrático',
    timestamp: 'Agora',
    content:
      'Olá! Sou o seu **Tutor Socrático de IA** para o ENEM. 🧠\n\nMeu objetivo é guiar seu raciocínio com **perguntas estratégicas**, conexões interdisciplinares e análise de distratores sem entregar a resposta pronta de imediato.\n\n```python\n# Algoritmo de Aprendizagem Socrática\ndef resolver_duvida(enunciado, duvida_aluno):\n    conceito_chave = identificar_fundamento(enunciado)\n    return construir_solucao_passo_a_passo(conceito_chave)\n```\n\nQual tema, fórmula ou questão do ENEM você gostaria de explorar hoje?',
  },
];

interface ChatState {
  // Chat da Comunidade
  messages: ChatMessage[];
  addMessage: (msg: Omit<ChatMessage, 'id' | 'timestamp' | 'likes'>) => void;
  toggleLike: (id: string) => void;

  // Tutor Socrático com IA e RAG
  socraticMessages: SocraticMessage[];
  activeSubject: string;
  isTyping: boolean;
  searchResults: QuestionSearchResult[];
  isSearching: boolean;

  setActiveSubject: (subject: string) => void;
  sendSocraticMessage: (
    userText: string,
    subject?: string,
    questionId?: string
  ) => Promise<void>;
  searchQuestions: (query: string, area?: string) => Promise<QuestionSearchResult[]>;
  clearSocraticMessages: () => void;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      messages: INITIAL_COMMUNITY_MESSAGES,
      socraticMessages: INITIAL_SOCRATIC_MESSAGES,
      activeSubject: 'Matemática',
      isTyping: false,
      searchResults: [],
      isSearching: false,

      setActiveSubject: (subject: string) => set({ activeSubject: subject }),

      addMessage: (newMsg) => {
        const now = new Date();
        const timestamp = `${now.getHours().toString().padStart(2, '0')}:${now
          .getMinutes()
          .toString()
          .padStart(2, '0')}`;
        const message: ChatMessage = {
          ...newMsg,
          id: `chat-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          timestamp,
          likes: 0,
          likedByMe: false,
          isMe: true,
        };

        set((state) => ({
          messages: [message, ...state.messages],
        }));
      },

      toggleLike: (id: string) => {
        set((state) => ({
          messages: state.messages.map((m) => {
            if (m.id !== id) return m;
            const liked = !m.likedByMe;
            return {
              ...m,
              likedByMe: liked,
              likes: liked ? m.likes + 1 : Math.max(0, m.likes - 1),
            };
          }),
        }));
      },

      sendSocraticMessage: async (
        userText: string,
        subjectParam?: string,
        questionId?: string
      ) => {
        const currentSubject = subjectParam || get().activeSubject;
        const now = new Date();
        const timestamp = `${now.getHours().toString().padStart(2, '0')}:${now
          .getMinutes()
          .toString()
          .padStart(2, '0')}`;

        const userMsg: SocraticMessage = {
          id: `user_${Date.now()}`,
          role: 'user',
          content: userText,
          subjectTag: currentSubject,
          timestamp,
          questionId,
        };

        const assistantMsgId = `assistant_${Date.now() + 1}`;
        const placeholderAssistant: SocraticMessage = {
          id: assistantMsgId,
          role: 'assistant',
          content: '',
          subjectTag: currentSubject,
          timestamp,
          isStreaming: true,
        };

        set((state) => ({
          socraticMessages: [...state.socraticMessages, userMsg, placeholderAssistant],
          isTyping: true,
        }));

        try {
          const token = useUserStore.getState().token;
          const user = useUserStore.getState().user;

          // Faz a requisição para a API real do Tutor RAG Socrático
          const res = await api.post<any>('/ai/tutor', {
            questionId,
            studentDoubt: userText,
            message: userText,
            subject: currentSubject,
            userId: user?.id,
          });

          const replyText =
            res?.tutorGuidance ||
            res?.reply ||
            res?.content ||
            res?.message ||
            'Não foi possível formular uma resposta detalhada no momento.';

          const relatedLessons = Array.isArray(res?.referencedLessons)
            ? res.referencedLessons
            : undefined;

          set((state) => ({
            isTyping: false,
            socraticMessages: state.socraticMessages.map((m) =>
              m.id === assistantMsgId
                ? {
                    ...m,
                    content: replyText,
                    isStreaming: false,
                    relatedLessons,
                  }
                : m
            ),
          }));
        } catch (error) {
          console.warn('[useChatStore Socratic Error]:', error);

          const fallbackGuidance =
            `Excelente dúvida sobre **${currentSubject}**!\n\n` +
            `Vamos estruturar o raciocínio socrático passo a passo:\n` +
            `1. **Comando do ENEM**: Quando você lê *"${userText.slice(0, 70)}"*, quais grandezas e restrições o texto propõe?\n` +
            `2. **Conceito Chave**: Lembre-se de identificar a relação de proporcionalidade direta ou inversa antes de escolher a fórmula.\n\n` +
            `> **Pergunta para reflexão**: Se dobrarmos o valor da variável de entrada, o resultado esperado aumenta ou diminui? Tente responder com suas palavras!`;

          set((state) => ({
            isTyping: false,
            socraticMessages: state.socraticMessages.map((m) =>
              m.id === assistantMsgId
                ? {
                    ...m,
                    content: fallbackGuidance,
                    isStreaming: false,
                  }
                : m
            ),
          }));
        }
      },

      searchQuestions: async (query: string, area?: string) => {
        if (!query.trim()) return [];
        set({ isSearching: true });

        try {
          const params = new URLSearchParams();
          params.append('query', query.trim());
          if (area) params.append('area', area);

          const res = await api.get<any>(`/search?${params.toString()}`);
          const results: QuestionSearchResult[] = Array.isArray(res?.results)
            ? res.results
            : Array.isArray(res)
            ? res
            : [];

          set({ searchResults: results, isSearching: false });
          return results;
        } catch (err) {
          console.warn('[searchQuestions Error]:', err);
          set({ searchResults: [], isSearching: false });
          return [];
        }
      },

      clearSocraticMessages: () => {
        set({ socraticMessages: INITIAL_SOCRATIC_MESSAGES });
      },
    }),
    {
      name: '@minuto_enem:chat_store_v2',
      storage: createJSONStorage(() => safeStorage),
      partialize: (state) => ({
        messages: state.messages,
        socraticMessages: state.socraticMessages.slice(-30),
        activeSubject: state.activeSubject,
      }),
    }
  )
);

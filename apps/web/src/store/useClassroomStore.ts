import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { safeStorage } from '@/services/safeStorage';
import { type Classroom } from '@minuto-enem/shared';
import { api } from '@/services/api';

export type { Classroom } from '@minuto-enem/shared';

export interface ClassroomStudentItem {
  id: string;
  name: string;
  email: string;
  xp: number;
  currentStreak: number;
  lastStudyDate?: string | null;
}

export interface StudentSubmissionItem {
  studentId: string;
  studentName: string;
  submittedAt: string;
  status: 'ENTREGUE' | 'PENDENTE' | 'CORRIGIDO';
  score?: number;
  correctCount?: number;
  totalQuestions?: number;
  accuracyPercent?: number;
  timeSpent: string;
}

export interface MissedQuestionItem {
  questionId: string;
  text: string;
  year?: number;
  subject?: string;
  topic?: string;
  difficulty?: string;
  errorCount: number;
  totalCount: number;
  errorPercent: number;
}

export interface TeacherAssignmentItem {
  id: string;
  classId?: string;
  creationMode?: string;
  subject: string;
  topic: string;
  title: string;
  dueDate: string;
  totalStudents: number;
  submittedCount: number;
  gradedCount: number;
  averageScore: number;
  color: string;
  icon: string;
  instructions: string;
  comments: any[];
  submissions: StudentSubmissionItem[];
  mostMissedQuestions?: MissedQuestionItem[];
}

interface ClassroomState {
  userId: string | null;
  classrooms: Classroom[];
  isLoading: boolean;
  error: string | null;
  teacherTracking: any | null;

  setUserId: (userId: string | null) => void;
  clearClassrooms: () => void;
  fetchClassrooms: () => Promise<Classroom[]>;
  addClassroom: (
    classroom: Omit<
      Classroom,
      'id' | 'createdAt' | 'studentsCount' | 'tasksCount' | 'materialsCount'
    >
  ) => Promise<Classroom>;
  joinClassroomByCode: (
    code: string
  ) => Promise<{ success: boolean; message: string; classroom?: Classroom }>;
  deleteClassroom: (id: string) => Promise<void>;
  unenrollClassroom: (id: string) => Promise<void>;
  getClassroomById: (id: string) => Promise<any>;
  fetchTeacherTracking: (classId?: string) => Promise<any>;
  createTask: (payload: any) => Promise<any>;
  submitTask: (taskId: string, payload: any) => Promise<any>;
}

export function mapApiClassroomToStore(c: any): Classroom {
  return {
    id: c.id,
    name: c.name,
    code: c.code,
    schoolId: c.schoolId || c.school?.id || 'default-school',
    teacherId: c.teacherId || '',
    teacherName: c.teacher?.name || 'Professor',
    subject: c.subject || 'Geral',
    description: c.description || undefined,
    school: c.school || undefined,
    themeColor: c.themeColor || '#58CC02',
    icon: c.icon || 'graduation-cap',
    createdAt: c.createdAt
      ? new Date(c.createdAt).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0],
    studentsCount:
      c._count?.students ??
      (Array.isArray(c.students) ? c.students.length : 0),
    tasksCount:
      c._count?.tasks ?? (Array.isArray(c.tasks) ? c.tasks.length : 0),
    materialsCount: c.materialsCount ?? 0,
  };
}

export const useClassroomStore = create<ClassroomState>()(
  persist(
    (set, get) => ({
      userId: null,
      classrooms: [],
      isLoading: false,
      error: null,
      teacherTracking: null,

      setUserId: (newUserId) => {
        const currentUserId = get().userId;
        if (newUserId !== currentUserId) {
          set({ userId: newUserId, classrooms: [], error: null });
        }
      },

      clearClassrooms: () => {
        set({ classrooms: [], userId: null, error: null, isLoading: false });
      },

      fetchClassrooms: async () => {
        set({ isLoading: true, error: null });
        try {
          const data = await api.get<any[]>('/classrooms');
          if (Array.isArray(data)) {
            const mapped = data.map(mapApiClassroomToStore);
            set({ classrooms: mapped, isLoading: false });
            return mapped;
          }
          set({ classrooms: [], isLoading: false });
          return [];
        } catch (err: any) {
          const msg =
            err.response?.data?.error || err.message || 'Erro ao buscar turmas';
          set({ error: msg, isLoading: false, classrooms: [] });
          return [];
        }
      },

      addClassroom: async (data) => {
        set({ isLoading: true, error: null });
        const cleanCode = data.code ? data.code.trim().toUpperCase() : '';

        // Validação local de duplicidade antes da chamada
        if (cleanCode) {
          const existingLocal = get().classrooms.find(
            (c) => c.code?.trim().toUpperCase() === cleanCode
          );
          if (existingLocal) {
            set({ isLoading: false });
            throw new Error(`Já existe uma turma cadastrada com o código "${cleanCode}".`);
          }
        }

        try {
          const payload = {
            name: data.name.trim(),
            code: cleanCode,
          };
          const createdApi = await api.post<any>('/classrooms', payload);
          const mapped = mapApiClassroomToStore({
            ...createdApi,
            subject: data.subject,
            description: data.description,
            school: data.school,
            themeColor: data.themeColor,
            icon: data.icon,
          });

          set((state) => ({
            classrooms: [mapped, ...state.classrooms.filter((c) => c.id !== mapped.id)],
            isLoading: false,
          }));

          return mapped;
        } catch (err: any) {
          const message =
            err.response?.data?.error ||
            err.message ||
            'Não foi possível registrar a turma. Verifique o código e tente novamente.';
          set({ isLoading: false, error: message });
          throw new Error(message);
        }
      },

      joinClassroomByCode: async (code) => {
        const cleanCode = code.trim().toUpperCase();
        try {
          const response = await api.post<any>('/classrooms/enroll', {
            code: cleanCode,
          });
          const mapped = mapApiClassroomToStore(response);

          set((state) => ({
            classrooms: [mapped, ...state.classrooms.filter((c) => c.id !== mapped.id)],
          }));

          return {
            success: true,
            message: `Você ingressou com sucesso na turma ${mapped.name}!`,
            classroom: mapped,
          };
        } catch (err: any) {
          const message =
            err.response?.data?.error ||
            err.message ||
            'Código de turma não encontrado. Verifique se digitou corretamente.';
          return {
            success: false,
            message,
          };
        }
      },

      deleteClassroom: async (id) => {
        try {
          await api.delete(`/classrooms/${id}`);
        } catch {}
        set((state) => ({
          classrooms: state.classrooms.filter((c) => c.id !== id),
        }));
      },

      unenrollClassroom: async (id) => {
        try {
          await api.post(`/classrooms/${id}/unenroll`);
        } catch {}
        set((state) => ({
          classrooms: state.classrooms.filter((c) => c.id !== id),
        }));
      },

      getClassroomById: async (id) => {
        try {
          const response = await api.get<any>(`/classrooms/${id}`);
          return response;
        } catch {
          const cached = get().classrooms.find((c) => c.id === id);
          return cached || null;
        }
      },

      fetchTeacherTracking: async (classId) => {
        try {
          const endpoint = classId
            ? `/classrooms/teacher-tracking?classId=${encodeURIComponent(classId)}`
            : '/classrooms/teacher-tracking';
          const data = await api.get<any>(endpoint);
          set({ teacherTracking: data });
          return data;
        } catch (err: any) {
          return null;
        }
      },

      createTask: async (payload) => {
        const classTarget = payload.classroomId || payload.classId;
        const endpoint = classTarget ? `/classrooms/${classTarget}/tasks` : '/tasks';
        const res = await api.post<any>(endpoint, payload);
        return res;
      },

      submitTask: async (taskId, payload) => {
        const res = await api.post<any>(`/tasks/${taskId}/submit`, payload);
        return res;
      },
    }),
    {
      name: '@minuto-enem:classrooms-storage-v2',
      storage: createJSONStorage(() => safeStorage),
      partialize: (state) => ({
        userId: state.userId,
        classrooms: state.classrooms,
      }),
    }
  )
);

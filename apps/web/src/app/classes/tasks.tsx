import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { safeAsyncStorage as AsyncStorage } from '@/services/safeStorage';
import { api } from '@/services/api';
import { useUserStore } from '@/store/useUserStore';
import { useClassroomStore } from '@/store/useClassroomStore';

type TaskComment = {
  id: string;
  author: string;
  role: 'STUDENT' | 'TEACHER';
  date: string;
  text: string;
};

export type Task = {
  id: string;
  classId?: string;
  classroomId?: string;
  creationMode?: string;
  subject: string;
  topic: string;
  teacher: string;
  total: number;
  done: number;
  color: string;
  icon: string;
  score?: number;
  instructions?: string;
  comments: TaskComment[];
  dueDate?: string;
  questionIds?: string[];
  status?: string;
};

export interface AiSuggestedTask {
  id: string;
  classId?: string;
  subject: string;
  topic: string;
  title: string;
  reason: string;
  totalQuestions: number;
  difficultyLevel: 'Fácil' | 'Médio' | 'Difícil';
  suggestedDays: number;
  instructions: string;
  color: string;
  icon: string;
}

export interface BankQuestionItem {
  id: string;
  year?: number;
  subject?: string;
  topic?: string;
  text: string;
  options: string[];
  difficulty?: string;
  errorRate?: number;
  subjectRef?: { name: string; icon?: string };
}

const DEFAULT_SUBJECTS = [
  'Matemática',
  'Física',
  'Química',
  'Biologia',
  'História',
  'Geografia',
  'Português',
  'Literatura',
  'Filosofia',
  'Sociologia',
];

const DEFAULT_AI_SUGGESTIONS: AiSuggestedTask[] = [
  {
    id: 'ai-sug-1',
    subject: 'Física',
    topic: 'Plano Inclinado e Atrito',
    title: 'Lista de Reforço: Dinâmica e Atrito',
    reason:
      'Diagnóstico da IA: 42% dos alunos erraram decomposição de forças no último simulado.',
    totalQuestions: 10,
    difficultyLevel: 'Médio',
    suggestedDays: 7,
    instructions:
      'Praticar cálculo de forças perpendiculares (Normal = P · cos θ) e força resultante paralela ao plano inclinado.',
    color: '#58CC02',
    icon: 'atom',
  },
  {
    id: 'ai-sug-2',
    subject: 'Matemática',
    topic: 'Geometria Espacial e Volume',
    title: 'Lista Intensiva: Prismas e Cilindros no ENEM',
    reason:
      'Diagnóstico da IA: Assunto recorrente com 35% de erros de fórmula de base e volume.',
    totalQuestions: 12,
    difficultyLevel: 'Difícil',
    suggestedDays: 5,
    instructions:
      'Exercícios de aplicação direta e cálculo de capacidade cúbica em contextos cotidianos.',
    color: '#FF4B4B',
    icon: 'calculator',
  },
  {
    id: 'ai-sug-3',
    subject: 'Literatura',
    topic: 'Modernismo Brasileiro (1ª Fase)',
    title: 'Lista Temática: Semana de Arte Moderna de 1922',
    reason:
      'Diagnóstico da IA: Alta frequência na prova com dúvidas sobre ruptura com o academicismo.',
    totalQuestions: 8,
    difficultyLevel: 'Médio',
    suggestedDays: 4,
    instructions:
      'Análise de poemas de Oswald de Andrade e Mário de Andrade focando na antropofagia cultural.',
    color: '#1CB0F6',
    icon: 'book-open',
  },
];

const INITIAL_MOCK_TASKS: { pending: Task[]; completed: Task[] } = {
  pending: [
    {
      id: 't1',
      subject: 'Física',
      topic: 'Cinemática Escalar',
      teacher: 'Prof. Carlos',
      total: 15,
      done: 0,
      color: '#58CC02',
      icon: 'atom',
      dueDate: 'Em 7 dias',
      instructions: 'Resolver as 15 questões de MRU e MRUV aplicando as equações horárias.',
      comments: [
        {
          id: 'c1',
          author: 'Lucas Silva',
          role: 'STUDENT',
          date: 'Hoje 09:15',
          text: 'Professor, na questão 3 a velocidade inicial é nula?',
        },
        {
          id: 'c2',
          author: 'Prof. Carlos',
          role: 'TEACHER',
          date: 'Hoje 09:40',
          text: 'Sim! Parte do repouso, então v0 = 0 m/s.',
        },
      ],
    },
    {
      id: 't2',
      subject: 'Física',
      topic: 'Leis de Newton',
      teacher: 'Prof. Carlos',
      total: 20,
      done: 5,
      color: '#58CC02',
      icon: 'atom',
      dueDate: 'Em 4 dias',
      instructions: 'Identificar as forças em pares de ação e reação no plano inclinado.',
      comments: [],
    },
    {
      id: 't3',
      subject: 'Matemática',
      topic: 'Geometria Plana',
      teacher: 'Profª. Marta',
      total: 10,
      done: 4,
      color: '#FF4B4B',
      icon: 'calculator',
      dueDate: 'Em 5 dias',
      instructions: 'Cálculo de áreas de triângulos, círculos e setores circulares.',
      comments: [
        {
          id: 'c3',
          author: 'Mariana Lima',
          role: 'STUDENT',
          date: 'Ontem',
          text: 'Muito boa a seleção de questões do ENEM 2023!',
        },
      ],
    },
  ],
  completed: [
    {
      id: 't4',
      subject: 'História',
      topic: 'Era Vargas',
      teacher: 'Prof. Sérgio',
      total: 20,
      done: 20,
      color: '#F1C40F',
      icon: 'monument',
      score: 9.0,
      dueDate: 'Finalizada',
      instructions: 'Revisão da Constituição de 1934 e 1937 (Estado Novo).',
      comments: [],
    },
    {
      id: 't5',
      subject: 'História',
      topic: 'Segunda Guerra',
      teacher: 'Prof. Sérgio',
      total: 15,
      done: 15,
      color: '#F1C40F',
      icon: 'monument',
      score: 8.5,
      dueDate: 'Finalizada',
      instructions: 'Contexto geopolítico e participação da FEB.',
      comments: [],
    },
  ],
};

const TASKS_STORAGE_KEY = '@minuto_enem:classroom_tasks_v2';

export default function TasksScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const {
    subject: filterSubject,
    classId,
    className,
    openNewTask,
  } = useLocalSearchParams<{
    subject?: string;
    classId?: string;
    className?: string;
    openNewTask?: string;
  }>();

  const user = useUserStore((state) => state.user);
  const classrooms = useClassroomStore((state) => state.classrooms);
  const createTaskInStore = useClassroomStore((state) => state.createTask);

  const [activeTab, setActiveTab] = useState<'pendentes' | 'feitas'>('pendentes');
  const [expandedSubject, setExpandedSubject] = useState<string | null>(filterSubject || 'Física');
  const [tasksState, setTasksState] = useState(INITIAL_MOCK_TASKS);
  const [expandedTaskComments, setExpandedTaskComments] = useState<Record<string, boolean>>({});
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});

  // =========================================================================
  // ESTADOS DO CONSTRUTOR DE TAREFAS DO PROFESSOR (4 ABAS)
  // =========================================================================
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [creationModeTab, setCreationModeTab] = useState<
    'BANCO' | 'ASSUNTO' | 'AUTORAL' | 'IA'
  >('BANCO');

  const defaultRoomId = classId || classrooms[0]?.id || '';
  const [selectedClassId, setSelectedClassId] = useState<string>(defaultRoomId);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskInstructions, setTaskInstructions] = useState('');
  const [taskDueDateDays, setTaskDueDateDays] = useState<number>(7);
  const [isSubmittingTask, setIsSubmittingTask] = useState(false);

  // Aba 1: Buscar no Banco do ENEM
  const [bankSearchText, setBankSearchText] = useState('');
  const [bankSubjectFilter, setBankSubjectFilter] = useState<string>(filterSubject || 'TODAS');
  const [bankDifficultyFilter, setBankDifficultyFilter] = useState<string>('TODAS');
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<Set<string>>(new Set());

  // Aba 2: Gerar Lista por Assunto
  const [randomSubject, setRandomSubject] = useState<string>(filterSubject || 'Matemática');
  const [randomTopic, setRandomTopic] = useState('');
  const [randomQuantity, setRandomQuantity] = useState<number>(10);
  const [randomDifficulty, setRandomDifficulty] = useState<'EASY' | 'MEDIUM' | 'HARD' | 'MISTO'>('MISTO');

  // Aba 3: Questão Autoral
  const [authorSubject, setAuthorSubject] = useState<string>(filterSubject || 'Geral');
  const [authorTopic, setAuthorTopic] = useState('');
  const [authorQuestionText, setAuthorQuestionText] = useState('');
  const [authorOptions, setAuthorOptions] = useState<string[]>(['', '', '', '', '']);
  const [authorCorrectIndex, setAuthorCorrectIndex] = useState<number>(0);
  const [authorExplanation, setAuthorExplanation] = useState('');

  // Aba 4: Copiloto Docente com IA
  const [aiSuggestionsList, setAiSuggestionsList] = useState<AiSuggestedTask[]>(DEFAULT_AI_SUGGESTIONS);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);

  // Abre o modal de criação se o parâmetro openNewTask estiver na URL
  useEffect(() => {
    if (openNewTask === '1' && user?.role === 'TEACHER') {
      setIsCreateModalOpen(true);
    }
  }, [openNewTask, user?.role]);

  // Consulta à API para buscar questões do Banco do ENEM (para o modo BANCO)
  const { data: bankQuestions = [], isLoading: isLoadingBankQuestions } = useQuery<
    BankQuestionItem[],
    Error
  >({
    queryKey: [
      'task-bank-questions',
      bankSearchText,
      bankSubjectFilter,
      bankDifficultyFilter,
    ],
    queryFn: async () => {
      try {
        const queryParams = new URLSearchParams();
        if (bankSearchText.trim()) queryParams.set('search', bankSearchText.trim());
        if (bankSubjectFilter !== 'TODAS') queryParams.set('subject', bankSubjectFilter);
        if (bankDifficultyFilter !== 'TODAS') queryParams.set('difficulty', bankDifficultyFilter);
        queryParams.set('limit', '35');

        const res = await api.get<BankQuestionItem[]>(
          `/tasks/questions?${queryParams.toString()}`
        );
        return Array.isArray(res) ? res : [];
      } catch {
        return [];
      }
    },
    enabled: isCreateModalOpen && creationModeTab === 'BANCO',
  });

  // Consulta à API real para buscar as tarefas da turma
  const { data: remoteTasks, refetch: refetchRemoteTasks } = useQuery<any[], Error>({
    queryKey: ['classroom-tasks-list', classId, filterSubject],
    queryFn: async () => {
      try {
        const endpoint = classId ? `/tasks/classroom/${classId}` : '/tasks';
        const res = await api.get<any[]>(endpoint);
        return Array.isArray(res) ? res : [];
      } catch {
        return [];
      }
    },
  });

  // Mescla tarefas remotas
  useEffect(() => {
    if (remoteTasks && remoteTasks.length > 0) {
      const pendingList: Task[] = [];
      const completedList: Task[] = [];

      for (const t of remoteTasks) {
        const hasMySub = Boolean(t.mySubmission);
        const isCompleted = t.status === 'COMPLETED' || hasMySub;

        let displayDueDate = 'Em 7 dias';
        if (t.dueDate) {
          const d = new Date(t.dueDate);
          displayDueDate = `Prazo: ${d.toLocaleDateString('pt-BR')}`;
        }

        const mappedTask: Task = {
          id: t.id,
          classId: t.classroomId || t.classId,
          classroomId: t.classroomId,
          creationMode: t.creationMode,
          subject:
            t.subject?.name ||
            t.topic?.split(':')[0]?.trim() ||
            t.classroom?.name ||
            'Geral',
          topic: t.topicRef?.name || t.topic || t.title,
          teacher: t.classroom?.name || user?.name || 'Professor',
          total: t.total || (t.questionIds?.length || 10),
          done: isCompleted ? (t.total || 10) : 0,
          color: t.subject?.color || '#58CC02',
          icon: t.subject?.icon || 'atom',
          score: t.mySubmission?.score,
          instructions: t.description || 'Lista de questões da turma',
          comments: [],
          dueDate: displayDueDate,
          questionIds: t.questionIds || [],
          status: t.status,
        };

        if (isCompleted) {
          completedList.push(mappedTask);
        } else {
          pendingList.push(mappedTask);
        }
      }

      setTasksState((prev) => ({
        pending: pendingList.length > 0 ? pendingList : prev.pending,
        completed: completedList.length > 0 ? completedList : prev.completed,
      }));
    }
  }, [remoteTasks, user?.name]);

  // Carrega tarefas salvas do cache local
  useEffect(() => {
    async function loadTasks() {
      try {
        const raw = await AsyncStorage.getItem(TASKS_STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed?.pending && parsed?.completed) {
            setTasksState(parsed);
          }
        }
      } catch {
        // Ignora
      }
    }
    loadTasks();
  }, []);

  const saveTasksLocally = async (newState: typeof INITIAL_MOCK_TASKS) => {
    setTasksState(newState);
    try {
      await AsyncStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(newState));
    } catch {
      // Ignora erro
    }
  };

  const toggleSelectQuestionId = (qId: string) => {
    setSelectedQuestionIds((prev) => {
      const copy = new Set(prev);
      if (copy.has(qId)) {
        copy.delete(qId);
      } else {
        copy.add(qId);
      }
      return copy;
    });
  };

  // =========================================================================
  // SUBMISSÃO DO CONSTRUTOR DE TAREFA PELO PROFESSOR
  // =========================================================================
  const handlePublishCustomTask = async () => {
    if (!taskTitle.trim()) {
      Alert.alert('Título Obrigatório', 'Dê um título para a lista de tarefas.');
      return;
    }

    const targetRoomId = selectedClassId || defaultRoomId;
    if (!targetRoomId) {
      Alert.alert('Turma Obrigatória', 'Selecione a turma para publicar a tarefa.');
      return;
    }

    setIsSubmittingTask(true);
    try {
      const calcDueDate = new Date();
      calcDueDate.setDate(calcDueDate.getDate() + taskDueDateDays);

      let payload: any = {
        classroomId: targetRoomId,
        title: taskTitle.trim(),
        description: taskInstructions.trim() || undefined,
        dueDate: calcDueDate.toISOString(),
      };

      // MODO 1: BANCO DO ENEM (MANUAL_SELECTION)
      if (creationModeTab === 'BANCO') {
        const qIdsArray = Array.from(selectedQuestionIds);
        if (qIdsArray.length === 0) {
          Alert.alert(
            'Nenhuma Questão Selecionada',
            'Marque pelo menos uma questão do banco do ENEM para compor a lista.'
          );
          setIsSubmittingTask(false);
          return;
        }
        payload = {
          ...payload,
          creationMode: 'MANUAL_SELECTION',
          subject: bankSubjectFilter !== 'TODAS' ? bankSubjectFilter : undefined,
          questionIds: qIdsArray,
          total: qIdsArray.length,
          topic: `Lista do ENEM: ${taskTitle.trim()}`,
        };
      }
      // MODO 2: GERAR LISTA POR ASSUNTO (RANDOM_BY_TOPIC)
      else if (creationModeTab === 'ASSUNTO') {
        if (!randomTopic.trim()) {
          Alert.alert('Assunto Obrigatório', 'Informe o assunto/conteúdo da lista (ex: Ecologia, Cinemática).');
          setIsSubmittingTask(false);
          return;
        }
        payload = {
          ...payload,
          creationMode: 'RANDOM_BY_TOPIC',
          subject: randomSubject,
          topic: randomTopic.trim(),
          difficulty: randomDifficulty !== 'MISTO' ? randomDifficulty : undefined,
          quantity: randomQuantity,
          total: randomQuantity,
        };
      }
      // MODO 3: CRIAR QUESTÃO PRÓPRIA (CUSTOM_TEACHER_QUESTIONS)
      else if (creationModeTab === 'AUTORAL') {
        if (!authorQuestionText.trim()) {
          Alert.alert('Enunciado Obrigatório', 'Escreva o enunciado da questão.');
          setIsSubmittingTask(false);
          return;
        }
        const validOptions = authorOptions.map((o) => o.trim()).filter(Boolean);
        if (validOptions.length < 2) {
          Alert.alert('Alternativas Incompletas', 'Preencha no mínimo 2 alternativas para a questão.');
          setIsSubmittingTask(false);
          return;
        }
        payload = {
          ...payload,
          creationMode: 'CUSTOM_TEACHER_QUESTIONS',
          subject: authorSubject,
          topic: authorTopic.trim() || taskTitle.trim(),
          customQuestions: [
            {
              text: authorQuestionText.trim(),
              options: authorOptions.map((opt, i) => opt.trim() || `Alternativa ${i + 1}`),
              correctAnswer: authorCorrectIndex,
              explanation: authorExplanation.trim() || undefined,
            },
          ],
          total: 1,
        };
      }

      // Envia criação para o back-end
      await createTaskInStore(payload);

      // Invalida e recarrega dados em tempo real
      await queryClient.invalidateQueries({ queryKey: ['classroom-tasks-list'] });
      await queryClient.invalidateQueries({ queryKey: ['teacher-tracking'] });
      refetchRemoteTasks();

      // Limpa os formulários
      setIsCreateModalOpen(false);
      setTaskTitle('');
      setTaskInstructions('');
      setSelectedQuestionIds(new Set());
      setAuthorQuestionText('');
      setAuthorOptions(['', '', '', '', '']);
      setRandomTopic('');

      Alert.alert(
        'Lista Publicada!',
        `A tarefa "${taskTitle.trim()}" foi criada com sucesso e já está disponível para os alunos.`
      );
    } catch (err: any) {
      const msg = err.response?.data?.error || err.message || 'Erro ao criar tarefa.';
      Alert.alert('Falha ao Criar Lista', msg);
    } finally {
      setIsSubmittingTask(false);
    }
  };

  /**
   * Aprova uma sugestão de lista de exercícios da IA
   */
  const handleApproveAndSendToClass = async (suggestion: AiSuggestedTask) => {
    setApprovingId(suggestion.id);
    try {
      const targetRoomId = selectedClassId || classId || defaultRoomId;
      const calcDueDate = new Date();
      calcDueDate.setDate(calcDueDate.getDate() + suggestion.suggestedDays);

      await createTaskInStore({
        classroomId: targetRoomId,
        creationMode: 'AI_GENERATED',
        title: suggestion.title,
        subject: suggestion.subject,
        topic: suggestion.topic,
        instructions: suggestion.instructions,
        total: suggestion.totalQuestions,
        quantity: suggestion.totalQuestions,
        difficulty:
          suggestion.difficultyLevel === 'Fácil'
            ? 'EASY'
            : suggestion.difficultyLevel === 'Difícil'
            ? 'HARD'
            : 'MEDIUM',
        dueDate: calcDueDate.toISOString(),
      });

      queryClient.invalidateQueries({ queryKey: ['teacher-tracking'] });
      queryClient.invalidateQueries({ queryKey: ['classroom-tasks-list'] });
      refetchRemoteTasks();

      setAiSuggestionsList((prev) => prev.filter((s) => s.id !== suggestion.id));
      setIsCreateModalOpen(false);

      Alert.alert(
        'Lista da IA Aprovada!',
        `A lista "${suggestion.title}" foi aprovada e publicada para a turma.`
      );
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Não foi possível aprovar a sugestão da IA.');
    } finally {
      setApprovingId(null);
    }
  };

  const handleGenerateNewAiSuggestion = async () => {
    setIsGeneratingAi(true);
    try {
      const fallbackNew: AiSuggestedTask = {
        id: `ai-gen-${Date.now()}`,
        subject: filterSubject || 'Matemática',
        topic: 'Análise Combinatória e Probabilidade',
        title: 'Treino de Precisão: Arranjos e Combinações no ENEM',
        reason:
          'Diagnóstico da IA: Baixa taxa de acertos em questões que exigem o princípio fundamental da contagem.',
        totalQuestions: 10,
        difficultyLevel: 'Médio',
        suggestedDays: 6,
        instructions:
          'Identificar a diferença quando a ordem dos elementos importa (arranjo) ou não importa (combinação).',
        color: '#FF4B4B',
        icon: 'calculator',
      };
      setAiSuggestionsList((prev) => [fallbackNew, ...prev]);
    } finally {
      setIsGeneratingAi(false);
    }
  };

  // Agrupa tarefas pela Matéria
  const groupedTasks = useMemo(() => {
    let tasks = activeTab === 'pendentes' ? tasksState.pending : tasksState.completed;

    if (filterSubject) {
      tasks = tasks.filter(
        (t) => t.subject.toLowerCase() === filterSubject.toLowerCase()
      );
    }

    return tasks.reduce((acc, task) => {
      if (!acc[task.subject]) {
        acc[task.subject] = { tasks: [], color: task.color, icon: task.icon };
      }
      acc[task.subject].tasks.push(task);
      return acc;
    }, {} as Record<string, { tasks: Task[]; color: string; icon: string }>);
  }, [activeTab, tasksState, filterSubject]);

  const toggleSubject = (subject: string) => {
    setExpandedSubject((prev) => (prev === subject ? null : subject));
  };

  const toggleTaskComments = (taskId: string) => {
    setExpandedTaskComments((prev) => ({ ...prev, [taskId]: !prev[taskId] }));
  };

  const handleAddComment = (taskId: string) => {
    const text = (commentInputs[taskId] || '').trim();
    if (!text) return;

    const newComment: TaskComment = {
      id: `tc_${Date.now()}`,
      author: user?.name || (user?.role === 'TEACHER' ? 'Professor' : 'Aluno'),
      role: (user?.role as 'STUDENT' | 'TEACHER') || 'STUDENT',
      date: 'Agora',
      text,
    };

    const updateList = (list: Task[]) =>
      list.map((t) =>
        t.id === taskId ? { ...t, comments: [...t.comments, newComment] } : t
      );

    const updated = {
      pending: updateList(tasksState.pending),
      completed: updateList(tasksState.completed),
    };

    saveTasksLocally(updated);
    setCommentInputs((prev) => ({ ...prev, [taskId]: '' }));
    setExpandedTaskComments((prev) => ({ ...prev, [taskId]: true }));
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* 1. HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <FontAwesome5 name="arrow-left" size={18} color="#2C3A47" />
        </TouchableOpacity>
        <View style={{ alignItems: 'center' }}>
          <Text style={styles.headerTitle}>
            {filterSubject ? `Tarefas: ${filterSubject}` : 'Tarefas da Turma'}
          </Text>
          {className && (
            <Text style={{ fontSize: 11, color: '#8CA0B3', marginTop: 2 }}>{className}</Text>
          )}
        </View>
        {user?.role === 'TEACHER' ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TouchableOpacity
              style={styles.headerAddBtn}
              activeOpacity={0.8}
              onPress={() => setIsCreateModalOpen(true)}
            >
              <FontAwesome5 name="plus" size={12} color="#FFF" />
              <Text style={styles.headerAddBtnText}>Nova Lista</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.teacherTrackerBtn}
              onPress={() => router.push('/classes/teacher-tracking' as any)}
            >
              <FontAwesome5 name="chart-pie" size={15} color="#1CB0F6" />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.backButton} />
        )}
      </View>

      {/* 2. ABAS DO ALUNO: PENDENTES VS FEITAS COM PRAZO */}
      <View style={styles.tabContainer}>
        <View style={styles.tabBackground}>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'pendentes' && styles.tabActive]}
            onPress={() => {
              setActiveTab('pendentes');
              setExpandedSubject(null);
            }}
            activeOpacity={0.8}
          >
            <FontAwesome5
              name="clock"
              size={13}
              color={activeTab === 'pendentes' ? '#2C3A47' : '#8CA0B3'}
              style={{ marginRight: 6 }}
            />
            <Text
              style={[
                styles.tabText,
                activeTab === 'pendentes' && styles.tabTextActive,
              ]}
            >
              Pendentes ({tasksState.pending.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'feitas' && styles.tabActive]}
            onPress={() => {
              setActiveTab('feitas');
              setExpandedSubject(null);
            }}
            activeOpacity={0.8}
          >
            <FontAwesome5
              name="check-double"
              size={13}
              color={activeTab === 'feitas' ? '#2C3A47' : '#8CA0B3'}
              style={{ marginRight: 6 }}
            />
            <Text
              style={[
                styles.tabText,
                activeTab === 'feitas' && styles.tabTextActive,
              ]}
            >
              Concluídas ({tasksState.completed.length})
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 3. CONTEÚDO */}
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Banner para Professor Criar Tarefas */}
        {user?.role === 'TEACHER' && (
          <View style={styles.teacherBannerWrapper}>
            <TouchableOpacity
              style={styles.teacherHeaderBanner}
              activeOpacity={0.85}
              onPress={() => router.push('/classes/teacher-tracking' as any)}
            >
              <View style={styles.teacherIconCircle}>
                <FontAwesome5 name="chalkboard-teacher" size={14} color="#FFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.teacherBannerTitle}>Acompanhamento em Tempo Real</Text>
                <Text style={styles.teacherBannerSub}>
                  Veja quem entregou, notas e questões mais erradas da turma.
                </Text>
              </View>
              <FontAwesome5 name="arrow-right" size={12} color="#1CB0F6" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.openBuilderBannerBtn}
              activeOpacity={0.85}
              onPress={() => setIsCreateModalOpen(true)}
            >
              <FontAwesome5 name="layer-group" size={15} color="#FFF" />
              <Text style={styles.openBuilderBannerBtnText}>
                + Construtor de Tarefas (Banco ENEM, Assunto, Autoral ou IA)
              </Text>
            </TouchableOpacity>
          </View>
        )}

        <Text style={styles.sectionSubtitle}>
          {activeTab === 'pendentes'
            ? 'Listas ativas com prazo de entrega oficial. Clique para resolver no Quiz.'
            : 'Histórico de listas concluídas e notas registradas com seus professores.'}
        </Text>

        {Object.keys(groupedTasks).length === 0 ? (
          <View style={styles.emptyState}>
            <FontAwesome5
              name="check-circle"
              size={44}
              color="#CBD5E1"
              style={{ marginBottom: 12 }}
            />
            <Text style={styles.emptyText}>
              {activeTab === 'pendentes'
                ? 'Tudo limpo por aqui! Você não possui tarefas pendentes nesta disciplina.'
                : 'Você ainda não concluiu nenhuma lista de exercícios nesta turma.'}
            </Text>
          </View>
        ) : (
          Object.entries(groupedTasks).map(([subject, data]) => {
            const isExpanded = expandedSubject === subject;

            return (
              <View key={subject} style={[styles.folderContainer, { borderColor: data.color }]}>
                {/* CAPA DA PASTA */}
                <TouchableOpacity
                  style={[styles.folderHeader, isExpanded && styles.folderHeaderActive]}
                  activeOpacity={0.8}
                  onPress={() => toggleSubject(subject)}
                >
                  <View style={styles.folderTitleRow}>
                    <View style={[styles.folderIconBox, { backgroundColor: data.color }]}>
                      <FontAwesome5 name={data.icon} size={15} color="#FFF" />
                    </View>
                    <View>
                      <Text style={styles.folderSubjectName}>{subject}</Text>
                      <Text style={styles.folderSubjectCount}>
                        {data.tasks.length} {data.tasks.length === 1 ? 'lista' : 'listas'}
                      </Text>
                    </View>
                  </View>
                  <FontAwesome5
                    name={isExpanded ? 'chevron-up' : 'chevron-down'}
                    size={14}
                    color="#8CA0B3"
                  />
                </TouchableOpacity>

                {/* CONTEÚDO DA PASTA */}
                {isExpanded && (
                  <View style={styles.expandedContent}>
                    {data.tasks.map((task) => {
                      const isCommentsOpen = !!expandedTaskComments[task.id];

                      return (
                        <View key={task.id} style={styles.taskCard}>
                          {/* Cabeçalho do Card da Tarefa */}
                          <View style={styles.cardHeader}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.taskTitle}>{task.topic}</Text>
                              <View style={styles.dueDateBadge}>
                                <FontAwesome5 name="calendar-alt" size={10} color="#64748B" />
                                <Text style={styles.dueDateText}>
                                  {task.dueDate || 'Prazo: Em 7 dias'}
                                </Text>
                              </View>
                            </View>

                            <View style={styles.teacherBadge}>
                              <FontAwesome5
                                name="chalkboard-teacher"
                                size={10}
                                color="#8CA0B3"
                                style={{ marginRight: 4 }}
                              />
                              <Text style={styles.teacherName}>{task.teacher}</Text>
                            </View>
                          </View>

                          {task.instructions && (
                            <Text style={styles.taskInstructions}>{task.instructions}</Text>
                          )}

                          {/* Se for ABA PENDENTES: Botão de Fazer no Quiz */}
                          {activeTab === 'pendentes' ? (
                            <View style={styles.pendingActionSection}>
                              <View style={styles.totalQuestionsBadge}>
                                <FontAwesome5 name="list-ol" size={11} color="#0284C7" />
                                <Text style={styles.totalQuestionsBadgeText}>
                                  {task.total} questões
                                </Text>
                              </View>

                              <TouchableOpacity
                                style={[styles.startQuizButton, { backgroundColor: task.color }]}
                                activeOpacity={0.85}
                                onPress={() =>
                                  router.push({
                                    pathname: '/quiz',
                                    params: {
                                      taskId: task.id,
                                      mode: 'tarefa',
                                      subject: task.subject,
                                      title: task.topic,
                                    },
                                  } as any)
                                }
                              >
                                <Text style={styles.startQuizButtonText}>
                                  {task.done === 0 ? 'Fazer Tarefa no Quiz' : 'Continuar Tarefa'}
                                </Text>
                                <FontAwesome5 name="arrow-right" size={11} color="#FFF" />
                              </TouchableOpacity>
                            </View>
                          ) : (
                            /* Se for ABA CONCLUÍDAS: Exibe Nota Obtida */
                            <View style={styles.completedSection}>
                              <View style={styles.scoreBox}>
                                <FontAwesome5
                                  name="award"
                                  size={13}
                                  color="#16A34A"
                                  style={{ marginRight: 6 }}
                                />
                                <Text style={styles.scoreText}>
                                  Nota:{' '}
                                  <Text style={{ fontWeight: 'bold', color: '#16A34A' }}>
                                    {task.score !== undefined ? task.score : '10.0'}/10
                                  </Text>
                                </Text>
                              </View>

                              <TouchableOpacity
                                style={styles.reviewErrorsBtn}
                                onPress={() =>
                                  router.push({
                                    pathname: '/stats/errors',
                                    params: { subject: task.subject },
                                  } as any)
                                }
                              >
                                <Text style={styles.reviewText}>Revisar Questões</Text>
                              </TouchableOpacity>
                            </View>
                          )}

                          {/* DÚVIDAS E COMENTÁRIOS DA LISTA */}
                          <View style={styles.taskCommentsWrapper}>
                            <TouchableOpacity
                              style={styles.taskCommentsToggle}
                              onPress={() => toggleTaskComments(task.id)}
                            >
                              <FontAwesome5 name="comments" size={11} color="#0284C7" />
                              <Text style={styles.taskCommentsToggleText}>
                                {task.comments.length === 0
                                  ? 'Dúvidas sobre a lista'
                                  : `Dúvidas e comentários (${task.comments.length})`}
                              </Text>
                              <FontAwesome5
                                name={isCommentsOpen ? 'chevron-up' : 'chevron-down'}
                                size={10}
                                color="#0284C7"
                              />
                            </TouchableOpacity>

                            {isCommentsOpen && (
                              <View style={styles.taskCommentsList}>
                                {task.comments.map((c) => (
                                  <View key={c.id} style={styles.commentBox}>
                                    <View style={styles.commentMetaRow}>
                                      <Text style={styles.commentAuthorName}>
                                        {c.author}{' '}
                                        {c.role === 'TEACHER' && (
                                          <Text style={styles.teacherBadgeInline}>(Prof)</Text>
                                        )}
                                      </Text>
                                      <Text style={styles.commentDateText}>{c.date}</Text>
                                    </View>
                                    <Text style={styles.commentBodyText}>{c.text}</Text>
                                  </View>
                                ))}

                                <View style={styles.inputCommentRow}>
                                  <TextInput
                                    style={styles.taskCommentInput}
                                    placeholder="Escreva uma dúvida sobre esta lista..."
                                    placeholderTextColor="#A0AEC0"
                                    value={commentInputs[task.id] || ''}
                                    onChangeText={(txt) =>
                                      setCommentInputs((prev) => ({ ...prev, [task.id]: txt }))
                                    }
                                  />
                                  <TouchableOpacity
                                    style={styles.sendCommentBtn}
                                    onPress={() => handleAddComment(task.id)}
                                  >
                                    <FontAwesome5 name="paper-plane" size={11} color="#FFF" />
                                  </TouchableOpacity>
                                </View>
                              </View>
                            )}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>

      {/* ============================================================== */}
      {/* 4. MODAL DO CONSTRUTOR DE TAREFAS DO PROFESSOR (4 ABAS)         */}
      {/* ============================================================== */}
      <Modal
        visible={isCreateModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setIsCreateModalOpen(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={styles.modalCard}>
            {/* Header do Construtor */}
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderTitleRow}>
                <View style={styles.modalIconBox}>
                  <FontAwesome5 name="tasks" size={16} color="#FFF" />
                </View>
                <View>
                  <Text style={styles.modalTitle}>Construtor de Tarefas</Text>
                  <Text style={styles.modalSub}>
                    Crie listas sob medida para sua turma em 4 modos flexíveis.
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setIsCreateModalOpen(false)}
              >
                <FontAwesome5 name="times" size={14} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalScroll}>
              {/* SELEÇÃO DA TURMA */}
              {classrooms.length > 0 && (
                <View style={styles.formGroup}>
                  <Text style={styles.formLabel}>Turma de Destino *</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.horizontalPillRow}
                  >
                    {classrooms.map((c) => {
                      const isSelected = selectedClassId === c.id;
                      return (
                        <TouchableOpacity
                          key={c.id}
                          style={[styles.selectorPill, isSelected && styles.selectorPillActive]}
                          onPress={() => setSelectedClassId(c.id)}
                        >
                          <FontAwesome5
                            name={c.icon || 'chalkboard'}
                            size={11}
                            color={isSelected ? '#FFF' : '#64748B'}
                          />
                          <Text
                            style={[
                              styles.selectorPillText,
                              isSelected && styles.selectorPillTextActive,
                            ]}
                          >
                            {c.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              )}

              {/* TÍTULO DA LISTA */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Título da Lista de Exercícios *</Text>
                <TextInput
                  style={styles.inputField}
                  placeholder="Ex: Lista Semanal de Física - Leis de Newton e Forças"
                  placeholderTextColor="#94A3B8"
                  value={taskTitle}
                  onChangeText={setTaskTitle}
                />
              </View>

              {/* PRAZO DE ENTREGA */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Prazo para Entrega dos Alunos</Text>
                <View style={styles.dueDatePillRow}>
                  {[3, 5, 7, 14].map((days) => {
                    const isSelected = taskDueDateDays === days;
                    return (
                      <TouchableOpacity
                        key={days}
                        style={[styles.duePill, isSelected && styles.duePillActive]}
                        onPress={() => setTaskDueDateDays(days)}
                      >
                        <Text style={[styles.duePillText, isSelected && styles.duePillTextActive]}>
                          {days} dias
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* AS 4 ABAS DO CONSTRUTOR */}
              <View style={styles.builderTabsContainer}>
                <TouchableOpacity
                  style={[
                    styles.builderTabBtn,
                    creationModeTab === 'BANCO' && styles.builderTabBtnActive,
                  ]}
                  onPress={() => setCreationModeTab('BANCO')}
                >
                  <FontAwesome5
                    name="database"
                    size={11}
                    color={creationModeTab === 'BANCO' ? '#0284C7' : '#64748B'}
                  />
                  <Text
                    style={[
                      styles.builderTabText,
                      creationModeTab === 'BANCO' && styles.builderTabTextActive,
                    ]}
                  >
                    Banco ENEM
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.builderTabBtn,
                    creationModeTab === 'ASSUNTO' && styles.builderTabBtnActive,
                  ]}
                  onPress={() => setCreationModeTab('ASSUNTO')}
                >
                  <FontAwesome5
                    name="random"
                    size={11}
                    color={creationModeTab === 'ASSUNTO' ? '#0284C7' : '#64748B'}
                  />
                  <Text
                    style={[
                      styles.builderTabText,
                      creationModeTab === 'ASSUNTO' && styles.builderTabTextActive,
                    ]}
                  >
                    Por Assunto
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.builderTabBtn,
                    creationModeTab === 'AUTORAL' && styles.builderTabBtnActive,
                  ]}
                  onPress={() => setCreationModeTab('AUTORAL')}
                >
                  <FontAwesome5
                    name="edit"
                    size={11}
                    color={creationModeTab === 'AUTORAL' ? '#0284C7' : '#64748B'}
                  />
                  <Text
                    style={[
                      styles.builderTabText,
                      creationModeTab === 'AUTORAL' && styles.builderTabTextActive,
                    ]}
                  >
                    Autoral
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.builderTabBtn,
                    creationModeTab === 'IA' && styles.builderTabBtnActive,
                  ]}
                  onPress={() => setCreationModeTab('IA')}
                >
                  <FontAwesome5
                    name="robot"
                    size={11}
                    color={creationModeTab === 'IA' ? '#8E44AD' : '#64748B'}
                  />
                  <Text
                    style={[
                      styles.builderTabText,
                      creationModeTab === 'IA' && { color: '#8E44AD', fontWeight: 'bold' },
                    ]}
                  >
                    IA (Beta)
                  </Text>
                </TouchableOpacity>
              </View>

              {/* ============================================================== */}
              {/* ABA 1: BUSCAR NO BANCO DO ENEM COM CHECKBOXES                   */}
              {/* ============================================================== */}
              {creationModeTab === 'BANCO' && (
                <View style={styles.tabContentCard}>
                  {/* Busca textual */}
                  <View style={styles.searchBarBox}>
                    <FontAwesome5 name="search" size={13} color="#94A3B8" />
                    <TextInput
                      style={styles.searchBarInput}
                      placeholder="Buscar por palavra-chave no enunciado ou ano..."
                      placeholderTextColor="#94A3B8"
                      value={bankSearchText}
                      onChangeText={setBankSearchText}
                    />
                  </View>

                  {/* Filtro por Matéria */}
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.horizontalPillRow}
                  >
                    {['TODAS', ...DEFAULT_SUBJECTS].map((s) => {
                      const isSelected = bankSubjectFilter === s;
                      return (
                        <TouchableOpacity
                          key={s}
                          style={[styles.smallFilterChip, isSelected && styles.smallFilterChipActive]}
                          onPress={() => setBankSubjectFilter(s)}
                        >
                          <Text
                            style={[
                              styles.smallFilterChipText,
                              isSelected && styles.smallFilterChipTextActive,
                            ]}
                          >
                            {s}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>

                  {/* Lista de Questões com Checkboxes */}
                  <View style={styles.questionsSelectionHeader}>
                    <Text style={styles.questionsCountLabel}>
                      Questões encontradas no banco: {bankQuestions.length}
                    </Text>
                    <View style={styles.selectedCountBadge}>
                      <FontAwesome5 name="check" size={10} color="#16A34A" />
                      <Text style={styles.selectedCountBadgeText}>
                        {selectedQuestionIds.size} selecionadas
                      </Text>
                    </View>
                  </View>

                  {isLoadingBankQuestions ? (
                    <View style={{ padding: 24, alignItems: 'center' }}>
                      <ActivityIndicator size="small" color="#0284C7" />
                      <Text style={styles.loadingHint}>Filtrando banco de questões do ENEM...</Text>
                    </View>
                  ) : bankQuestions.length === 0 ? (
                    <Text style={styles.emptyQuestionsHint}>
                      Nenhuma questão encontrada para os filtros aplicados. Tente outra palavra-chave.
                    </Text>
                  ) : (
                    <View style={styles.questionsList}>
                      {bankQuestions.map((q) => {
                        const isChecked = selectedQuestionIds.has(q.id);
                        return (
                          <TouchableOpacity
                            key={q.id}
                            style={[
                              styles.questionSelectCard,
                              isChecked && styles.questionSelectCardChecked,
                            ]}
                            activeOpacity={0.8}
                            onPress={() => toggleSelectQuestionId(q.id)}
                          >
                            <View style={styles.questionCardTopRow}>
                              <View
                                style={[
                                  styles.checkboxBox,
                                  isChecked && styles.checkboxBoxChecked,
                                ]}
                              >
                                {isChecked && <FontAwesome5 name="check" size={10} color="#FFF" />}
                              </View>
                              <View style={styles.questionMetaTags}>
                                {q.year && (
                                  <Text style={styles.questionMetaTagText}>ENEM {q.year}</Text>
                                )}
                                <Text style={styles.questionMetaTagText}>
                                  {q.subject || q.subjectRef?.name || 'Geral'}
                                </Text>
                              </View>
                            </View>

                            <Text style={styles.questionSnippet} numberOfLines={3}>
                              {q.text}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </View>
              )}

              {/* ============================================================== */}
              {/* ABA 2: GERAR LISTA POR ASSUNTO (RANDOM_BY_TOPIC)               */}
              {/* ============================================================== */}
              {creationModeTab === 'ASSUNTO' && (
                <View style={styles.tabContentCard}>
                  <Text style={styles.modeInstructions}>
                    O sistema sorteará questões reais do ENEM com base no assunto e nível escolhidos.
                  </Text>

                  {/* Matéria */}
                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Disciplina *</Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.horizontalPillRow}
                    >
                      {DEFAULT_SUBJECTS.map((s) => {
                        const isSelected = randomSubject === s;
                        return (
                          <TouchableOpacity
                            key={s}
                            style={[
                              styles.selectorPill,
                              isSelected && styles.selectorPillActive,
                            ]}
                            onPress={() => setRandomSubject(s)}
                          >
                            <Text
                              style={[
                                styles.selectorPillText,
                                isSelected && styles.selectorPillTextActive,
                              ]}
                            >
                              {s}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>

                  {/* Assunto / Tópico */}
                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Assunto / Conteúdo Específico *</Text>
                    <TextInput
                      style={styles.inputField}
                      placeholder="Ex: Ecologia, Leis de Newton, Geometria Espacial, Era Vargas"
                      placeholderTextColor="#94A3B8"
                      value={randomTopic}
                      onChangeText={setRandomTopic}
                    />
                  </View>

                  {/* Quantidade de Questões */}
                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Quantidade de Questões</Text>
                    <View style={styles.dueDatePillRow}>
                      {[5, 10, 15, 20].map((num) => {
                        const isSelected = randomQuantity === num;
                        return (
                          <TouchableOpacity
                            key={num}
                            style={[styles.duePill, isSelected && styles.duePillActive]}
                            onPress={() => setRandomQuantity(num)}
                          >
                            <Text
                              style={[styles.duePillText, isSelected && styles.duePillTextActive]}
                            >
                              {num} questões
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>

                  {/* Nível de Dificuldade */}
                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Nível de Dificuldade</Text>
                    <View style={styles.dueDatePillRow}>
                      {(['MISTO', 'EASY', 'MEDIUM', 'HARD'] as const).map((lvl) => {
                        const isSelected = randomDifficulty === lvl;
                        const label =
                          lvl === 'MISTO'
                            ? 'Misto'
                            : lvl === 'EASY'
                            ? 'Fácil'
                            : lvl === 'MEDIUM'
                            ? 'Médio'
                            : 'Difícil';
                        return (
                          <TouchableOpacity
                            key={lvl}
                            style={[styles.duePill, isSelected && styles.duePillActive]}
                            onPress={() => setRandomDifficulty(lvl)}
                          >
                            <Text
                              style={[styles.duePillText, isSelected && styles.duePillTextActive]}
                            >
                              {label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                </View>
              )}

              {/* ============================================================== */}
              {/* ABA 3: CRIAR QUESTÃO PRÓPRIA (CUSTOM_TEACHER_QUESTIONS)        */}
              {/* ============================================================== */}
              {creationModeTab === 'AUTORAL' && (
                <View style={styles.tabContentCard}>
                  <Text style={styles.modeInstructions}>
                    Cadastre uma questão inédita da sua autoria com 5 alternativas e gabarito.
                  </Text>

                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Matéria e Assunto</Text>
                    <TextInput
                      style={styles.inputField}
                      placeholder="Ex: Física - Trabalho e Energia"
                      placeholderTextColor="#94A3B8"
                      value={authorTopic}
                      onChangeText={setAuthorTopic}
                    />
                  </View>

                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Enunciado da Questão *</Text>
                    <TextInput
                      style={[styles.inputField, styles.textArea]}
                      placeholder="Escreva aqui o enunciado completo da questão autoral..."
                      placeholderTextColor="#94A3B8"
                      value={authorQuestionText}
                      onChangeText={setAuthorQuestionText}
                      multiline
                      numberOfLines={4}
                      textAlignVertical="top"
                    />
                  </View>

                  <Text style={styles.formLabel}>Alternativas (Marque a Correta) *</Text>
                  {authorOptions.map((opt, idx) => {
                    const letter = ['A', 'B', 'C', 'D', 'E'][idx];
                    const isCorrect = authorCorrectIndex === idx;

                    return (
                      <View key={idx} style={styles.optionInputRow}>
                        <TouchableOpacity
                          style={[
                            styles.radioOptionLetter,
                            isCorrect && styles.radioOptionLetterCorrect,
                          ]}
                          onPress={() => setAuthorCorrectIndex(idx)}
                        >
                          <Text
                            style={[
                              styles.radioOptionLetterText,
                              isCorrect && styles.radioOptionLetterTextCorrect,
                            ]}
                          >
                            {letter}
                          </Text>
                        </TouchableOpacity>

                        <TextInput
                          style={[
                            styles.optionInputField,
                            isCorrect && styles.optionInputFieldCorrect,
                          ]}
                          placeholder={`Texto da alternativa ${letter}...`}
                          placeholderTextColor="#94A3B8"
                          value={opt}
                          onChangeText={(txt) => {
                            const copy = [...authorOptions];
                            copy[idx] = txt;
                            setAuthorOptions(copy);
                          }}
                        />
                      </View>
                    );
                  })}

                  <View style={[styles.formGroup, { marginTop: 10 }]}>
                    <Text style={styles.formLabel}>Comentário / Resolução Explicada</Text>
                    <TextInput
                      style={[styles.inputField, { minHeight: 60 }]}
                      placeholder="Explicação pedagógica mostrada aos alunos ao responderem..."
                      placeholderTextColor="#94A3B8"
                      value={authorExplanation}
                      onChangeText={setAuthorExplanation}
                      multiline
                      numberOfLines={2}
                      textAlignVertical="top"
                    />
                  </View>
                </View>
              )}

              {/* ============================================================== */}
              {/* ABA 4: GERAR COM IA (BETA)                                     */}
              {/* ============================================================== */}
              {creationModeTab === 'IA' && (
                <View style={styles.tabContentCard}>
                  <View style={styles.aiHeaderRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.aiHeaderTitle}>Sugestões do Copiloto Docente</Text>
                      <Text style={styles.aiHeaderSub}>
                        Listas automáticas baseadas nas lacunas de aprendizagem da turma.
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.refreshAiBtn}
                      activeOpacity={0.8}
                      onPress={handleGenerateNewAiSuggestion}
                      disabled={isGeneratingAi}
                    >
                      {isGeneratingAi ? (
                        <ActivityIndicator size="small" color="#8E44AD" />
                      ) : (
                        <>
                          <FontAwesome5 name="magic" size={11} color="#8E44AD" />
                          <Text style={styles.refreshAiBtnText}>Gerar Mais</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>

                  {aiSuggestionsList.map((suggestion) => {
                    const isApproving = approvingId === suggestion.id;
                    return (
                      <View key={suggestion.id} style={styles.aiCardMini}>
                        <View style={styles.aiCardMiniTop}>
                          <View style={styles.aiBadgeTag}>
                            <FontAwesome5 name="robot" size={10} color="#8E44AD" />
                            <Text style={styles.aiBadgeTagText}>Sugestão IA</Text>
                          </View>
                          <Text style={styles.aiChipText}>
                            {suggestion.difficultyLevel} • {suggestion.totalQuestions} questões
                          </Text>
                        </View>

                        <Text style={styles.aiCardTitle}>{suggestion.title}</Text>
                        <Text style={styles.aiCardReason}>{suggestion.reason}</Text>

                        <TouchableOpacity
                          style={[styles.aiApproveBtn, isApproving && { opacity: 0.7 }]}
                          activeOpacity={0.85}
                          onPress={() => handleApproveAndSendToClass(suggestion)}
                          disabled={isApproving}
                        >
                          {isApproving ? (
                            <ActivityIndicator size="small" color="#FFF" />
                          ) : (
                            <>
                              <FontAwesome5 name="paper-plane" size={12} color="#FFF" />
                              <Text style={styles.aiApproveBtnText}>
                                Aprovar e Enviar para a Turma
                              </Text>
                            </>
                          )}
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              )}

              {/* BOTÕES FINAIS DE AÇÃO (PARA ABAS BANCO, ASSUNTO E AUTORAL) */}
              {creationModeTab !== 'IA' && (
                <View style={styles.modalBottomActions}>
                  <TouchableOpacity
                    style={styles.modalCancelBtn}
                    onPress={() => setIsCreateModalOpen(false)}
                    disabled={isSubmittingTask}
                  >
                    <Text style={styles.modalCancelBtnText}>Cancelar</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.modalPublishBtn,
                      isSubmittingTask && { opacity: 0.7 },
                    ]}
                    activeOpacity={0.85}
                    onPress={handlePublishCustomTask}
                    disabled={isSubmittingTask}
                  >
                    {isSubmittingTask ? (
                      <ActivityIndicator size="small" color="#FFF" />
                    ) : (
                      <>
                        <FontAwesome5 name="check" size={13} color="#FFF" />
                        <Text style={styles.modalPublishBtnText}>
                          {creationModeTab === 'BANCO'
                            ? `Publicar (${selectedQuestionIds.size} questões)`
                            : 'Publicar Lista para a Turma'}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
  },
  backButton: { width: 38, height: 38, justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: 'bold', color: '#1E293B' },
  headerAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#16A34A',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  headerAddBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  teacherTrackerBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#F0F9FF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },

  tabContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
    backgroundColor: '#FFF',
  },
  tabBackground: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 3,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 10,
  },
  tabActive: {
    backgroundColor: '#FFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  tabText: { fontSize: 12, fontWeight: 'bold', color: '#64748B' },
  tabTextActive: { color: '#0F172A' },

  scrollContent: { padding: 16, paddingBottom: 60 },
  sectionSubtitle: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 16,
    fontStyle: 'italic',
  },

  teacherBannerWrapper: {
    marginBottom: 16,
    gap: 8,
  },
  teacherHeaderBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    padding: 12,
    borderRadius: 14,
    gap: 10,
  },
  teacherIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#0284C7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  teacherBannerTitle: { fontSize: 13, fontWeight: 'bold', color: '#0369A1' },
  teacherBannerSub: { fontSize: 11, color: '#475569', lineHeight: 15 },
  openBuilderBannerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0284C7',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
  },
  openBuilderBannerBtnText: { color: '#FFF', fontSize: 13, fontWeight: 'bold' },

  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 40,
    paddingHorizontal: 24,
  },
  emptyText: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 20,
  },

  folderContainer: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    marginBottom: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderLeftWidth: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  folderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    backgroundColor: '#FFF',
  },
  folderHeaderActive: {
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  folderTitleRow: { flexDirection: 'row', alignItems: 'center' },
  folderIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  folderSubjectName: { fontSize: 15, fontWeight: 'bold', color: '#1E293B' },
  folderSubjectCount: { fontSize: 12, color: '#64748B', marginTop: 2 },

  expandedContent: { padding: 14, backgroundColor: '#F8FAFC', gap: 12 },

  taskCard: {
    backgroundColor: '#FFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
    gap: 8,
  },
  taskTitle: { fontSize: 14, fontWeight: 'bold', color: '#1E293B' },
  dueDateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  dueDateText: { fontSize: 11, color: '#64748B', fontWeight: '500' },
  teacherBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  teacherName: { fontSize: 10, fontWeight: 'bold', color: '#475569' },

  taskInstructions: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 16,
    marginBottom: 10,
  },

  pendingActionSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderColor: '#F1F5F9',
    paddingTop: 10,
    marginTop: 4,
  },
  totalQuestionsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F0F9FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  totalQuestionsBadgeText: { fontSize: 11, fontWeight: 'bold', color: '#0369A1' },

  startQuizButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  startQuizButtonText: { fontSize: 12, fontWeight: 'bold', color: '#FFF' },

  completedSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderColor: '#F1F5F9',
    paddingTop: 10,
    marginTop: 4,
  },
  scoreBox: { flexDirection: 'row', alignItems: 'center' },
  scoreText: { fontSize: 13, color: '#334155' },
  reviewErrorsBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
  },
  reviewText: { fontSize: 11, fontWeight: 'bold', color: '#0284C7' },

  taskCommentsWrapper: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  taskCommentsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  taskCommentsToggleText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#0284C7',
    flex: 1,
  },
  taskCommentsList: { marginTop: 8, gap: 8 },
  commentBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  commentMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  commentAuthorName: { fontSize: 11, fontWeight: 'bold', color: '#1E293B' },
  teacherBadgeInline: { color: '#0284C7' },
  commentDateText: { fontSize: 9, color: '#94A3B8' },
  commentBodyText: { fontSize: 12, color: '#475569', lineHeight: 16 },
  inputCommentRow: { flexDirection: 'row', gap: 6, marginTop: 4 },
  taskCommentInput: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 12,
    color: '#1E293B',
  },
  sendCommentBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#0284C7',
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
  },

  // =========================================================================
  // ESTILOS DO MODAL CONSTRUTOR DE TAREFAS
  // =========================================================================
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 14,
  },
  modalCard: {
    width: '100%',
    maxWidth: 620,
    maxHeight: '94%',
    backgroundColor: '#FFF',
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  modalHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  modalIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#0284C7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalTitle: { fontSize: 16, fontWeight: 'bold', color: '#0F172A' },
  modalSub: { fontSize: 11, color: '#64748B', marginTop: 2 },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
  },

  modalScroll: { padding: 18, gap: 14 },
  formGroup: { gap: 6 },
  formLabel: { fontSize: 12, fontWeight: '700', color: '#1E293B' },
  inputField: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: '#0F172A',
  },
  textArea: { minHeight: 80 },

  horizontalPillRow: { gap: 8, paddingVertical: 2 },
  selectorPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  selectorPillActive: { backgroundColor: '#0284C7', borderColor: '#0284C7' },
  selectorPillText: { fontSize: 12, fontWeight: '600', color: '#475569' },
  selectorPillTextActive: { color: '#FFF', fontWeight: 'bold' },

  dueDatePillRow: { flexDirection: 'row', gap: 8 },
  duePill: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  duePillActive: { backgroundColor: '#0284C7', borderColor: '#0284C7' },
  duePillText: { fontSize: 11, fontWeight: '600', color: '#64748B' },
  duePillTextActive: { color: '#FFF', fontWeight: 'bold' },

  builderTabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 3,
    marginTop: 4,
  },
  builderTabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 9,
  },
  builderTabBtnActive: {
    backgroundColor: '#FFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  builderTabText: { fontSize: 11, fontWeight: 'bold', color: '#64748B' },
  builderTabTextActive: { color: '#0284C7' },

  tabContentCard: {
    backgroundColor: '#FFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    gap: 12,
  },
  modeInstructions: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 17,
  },

  searchBarBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  searchBarInput: { flex: 1, fontSize: 12, color: '#0F172A' },

  smallFilterChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  smallFilterChipActive: { backgroundColor: '#0284C7', borderColor: '#0284C7' },
  smallFilterChipText: { fontSize: 11, color: '#64748B', fontWeight: '600' },
  smallFilterChipTextActive: { color: '#FFF', fontWeight: 'bold' },

  questionsSelectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  questionsCountLabel: { fontSize: 11, fontWeight: 'bold', color: '#64748B' },
  selectedCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  selectedCountBadgeText: { fontSize: 11, fontWeight: 'bold', color: '#16A34A' },
  loadingHint: { fontSize: 11, color: '#64748B', marginTop: 6 },
  emptyQuestionsHint: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    padding: 12,
  },

  questionsList: { gap: 8, maxHeight: 240 },
  questionSelectCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    padding: 10,
    gap: 6,
  },
  questionSelectCardChecked: {
    borderColor: '#16A34A',
    backgroundColor: '#F0FDF4',
  },
  questionCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checkboxBox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxBoxChecked: {
    backgroundColor: '#16A34A',
    borderColor: '#16A34A',
  },
  questionMetaTags: { flexDirection: 'row', gap: 6, flex: 1 },
  questionMetaTagText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#475569',
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  questionSnippet: { fontSize: 11, color: '#334155', lineHeight: 16 },

  optionInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  radioOptionLetter: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioOptionLetterCorrect: {
    backgroundColor: '#16A34A',
    borderColor: '#16A34A',
  },
  radioOptionLetterText: { fontSize: 12, fontWeight: 'bold', color: '#64748B' },
  radioOptionLetterTextCorrect: { color: '#FFF' },
  optionInputField: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 12,
    color: '#0F172A',
  },
  optionInputFieldCorrect: {
    borderColor: '#16A34A',
    backgroundColor: '#F0FDF4',
  },

  aiHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  aiHeaderTitle: { fontSize: 13, fontWeight: 'bold', color: '#1E293B' },
  aiHeaderSub: { fontSize: 11, color: '#64748B' },
  refreshAiBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F3E8FF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  refreshAiBtnText: { fontSize: 11, fontWeight: 'bold', color: '#8E44AD' },
  aiCardMini: {
    backgroundColor: '#FAF5FF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E9D5FF',
    padding: 12,
    gap: 6,
  },
  aiCardMiniTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  aiBadgeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F3E8FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  aiBadgeTagText: { fontSize: 10, fontWeight: 'bold', color: '#8E44AD' },
  aiChipText: { fontSize: 10, fontWeight: '600', color: '#6B21A8' },
  aiCardTitle: { fontSize: 13, fontWeight: 'bold', color: '#0F172A' },
  aiCardReason: { fontSize: 11, color: '#4B5563', lineHeight: 15 },
  aiApproveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#8E44AD',
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 4,
  },
  aiApproveBtnText: { color: '#FFF', fontSize: 12, fontWeight: 'bold' },

  modalBottomActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 8,
  },
  modalCancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
  },
  modalCancelBtnText: { fontSize: 12, fontWeight: 'bold', color: '#64748B' },
  modalPublishBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#16A34A',
  },
  modalPublishBtnText: { fontSize: 12, fontWeight: 'bold', color: '#FFF' },
});

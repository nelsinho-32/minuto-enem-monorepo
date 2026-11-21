import { useThemedStyles } from '@/hooks/use-theme';
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
import { TaskBuilderModal } from '@/components/classroom/TaskBuilderModal';

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
  'Redação',
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
  const styles = useThemedStyles(baseStyles);
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
    'BANCO' | 'ASSUNTO' | 'AUTORAL' | 'REDACAO'
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

  // Aba 4: Proposta de Redação (Oficina Nota 1000)
  const [essayTheme, setEssayTheme] = useState('');

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
      // MODO 4: PROPOSTA DE REDAÇÃO (OFICINA NOTA 1000)
      else if (creationModeTab === 'REDACAO') {
        payload = {
          ...payload,
          creationMode: 'ESSAY',
          subject: 'Redação',
          topic: essayTheme.trim() || taskTitle.trim(),
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
      setEssayTheme('');

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
      <TaskBuilderModal
        visible={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        classrooms={classrooms}
        selectedClassId={selectedClassId}
        onSelectClassId={setSelectedClassId}
        taskTitle={taskTitle}
        onChangeTaskTitle={setTaskTitle}
        taskDueDateDays={taskDueDateDays}
        onChangeTaskDueDateDays={setTaskDueDateDays}
        creationModeTab={creationModeTab}
        onChangeCreationModeTab={setCreationModeTab}
        subjectsList={DEFAULT_SUBJECTS}
        bankSearchText={bankSearchText}
        onChangeBankSearchText={setBankSearchText}
        bankSubjectFilter={bankSubjectFilter}
        onChangeBankSubjectFilter={setBankSubjectFilter}
        bankQuestions={bankQuestions}
        isLoadingBankQuestions={isLoadingBankQuestions}
        selectedQuestionIds={selectedQuestionIds}
        onToggleSelectQuestionId={toggleSelectQuestionId}
        randomSubject={randomSubject}
        onChangeRandomSubject={setRandomSubject}
        randomTopic={randomTopic}
        onChangeRandomTopic={setRandomTopic}
        randomQuantity={randomQuantity}
        onChangeRandomQuantity={setRandomQuantity}
        randomDifficulty={randomDifficulty}
        onChangeRandomDifficulty={setRandomDifficulty}
        authorTopic={authorTopic}
        onChangeAuthorTopic={setAuthorTopic}
        authorQuestionText={authorQuestionText}
        onChangeAuthorQuestionText={setAuthorQuestionText}
        authorOptions={authorOptions}
        onChangeAuthorOptions={setAuthorOptions}
        authorCorrectIndex={authorCorrectIndex}
        onChangeAuthorCorrectIndex={setAuthorCorrectIndex}
        authorExplanation={authorExplanation}
        onChangeAuthorExplanation={setAuthorExplanation}
        essayTheme={essayTheme}
        onChangeEssayTheme={setEssayTheme}
        isSubmitting={isSubmittingTask}
        onSubmit={handlePublishCustomTask}
      />
    </SafeAreaView>
  );
}

const baseStyles = StyleSheet.create({
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

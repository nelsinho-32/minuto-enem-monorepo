import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Share,
  ScrollView,
  ActivityIndicator,
  useWindowDimensions,
  Modal,
  Platform,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import Markdown from 'react-native-markdown-display';
import * as WebBrowser from 'expo-web-browser';
import { useClassroomStore } from '@/store/useClassroomStore';
import { useUserStore } from '@/store/useUserStore';
import { ConfirmModal } from '@/components/ConfirmModal';
import { EmbeddedVideoPlayer } from '@/components/EmbeddedVideoPlayer';
import { PdfViewerModal } from '@/components/PdfViewerModal';
import { api } from '@/services/api';
import { saveTasksLocal, getTasksLocal } from '@/database/schema';

interface PostComment {
  id: string;
  author: string;
  role: 'STUDENT' | 'TEACHER';
  date: string;
  text: string;
}

interface ClassroomPost {
  id: string;
  author: string;
  role: 'STUDENT' | 'TEACHER';
  date: string;
  text: string;
  likes: number;
  comments: PostComment[];
}

export default function ClassroomDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const classrooms = useClassroomStore((state) => state.classrooms);
  const deleteClassroom = useClassroomStore((state) => state.deleteClassroom);
  const unenrollClassroom = useClassroomStore((state) => state.unenrollClassroom);
  const user = useUserStore((state) => state.user);

  // Busca os dados detalhados reais da sala pelo ID ou código
  const {
    data: apiClassroomData,
    isLoading: isLoadingRoom,
    refetch: refetchRoom,
  } = useQuery({
    queryKey: ['classroom-detail', id],
    queryFn: async () => {
      if (!id) return null;
      try {
        const res = await api.get<any>(`/classrooms/${id}`);
        return res;
      } catch {
        return null;
      }
    },
    enabled: Boolean(id),
  });

  const cachedRoom = classrooms.find((c) => c.id === id || c.code === id);
  const classroom = apiClassroomData
    ? {
        id: apiClassroomData.id,
        name: apiClassroomData.name,
        code: apiClassroomData.code,
        teacherId: apiClassroomData.teacherId,
        teacherName: apiClassroomData.teacher?.name || cachedRoom?.teacherName || 'Professor',
        subject: apiClassroomData.subject || cachedRoom?.subject || 'Geral',
        description: apiClassroomData.description || cachedRoom?.description,
        school: apiClassroomData.school || cachedRoom?.school,
        themeColor: cachedRoom?.themeColor || '#58CC02',
        icon: cachedRoom?.icon || 'graduation-cap',
        studentsCount:
          apiClassroomData._count?.students ??
          apiClassroomData.students?.length ??
          cachedRoom?.studentsCount ??
          0,
        tasksCount:
          apiClassroomData._count?.tasks ??
          apiClassroomData.tasks?.length ??
          cachedRoom?.tasksCount ??
          0,
        materialsCount:
          apiClassroomData._count?.lessons ??
          apiClassroomData.lessons?.length ??
          cachedRoom?.materialsCount ??
          0,
        lessons: apiClassroomData.lessons || [],
      }
    : cachedRoom;

  // Busca as videoaulas reais salvas para esta turma
  const {
    data: customLessons = [],
    isLoading: isLoadingLessons,
    refetch: refetchLessons,
  } = useQuery({
    queryKey: ['classroom-custom-lessons', classroom?.id],
    queryFn: async () => {
      if (!classroom?.id) return [];
      try {
        const res = await api.get<any[]>(`/classrooms/${classroom.id}/lessons`);
        return Array.isArray(res) ? res : [];
      } catch {
        return (classroom as any)?.lessons || [];
      }
    },
    enabled: Boolean(classroom?.id),
    initialData: (classroom as any)?.lessons || [],
  });

  const lessonsList = useMemo(() => {
    if (Array.isArray(customLessons) && customLessons.length > 0) {
      return customLessons;
    }
    if (Array.isArray((classroom as any)?.lessons) && (classroom as any).lessons.length > 0) {
      return (classroom as any).lessons;
    }
    return [];
  }, [customLessons, classroom]);

  // Busca tarefas / exercícios específicos desta turma (GET /classrooms/:id/tasks)
  const {
    data: classroomTasks = [],
    isLoading: isLoadingTasks,
    refetch: refetchTasks,
  } = useQuery<any[]>({
    queryKey: ['classroom-tasks', classroom?.id],
    queryFn: async () => {
      if (!classroom?.id) return [];
      try {
        const res = await api.get<any[]>(`/classrooms/${classroom.id}/tasks`);
        const tasksList = Array.isArray(res) ? res : [];
        if (tasksList.length > 0) {
          saveTasksLocal(
            tasksList.map((t: any) => ({
              id: t.id,
              title: t.title || t.topic || '',
              description: t.description || null,
              topic: t.topic || '',
              classId: t.classId || classroom.id,
              classroomId: t.classroomId || classroom.id,
              dueDate: t.dueDate || null,
              status: t.status || 'PENDING_APPROVAL',
              total: t.total || 0,
              subjectId: t.subjectId || null,
              subjectName: typeof t.subject === 'string' ? t.subject : t.subject?.name,
              instructions: t.instructions || null,
              createdAt: t.createdAt || null,
              updatedAt: t.updatedAt || null,
            }))
          ).catch(() => {});
        }
        return tasksList;
      } catch {
        // Fallback offline: carrega as tarefas salvas no SQLite
        const localTasks = await getTasksLocal(classroom.id);
        return localTasks;
      }
    },
    enabled: Boolean(classroom?.id),
  });

  const [taskFilter, setTaskFilter] = useState<'TODOS' | 'PENDENTES' | 'CONCLUIDOS'>('TODOS');

  const getTaskStatus = (task: any): 'PENDENTE' | 'CONCLUIDO' => {
    const sub = task?.mySubmission;
    const isCompleted =
      Boolean(sub) &&
      (sub.status === 'CORRIGIDO' ||
        sub.status === 'COMPLETED' ||
        sub.status === 'SUBMITTED' ||
        Boolean(sub.submittedAt) ||
        sub.score !== undefined);

    return isCompleted ? 'CONCLUIDO' : 'PENDENTE';
  };

  const filteredTasks = useMemo(() => {
    if (!Array.isArray(classroomTasks)) return [];
    if (taskFilter === 'PENDENTES') {
      return classroomTasks.filter((t) => getTaskStatus(t) === 'PENDENTE');
    }
    if (taskFilter === 'CONCLUIDOS') {
      return classroomTasks.filter((t) => getTaskStatus(t) === 'CONCLUIDO');
    }
    return classroomTasks;
  }, [classroomTasks, taskFilter]);

  const pendingTasksCount = useMemo(() => {
    if (!Array.isArray(classroomTasks)) return 0;
    return classroomTasks.filter((t) => getTaskStatus(t) === 'PENDENTE').length;
  }, [classroomTasks]);

  const completedTasksCount = useMemo(() => {
    if (!Array.isArray(classroomTasks)) return 0;
    return classroomTasks.filter((t) => getTaskStatus(t) === 'CONCLUIDO').length;
  }, [classroomTasks]);

  const [activeTab, setActiveTab] = useState<'geral' | 'aulas' | 'atividades' | 'alunos'>('aulas');
  const [newPostText, setNewPostText] = useState('');
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [expandedPostComments, setExpandedPostComments] = useState<Record<string, boolean>>({
    p1: true,
  });
  const [readingMaterial, setReadingMaterial] = useState<any | null>(null);
  const [viewingPdf, setViewingPdf] = useState<{
    visible: boolean;
    fileUrl: string;
    title: string;
    description?: string;
  } | null>(null);

  const handleOpenPdf = (
    url?: string | null,
    title?: string,
    description?: string
  ) => {
    if (!url) return;
    setViewingPdf({
      visible: true,
      fileUrl: url,
      title: title || 'Apostila / Documento PDF',
      description,
    });
  };

  const [posts, setPosts] = useState<ClassroomPost[]>([
    {
      id: 'p1',
      author: classroom?.teacherName || 'Prof. Responsável',
      role: 'TEACHER',
      date: 'Hoje às 10:30',
      text: 'Sejam bem-vindos! Já disponibilizamos a lista de exercícios da semana e o material teórico na aba de Tarefas.',
      likes: 12,
      comments: [
        {
          id: 'c1',
          author: 'Lucas Silva',
          role: 'STUDENT',
          date: 'Hoje às 10:45',
          text: 'Bom dia professor! Até que dia podemos enviar as respostas da lista?',
        },
        {
          id: 'c2',
          author: classroom?.teacherName || 'Prof. Responsável',
          role: 'TEACHER',
          date: 'Hoje às 11:00',
          text: 'Olá Lucas! O prazo oficial é até o próximo domingo às 23:59.',
        },
      ],
    },
  ]);

  // Pop-confirm states
  const [confirmModal, setConfirmModal] = useState<{
    visible: boolean;
    title: string;
    message: string;
    confirmText?: string;
    confirmColor?: string;
    icon?: string;
    action: () => void;
  }>({
    visible: false,
    title: '',
    message: '',
    action: () => {},
  });

  if (!classroom) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.emptyCenter}>
          <Text style={styles.emptyTitle}>Turma não encontrada.</Text>
          <TouchableOpacity style={styles.backHomeBtn} onPress={() => router.replace('/')}>
            <Text style={styles.backHomeBtnText}>Voltar ao Início</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Entre na turma "${classroom.name}" no Minuto ENEM usando o código: ${classroom.code}`,
      });
    } catch {
      // Ignora erro
    }
  };

  const handlePost = () => {
    if (!newPostText.trim()) return;
    const authorName = user?.name || classroom.teacherName;
    const authorRole = (user?.role as 'STUDENT' | 'TEACHER') || 'TEACHER';

    setPosts([
      {
        id: `post_${Date.now()}`,
        author: authorName,
        role: authorRole,
        date: 'Agora',
        text: newPostText.trim(),
        likes: 0,
        comments: [],
      },
      ...posts,
    ]);
    setNewPostText('');
  };

  const handleAddCommentToPost = (postId: string) => {
    const text = (commentInputs[postId] || '').trim();
    if (!text) return;

    const newComment: PostComment = {
      id: `comm_${Date.now()}`,
      author: user?.name || (user?.role === 'TEACHER' ? 'Professor' : 'Aluno'),
      role: (user?.role as 'STUDENT' | 'TEACHER') || 'STUDENT',
      date: 'Agora',
      text,
    };

    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? { ...p, comments: [...p.comments, newComment] }
          : p
      )
    );

    setCommentInputs((prev) => ({ ...prev, [postId]: '' }));
    setExpandedPostComments((prev) => ({ ...prev, [postId]: true }));
  };

  const toggleComments = (postId: string) => {
    setExpandedPostComments((prev) => ({ ...prev, [postId]: !prev[postId] }));
  };

  // Pop-confirm para excluir post
  const requestDeletePost = (postId: string) => {
    setConfirmModal({
      visible: true,
      title: 'Excluir Comunicado',
      message: 'Tem certeza de que deseja apagar este comunicado e todos os seus comentários?',
      confirmText: 'Excluir',
      confirmColor: '#FF4B4B',
      icon: 'trash-alt',
      action: () => {
        setPosts((prev) => prev.filter((p) => p.id !== postId));
        setConfirmModal((prev) => ({ ...prev, visible: false }));
      },
    });
  };

  // Pop-confirm para excluir turma
  const requestDeleteClassroom = () => {
    setConfirmModal({
      visible: true,
      title: 'Encerrar Turma',
      message: `Tem certeza de que deseja encerrar a turma "${classroom.name}"? Alunos e materiais perderão o acesso associado.`,
      confirmText: 'Encerrar Turma',
      confirmColor: '#FF4B4B',
      icon: 'trash-alt',
      action: () => {
        deleteClassroom(classroom.id);
        setConfirmModal((prev) => ({ ...prev, visible: false }));
        router.replace('/');
      },
    });
  };

  // Pop-confirm para sair da turma (caso aluno)
  const requestLeaveClassroom = () => {
    setConfirmModal({
      visible: true,
      title: 'Sair da Turma',
      message: `Deseja sair da turma "${classroom.name}"? Você precisará do código de acesso para retornar depois.`,
      confirmText: 'Sair da Turma',
      confirmColor: '#FF9600',
      icon: 'sign-out-alt',
      action: async () => {
        await unenrollClassroom(classroom.id);
        setConfirmModal((prev) => ({ ...prev, visible: false }));
        router.replace('/');
      },
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerIconBtn}>
          <FontAwesome5 name="arrow-left" size={18} color="#2C3A47" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {classroom.name}
        </Text>
        <TouchableOpacity onPress={handleShare} style={styles.headerIconBtn}>
          <FontAwesome5 name="share-alt" size={18} color="#1CB0F6" />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Banner Hero da Turma */}
        <View style={[styles.heroCard, { backgroundColor: classroom.themeColor }]}>
          <View style={styles.heroTopRow}>
            <View style={styles.heroIconCircle}>
              <FontAwesome5 name={classroom.icon || 'chalkboard-teacher'} size={24} color="#FFF" />
            </View>
            <View style={styles.codeBadge}>
              <FontAwesome5 name="key" size={11} color="#FFF" />
              <Text style={styles.codeBadgeText}>{classroom.code}</Text>
            </View>
          </View>

          <Text style={styles.heroTitle}>{classroom.name}</Text>
          <Text style={styles.heroSub}>
            {classroom.subject} • {classroom.teacherName}
            {classroom.school ? ` • ${classroom.school}` : ''}
          </Text>

          {classroom.description && (
            <Text style={styles.heroDesc}>{classroom.description}</Text>
          )}

          {/* Atalhos do Professor: Análise da Turma & Acompanhamento */}
          {(user?.role === 'TEACHER' || user?.role === 'SCHOOL' || user?.role === 'ADMIN') && (
            <View style={{ gap: 8, marginBottom: 12 }}>
              <TouchableOpacity
                style={[
                  styles.teacherDashboardButton,
                  { borderColor: '#1CB0F6', backgroundColor: '#EFF6FF' },
                ]}
                activeOpacity={0.85}
                onPress={() => router.push(`/teacher/classrooms/${classroom.id}` as any)}
              >
                <FontAwesome5 name="fire-alt" size={14} color="#1CB0F6" />
                <Text style={[styles.teacherDashboardText, { color: '#0284C7' }]}>
                  Mapa de Calor & Análise Pedagógica da Turma
                </Text>
                <FontAwesome5 name="arrow-right" size={12} color="#0284C7" />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.teacherDashboardButton}
                activeOpacity={0.85}
                onPress={() =>
                  router.push(`/classes/teacher-tracking?classId=${classroom.id}` as any)
                }
              >
                <FontAwesome5 name="chart-pie" size={14} color={classroom.themeColor} />
                <Text style={[styles.teacherDashboardText, { color: classroom.themeColor }]}>
                  Acompanhar Listas & Materiais
                </Text>
                <FontAwesome5 name="arrow-right" size={12} color={classroom.themeColor} />
              </TouchableOpacity>
            </View>
          )}

          {/* Estatísticas Rápidas */}
          <View style={styles.heroStatsRow}>
            <View style={styles.heroStatItem}>
              <Text style={styles.heroStatValue}>{classroom.studentsCount}</Text>
              <Text style={styles.heroStatLabel}>Alunos</Text>
            </View>
            <View style={styles.heroStatDivider} />
            <View style={styles.heroStatItem}>
              <Text style={styles.heroStatValue}>{classroom.tasksCount}</Text>
              <Text style={styles.heroStatLabel}>Listas</Text>
            </View>
            <View style={styles.heroStatDivider} />
            <View style={styles.heroStatItem}>
              <Text style={styles.heroStatValue}>{lessonsList.length || classroom.materialsCount}</Text>
              <Text style={styles.heroStatLabel}>Aulas</Text>
            </View>
          </View>
        </View>

        {/* Abas */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'geral' && styles.tabButtonActive]}
            onPress={() => setActiveTab('geral')}
          >
            <Text style={[styles.tabText, activeTab === 'geral' && styles.tabTextActive]}>
              Mural
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'aulas' && styles.tabButtonActive]}
            onPress={() => setActiveTab('aulas')}
          >
            <Text style={[styles.tabText, activeTab === 'aulas' && styles.tabTextActive]}>
              Aulas ({lessonsList.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'atividades' && styles.tabButtonActive]}
            onPress={() => setActiveTab('atividades')}
          >
            <Text style={[styles.tabText, activeTab === 'atividades' && styles.tabTextActive]}>
              Exercícios ({classroomTasks.length})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'alunos' && styles.tabButtonActive]}
            onPress={() => setActiveTab('alunos')}
          >
            <Text style={[styles.tabText, activeTab === 'alunos' && styles.tabTextActive]}>
              Alunos ({classroom.studentsCount})
            </Text>
          </TouchableOpacity>
        </View>

        {/* Conteúdo 1: Mural & Avisos com comentários estilo Classroom */}
        {activeTab === 'geral' && (
          <View style={styles.tabSection}>
            {/* Caixa de Novo Comunicado */}
            <View style={styles.postBoxCard}>
              <Text style={styles.postBoxTitle}>Compartilhar com a turma</Text>
              <TextInput
                style={styles.postInput}
                placeholder="Escreva um comunicado, aviso ou instrução para os alunos..."
                placeholderTextColor="#A0AEC0"
                multiline
                numberOfLines={3}
                value={newPostText}
                onChangeText={setNewPostText}
              />
              <View style={styles.postBoxActions}>
                <TouchableOpacity
                  style={[styles.postButton, !newPostText.trim() && { opacity: 0.5 }]}
                  disabled={!newPostText.trim()}
                  onPress={handlePost}
                >
                  <FontAwesome5 name="paper-plane" size={12} color="#FFF" />
                  <Text style={styles.postButtonText}>Publicar no Mural</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Lista de Publicações do Mural */}
            {posts.map((post) => {
              const isCommentsOpen = !!expandedPostComments[post.id];

              return (
                <View key={post.id} style={styles.feedCard}>
                  <View style={styles.feedHeader}>
                    <View
                      style={[
                        styles.feedAvatar,
                        { backgroundColor: post.role === 'TEACHER' ? '#1CB0F6' : '#58CC02' },
                      ]}
                    >
                      <FontAwesome5
                        name={post.role === 'TEACHER' ? 'chalkboard-teacher' : 'user'}
                        size={12}
                        color="#FFF"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.feedAuthor}>
                        {post.author}{' '}
                        {post.role === 'TEACHER' && (
                          <Text style={styles.teacherBadgeText}>• Professor</Text>
                        )}
                      </Text>
                      <Text style={styles.feedDate}>{post.date}</Text>
                    </View>

                    <TouchableOpacity
                      style={styles.feedOptionsBtn}
                      onPress={() => requestDeletePost(post.id)}
                    >
                      <FontAwesome5 name="trash-alt" size={12} color="#8CA0B3" />
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.feedText}>{post.text}</Text>

                  {/* Barra de Ações: Comentários da Turma */}
                  <View style={styles.feedActionRow}>
                    <TouchableOpacity
                      style={styles.toggleCommentsBtn}
                      onPress={() => toggleComments(post.id)}
                    >
                      <FontAwesome5 name="comment-alt" size={12} color="#1CB0F6" />
                      <Text style={styles.toggleCommentsText}>
                        {post.comments.length}{' '}
                        {post.comments.length === 1 ? 'comentário da turma' : 'comentários da turma'}
                      </Text>
                      <FontAwesome5
                        name={isCommentsOpen ? 'chevron-up' : 'chevron-down'}
                        size={10}
                        color="#8CA0B3"
                      />
                    </TouchableOpacity>
                  </View>

                  {/* Seção de Comentários do Post (Estilo Google Classroom) */}
                  {isCommentsOpen && (
                    <View style={styles.postCommentsSection}>
                      {post.comments.map((comm) => (
                        <View key={comm.id} style={styles.postCommentItem}>
                          <View style={styles.commentAvatarMini}>
                            <FontAwesome5
                              name={comm.role === 'TEACHER' ? 'chalkboard-teacher' : 'user'}
                              size={10}
                              color="#FFF"
                            />
                          </View>
                          <View style={styles.commentBubble}>
                            <View style={styles.commentHeaderMini}>
                              <Text style={styles.commentAuthorMini}>
                                {comm.author}{' '}
                                {comm.role === 'TEACHER' && (
                                  <Text style={styles.teacherMiniTag}>(Prof)</Text>
                                )}
                              </Text>
                              <Text style={styles.commentDateMini}>{comm.date}</Text>
                            </View>
                            <Text style={styles.commentTextMini}>{comm.text}</Text>
                          </View>
                        </View>
                      ))}

                      {/* Campo para Alunos/Professores Comentarem */}
                      <View style={styles.addCommentInputRow}>
                        <TextInput
                          style={styles.addCommentInput}
                          placeholder="Adicionar comentário para a turma..."
                          placeholderTextColor="#A0AEC0"
                          value={commentInputs[post.id] || ''}
                          onChangeText={(txt) =>
                            setCommentInputs((prev) => ({ ...prev, [post.id]: txt }))
                          }
                        />
                        <TouchableOpacity
                          style={styles.addCommentSendBtn}
                          onPress={() => handleAddCommentToPost(post.id)}
                        >
                          <FontAwesome5 name="paper-plane" size={11} color="#FFF" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* Conteúdo 2: Aulas & Materiais Multimodais da Turma */}
        {activeTab === 'aulas' && (
          <View style={styles.tabSection}>
            {user?.role === 'TEACHER' && (
              <TouchableOpacity
                style={styles.addLessonTeacherBanner}
                activeOpacity={0.85}
                onPress={() =>
                  router.push({
                    pathname: '/classes/materials',
                    params: {
                      classId: classroom.id,
                      subject: classroom.subject,
                      className: classroom.name,
                      openNew: '1',
                    },
                  } as any)
                }
              >
                <View style={styles.addLessonIconCircle}>
                  <FontAwesome5 name="plus" size={14} color="#FFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.addLessonTeacherTitle}>Publicar Material Didático</Text>
                  <Text style={styles.addLessonTeacherSub}>
                    Adicione videoaulas do YouTube, artigos, macetes rápidos ou arquivos PDF.
                  </Text>
                </View>
                <FontAwesome5 name="chevron-right" size={12} color="#16A34A" />
              </TouchableOpacity>
            )}

            {lessonsList.length === 0 ? (
              <View style={styles.emptyLessonsCard}>
                <FontAwesome5 name="folder-open" size={36} color="#CBD5E1" style={{ marginBottom: 12 }} />
                <Text style={styles.emptyLessonsTitle}>Nenhum material publicado ainda</Text>
                <Text style={styles.emptyLessonsSub}>
                  Assim que o professor publicar aulas, vídeos, artigos ou PDFs, eles ficarão disponíveis aqui para você estudar.
                </Text>
              </View>
            ) : (
              lessonsList.map((lesson: any) => {
                const rawType = (lesson.type || '').toUpperCase();
                const isYouTube = rawType === 'VIDEO' || Boolean(lesson.youtubeUrl);
                const isArticle = rawType === 'ARTICLE';
                const isTip = rawType === 'TIP';
                const isPdf =
                  rawType === 'PDF' ||
                  rawType === 'EXTERNAL_LINK' ||
                  (lesson.fileUrl && /\.pdf/i.test(lesson.fileUrl));

                let badgeConfig = {
                  label: 'VÍDEO',
                  icon: 'youtube',
                  color: '#DC2626',
                  bgColor: '#FEE2E2',
                };

                if (isArticle) {
                  badgeConfig = {
                    label: 'ARTIGO',
                    icon: 'newspaper',
                    color: '#2563EB',
                    bgColor: '#DBEAFE',
                  };
                } else if (isTip) {
                  badgeConfig = {
                    label: 'MACETE',
                    icon: 'lightbulb',
                    color: '#D97706',
                    bgColor: '#FEF3C7',
                  };
                } else if (isPdf) {
                  badgeConfig = {
                    label: 'PDF',
                    icon: 'file-pdf',
                    color: '#059669',
                    bgColor: '#D1FAE5',
                  };
                }

                return (
                  <View
                    key={lesson.id}
                    style={[
                      styles.lessonVideoCard,
                      isTip && { borderColor: '#FDE68A', backgroundColor: '#FFFDF5' },
                    ]}
                  >
                    {/* Cabeçalho da Aula */}
                    <View style={styles.lessonCardHeader}>
                      <View style={styles.lessonBadgeRow}>
                        <View style={styles.lessonSubjectBadge}>
                          <Text style={styles.lessonSubjectBadgeText}>
                            {lesson.subject?.name || classroom.subject || 'Geral'}
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.youtubeLiveBadge,
                            { backgroundColor: badgeConfig.bgColor },
                          ]}
                        >
                          <FontAwesome5
                            name={badgeConfig.icon}
                            size={11}
                            color={badgeConfig.color}
                          />
                          <Text
                            style={[
                              styles.youtubeLiveBadgeText,
                              { color: badgeConfig.color },
                            ]}
                          >
                            {badgeConfig.label}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.lessonCardTitle}>{lesson.title}</Text>
                      {lesson.createdAt && (
                        <Text style={styles.lessonDateText}>
                          Disponibilizado em{' '}
                          {new Date(lesson.createdAt).toLocaleDateString('pt-BR', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </Text>
                      )}
                    </View>

                    {/* VÍDEO: Player de YouTube Embutido */}
                    {isYouTube && lesson.youtubeUrl && (
                      <View style={styles.playerContainerWrapper}>
                        <EmbeddedVideoPlayer
                          youtubeUrl={lesson.youtubeUrl}
                          title={lesson.title}
                          fullWidth={true}
                        />
                      </View>
                    )}

                    {/* MACETE RÁPIDO: Bloco de Destaque com Lâmpada */}
                    {isTip && (lesson.content || lesson.description) && (
                      <View style={styles.tipClassroomBox}>
                        <View style={styles.tipClassroomHeader}>
                          <FontAwesome5 name="bolt" size={12} color="#D97706" />
                          <Text style={styles.tipClassroomTitle}>Dica de Fixação Rápida</Text>
                        </View>
                        <Text style={styles.tipClassroomText} numberOfLines={4}>
                          {(lesson.content || lesson.description || '').replace(/[#*`>]/g, '')}
                        </Text>
                        <TouchableOpacity
                          style={styles.openTipBtn}
                          activeOpacity={0.8}
                          onPress={() => setReadingMaterial(lesson)}
                        >
                          <FontAwesome5 name="lightbulb" size={11} color="#FFF" />
                          <Text style={styles.openTipBtnText}>Ver Macete Completo</Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    {/* ARTIGO / TEXTO: Botão para Abrir Leitor Completo */}
                    {isArticle && (
                      <View style={styles.articleCardActionBox}>
                        <Text style={styles.articleCardSummary} numberOfLines={2}>
                          {lesson.description ||
                            lesson.content?.substring(0, 120) ||
                            'Artigo explicativo para leitura com conceitos fundamentais.'}
                        </Text>
                        <TouchableOpacity
                          style={styles.openArticleBtn}
                          activeOpacity={0.8}
                          onPress={() => setReadingMaterial(lesson)}
                        >
                          <FontAwesome5 name="book-reader" size={12} color="#FFF" />
                          <Text style={styles.openArticleBtnText}>Ler Artigo Completo</Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    {/* PDF: Botão para Visualizar Documento */}
                    {isPdf && (
                      <View style={styles.pdfCardActionBox}>
                        <Text style={styles.pdfCardSummary} numberOfLines={2}>
                          {lesson.description || 'Documento em formato PDF para download ou estudo complementar.'}
                        </Text>
                        <TouchableOpacity
                          style={styles.openPdfBtn}
                          activeOpacity={0.8}
                          onPress={() =>
                            handleOpenPdf(
                              lesson.fileUrl,
                              lesson.title,
                              lesson.description
                            )
                          }
                        >
                          <FontAwesome5 name="file-pdf" size={13} color="#FFF" />
                          <Text style={styles.openPdfBtnText}>Visualizar / Abrir Documento</Text>
                        </TouchableOpacity>
                      </View>
                    )}

                    {/* Descrição / Conteúdo Pedagógico se for vídeo */}
                    {isYouTube && lesson.description && (
                      <View style={styles.lessonDescBox}>
                        <Text style={styles.lessonDescTitle}>Conteúdo / Resumo</Text>
                        <Text style={styles.lessonDescText}>{lesson.description}</Text>
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </View>
        )}

        {/* Conteúdo 3: Exercícios da Turma */}
        {activeTab === 'atividades' && (
          <View style={styles.tabSection}>
            {/* Banner de Direcionamento ao Painel de Acompanhamento do Professor (apenas para TEACHER) */}
            {user?.role === 'TEACHER' && (
              <TouchableOpacity
                style={styles.highlightBanner}
                activeOpacity={0.8}
                onPress={() => router.push(`/classes/teacher-tracking?classId=${classroom.id}` as any)}
              >
                <View style={[styles.actionIconBox, { backgroundColor: '#FFF0D4' }]}>
                  <FontAwesome5 name="chart-bar" size={18} color="#FF9600" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.actionCardTitle}>Painel de Acompanhamento das Listas</Text>
                  <Text style={styles.actionCardSub}>
                    Veja taxa de acertos, tempo gasto e quem já entregou cada exercício.
                  </Text>
                </View>
                <FontAwesome5 name="chevron-right" size={14} color="#8CA0B3" />
              </TouchableOpacity>
            )}

            {/* Cabeçalho da Seção de Exercícios */}
            <View style={styles.exercisesHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.exercisesSectionTitle}>Exercícios da Turma</Text>
                <Text style={styles.exercisesSectionSub}>
                  Listas e atividades pedagógicas atribuídas para esta turma
                </Text>
              </View>

              {user?.role === 'TEACHER' && (
                <TouchableOpacity
                  style={styles.createTaskShortcutBtn}
                  activeOpacity={0.8}
                  onPress={() =>
                    router.push({
                      pathname: '/classes/tasks',
                      params: {
                        subject: classroom.subject,
                        classId: classroom.id,
                        className: classroom.name,
                      },
                    } as any)
                  }
                >
                  <FontAwesome5 name="plus" size={11} color="#FFF" style={{ marginRight: 6 }} />
                  <Text style={styles.createTaskShortcutText}>Nova Lista</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Chips de Filtro (Todos / Pendentes / Concluídos) */}
            <View style={styles.filterChipsRow}>
              <TouchableOpacity
                style={[
                  styles.filterChip,
                  taskFilter === 'TODOS' && styles.filterChipActive,
                ]}
                onPress={() => setTaskFilter('TODOS')}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    taskFilter === 'TODOS' && styles.filterChipTextActive,
                  ]}
                >
                  Todos ({classroomTasks.length})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.filterChip,
                  taskFilter === 'PENDENTES' && styles.filterChipActive,
                ]}
                onPress={() => setTaskFilter('PENDENTES')}
              >
                <View style={[styles.statusDot, { backgroundColor: '#F59E0B' }]} />
                <Text
                  style={[
                    styles.filterChipText,
                    taskFilter === 'PENDENTES' && styles.filterChipTextActive,
                  ]}
                >
                  Pendentes ({pendingTasksCount})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.filterChip,
                  taskFilter === 'CONCLUIDOS' && styles.filterChipActive,
                ]}
                onPress={() => setTaskFilter('CONCLUIDOS')}
              >
                <View style={[styles.statusDot, { backgroundColor: '#10B981' }]} />
                <Text
                  style={[
                    styles.filterChipText,
                    taskFilter === 'CONCLUIDOS' && styles.filterChipTextActive,
                  ]}
                >
                  Concluídos ({completedTasksCount})
                </Text>
              </TouchableOpacity>
            </View>

            {/* Loading State */}
            {isLoadingTasks ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator size="small" color="#1CB0F6" />
                <Text style={styles.loadingText}>Carregando exercícios da turma...</Text>
              </View>
            ) : filteredTasks.length === 0 ? (
              /* Empty State */
              <View style={styles.emptyTasksCard}>
                <View style={styles.emptyTasksIconCircle}>
                  <FontAwesome5 name="clipboard-list" size={28} color="#94A3B8" />
                </View>
                <Text style={styles.emptyTasksTitle}>
                  {classroomTasks.length === 0
                    ? 'Nenhum exercício atribuído'
                    : 'Nenhum exercício encontrado'}
                </Text>
                <Text style={styles.emptyTasksSub}>
                  {classroomTasks.length === 0
                    ? 'O professor ainda não publicou listas de exercícios nesta turma. Fique atento aos novos comunicados!'
                    : `Não há exercícios com status "${taskFilter === 'PENDENTES' ? 'Pendente' : 'Concluído'}".`}
                </Text>
                {user?.role === 'TEACHER' && classroomTasks.length === 0 && (
                  <TouchableOpacity
                    style={styles.emptyCreateTaskBtn}
                    onPress={() =>
                      router.push({
                        pathname: '/classes/tasks',
                        params: {
                          subject: classroom.subject,
                          classId: classroom.id,
                          className: classroom.name,
                        },
                      } as any)
                    }
                  >
                    <FontAwesome5 name="plus" size={12} color="#FFF" style={{ marginRight: 6 }} />
                    <Text style={styles.emptyCreateTaskBtnText}>Criar Primeira Lista</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              /* Lista de Exercícios */
              <View style={styles.tasksListContainer}>
                {filteredTasks.map((task) => {
                  const status = getTaskStatus(task);
                  const isCompleted = status === 'CONCLUIDO';
                  const taskTitle = task.title || task.topic || 'Lista de Exercícios';
                  const subjectName =
                    typeof task.subject === 'object'
                      ? task.subject?.name
                      : task.subject || classroom.subject;
                  const totalQuestions =
                    task.total || (Array.isArray(task.questionIds) ? task.questionIds.length : 10);
                  const sub = task.mySubmission;

                  return (
                    <View
                      key={task.id}
                      style={[
                        styles.taskItemCard,
                        isCompleted ? styles.taskItemCardCompleted : styles.taskItemCardPending,
                      ]}
                    >
                      {/* Topo do Card: Matéria + Badge de Status */}
                      <View style={styles.taskCardTop}>
                        <View style={styles.taskSubjectBadge}>
                          <Text style={styles.taskSubjectBadgeText} numberOfLines={1}>
                            {subjectName}
                          </Text>
                        </View>

                        {isCompleted ? (
                          <View style={styles.statusBadgeCompleted}>
                            <FontAwesome5
                              name="check-circle"
                              size={11}
                              color="#16A34A"
                              style={{ marginRight: 4 }}
                            />
                            <Text style={styles.statusBadgeCompletedText}>Concluído</Text>
                          </View>
                        ) : (
                          <View style={styles.statusBadgePending}>
                            <FontAwesome5
                              name="clock"
                              size={11}
                              color="#D97706"
                              style={{ marginRight: 4 }}
                            />
                            <Text style={styles.statusBadgePendingText}>Pendente</Text>
                          </View>
                        )}
                      </View>

                      {/* Título e Assunto */}
                      <Text style={styles.taskItemTitle}>{taskTitle}</Text>
                      {task.topic && task.topic !== taskTitle && (
                        <Text style={styles.taskItemTopic}>Assunto: {task.topic}</Text>
                      )}

                      {/* Instruções do Professor (se houver) */}
                      {task.instructions ? (
                        <View style={styles.taskInstructionsBox}>
                          <FontAwesome5
                            name="info-circle"
                            size={11}
                            color="#64748B"
                            style={{ marginRight: 6, marginTop: 2 }}
                          />
                          <Text style={styles.taskInstructionsText} numberOfLines={2}>
                            {task.instructions}
                          </Text>
                        </View>
                      ) : null}

                      {/* Metadados: Questões e Prazo */}
                      <View style={styles.taskMetaRow}>
                        <View style={styles.taskMetaItem}>
                          <FontAwesome5 name="list-ol" size={11} color="#64748B" />
                          <Text style={styles.taskMetaText}>{totalQuestions} questões</Text>
                        </View>

                        {task.dueDate && (
                          <View style={styles.taskMetaItem}>
                            <FontAwesome5 name="calendar-alt" size={11} color="#64748B" />
                            <Text style={styles.taskMetaText}>
                              Prazo: {new Date(task.dueDate).toLocaleDateString('pt-BR')}
                            </Text>
                          </View>
                        )}

                        {isCompleted && sub && (
                          <View style={styles.taskMetaItem}>
                            <FontAwesome5 name="award" size={11} color="#16A34A" />
                            <Text style={[styles.taskMetaText, { color: '#16A34A', fontWeight: 'bold' }]}>
                              {sub.correctCount !== undefined
                                ? `${sub.correctCount}/${sub.totalQuestions || totalQuestions} acertos`
                                : 'Finalizado'}
                            </Text>
                          </View>
                        )}
                      </View>

                      {/* Ação do Aluno */}
                      <View style={styles.taskCardFooter}>
                        {isCompleted ? (
                          <View style={styles.completedFooterRow}>
                            <View style={styles.scorePill}>
                              <Text style={styles.scorePillLabel}>Nota:</Text>
                              <Text style={styles.scorePillValue}>
                                {sub?.score !== undefined ? sub.score.toFixed(1) : '10.0'}/10
                              </Text>
                            </View>

                            <TouchableOpacity
                              style={styles.reviewErrorsBtn}
                              activeOpacity={0.8}
                              onPress={() =>
                                router.push({
                                  pathname: '/stats/errors',
                                  params: { subject: subjectName },
                                } as any)
                              }
                            >
                              <Text style={styles.reviewErrorsBtnText}>Revisar Dúvidas</Text>
                              <FontAwesome5 name="chevron-right" size={10} color="#2563EB" />
                            </TouchableOpacity>
                          </View>
                        ) : (
                          <TouchableOpacity
                            style={styles.solveExerciseBtn}
                            activeOpacity={0.85}
                            onPress={() =>
                              router.push({
                                pathname: '/quiz',
                                params: {
                                  taskId: task.id,
                                  mode: 'tarefa',
                                  subject: subjectName,
                                  title: taskTitle,
                                },
                              } as any)
                            }
                          >
                            <Text style={styles.solveExerciseBtnText}>Iniciar Exercício</Text>
                            <FontAwesome5 name="arrow-right" size={12} color="#FFF" />
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Atalho para Materiais Didáticos */}
            <TouchableOpacity
              style={styles.actionRowCard}
              activeOpacity={0.8}
              onPress={() =>
                router.push({
                  pathname: '/classes/materials',
                  params: {
                    subject: classroom.subject,
                    classId: classroom.id,
                    className: classroom.name,
                  },
                } as any)
              }
            >
              <View style={[styles.actionIconBox, { backgroundColor: '#F0FDF4' }]}>
                <FontAwesome5 name="folder-open" size={18} color="#58CC02" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.actionCardTitle}>Apostilas e Materiais Didáticos</Text>
                <Text style={styles.actionCardSub}>PDFs, resumos e leituras desta turma de {classroom.subject}.</Text>
              </View>
              <FontAwesome5 name="chevron-right" size={14} color="#8CA0B3" />
            </TouchableOpacity>
          </View>
        )}

        {/* Conteúdo 3: Alunos */}
        {activeTab === 'alunos' && (
          <View style={styles.tabSection}>
            <View style={styles.inviteBox}>
              <View style={{ flex: 1 }}>
                <Text style={styles.inviteTitle}>Convide mais participantes</Text>
                <Text style={styles.inviteSub}>Código: {classroom.code}</Text>
              </View>
              <TouchableOpacity style={styles.inviteBtn} onPress={handleShare}>
                <FontAwesome5 name="share-alt" size={12} color="#FFF" />
                <Text style={styles.inviteBtnText}>Convidar</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.studentsListCard}>
              {Array.isArray(apiClassroomData?.students) && apiClassroomData.students.length > 0 ? (
                apiClassroomData.students.map((student: any) => (
                  <View key={student.id} style={styles.studentRow}>
                    <View style={styles.studentAvatar}>
                      <Text style={styles.studentAvatarText}>
                        {student.name?.charAt(0)?.toUpperCase() || 'A'}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.studentName}>{student.name}</Text>
                      <Text style={styles.studentSub}>
                        {student.currentStreak || 0} dias de ofensiva
                      </Text>
                    </View>
                    <Text style={styles.studentXp}>{student.xp || 0} XP</Text>
                  </View>
                ))
              ) : (
                <View style={{ padding: 24, alignItems: 'center' }}>
                  <FontAwesome5 name="user-friends" size={32} color="#CBD5E1" style={{ marginBottom: 10 }} />
                  <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#64748B', textAlign: 'center' }}>
                    Nenhum aluno matriculado ainda.
                  </Text>
                  <Text style={{ fontSize: 12, color: '#94A3B8', textAlign: 'center', marginTop: 4 }}>
                    Compartilhe o código {classroom.code} para que os estudantes entrem nesta sala.
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Botões de Sair e Excluir Turma com Pop-confirm de acordo com o papel */}
        <View style={styles.bottomActionsCol}>
          {user?.role !== 'TEACHER' && (
            <TouchableOpacity
              style={styles.leaveButton}
              activeOpacity={0.8}
              onPress={requestLeaveClassroom}
            >
              <FontAwesome5 name="sign-out-alt" size={14} color="#8CA0B3" />
              <Text style={styles.leaveButtonText}>Sair da Turma</Text>
            </TouchableOpacity>
          )}

          {user?.role === 'TEACHER' && (
            <TouchableOpacity
              style={styles.deleteButton}
              activeOpacity={0.8}
              onPress={requestDeleteClassroom}
            >
              <FontAwesome5 name="trash-alt" size={14} color="#FF4B4B" />
              <Text style={styles.deleteButtonText}>Encerrar Turma (Professor)</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      {/* Pop-confirm Modal */}
      <ConfirmModal
        visible={confirmModal.visible}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText={confirmModal.confirmText}
        confirmColor={confirmModal.confirmColor}
        icon={confirmModal.icon}
        onConfirm={confirmModal.action}
        onCancel={() => setConfirmModal((prev) => ({ ...prev, visible: false }))}
      />

      {/* Modal Leitor Formatado para Artigos e Macetes */}
      <Modal
        visible={Boolean(readingMaterial)}
        transparent
        animationType="slide"
        onRequestClose={() => setReadingMaterial(null)}
      >
        <SafeAreaView style={styles.readerModalOverlay}>
          <View style={styles.readerCard}>
            {/* Header do Leitor */}
            <View style={styles.readerHeader}>
              <View style={{ flex: 1 }}>
                <View style={styles.readerBadgeRow}>
                  <View
                    style={[
                      styles.readerTypeBadge,
                      {
                        backgroundColor:
                          readingMaterial?.type === 'TIP' ? '#FEF3C7' : '#EFF6FF',
                      },
                    ]}
                  >
                    <FontAwesome5
                      name={readingMaterial?.type === 'TIP' ? 'lightbulb' : 'newspaper'}
                      size={11}
                      color={readingMaterial?.type === 'TIP' ? '#D97706' : '#2563EB'}
                    />
                    <Text
                      style={[
                        styles.readerTypeBadgeText,
                        {
                          color:
                            readingMaterial?.type === 'TIP' ? '#D97706' : '#2563EB',
                        },
                      ]}
                    >
                      {readingMaterial?.type === 'TIP' ? 'Macete Rápido' : 'Artigo Didático'}
                    </Text>
                  </View>
                  <Text style={styles.readerSubjectText}>
                    {readingMaterial?.subject?.name || classroom.subject}
                  </Text>
                </View>
                <Text style={styles.readerTitle} numberOfLines={2}>
                  {readingMaterial?.title}
                </Text>
                <Text style={styles.readerAuthorSub}>
                  Turma: {classroom.name} • {classroom.teacherName}
                </Text>
              </View>

              <TouchableOpacity
                style={styles.readerCloseBtn}
                onPress={() => setReadingMaterial(null)}
              >
                <FontAwesome5 name="times" size={16} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Conteúdo formatado em Markdown */}
            <ScrollView
              style={styles.readerScroll}
              contentContainerStyle={styles.readerScrollContent}
              showsVerticalScrollIndicator={false}
            >
              {readingMaterial?.content ? (
                <Markdown style={markdownStyles as any}>
                  {readingMaterial.content}
                </Markdown>
              ) : (
                <Text style={styles.readerPlainBody}>
                  {readingMaterial?.description || 'Nenhum texto disponível para este material.'}
                </Text>
              )}

              {/* Botão de Praticar Questões deste Assunto */}
              <View style={styles.readerFooterActionBox}>
                <TouchableOpacity
                  style={styles.practiceQuizBtn}
                  activeOpacity={0.85}
                  onPress={() => {
                    const subId = readingMaterial?.subjectId || readingMaterial?.subject?.id;
                    setReadingMaterial(null);
                    router.push({
                      pathname: '/quiz',
                      params: {
                        subjectId: subId || '',
                        lessonId: readingMaterial?.id || '',
                      },
                    } as any);
                  }}
                >
                  <FontAwesome5 name="pencil-alt" size={14} color="#FFF" />
                  <Text style={styles.practiceQuizBtnText}>
                    Praticar Questões deste Assunto
                  </Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </SafeAreaView>
      </Modal>

      {/* Visualizador In-App de Arquivos PDF */}
      <PdfViewerModal
        visible={Boolean(viewingPdf?.visible)}
        onClose={() => setViewingPdf(null)}
        pdfUrl={viewingPdf?.fileUrl}
        title={viewingPdf?.title}
        description={viewingPdf?.description}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F9FC' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
  },
  headerIconBtn: { width: 38, height: 38, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { flex: 1, fontSize: 17, fontWeight: 'bold', color: '#2C3A47', textAlign: 'center' },
  scrollContent: { padding: 18, paddingBottom: 60 },

  emptyCenter: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  emptyTitle: { fontSize: 18, fontWeight: 'bold', color: '#2C3A47', marginBottom: 12 },
  backHomeBtn: { backgroundColor: '#1CB0F6', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12 },
  backHomeBtnText: { color: '#FFF', fontWeight: 'bold' },

  heroCard: {
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  heroIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  codeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.25)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  codeBadgeText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  heroTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 4,
  },
  heroSub: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.9)',
    marginBottom: 8,
  },
  heroDesc: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.85)',
    lineHeight: 18,
    marginBottom: 14,
  },

  teacherDashboardButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FFF',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  teacherDashboardText: {
    fontSize: 13,
    fontWeight: 'bold',
  },

  heroStatsRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 14,
    paddingVertical: 10,
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  heroStatItem: { alignItems: 'center' },
  heroStatValue: { fontSize: 16, fontWeight: 'bold', color: '#FFF' },
  heroStatLabel: { fontSize: 11, color: 'rgba(255,255,255,0.85)' },
  heroStatDivider: { width: 1, height: 24, backgroundColor: 'rgba(255,255,255,0.2)' },

  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: 12,
    padding: 4,
    marginBottom: 16,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
  },
  tabButtonActive: {
    backgroundColor: '#FFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  tabText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#8CA0B3',
  },
  tabTextActive: {
    color: '#2C3A47',
  },

  tabSection: { gap: 14 },

  postBoxCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 10,
  },
  postBoxTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#2C3A47',
  },
  postInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 10,
    fontSize: 14,
    color: '#2C3A47',
    minHeight: 60,
    textAlignVertical: 'top',
  },
  postBoxActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  postButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#1CB0F6',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  postButtonText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: 'bold',
  },

  feedCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  feedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  feedAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  feedAuthor: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#2C3A47',
  },
  teacherBadgeText: {
    color: '#1CB0F6',
    fontSize: 11,
  },
  feedDate: {
    fontSize: 11,
    color: '#8CA0B3',
  },
  feedOptionsBtn: {
    padding: 4,
  },
  feedText: {
    fontSize: 13,
    color: '#4B5563',
    lineHeight: 19,
    marginBottom: 10,
  },
  feedActionRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 8,
  },
  toggleCommentsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  toggleCommentsText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#1CB0F6',
  },

  // Comentários do Post
  postCommentsSection: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    gap: 8,
  },
  postCommentItem: {
    flexDirection: 'row',
    gap: 8,
  },
  commentAvatarMini: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#8CA0B3',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  commentBubble: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  commentHeaderMini: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  commentAuthorMini: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#2C3A47',
  },
  teacherMiniTag: {
    color: '#1CB0F6',
  },
  commentDateMini: {
    fontSize: 9,
    color: '#8CA0B3',
  },
  commentTextMini: {
    fontSize: 12,
    color: '#4B5563',
    lineHeight: 16,
  },
  addCommentInputRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  addCommentInput: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 12,
    color: '#2C3A47',
  },
  addCommentSendBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#1CB0F6',
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
  },

  highlightBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#FDE68A',
    gap: 12,
  },
  actionRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 12,
  },
  actionIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionCardTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#2C3A47',
  },
  actionCardSub: {
    fontSize: 12,
    color: '#8CA0B3',
    marginTop: 2,
  },

  inviteBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  inviteTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#2C3A47',
  },
  inviteSub: {
    fontSize: 12,
    color: '#1CB0F6',
    fontWeight: 'bold',
    marginTop: 2,
  },
  inviteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#1CB0F6',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  inviteBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: 'bold',
  },

  studentsListCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  studentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    gap: 12,
  },
  studentAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#E0F2FE',
    justifyContent: 'center',
    alignItems: 'center',
  },
  studentAvatarText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0284C7',
  },
  studentName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#2C3A47',
  },
  studentSub: {
    fontSize: 11,
    color: '#8CA0B3',
    marginTop: 2,
  },
  studentXp: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#F1C40F',
  },

  bottomActionsCol: {
    gap: 10,
    marginTop: 24,
  },
  leaveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 12,
    borderRadius: 14,
  },
  leaveButtonText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#8CA0B3',
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FFF5F5',
    borderWidth: 1,
    borderColor: '#FFE4E6',
    paddingVertical: 14,
    borderRadius: 14,
  },
  deleteButtonText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FF4B4B',
  },

  addLessonTeacherBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    padding: 14,
    borderRadius: 14,
    marginBottom: 4,
  },
  addLessonIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#16A34A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addLessonTeacherTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#166534',
  },
  addLessonTeacherSub: {
    fontSize: 11,
    color: '#15803D',
    marginTop: 2,
  },
  emptyLessonsCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 32,
    alignItems: 'center',
  },
  emptyLessonsTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#475569',
    textAlign: 'center',
  },
  emptyLessonsSub: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
  lessonVideoCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  lessonCardHeader: {
    padding: 16,
    gap: 6,
  },
  lessonBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  lessonSubjectBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  lessonSubjectBadgeText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#475569',
  },
  youtubeLiveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  youtubeLiveBadgeText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#DC2626',
  },
  lessonCardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1E293B',
  },
  lessonDateText: {
    fontSize: 11,
    color: '#94A3B8',
  },
  playerContainerWrapper: {
    width: '100%',
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  noVideoPlaceholder: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 16,
    backgroundColor: '#F8FAFC',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
  },
  noVideoPlaceholderText: {
    fontSize: 12,
    color: '#64748B',
  },
  lessonDescBox: {
    padding: 16,
    gap: 4,
    borderTopWidth: 1,
    borderColor: '#F1F5F9',
  },
  lessonDescTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  lessonDescText: {
    fontSize: 13,
    color: '#334155',
    lineHeight: 20,
  },

  // CARD DE MACETE RÁPIDO
  tipClassroomBox: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 12,
    padding: 12,
    margin: 14,
    gap: 6,
  },
  tipClassroomHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tipClassroomTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#B45309',
  },
  tipClassroomText: {
    fontSize: 13,
    color: '#92400E',
    lineHeight: 18,
  },
  openTipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    backgroundColor: '#D97706',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginTop: 4,
  },
  openTipBtnText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#FFF',
  },

  // CARD DE ARTIGO
  articleCardActionBox: {
    padding: 14,
    gap: 10,
    borderTopWidth: 1,
    borderColor: '#F1F5F9',
  },
  articleCardSummary: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 18,
  },
  openArticleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    backgroundColor: '#2563EB',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  openArticleBtnText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FFF',
  },

  // CARD DE PDF
  pdfCardActionBox: {
    padding: 14,
    gap: 10,
    borderTopWidth: 1,
    borderColor: '#F1F5F9',
  },
  pdfCardSummary: {
    fontSize: 13,
    color: '#475569',
    lineHeight: 18,
  },
  openPdfBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    backgroundColor: '#059669',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  openPdfBtnText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FFF',
  },

  // MODAL LEITOR FORMATADO
  readerModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 12,
  },
  readerCard: {
    width: '100%',
    maxWidth: 680,
    height: '92%',
    backgroundColor: '#FFF',
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 12,
  },
  readerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  readerBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  readerTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  readerTypeBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  readerSubjectText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  readerTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#0F172A',
    lineHeight: 22,
  },
  readerAuthorSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 4,
  },
  readerCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 12,
  },
  readerScroll: {
    flex: 1,
  },
  readerScrollContent: {
    padding: 24,
    paddingBottom: 40,
  },
  readerPlainBody: {
    fontSize: 15,
    color: '#334155',
    lineHeight: 24,
  },
  readerFooterActionBox: {
    marginTop: 30,
    paddingTop: 20,
    borderTopWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
  },
  practiceQuizBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#16A34A',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  practiceQuizBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: 'bold',
  },

  /* Exercícios da Turma styles */
  exercisesHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  exercisesSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1E293B',
  },
  exercisesSectionSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  createTaskShortcutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1CB0F6',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  createTaskShortcutText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
  filterChipsRow: {
    flexDirection: 'row',
    gap: 8,
    marginVertical: 6,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterChipActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#3B82F6',
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  filterChipTextActive: {
    color: '#2563EB',
    fontWeight: '700',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  loadingBox: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 13,
    color: '#64748B',
  },
  emptyTasksCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyTasksIconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  emptyTasksTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 4,
  },
  emptyTasksSub: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 300,
  },
  emptyCreateTaskBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1CB0F6',
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginTop: 14,
  },
  emptyCreateTaskBtnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
  },
  tasksListContainer: {
    gap: 12,
  },
  taskItemCard: {
    backgroundColor: '#FFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  taskItemCardPending: {
    borderLeftWidth: 4,
    borderLeftColor: '#F59E0B',
  },
  taskItemCardCompleted: {
    borderLeftWidth: 4,
    borderLeftColor: '#10B981',
  },
  taskCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  taskSubjectBadge: {
    backgroundColor: '#F1F5F9',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  taskSubjectBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  statusBadgePending: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 999,
  },
  statusBadgePendingText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#D97706',
  },
  statusBadgeCompleted: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 999,
  },
  statusBadgeCompletedText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#16A34A',
  },
  taskItemTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 2,
  },
  taskItemTopic: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 6,
  },
  taskInstructionsBox: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    padding: 8,
    borderRadius: 8,
    marginVertical: 6,
  },
  taskInstructionsText: {
    fontSize: 12,
    color: '#64748B',
    flex: 1,
    fontStyle: 'italic',
  },
  taskMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 8,
    marginBottom: 12,
  },
  taskMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  taskMetaText: {
    fontSize: 12,
    color: '#64748B',
  },
  taskCardFooter: {
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 12,
  },
  solveExerciseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1CB0F6',
    paddingVertical: 10,
    borderRadius: 10,
    gap: 8,
  },
  solveExerciseBtnText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '700',
  },
  completedFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  scorePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
    gap: 4,
  },
  scorePillLabel: {
    fontSize: 12,
    color: '#15803D',
  },
  scorePillValue: {
    fontSize: 13,
    fontWeight: '800',
    color: '#15803D',
  },
  reviewErrorsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
    gap: 5,
  },
  reviewErrorsBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2563EB',
  },
});

const markdownStyles = {
  body: {
    color: '#334155',
    fontSize: 15,
    lineHeight: 24,
  },
  heading1: {
    color: '#0F172A',
    fontSize: 22,
    fontWeight: 'bold',
    marginTop: 18,
    marginBottom: 8,
  },
  heading2: {
    color: '#1E293B',
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 14,
    marginBottom: 6,
  },
  heading3: {
    color: '#334155',
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 10,
    marginBottom: 4,
  },
  paragraph: {
    marginBottom: 12,
  },
  bullet_list: {
    marginBottom: 12,
  },
  list_item: {
    marginBottom: 6,
  },
  blockquote: {
    backgroundColor: '#F8FAFC',
    borderLeftColor: '#3B82F6',
    borderLeftWidth: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginVertical: 10,
    borderRadius: 4,
  },
  code_inline: {
    backgroundColor: '#F1F5F9',
    color: '#EF4444',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontSize: 13,
  },
};

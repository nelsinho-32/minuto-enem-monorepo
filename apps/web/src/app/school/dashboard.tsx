import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import { RoleGuard } from '@/components/RoleGuard';
import { KpiCard } from '@/components/b2b/KpiCard';
import { Badge } from '@/components/b2b/Badge';
import { SkeletonLoader } from '@/components/b2b/SkeletonLoader';
import { CreateTeacherModal } from '@/components/b2b/CreateTeacherModal';
import { CreateClassroomModal, TeacherOption } from '@/components/b2b/CreateClassroomModal';
import { SchoolAnnouncementItem } from '@/components/SchoolMuralCard';

interface SchoolOverviewResponse {
  school: {
    id: string;
    name: string;
    code: string;
    slug: string;
    cnpj?: string | null;
    isActive: boolean;
  };
  metrics: {
    totalClassrooms: number;
    totalStudents: number;
    activeStudentsWeekly: number;
    weeklyEngagementRate: number;
    generalAccuracyByArea: Record<
      string,
      {
        totalAttempts: number;
        correctCount: number;
        accuracyPercent: number;
      }
    >;
  };
  classroomComparisons: Array<{
    id: string;
    name: string;
    code: string;
    teacherId: string;
    teacherName: string;
    studentsCount: number;
    tasksCount: number;
    materialsCount: number;
    totalSubmissions: number;
    averageAccuracy: number;
    averageScore: number;
    taskCompletionRate: number;
  }>;
}

interface TeacherItem {
  id: string;
  name: string;
  email: string;
  classroomsCount: number;
  createdAt: string;
}

type TabType = 'OVERVIEW' | 'CLASSROOMS' | 'TEACHERS' | 'ANNOUNCEMENTS';

export default function SchoolDashboardScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<TabType>('OVERVIEW');
  const [teacherModalVisible, setTeacherModalVisible] = useState(false);
  const [classroomModalVisible, setClassroomModalVisible] = useState(false);

  // 1. Visão consolidada da Escola
  const {
    data: overview,
    isLoading: loadingOverview,
    isError: errorOverview,
    refetch: refetchOverview,
  } = useQuery<SchoolOverviewResponse>({
    queryKey: ['school-overview'],
    queryFn: () => api.get<SchoolOverviewResponse>('/schools/me/overview'),
  });

  // 2. Professores da Escola (para gestão e vínculo de turmas)
  const { data: teachers = [], refetch: refetchTeachers } = useQuery<TeacherItem[]>({
    queryKey: ['school-teachers'],
    queryFn: () => api.get<TeacherItem[]>('/schools/me/teachers'),
  });

  // 3. Comunicados da Escola (Mural Institucional)
  const {
    data: announcements = [],
    isLoading: loadingAnnouncements,
    refetch: refetchAnnouncements,
  } = useQuery<SchoolAnnouncementItem[]>({
    queryKey: ['school-announcements'],
    queryFn: async () => {
      try {
        const res = await api.get<SchoolAnnouncementItem[]>('/schools/me/announcements');
        return Array.isArray(res) ? res : [];
      } catch {
        return [];
      }
    },
  });

  // Estado do formulário de criação de comunicado
  const [announcementTitle, setAnnouncementTitle] = useState('');
  const [announcementContent, setAnnouncementContent] = useState('');
  const [announcementAudience, setAnnouncementAudience] = useState<'ALL' | 'TEACHERS_ONLY'>('ALL');
  const [isSubmittingAnnouncement, setIsSubmittingAnnouncement] = useState(false);
  const [announcementFormError, setAnnouncementFormError] = useState<string | null>(null);
  const [announcementSuccessMsg, setAnnouncementSuccessMsg] = useState<string | null>(null);

  const handleCreateAnnouncement = async () => {
    if (!announcementTitle.trim()) {
      setAnnouncementFormError('O título do comunicado é obrigatório.');
      return;
    }
    if (!announcementContent.trim()) {
      setAnnouncementFormError('A mensagem do comunicado é obrigatória.');
      return;
    }

    try {
      setIsSubmittingAnnouncement(true);
      setAnnouncementFormError(null);
      setAnnouncementSuccessMsg(null);

      await api.post('/schools/me/announcements', {
        title: announcementTitle.trim(),
        content: announcementContent.trim(),
        targetAudience: announcementAudience,
      });

      setAnnouncementTitle('');
      setAnnouncementContent('');
      setAnnouncementAudience('ALL');
      setAnnouncementSuccessMsg('Comunicado publicado com sucesso no Mural da Escola!');
      await queryClient.invalidateQueries({ queryKey: ['school-announcements'] });
      await queryClient.invalidateQueries({ queryKey: ['institutional-announcements'] });
      refetchAnnouncements();
    } catch (err: any) {
      setAnnouncementFormError(err?.message || 'Erro ao publicar comunicado.');
    } finally {
      setIsSubmittingAnnouncement(false);
    }
  };

  const handleDeleteAnnouncement = (id: string) => {
    const doDelete = async () => {
      try {
        await api.delete(`/schools/me/announcements/${id}`);
        await queryClient.invalidateQueries({ queryKey: ['school-announcements'] });
        await queryClient.invalidateQueries({ queryKey: ['institutional-announcements'] });
        refetchAnnouncements();
      } catch (err: any) {
        if (Platform.OS === 'web') {
          window.alert(err?.message || 'Erro ao remover comunicado.');
        } else {
          Alert.alert('Erro', err?.message || 'Erro ao remover comunicado.');
        }
      }
    };

    if (Platform.OS === 'web') {
      if (
        window.confirm(
          'Tem certeza que deseja remover este comunicado? Ele deixará de aparecer para alunos e professores.'
        )
      ) {
        doDelete();
      }
    } else {
      Alert.alert(
        'Remover Comunicado',
        'Tem certeza que deseja remover este comunicado? Ele deixará de aparecer para alunos e professores.',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Remover', style: 'destructive', onPress: doDelete },
        ]
      );
    }
  };

  const teacherOptions: TeacherOption[] = teachers.map((t) => ({
    id: t.id,
    name: t.name,
    email: t.email,
  }));

  const metrics = overview?.metrics;
  const school = overview?.school;
  const classrooms = overview?.classroomComparisons || [];

  // Mapeamento de acurácia global
  const areas = Object.entries(metrics?.generalAccuracyByArea || {});

  // Média Geral de Acertos consolidada
  const overallAccuracy =
    areas.length > 0
      ? Math.round(
          areas.reduce((acc, [, val]) => acc + val.accuracyPercent, 0) / areas.length
        )
      : 0;

  // Total de questões respondidas na semana
  const totalQuestionsResolved = areas.reduce(
    (acc, [, val]) => acc + val.totalAttempts,
    0
  );

  return (
    <RoleGuard allowedRoles={['SCHOOL', 'ADMIN']}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        {/* Top Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => router.back()}
              activeOpacity={0.7}
            >
              <FontAwesome5 name="arrow-left" size={15} color="#4B5563" />
            </TouchableOpacity>
            <View>
              <View style={styles.schoolBadgeRow}>
                <View style={styles.schoolRoleBadge}>
                  <FontAwesome5 name="school" size={11} color="#0284C7" style={{ marginRight: 5 }} />
                  <Text style={styles.schoolRoleBadgeText}>Gestão Escolar B2B</Text>
                </View>
                {school?.code ? (
                  <Text style={styles.headerCodeText}>Código: {school.code}</Text>
                ) : null}
              </View>
              <Text style={styles.headerTitle}>
                {school?.name || 'Dashboard da Escola'}
              </Text>
            </View>
          </View>

          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.actionBtnOutline}
              onPress={() => setActiveTab('ANNOUNCEMENTS')}
              activeOpacity={0.8}
            >
              <FontAwesome5
                name="bullhorn"
                size={12}
                color="#2563EB"
                style={{ marginRight: 6 }}
              />
              <Text style={[styles.actionBtnOutlineText, { color: '#2563EB' }]}>+ Comunicado</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionBtnOutline}
              onPress={() => setTeacherModalVisible(true)}
              activeOpacity={0.8}
            >
              <FontAwesome5
                name="chalkboard-teacher"
                size={13}
                color="#4B5563"
                style={{ marginRight: 6 }}
              />
              <Text style={styles.actionBtnOutlineText}>+ Professor</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionBtnPrimary}
              onPress={() => setClassroomModalVisible(true)}
              activeOpacity={0.8}
            >
              <FontAwesome5 name="plus" size={13} color="#FFFFFF" style={{ marginRight: 6 }} />
              <Text style={styles.actionBtnPrimaryText}>Nova Turma</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Tab Switcher */}
        <View style={styles.tabsContainer}>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'OVERVIEW' && styles.tabButtonActive]}
            onPress={() => setActiveTab('OVERVIEW')}
          >
            <FontAwesome5
              name="chart-pie"
              size={13}
              color={activeTab === 'OVERVIEW' ? '#1CB0F6' : '#6B7280'}
              style={{ marginRight: 6 }}
            />
            <Text
              style={[
                styles.tabButtonText,
                activeTab === 'OVERVIEW' && styles.tabButtonTextActive,
              ]}
            >
              Visão Geral Pedagógica
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'CLASSROOMS' && styles.tabButtonActive]}
            onPress={() => setActiveTab('CLASSROOMS')}
          >
            <FontAwesome5
              name="users"
              size={13}
              color={activeTab === 'CLASSROOMS' ? '#1CB0F6' : '#6B7280'}
              style={{ marginRight: 6 }}
            />
            <Text
              style={[
                styles.tabButtonText,
                activeTab === 'CLASSROOMS' && styles.tabButtonTextActive,
              ]}
            >
              Turmas ({classrooms.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'TEACHERS' && styles.tabButtonActive]}
            onPress={() => setActiveTab('TEACHERS')}
          >
            <FontAwesome5
              name="chalkboard-teacher"
              size={13}
              color={activeTab === 'TEACHERS' ? '#1CB0F6' : '#6B7280'}
              style={{ marginRight: 6 }}
            />
            <Text
              style={[
                styles.tabButtonText,
                activeTab === 'TEACHERS' && styles.tabButtonTextActive,
              ]}
            >
              Professores ({teachers.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'ANNOUNCEMENTS' && styles.tabButtonActive]}
            onPress={() => setActiveTab('ANNOUNCEMENTS')}
          >
            <FontAwesome5
              name="bullhorn"
              size={13}
              color={activeTab === 'ANNOUNCEMENTS' ? '#1CB0F6' : '#6B7280'}
              style={{ marginRight: 6 }}
            />
            <Text
              style={[
                styles.tabButtonText,
                activeTab === 'ANNOUNCEMENTS' && styles.tabButtonTextActive,
              ]}
            >
              Mural de Comunicados ({announcements.length})
            </Text>
          </TouchableOpacity>
        </View>

        {/* Main Content Area */}
        <ScrollView
          style={styles.contentScroll}
          contentContainerStyle={styles.contentInner}
          showsVerticalScrollIndicator={false}
        >
          {loadingOverview ? (
            <View style={styles.loadingContainer}>
              <View style={styles.kpiRow}>
                {[1, 2, 3, 4].map((i) => (
                  <KpiCard key={i} title="" value="" icon="circle" loading />
                ))}
              </View>
              <SkeletonLoader width="100%" height={260} borderRadius={16} style={{ marginTop: 20 }} />
            </View>
          ) : errorOverview ? (
            <View style={styles.errorBox}>
              <FontAwesome5 name="exclamation-triangle" size={32} color="#EF4444" />
              <Text style={styles.errorTitle}>Erro ao carregar dados da escola</Text>
              <Text style={styles.errorDesc}>
                Não conseguimos obter o relatório consolidado da sua instituição.
              </Text>
              <TouchableOpacity
                style={styles.retryBtn}
                onPress={() => {
                  refetchOverview();
                  refetchTeachers();
                }}
              >
                <FontAwesome5 name="sync-alt" size={13} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.retryBtnText}>Recarregar</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {/* TAB 1: VISÃO GERAL */}
              {activeTab === 'OVERVIEW' && (
                <View style={styles.tabContent}>
                  {/* Top KPI Cards */}
                  <View style={styles.kpiRow}>
                    <KpiCard
                      title="Alunos Ativos"
                      value={metrics?.totalStudents || 0}
                      subtitle={`${metrics?.activeStudentsWeekly || 0} ativos esta semana`}
                      icon="user-graduate"
                      color="#1CB0F6"
                    />
                    <KpiCard
                      title="Engajamento Diário"
                      value={`${metrics?.weeklyEngagementRate || 0}%`}
                      subtitle="Streak ativo na semana"
                      icon="fire"
                      color="#FF9600"
                    />
                    <KpiCard
                      title="Questões Resolvidas"
                      value={totalQuestionsResolved}
                      subtitle="Volume semanal consolidado"
                      icon="check-circle"
                      color="#58CC02"
                    />
                    <KpiCard
                      title="Média de Acertos"
                      value={`${overallAccuracy}%`}
                      subtitle="Desempenho geral ENEM"
                      icon="award"
                      color="#9333EA"
                    />
                  </View>

                  {/* Desempenho por Área do Conhecimento */}
                  <View style={styles.sectionCard}>
                    <View style={styles.sectionHeader}>
                      <View style={styles.sectionTitleRow}>
                        <View style={[styles.sectionIconCircle, { backgroundColor: '#F3E8FF' }]}>
                          <FontAwesome5 name="chart-bar" size={15} color="#9333EA" />
                        </View>
                        <View>
                          <Text style={styles.sectionTitle}>
                            Desempenho por Área do Conhecimento
                          </Text>
                          <Text style={styles.sectionSubtitle}>
                            Média de acertos da escola por disciplina para guiar intervenções
                          </Text>
                        </View>
                      </View>
                    </View>

                    {areas.length === 0 ? (
                      <Text style={styles.emptyInlineText}>
                        Ainda não há dados suficientes de questões resolvidas pelos alunos.
                      </Text>
                    ) : (
                      <View style={styles.areasGrid}>
                        {areas.map(([areaName, stat]) => {
                          const isCritical = stat.accuracyPercent < 50;
                          return (
                            <View key={areaName} style={styles.areaItem}>
                              <View style={styles.areaItemTop}>
                                <Text style={styles.areaName}>{areaName}</Text>
                                <Text
                                  style={[
                                    styles.areaPercent,
                                    { color: isCritical ? '#EF4444' : '#10B981' },
                                  ]}
                                >
                                  {stat.accuracyPercent}%
                                </Text>
                              </View>
                              <View style={styles.areaProgressTrack}>
                                <View
                                  style={[
                                    styles.areaProgressFill,
                                    {
                                      width: `${Math.min(stat.accuracyPercent, 100)}%`,
                                      backgroundColor: isCritical ? '#EF4444' : '#10B981',
                                    },
                                  ]}
                                />
                              </View>
                              <Text style={styles.areaAttempts}>
                                {stat.correctCount} acertos de {stat.totalAttempts} tentativas
                              </Text>
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </View>

                  {/* Comparativo de Turmas */}
                  <View style={styles.sectionCard}>
                    <View style={styles.sectionHeader}>
                      <View style={styles.sectionTitleRow}>
                        <View style={[styles.sectionIconCircle, { backgroundColor: '#E0F2FE' }]}>
                          <FontAwesome5 name="users" size={15} color="#0284C7" />
                        </View>
                        <View>
                          <Text style={styles.sectionTitle}>Ranking & Comparativo de Turmas</Text>
                          <Text style={styles.sectionSubtitle}>
                            Acompanhe o engajamento e a taxa de conclusão entre as salas
                          </Text>
                        </View>
                      </View>
                    </View>

                    {classrooms.length === 0 ? (
                      <View style={styles.emptyClassroomsBox}>
                        <FontAwesome5 name="users" size={28} color="#9CA3AF" />
                        <Text style={styles.emptyTitle}>Nenhuma turma cadastrada</Text>
                        <Text style={styles.emptyDesc}>
                          Crie turmas para começar a analisar o desempenho dos alunos.
                        </Text>
                        <TouchableOpacity
                          style={styles.actionBtnPrimary}
                          onPress={() => setClassroomModalVisible(true)}
                        >
                          <Text style={styles.actionBtnPrimaryText}>+ Cadastrar Turma</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View style={styles.classroomsList}>
                        {classrooms.map((c, index) => (
                          <View key={c.id} style={styles.classroomItemCard}>
                            <View style={styles.classroomItemHeader}>
                              <View style={styles.rankBadge}>
                                <Text style={styles.rankBadgeText}>#{index + 1}</Text>
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={styles.classroomName}>{c.name}</Text>
                                <Text style={styles.classroomTeacher}>
                                  Prof. {c.teacherName} • Código: {c.code}
                                </Text>
                              </View>
                              <TouchableOpacity
                                style={styles.viewAnalyticsBtn}
                                onPress={() => router.push(`/teacher/classrooms/${c.id}` as any)}
                              >
                                <FontAwesome5
                                  name="chart-line"
                                  size={12}
                                  color="#1CB0F6"
                                  style={{ marginRight: 6 }}
                                />
                                <Text style={styles.viewAnalyticsBtnText}>Ver Turma</Text>
                              </TouchableOpacity>
                            </View>

                            <View style={styles.classroomMetricsRow}>
                              <View style={styles.classroomMetric}>
                                <Text style={styles.cMetricVal}>{c.studentsCount}</Text>
                                <Text style={styles.cMetricLabel}>Alunos</Text>
                              </View>
                              <View style={styles.classroomMetric}>
                                <Text style={styles.cMetricVal}>{c.tasksCount}</Text>
                                <Text style={styles.cMetricLabel}>Tarefas</Text>
                              </View>
                              <View style={styles.classroomMetric}>
                                <Text style={styles.cMetricVal}>{c.taskCompletionRate}%</Text>
                                <Text style={styles.cMetricLabel}>Conclusão</Text>
                              </View>
                              <View style={styles.classroomMetric}>
                                <Text
                                  style={[
                                    styles.cMetricVal,
                                    { color: c.averageAccuracy < 50 ? '#EF4444' : '#10B981' },
                                  ]}
                                >
                                  {c.averageAccuracy}%
                                </Text>
                                <Text style={styles.cMetricLabel}>Média Acertos</Text>
                              </View>
                            </View>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                </View>
              )}

              {/* TAB 2: GESTÃO DE TURMAS */}
              {activeTab === 'CLASSROOMS' && (
                <View style={styles.tabContent}>
                  <View style={styles.tabHeaderActionRow}>
                    <Text style={styles.tabHeadingText}>Turmas da Instituição</Text>
                    <TouchableOpacity
                      style={styles.actionBtnPrimary}
                      onPress={() => setClassroomModalVisible(true)}
                    >
                      <FontAwesome5
                        name="plus"
                        size={12}
                        color="#FFFFFF"
                        style={{ marginRight: 6 }}
                      />
                      <Text style={styles.actionBtnPrimaryText}>Nova Turma</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.classroomsList}>
                    {classrooms.map((c) => (
                      <View key={c.id} style={styles.classroomManageCard}>
                        <View style={styles.classroomItemHeader}>
                          <View style={styles.schoolIconSmall}>
                            <FontAwesome5 name="users" size={16} color="#1CB0F6" />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.classroomName}>{c.name}</Text>
                            <Text style={styles.classroomTeacher}>
                              Código de Acesso: <Text style={{ fontWeight: '700' }}>{c.code}</Text>
                            </Text>
                            <Text style={styles.classroomTeacher}>
                              Docente Responsável: Prof. {c.teacherName}
                            </Text>
                          </View>

                          <TouchableOpacity
                            style={styles.viewAnalyticsBtn}
                            onPress={() => router.push(`/teacher/classrooms/${c.id}` as any)}
                          >
                            <Text style={styles.viewAnalyticsBtnText}>Acessar Painel</Text>
                            <FontAwesome5
                              name="arrow-right"
                              size={11}
                              color="#1CB0F6"
                              style={{ marginLeft: 6 }}
                            />
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* TAB 3: PROFESSORES */}
              {activeTab === 'TEACHERS' && (
                <View style={styles.tabContent}>
                  <View style={styles.tabHeaderActionRow}>
                    <Text style={styles.tabHeadingText}>Corpo Docente Vinculado</Text>
                    <TouchableOpacity
                      style={styles.actionBtnPrimary}
                      onPress={() => setTeacherModalVisible(true)}
                    >
                      <FontAwesome5
                        name="user-plus"
                        size={12}
                        color="#FFFFFF"
                        style={{ marginRight: 6 }}
                      />
                      <Text style={styles.actionBtnPrimaryText}>Cadastrar Professor</Text>
                    </TouchableOpacity>
                  </View>

                  {teachers.length === 0 ? (
                    <View style={styles.emptyClassroomsBox}>
                      <FontAwesome5 name="chalkboard-teacher" size={32} color="#9CA3AF" />
                      <Text style={styles.emptyTitle}>Nenhum professor cadastrado</Text>
                      <Text style={styles.emptyDesc}>
                        Vincule os professores da escola para que eles possam assumir turmas.
                      </Text>
                      <TouchableOpacity
                        style={styles.actionBtnPrimary}
                        onPress={() => setTeacherModalVisible(true)}
                      >
                        <Text style={styles.actionBtnPrimaryText}>+ Cadastrar Primeiro Professor</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={styles.teachersGrid}>
                      {teachers.map((teacher) => (
                        <View key={teacher.id} style={styles.teacherCard}>
                          <View style={styles.teacherCardHeader}>
                            <View style={styles.teacherAvatarCircle}>
                              <FontAwesome5 name="user" size={16} color="#1CB0F6" />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.teacherCardName}>{teacher.name}</Text>
                              <Text style={styles.teacherCardEmail}>{teacher.email}</Text>
                            </View>
                            <Badge label="Professor" variant="info" dot={false} />
                          </View>
                          <View style={styles.teacherStats}>
                            <FontAwesome5
                              name="chalkboard"
                              size={12}
                              color="#6B7280"
                              style={{ marginRight: 6 }}
                            />
                            <Text style={styles.teacherStatsText}>
                              {teacher.classroomsCount} turma(s) sob gestão
                            </Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              )}

              {/* TAB 4: MURAL DE COMUNICADOS */}
              {activeTab === 'ANNOUNCEMENTS' && (
                <View style={styles.tabContent}>
                  {/* Cabeçalho da Seção */}
                  <View style={styles.tabHeaderActionRow}>
                    <View>
                      <Text style={styles.tabHeadingText}>Mural de Comunicados</Text>
                      <Text style={styles.tabHeadingSub}>
                        Envie comunicados e avisos oficiais para alunos e professores da sua escola
                      </Text>
                    </View>
                  </View>

                  {/* Formulário de Criação de Comunicado */}
                  <View style={styles.announcementFormCard}>
                    <View style={styles.announcementFormHeader}>
                      <View style={styles.megaphoneCircleSmall}>
                        <FontAwesome5 name="bullhorn" size={14} color="#2563EB" />
                      </View>
                      <Text style={styles.announcementFormTitle}>Publicar Novo Comunicado</Text>
                    </View>

                    {announcementSuccessMsg && (
                      <View style={styles.formSuccessBox}>
                        <FontAwesome5 name="check-circle" size={13} color="#16A34A" />
                        <Text style={styles.formSuccessText}>{announcementSuccessMsg}</Text>
                      </View>
                    )}

                    {announcementFormError && (
                      <View style={styles.formErrorBox}>
                        <FontAwesome5 name="exclamation-circle" size={13} color="#EF4444" />
                        <Text style={styles.formErrorText}>{announcementFormError}</Text>
                      </View>
                    )}

                    {/* Campo: Título */}
                    <View style={styles.formGroup}>
                      <Text style={styles.formLabel}>Título do Comunicado *</Text>
                      <TextInput
                        style={styles.formInput}
                        placeholder="Ex: Simulado Oficial ENEM - Orientações e Salas de Prova"
                        placeholderTextColor="#94A3B8"
                        value={announcementTitle}
                        onChangeText={(t) => {
                          setAnnouncementTitle(t);
                          if (announcementFormError) setAnnouncementFormError(null);
                        }}
                      />
                    </View>

                    {/* Campo: Mensagem */}
                    <View style={styles.formGroup}>
                      <Text style={styles.formLabel}>Mensagem / Conteúdo do Comunicado *</Text>
                      <TextInput
                        style={[styles.formInput, styles.formTextarea]}
                        placeholder="Escreva a mensagem completa do comunicado para a comunidade escolar..."
                        placeholderTextColor="#94A3B8"
                        multiline
                        numberOfLines={4}
                        value={announcementContent}
                        onChangeText={(t) => {
                          setAnnouncementContent(t);
                          if (announcementFormError) setAnnouncementFormError(null);
                        }}
                      />
                    </View>

                    {/* Campo: Público-Alvo (Select / Radio) */}
                    <View style={styles.formGroup}>
                      <Text style={styles.formLabel}>Público-Alvo do Comunicado</Text>
                      <View style={styles.audienceSelectorRow}>
                        <TouchableOpacity
                          style={[
                            styles.audienceOptionBtn,
                            announcementAudience === 'ALL' && styles.audienceOptionBtnActive,
                          ]}
                          onPress={() => setAnnouncementAudience('ALL')}
                          activeOpacity={0.8}
                        >
                          <FontAwesome5
                            name="users"
                            size={14}
                            color={announcementAudience === 'ALL' ? '#10B981' : '#64748B'}
                            style={{ marginRight: 8 }}
                          />
                          <View style={{ flex: 1 }}>
                            <Text
                              style={[
                                styles.audienceOptionTitle,
                                announcementAudience === 'ALL' && styles.audienceOptionTitleActive,
                              ]}
                            >
                              Geral (Todos)
                            </Text>
                            <Text style={styles.audienceOptionSub}>
                              Alunos e professores da escola
                            </Text>
                          </View>
                          {announcementAudience === 'ALL' && (
                            <FontAwesome5 name="check" size={12} color="#10B981" />
                          )}
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[
                            styles.audienceOptionBtn,
                            announcementAudience === 'TEACHERS_ONLY' &&
                              styles.audienceOptionBtnActiveBlue,
                          ]}
                          onPress={() => setAnnouncementAudience('TEACHERS_ONLY')}
                          activeOpacity={0.8}
                        >
                          <FontAwesome5
                            name="chalkboard-teacher"
                            size={14}
                            color={announcementAudience === 'TEACHERS_ONLY' ? '#2563EB' : '#64748B'}
                            style={{ marginRight: 8 }}
                          />
                          <View style={{ flex: 1 }}>
                            <Text
                              style={[
                                styles.audienceOptionTitle,
                                announcementAudience === 'TEACHERS_ONLY' &&
                                  styles.audienceOptionTitleActiveBlue,
                              ]}
                            >
                              Apenas Professores
                            </Text>
                            <Text style={styles.audienceOptionSub}>
                              Avisos pedagógicos internos
                            </Text>
                          </View>
                          {announcementAudience === 'TEACHERS_ONLY' && (
                            <FontAwesome5 name="check" size={12} color="#2563EB" />
                          )}
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* Botão de Envio */}
                    <TouchableOpacity
                      style={[
                        styles.publishAnnouncementBtn,
                        isSubmittingAnnouncement && { opacity: 0.7 },
                      ]}
                      onPress={handleCreateAnnouncement}
                      disabled={isSubmittingAnnouncement}
                      activeOpacity={0.85}
                    >
                      {isSubmittingAnnouncement ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <>
                          <FontAwesome5
                            name="paper-plane"
                            size={13}
                            color="#FFFFFF"
                            style={{ marginRight: 8 }}
                          />
                          <Text style={styles.publishAnnouncementBtnText}>
                            Publicar Comunicado no Mural
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>

                  {/* Listagem de Comunicados Publicados */}
                  <View style={styles.announcementsListSection}>
                    <Text style={styles.announcementsListTitle}>
                      Comunicados Emitidos ({announcements.length})
                    </Text>

                    {loadingAnnouncements ? (
                      <View style={styles.loadingBox}>
                        <ActivityIndicator size="small" color="#1CB0F6" />
                        <Text style={styles.loadingBoxText}>Carregando comunicados...</Text>
                      </View>
                    ) : announcements.length === 0 ? (
                      <View style={styles.emptyAnnouncementsCard}>
                        <FontAwesome5 name="bullhorn" size={32} color="#94A3B8" />
                        <Text style={styles.emptyAnnouncementsTitle}>
                          Nenhum comunicado publicado ainda
                        </Text>
                        <Text style={styles.emptyAnnouncementsSub}>
                          Preencha o formulário acima para publicar comunicados para seus alunos e professores.
                        </Text>
                      </View>
                    ) : (
                      <View style={styles.announcementsList}>
                        {announcements.map((item) => {
                          const isTeachers = item.targetAudience === 'TEACHERS_ONLY';
                          const formattedDate = new Date(item.createdAt).toLocaleDateString('pt-BR', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          });

                          return (
                            <View
                              key={item.id}
                              style={[
                                styles.publishedItemCard,
                                isTeachers ? styles.itemBorderBlue : styles.itemBorderGreen,
                              ]}
                            >
                              <View style={styles.publishedItemTop}>
                                <View
                                  style={[
                                    styles.audienceBadgeSmall,
                                    isTeachers ? styles.badgeBlue : styles.badgeGreen,
                                  ]}
                                >
                                  <FontAwesome5
                                    name={isTeachers ? 'chalkboard-teacher' : 'users'}
                                    size={10}
                                    color={isTeachers ? '#2563EB' : '#16A34A'}
                                    style={{ marginRight: 4 }}
                                  />
                                  <Text
                                    style={[
                                      styles.audienceBadgeSmallText,
                                      isTeachers ? styles.textBlue : styles.textGreen,
                                    ]}
                                  >
                                    {isTeachers ? 'Apenas Professores' : 'Geral (Todos)'}
                                  </Text>
                                </View>

                                <Text style={styles.publishedItemDate}>{formattedDate}</Text>
                              </View>

                              <Text style={styles.publishedItemTitle}>{item.title}</Text>
                              <Text style={styles.publishedItemContent}>{item.content}</Text>

                              <View style={styles.publishedItemFooter}>
                                <TouchableOpacity
                                  style={styles.deleteAnnouncementBtn}
                                  onPress={() => handleDeleteAnnouncement(item.id)}
                                  activeOpacity={0.7}
                                >
                                  <FontAwesome5
                                    name="trash-alt"
                                    size={11}
                                    color="#EF4444"
                                    style={{ marginRight: 6 }}
                                  />
                                  <Text style={styles.deleteAnnouncementBtnText}>
                                    Remover Comunicado
                                  </Text>
                                </TouchableOpacity>
                              </View>
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </View>
                </View>
              )}
            </>
          )}
        </ScrollView>

        {/* Modal: Vincular Novo Professor */}
        <CreateTeacherModal
          visible={teacherModalVisible}
          onClose={() => setTeacherModalVisible(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['school-teachers'] });
            setTeacherModalVisible(false);
          }}
        />

        {/* Modal: Criar Nova Turma */}
        <CreateClassroomModal
          visible={classroomModalVisible}
          teachers={teacherOptions}
          onClose={() => setClassroomModalVisible(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['school-overview'] });
            setClassroomModalVisible(false);
          }}
          onOpenCreateTeacher={() => setTeacherModalVisible(true)}
        />
      </SafeAreaView>
    </RoleGuard>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F7F9FC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    flexWrap: 'wrap',
    gap: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 260,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  schoolBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 8,
  },
  schoolRoleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  schoolRoleBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0284C7',
  },
  headerCodeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 10,
  },
  actionBtnOutline: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
  },
  actionBtnOutlineText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  actionBtnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1CB0F6',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  actionBtnPrimaryText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    gap: 16,
  },
  tabButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabButtonActive: {
    borderBottomColor: '#1CB0F6',
  },
  tabButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
  },
  tabButtonTextActive: {
    color: '#1CB0F6',
    fontWeight: '700',
  },
  contentScroll: {
    flex: 1,
  },
  contentInner: {
    padding: 24,
  },
  tabContent: {
    gap: 20,
  },
  loadingContainer: {
    gap: 20,
  },
  kpiRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 14,
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  sectionHeader: {
    marginBottom: 16,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  sectionSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  areasGrid: {
    gap: 12,
  },
  areaItem: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  areaItemTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  areaName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1F2937',
  },
  areaPercent: {
    fontSize: 14,
    fontWeight: '800',
  },
  areaProgressTrack: {
    height: 8,
    backgroundColor: '#E5E7EB',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 6,
  },
  areaProgressFill: {
    height: '100%',
    borderRadius: 4,
  },
  areaAttempts: {
    fontSize: 12,
    color: '#6B7280',
  },
  emptyInlineText: {
    fontSize: 13,
    color: '#6B7280',
    fontStyle: 'italic',
  },
  classroomsList: {
    gap: 12,
  },
  classroomItemCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  classroomItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  rankBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E0F2FE',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  rankBadgeText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0284C7',
  },
  classroomName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  classroomTeacher: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  viewAnalyticsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  viewAnalyticsBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1CB0F6',
  },
  classroomMetricsRow: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    justifyContent: 'space-around',
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  classroomMetric: {
    alignItems: 'center',
  },
  cMetricVal: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1F2937',
  },
  cMetricLabel: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
  },
  tabHeaderActionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tabHeadingText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  tabHeadingSub: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  classroomManageCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  schoolIconSmall: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E0F2FE',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  teachersGrid: {
    gap: 12,
  },
  teacherCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  teacherCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  teacherAvatarCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  teacherCardName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1F2937',
  },
  teacherCardEmail: {
    fontSize: 12,
    color: '#6B7280',
  },
  teacherStats: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  teacherStatsText: {
    fontSize: 12,
    color: '#6B7280',
  },
  emptyClassroomsBox: {
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginTop: 10,
  },
  emptyDesc: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 16,
    maxWidth: 320,
  },
  errorBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 36,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  errorTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#991B1B',
    marginTop: 12,
  },
  errorDesc: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 18,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EF4444',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
  },
  retryBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },

  /* Mural de Comunicados Styles */
  announcementFormCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
    marginBottom: 20,
  },
  announcementFormHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  megaphoneCircleSmall: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  announcementFormTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  formSuccessBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#DCFCE7',
    padding: 12,
    borderRadius: 10,
    marginBottom: 14,
  },
  formSuccessText: {
    fontSize: 13,
    color: '#15803D',
    fontWeight: '600',
    flex: 1,
  },
  formErrorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEE2E2',
    padding: 12,
    borderRadius: 10,
    marginBottom: 14,
  },
  formErrorText: {
    fontSize: 13,
    color: '#B91C1C',
    fontWeight: '600',
    flex: 1,
  },
  formGroup: {
    marginBottom: 14,
  },
  formLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 6,
  },
  formInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#0F172A',
  },
  formTextarea: {
    minHeight: 90,
    textAlignVertical: 'top',
  },
  audienceSelectorRow: {
    flexDirection: 'row',
    gap: 12,
  },
  audienceOptionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  audienceOptionBtnActive: {
    borderColor: '#10B981',
    backgroundColor: '#F0FDF4',
  },
  audienceOptionBtnActiveBlue: {
    borderColor: '#2563EB',
    backgroundColor: '#EFF6FF',
  },
  audienceOptionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  audienceOptionTitleActive: {
    color: '#15803D',
  },
  audienceOptionTitleActiveBlue: {
    color: '#1E40AF',
  },
  audienceOptionSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  publishAnnouncementBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563EB',
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 6,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  publishAnnouncementBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  announcementsListSection: {
    marginTop: 8,
  },
  announcementsListTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 12,
  },
  loadingBox: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  loadingBoxText: {
    fontSize: 13,
    color: '#64748B',
  },
  emptyAnnouncementsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 32,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyAnnouncementsTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1E293B',
    marginTop: 12,
    marginBottom: 4,
  },
  emptyAnnouncementsSub: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    maxWidth: 320,
    lineHeight: 18,
  },
  announcementsList: {
    gap: 12,
  },
  publishedItemCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  itemBorderGreen: {
    borderLeftColor: '#10B981',
  },
  itemBorderBlue: {
    borderLeftColor: '#2563EB',
  },
  publishedItemTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  audienceBadgeSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  badgeGreen: {
    backgroundColor: '#DCFCE7',
  },
  badgeBlue: {
    backgroundColor: '#DBEAFE',
  },
  audienceBadgeSmallText: {
    fontSize: 10,
    fontWeight: '700',
  },
  textGreen: {
    color: '#15803D',
  },
  textBlue: {
    color: '#1E40AF',
  },
  publishedItemDate: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '500',
  },
  publishedItemTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 4,
  },
  publishedItemContent: {
    fontSize: 13,
    color: '#334155',
    lineHeight: 20,
    marginBottom: 10,
  },
  publishedItemFooter: {
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 10,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  deleteAnnouncementBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: '#FEF2F2',
  },
  deleteAnnouncementBtnText: {
    fontSize: 11,
    color: '#EF4444',
    fontWeight: '600',
  },
});


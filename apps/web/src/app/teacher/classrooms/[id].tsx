import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import { RoleGuard } from '@/components/RoleGuard';
import { Badge, BadgeVariant } from '@/components/b2b/Badge';
import { KpiCard } from '@/components/b2b/KpiCard';
import { HeatmapCard, ErrorSubjectItem } from '@/components/b2b/HeatmapCard';
import { SkeletonLoader } from '@/components/b2b/SkeletonLoader';
import { AssignTaskModal } from '@/components/b2b/AssignTaskModal';
import { SchoolMuralCard } from '@/components/SchoolMuralCard';

interface StudentAnalysis {
  id: string;
  name: string;
  email: string;
  xp: number;
  currentStreak: number;
  longestStreak: number;
  lastStudyDate: string | null;
  taskCompletionRate: number;
  submittedTasksCount: number;
  totalClassroomTasks: number;
  averageAccuracy: number;
  averageTrailProgress: number;
  trailsCount: number;
  isAtRisk: boolean;
  riskFactors: string[];
  riskLevel: 'HIGH' | 'MEDIUM' | 'LOW';
}

interface ClassroomAnalyticsResponse {
  classroom: {
    id: string;
    name: string;
    code: string;
    teacher?: { id: string; name: string; email: string };
    studentsCount: number;
    tasksCount: number;
  };
  topErrorSubjects: ErrorSubjectItem[];
  students: StudentAnalysis[];
  atRiskStudents: StudentAnalysis[];
}

function getStudentStatus(student: StudentAnalysis): {
  label: string;
  variant: BadgeVariant;
} {
  if (student.isAtRisk || student.riskLevel === 'HIGH') {
    return { label: 'Inativo / Risco', variant: 'danger' };
  }
  if (student.riskLevel === 'MEDIUM' || student.currentStreak === 0) {
    return { label: 'Atenção', variant: 'warning' };
  }
  return { label: 'Engajado', variant: 'success' };
}

export default function TeacherClassroomAnalyticsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const classroomId = params.id as string;
  const queryClient = useQueryClient();

  const [studentSearch, setStudentSearch] = useState('');
  const [taskModalVisible, setTaskModalVisible] = useState(false);
  const [prefilledTopic, setPrefilledTopic] = useState<string | undefined>(undefined);

  const { data, isLoading, isError, refetch } = useQuery<ClassroomAnalyticsResponse>({
    queryKey: ['classroom-analytics', classroomId],
    queryFn: () => api.get<ClassroomAnalyticsResponse>(`/classrooms/${classroomId}/analytics`),
    enabled: Boolean(classroomId),
  });

  const classroom = data?.classroom;
  const topErrors = data?.topErrorSubjects || [];
  const students = data?.students || [];
  const atRiskStudents = data?.atRiskStudents || [];

  const filteredStudents = students.filter(
    (s) =>
      s.name.toLowerCase().includes(studentSearch.toLowerCase()) ||
      s.email.toLowerCase().includes(studentSearch.toLowerCase())
  );

  const handleOpenNewTask = (topic?: string) => {
    setPrefilledTopic(topic);
    setTaskModalVisible(true);
  };

  return (
    <RoleGuard allowedRoles={['TEACHER', 'SCHOOL', 'ADMIN']}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        {/* Header */}
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
              <View style={styles.classroomBadgeRow}>
                <View style={styles.teacherBadge}>
                  <FontAwesome5
                    name="chalkboard-teacher"
                    size={11}
                    color="#1CB0F6"
                    style={{ marginRight: 5 }}
                  />
                  <Text style={styles.teacherBadgeText}>Painel do Professor</Text>
                </View>
                {classroom?.code ? (
                  <Text style={styles.codeText}>Código: {classroom.code}</Text>
                ) : null}
              </View>
              <Text style={styles.headerTitle}>{classroom?.name || 'Carregando Turma...'}</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.newTaskButton}
            onPress={() => handleOpenNewTask()}
            activeOpacity={0.8}
          >
            <FontAwesome5 name="plus-circle" size={14} color="#FFFFFF" style={{ marginRight: 8 }} />
            <Text style={styles.newTaskButtonText}>Nova Tarefa para a Turma</Text>
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.contentScroll}
          contentContainerStyle={styles.contentInner}
          showsVerticalScrollIndicator={false}
        >
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <View style={styles.kpiRow}>
                <SkeletonLoader width={220} height={100} borderRadius={16} />
                <SkeletonLoader width={220} height={100} borderRadius={16} />
                <SkeletonLoader width={220} height={100} borderRadius={16} />
              </View>
              <SkeletonLoader width="100%" height={240} borderRadius={16} />
              <SkeletonLoader width="100%" height={320} borderRadius={16} />
            </View>
          ) : isError ? (
            <View style={styles.errorBox}>
              <FontAwesome5 name="exclamation-triangle" size={32} color="#EF4444" />
              <Text style={styles.errorTitle}>Erro ao carregar análise da turma</Text>
              <Text style={styles.errorDesc}>
                Não foi possível conectar aos relatórios analíticos desta turma.
              </Text>
              <TouchableOpacity style={styles.retryBtn} onPress={() => refetch()}>
                <FontAwesome5 name="sync-alt" size={13} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.retryBtnText}>Recarregar</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {/* Mural Institucional da Escola */}
              <SchoolMuralCard />

              {/* Alerta de Alunos em Risco */}
              {atRiskStudents.length > 0 ? (
                <View style={styles.riskAlertBox}>
                  <View style={styles.riskAlertIcon}>
                    <FontAwesome5 name="exclamation-triangle" size={18} color="#DC2626" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.riskAlertTitle}>
                      Atenção Pedagógica: {atRiskStudents.length} aluno(s) em risco detectado(s)
                    </Text>
                    <Text style={styles.riskAlertDesc}>
                      Estes estudantes apresentam inatividade recente ou taxa de conclusão de
                      tarefas inferior a 50%.
                    </Text>
                    <View style={styles.riskNamesRow}>
                      {atRiskStudents.slice(0, 4).map((s) => (
                        <View key={s.id} style={styles.riskNamePill}>
                          <Text style={styles.riskNamePillText}>{s.name}</Text>
                        </View>
                      ))}
                      {atRiskStudents.length > 4 ? (
                        <Text style={styles.riskMoreText}>
                          +{atRiskStudents.length - 4} outro(s)
                        </Text>
                      ) : null}
                    </View>
                  </View>
                </View>
              ) : null}

              {/* KPIs da Turma */}
              <View style={styles.kpiRow}>
                <KpiCard
                  title="Alunos Matriculados"
                  value={classroom?.studentsCount || students.length}
                  subtitle="Na turma ativa"
                  icon="users"
                  color="#1CB0F6"
                />
                <KpiCard
                  title="Tarefas Atribuídas"
                  value={classroom?.tasksCount || 0}
                  subtitle="Atividades pedagógicas"
                  icon="tasks"
                  color="#FF9600"
                />
                <KpiCard
                  title="Alunos em Risco"
                  value={atRiskStudents.length}
                  subtitle={atRiskStudents.length > 0 ? 'Exigem intervenção' : 'Nenhum em risco'}
                  icon="user-clock"
                  color={atRiskStudents.length > 0 ? '#EF4444' : '#10B981'}
                />
              </View>

              {/* Mapa de Calor de Dúvidas */}
              <HeatmapCard
                items={topErrors}
                onAssignReinforcement={(subject) => handleOpenNewTask(subject)}
              />

              {/* Tabela de Alunos da Turma */}
              <View style={styles.studentsSection}>
                <View style={styles.studentsHeader}>
                  <View>
                    <Text style={styles.studentsSectionTitle}>Alunos da Turma</Text>
                    <Text style={styles.studentsSectionSubtitle}>
                      {students.length} estudantes acompanhados
                    </Text>
                  </View>

                  <View style={styles.searchBox}>
                    <FontAwesome5
                      name="search"
                      size={12}
                      color="#9CA3AF"
                      style={{ marginRight: 8 }}
                    />
                    <TextInput
                      style={styles.searchInput}
                      placeholder="Filtrar por nome ou e-mail..."
                      placeholderTextColor="#9CA3AF"
                      value={studentSearch}
                      onChangeText={setStudentSearch}
                    />
                  </View>
                </View>

                {filteredStudents.length === 0 ? (
                  <View style={styles.emptyStudentsBox}>
                    <FontAwesome5 name="user-graduate" size={28} color="#9CA3AF" />
                    <Text style={styles.emptyStudentsTitle}>Nenhum aluno encontrado</Text>
                    <Text style={styles.emptyStudentsDesc}>
                      {studentSearch
                        ? 'Nenhum aluno corresponde à busca.'
                        : 'Convide seus alunos compartilhando o código de acesso da turma.'}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.studentsList}>
                    {filteredStudents.map((student) => {
                      const status = getStudentStatus(student);
                      return (
                        <View key={student.id} style={styles.studentCard}>
                          <View style={styles.studentCardLeft}>
                            <View style={styles.studentAvatar}>
                              <FontAwesome5 name="user-graduate" size={15} color="#1CB0F6" />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.studentName}>{student.name}</Text>
                              <Text style={styles.studentEmail}>{student.email}</Text>
                            </View>
                          </View>

                          {/* Métricas do Aluno */}
                          <View style={styles.studentMetricsRow}>
                            {/* Streak */}
                            <View style={styles.sMetric}>
                              <View style={styles.sMetricValueRow}>
                                <FontAwesome5
                                  name="fire"
                                  size={13}
                                  color="#FF9600"
                                  style={{ marginRight: 4 }}
                                />
                                <Text style={styles.sMetricVal}>{student.currentStreak}d</Text>
                              </View>
                              <Text style={styles.sMetricLabel}>Ofensiva</Text>
                            </View>

                            {/* Tarefas Concluídas */}
                            <View style={styles.sMetric}>
                              <Text style={styles.sMetricVal}>
                                {student.taskCompletionRate}%
                              </Text>
                              <Text style={styles.sMetricLabel}>
                                {student.submittedTasksCount}/{student.totalClassroomTasks} tarefas
                              </Text>
                            </View>

                            {/* Média de Acertos */}
                            <View style={styles.sMetric}>
                              <Text
                                style={[
                                  styles.sMetricVal,
                                  {
                                    color:
                                      student.averageAccuracy < 50
                                        ? '#EF4444'
                                        : student.averageAccuracy >= 70
                                        ? '#10B981'
                                        : '#374151',
                                  },
                                ]}
                              >
                                {student.averageAccuracy}%
                              </Text>
                              <Text style={styles.sMetricLabel}>Acertos</Text>
                            </View>

                            {/* Status */}
                            <View style={styles.sMetricStatus}>
                              <Badge label={status.label} variant={status.variant} />
                            </View>
                          </View>

                          {/* Fatores de Risco */}
                          {student.isAtRisk && student.riskFactors.length > 0 ? (
                            <View style={styles.studentRiskCallout}>
                              <FontAwesome5
                                name="exclamation-circle"
                                size={12}
                                color="#DC2626"
                                style={{ marginRight: 6, marginTop: 2 }}
                              />
                              <Text style={styles.studentRiskCalloutText}>
                                {student.riskFactors.join(' ')}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            </>
          )}
        </ScrollView>

        {/* Modal: Atribuir Nova Tarefa */}
        <AssignTaskModal
          visible={taskModalVisible}
          classroomId={classroomId}
          initialTopic={prefilledTopic}
          onClose={() => setTaskModalVisible(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['classroom-analytics', classroomId] });
            setTaskModalVisible(false);
          }}
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
  classroomBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    gap: 8,
  },
  teacherBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  teacherBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0284C7',
  },
  codeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
  },
  newTaskButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1CB0F6',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 12,
    shadowColor: '#1CB0F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  newTaskButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  contentScroll: {
    flex: 1,
  },
  contentInner: {
    padding: 24,
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
  riskAlertBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 14,
    padding: 16,
    gap: 12,
  },
  riskAlertIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  riskAlertTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#991B1B',
  },
  riskAlertDesc: {
    fontSize: 13,
    color: '#7F1D1D',
    marginTop: 2,
    lineHeight: 18,
  },
  riskNamesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 8,
    alignItems: 'center',
  },
  riskNamePill: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  riskNamePillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#B91C1C',
  },
  riskMoreText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#7F1D1D',
  },
  studentsSection: {
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
  studentsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    flexWrap: 'wrap',
    gap: 12,
  },
  studentsSectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
  },
  studentsSectionSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 8 : 4,
    minWidth: 220,
  },
  searchInput: {
    fontSize: 13,
    color: '#111827',
    flex: 1,
  },
  studentsList: {
    gap: 12,
  },
  studentCard: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  studentCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  studentAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E0F2FE',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  studentName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1F2937',
  },
  studentEmail: {
    fontSize: 12,
    color: '#6B7280',
  },
  studentMetricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    flexWrap: 'wrap',
    gap: 8,
  },
  sMetric: {
    alignItems: 'center',
  },
  sMetricValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sMetricVal: {
    fontSize: 14,
    fontWeight: '800',
    color: '#111827',
  },
  sMetricLabel: {
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 2,
  },
  sMetricStatus: {
    alignItems: 'flex-end',
  },
  studentRiskCallout: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FEF2F2',
    borderRadius: 8,
    padding: 8,
    marginTop: 8,
  },
  studentRiskCalloutText: {
    fontSize: 12,
    color: '#B91C1C',
    flex: 1,
  },
  emptyStudentsBox: {
    padding: 32,
    alignItems: 'center',
  },
  emptyStudentsTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111827',
    marginTop: 10,
  },
  emptyStudentsDesc: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 4,
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
});


import { useThemedStyles } from '@/hooks/use-theme';
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';
import { RoleGuard } from '@/components/RoleGuard';

interface EssayItem {
  id: string;
  taskId: string;
  studentId: string;
  imageUrl: string;
  status: 'PENDING' | 'CORRECTED';
  competency1?: number | null;
  competency2?: number | null;
  competency3?: number | null;
  competency4?: number | null;
  competency5?: number | null;
  finalScore?: number | null;
  generalFeedback?: string | null;
  submittedAt: string;
  student: {
    id: string;
    name: string;
    email: string;
  };
  task: {
    id: string;
    title: string;
    topic: string;
    description?: string | null;
    dueDate?: string | null;
    classroomId?: string | null;
    classroom?: {
      id: string;
      name: string;
      code: string;
    } | null;
  };
  correctedBy?: {
    id: string;
    name: string;
    email: string;
  } | null;
}

export default function TeacherEssaysDashboardScreen() {
  const styles = useThemedStyles(baseStyles);
  const router = useRouter();
  const { width } = useWindowDimensions();

  const [statusFilter, setStatusFilter] = useState<'PENDING' | 'CORRECTED' | 'ALL'>('PENDING');
  const [searchTerm, setSearchTerm] = useState('');

  // Busca lista de redações
  const {
    data: essays = [],
    isLoading,
    refetch,
    isRefetching,
  } = useQuery<EssayItem[]>({
    queryKey: ['teacher-essays', statusFilter],
    queryFn: async () => {
      const endpoint =
        statusFilter === 'PENDING'
          ? '/essays/pending'
          : statusFilter === 'CORRECTED'
          ? '/essays?status=CORRECTED'
          : '/essays';
      const res = await api.get<EssayItem[]>(endpoint);
      return Array.isArray(res) ? res : [];
    },
  });

  const pendingCount = essays.filter((e) => e.status === 'PENDING').length;

  const filteredEssays = essays.filter((essay) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    const studentName = essay.student?.name?.toLowerCase() || '';
    const taskTitle = essay.task?.title?.toLowerCase() || '';
    const taskTopic = essay.task?.topic?.toLowerCase() || '';
    const className = essay.task?.classroom?.name?.toLowerCase() || '';
    return (
      studentName.includes(term) ||
      taskTitle.includes(term) ||
      taskTopic.includes(term) ||
      className.includes(term)
    );
  });

  return (
    <RoleGuard allowedRoles={['TEACHER', 'SCHOOL']}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        {/* Header Superior */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => router.back()}
            activeOpacity={0.7}
          >
            <FontAwesome5 name="arrow-left" size={16} color="#1E293B" />
          </TouchableOpacity>

          <View style={{ flex: 1, marginLeft: 12 }}>
            <View style={styles.titleRow}>
              <View style={styles.badgePill}>
                <FontAwesome5 name="pen-fancy" size={11} color="#FFF" style={{ marginRight: 6 }} />
                <Text style={styles.badgePillText}>Oficina Nota 1000</Text>
              </View>
              {pendingCount > 0 && statusFilter === 'PENDING' && (
                <View style={styles.pendingBadge}>
                  <Text style={styles.pendingBadgeText}>{pendingCount} pendente(s)</Text>
                </View>
              )}
            </View>
            <Text style={styles.headerTitle}>Correções de Redação</Text>
            <Text style={styles.headerSubtitle}>
              Avalie as folhas de redação manuscritas dos alunos segundo as 5 competências do ENEM
            </Text>
          </View>

          <TouchableOpacity
            style={styles.refreshButton}
            onPress={() => refetch()}
            disabled={isRefetching}
            activeOpacity={0.7}
          >
            <FontAwesome5
              name="sync-alt"
              size={14}
              color={isRefetching ? '#94A3B8' : '#0284C7'}
            />
          </TouchableOpacity>
        </View>

        {/* Barra de Filtros e Busca */}
        <View style={styles.filterSection}>
          <View style={styles.tabBar}>
            <TouchableOpacity
              style={[styles.tabItem, statusFilter === 'PENDING' && styles.tabItemActive]}
              onPress={() => setStatusFilter('PENDING')}
            >
              <FontAwesome5
                name="hourglass-half"
                size={12}
                color={statusFilter === 'PENDING' ? '#D97706' : '#64748B'}
                style={{ marginRight: 6 }}
              />
              <Text
                style={[
                  styles.tabText,
                  statusFilter === 'PENDING' && styles.tabTextActive,
                ]}
              >
                Pendentes
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabItem, statusFilter === 'CORRECTED' && styles.tabItemActive]}
              onPress={() => setStatusFilter('CORRECTED')}
            >
              <FontAwesome5
                name="check-circle"
                size={12}
                color={statusFilter === 'CORRECTED' ? '#16A34A' : '#64748B'}
                style={{ marginRight: 6 }}
              />
              <Text
                style={[
                  styles.tabText,
                  statusFilter === 'CORRECTED' && styles.tabTextActive,
                ]}
              >
                Corrigidas
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.tabItem, statusFilter === 'ALL' && styles.tabItemActive]}
              onPress={() => setStatusFilter('ALL')}
            >
              <FontAwesome5
                name="list"
                size={12}
                color={statusFilter === 'ALL' ? '#0284C7' : '#64748B'}
                style={{ marginRight: 6 }}
              />
              <Text
                style={[styles.tabText, statusFilter === 'ALL' && styles.tabTextActive]}
              >
                Todas
              </Text>
            </TouchableOpacity>
          </View>

          {/* Campo de Busca por Aluno ou Tema */}
          <View style={styles.searchBox}>
            <FontAwesome5 name="search" size={13} color="#94A3B8" style={{ marginRight: 8 }} />
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar por aluno, tema ou turma..."
              placeholderTextColor="#94A3B8"
              value={searchTerm}
              onChangeText={setSearchTerm}
            />
            {searchTerm ? (
              <TouchableOpacity onPress={() => setSearchTerm('')}>
                <FontAwesome5 name="times-circle" size={14} color="#94A3B8" />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {/* Lista de Redações */}
        <ScrollView
          style={styles.content}
          contentContainerStyle={[
            styles.contentContainer,
            { maxWidth: Math.min(width, 1024), alignSelf: 'center', width: '100%' },
          ]}
        >
          {isLoading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color="#0284C7" />
              <Text style={styles.loadingText}>Carregando redações...</Text>
            </View>
          ) : filteredEssays.length === 0 ? (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIconCircle}>
                <FontAwesome5
                  name={statusFilter === 'PENDING' ? 'check-double' : 'inbox'}
                  size={32}
                  color={statusFilter === 'PENDING' ? '#16A34A' : '#94A3B8'}
                />
              </View>
              <Text style={styles.emptyTitle}>
                {statusFilter === 'PENDING'
                  ? 'Nenhuma redação pendente!'
                  : 'Nenhuma redação encontrada'}
              </Text>
              <Text style={styles.emptySubtitle}>
                {statusFilter === 'PENDING'
                  ? 'Todas as folhas de redação entregues pelos seus alunos foram avaliadas com sucesso.'
                  : 'Não há registros com os filtros selecionados no momento.'}
              </Text>
            </View>
          ) : (
            <View style={styles.grid}>
              {filteredEssays.map((essay) => {
                const isCorrected = essay.status === 'CORRECTED';
                const submissionDate = essay.submittedAt
                  ? new Date(essay.submittedAt).toLocaleDateString('pt-BR', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : '';

                return (
                  <TouchableOpacity
                    key={essay.id}
                    style={styles.card}
                    activeOpacity={0.85}
                    onPress={() => router.push(`/teacher/essays/${essay.id}` as any)}
                  >
                    <View style={styles.cardHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.studentName} numberOfLines={1}>
                          {essay.student?.name || 'Aluno'}
                        </Text>
                        <Text style={styles.studentEmail} numberOfLines={1}>
                          {essay.student?.email}
                        </Text>
                      </View>

                      {isCorrected ? (
                        <View style={styles.scoreBadge}>
                          <FontAwesome5 name="trophy" size={11} color="#16A34A" style={{ marginRight: 4 }} />
                          <Text style={styles.scoreBadgeText}>
                            {essay.finalScore ?? 0} / 1000
                          </Text>
                        </View>
                      ) : (
                        <View style={styles.pendingBadgeSmall}>
                          <FontAwesome5 name="clock" size={10} color="#D97706" style={{ marginRight: 4 }} />
                          <Text style={styles.pendingBadgeSmallText}>Pendente</Text>
                        </View>
                      )}
                    </View>

                    {/* Detalhes do Tema e Turma */}
                    <View style={styles.cardBody}>
                      <View style={styles.infoRow}>
                        <FontAwesome5 name="newspaper" size={12} color="#0284C7" style={{ marginRight: 8, marginTop: 2 }} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.taskTitle} numberOfLines={2}>
                            {essay.task?.title || essay.task?.topic || 'Tema de Redação'}
                          </Text>
                          {essay.task?.topic && essay.task.topic !== essay.task.title && (
                            <Text style={styles.taskTopic} numberOfLines={1}>
                              {essay.task.topic}
                            </Text>
                          )}
                        </View>
                      </View>

                      {essay.task?.classroom && (
                        <View style={styles.infoRow}>
                          <FontAwesome5 name="users" size={11} color="#64748B" style={{ marginRight: 8 }} />
                          <Text style={styles.classroomText}>
                            Turma: {essay.task.classroom.name} ({essay.task.classroom.code})
                          </Text>
                        </View>
                      )}

                      <View style={styles.infoRow}>
                        <FontAwesome5 name="calendar-alt" size={11} color="#64748B" style={{ marginRight: 8 }} />
                        <Text style={styles.dateText}>Enviado em {submissionDate}</Text>
                      </View>
                    </View>

                    {/* Footer da Ação */}
                    <View style={styles.cardFooter}>
                      <Text style={styles.actionHint}>
                        {isCorrected ? 'Ver Detalhes da Avaliação' : 'Avaliar Redação Agora'}
                      </Text>
                      <View style={[styles.actionBtn, isCorrected ? styles.actionBtnReview : styles.actionBtnGrade]}>
                        <FontAwesome5
                          name={isCorrected ? 'eye' : 'pen'}
                          size={11}
                          color="#FFF"
                          style={{ marginRight: 6 }}
                        />
                        <Text style={styles.actionBtnText}>
                          {isCorrected ? 'Revisar' : 'Corrigir'}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </RoleGuard>
  );
}

const baseStyles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  badgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#8E44AD',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  badgePillText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  pendingBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  pendingBadgeText: {
    color: '#D97706',
    fontSize: 11,
    fontWeight: '700',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  refreshButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F0F9FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterSection: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    gap: 12,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    padding: 4,
  },
  tabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
  },
  tabItemActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  tabTextActive: {
    fontWeight: '800',
    color: '#0F172A',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 40,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#1E293B',
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
  },
  loadingBox: {
    paddingVertical: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#64748B',
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1E293B',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 360,
  },
  grid: {
    gap: 14,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 12,
    marginBottom: 12,
  },
  studentName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  studentEmail: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  scoreBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  scoreBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#16A34A',
  },
  pendingBadgeSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  pendingBadgeSmallText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#D97706',
  },
  cardBody: {
    gap: 8,
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  taskTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  taskTopic: {
    fontSize: 12,
    color: '#64748B',
  },
  classroomText: {
    fontSize: 12,
    color: '#475569',
  },
  dateText: {
    fontSize: 12,
    color: '#64748B',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 10,
  },
  actionHint: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '600',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  actionBtnGrade: {
    backgroundColor: '#0284C7',
  },
  actionBtnReview: {
    backgroundColor: '#64748B',
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});

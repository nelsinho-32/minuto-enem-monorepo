import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  RefreshControl,
  Alert,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { FontAwesome5 } from '@expo/vector-icons';
import { api } from '@/services/api';
import { useTheme } from '@/hooks/use-theme';
import { useUserStore } from '@/store/useUserStore';
import { CloneTaskModal } from '@/components/classroom/CloneTaskModal';

interface CalendarTaskItem {
  id: string;
  title: string;
  topic: string;
  description?: string | null;
  dueDate: string | null;
  status: string;
  creationMode: string;
  difficulty?: string | null;
  totalQuestions: number;
  classroom: {
    id: string;
    name: string;
    code: string;
    studentsCount: number;
  } | null;
  subject: {
    id: string;
    name: string;
    slug: string;
  } | null;
  scheduleState: 'COMPLETED' | 'OVERDUE' | 'TODAY' | 'UPCOMING' | 'NO_DATE';
  completedByStudent: boolean;
  submissionCount: number;
  totalStudents: number;
}

interface CalendarResponse {
  classrooms: Array<{
    id: string;
    name: string;
    code: string;
    studentsCount: number;
  }>;
  items: CalendarTaskItem[];
  summary: {
    total: number;
    overdue: number;
    today: number;
    upcoming: number;
  };
}

function formatShortDate(iso: string | null): string {
  if (!iso) return 'Sem prazo definido';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Data inválida';
  return d.toLocaleDateString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function UnifiedCalendarScreen() {
  const router = useRouter();
  const theme = useTheme();
  const user = useUserStore((s) => s.user);
  const role = user?.role || 'STUDENT';

  const [selectedClassroomId, setSelectedClassroomId] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'OVERDUE' | 'TODAY' | 'UPCOMING' | 'COMPLETED'>('ALL');
  const [remindingTaskId, setRemindingTaskId] = useState<string | null>(null);
  const [cloneTargetTask, setCloneTargetTask] = useState<{ id: string; title: string } | null>(null);

  const handleRemindPending = async (taskId: string) => {
    setRemindingTaskId(taskId);
    try {
      const res = await api.post<{ notifiedCount: number; message?: string }>(
        `/tasks/${taskId}/remind-pending`,
        {}
      );
      const msg =
        res.notifiedCount > 0
          ? `Lembrete enviado para ${res.notifiedCount} aluno(s) pendente(s)!`
          : res.message || 'Todos os alunos já entregaram esta atividade!';
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert(msg);
      } else {
        Alert.alert('Notificação enviada', msg);
      }
    } catch (err: any) {
      const msg = err?.message || 'Não foi possível enviar o lembrete agora.';
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert(msg);
      } else {
        Alert.alert('Erro', msg);
      }
    } finally {
      setRemindingTaskId(null);
    }
  };

  const { data, isLoading, isRefetching, refetch } = useQuery<CalendarResponse>({
    queryKey: ['tasks-calendar', selectedClassroomId],
    queryFn: () =>
      api.get<CalendarResponse>(
        selectedClassroomId
          ? `/tasks/calendar?classroomId=${encodeURIComponent(selectedClassroomId)}`
          : '/tasks/calendar'
      ),
  });

  const filteredItems = useMemo(() => {
    const items = data?.items || [];
    if (statusFilter === 'ALL') return items;
    if (statusFilter === 'UPCOMING') {
      return items.filter((i) => i.scheduleState === 'UPCOMING' || i.scheduleState === 'NO_DATE');
    }
    return items.filter((i) => i.scheduleState === statusFilter);
  }, [data?.items, statusFilter]);

  const badgeStyleForState = (state: CalendarTaskItem['scheduleState']) => {
    switch (state) {
      case 'OVERDUE':
        return { label: 'Atrasada', bg: '#FEE2E2', color: '#DC2626', icon: 'exclamation-circle' };
      case 'TODAY':
        return { label: 'Vence Hoje', bg: '#FEF3C7', color: '#D97706', icon: 'clock' };
      case 'COMPLETED':
        return { label: 'Entregue', bg: '#DCFCE7', color: '#15803D', icon: 'check-circle' };
      case 'UPCOMING':
        return { label: 'Programada', bg: '#DBEAFE', color: '#1D4ED8', icon: 'calendar-alt' };
      default:
        return { label: 'Sem prazo', bg: theme.surfaceMuted, color: theme.textMuted, icon: 'calendar' };
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View
        style={[
          styles.header,
          { backgroundColor: theme.surface, borderBottomColor: theme.border },
        ]}
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <FontAwesome5 name="arrow-left" size={16} color={theme.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>
            Agenda Unificada de Entregas
          </Text>
          <Text style={[styles.headerSub, { color: theme.textMuted }]}>
            {role === 'TEACHER' || role === 'SCHOOL'
              ? 'Prazos de todas as suas turmas em ordem cronológica'
              : 'Todas as suas atividades e prazos das turmas'}
          </Text>
        </View>
        <TouchableOpacity onPress={() => refetch()} style={styles.backBtn}>
          <FontAwesome5 name="sync-alt" size={14} color={theme.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => {
              refetch();
            }}
          />
        }
      >
        {/* Cards de Resumo */}
        <View style={styles.summaryRow}>
          <View style={[styles.summaryCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.summaryNum, { color: '#DC2626' }]}>
              {data?.summary?.overdue ?? 0}
            </Text>
            <Text style={[styles.summaryLabel, { color: theme.textMuted }]}>Atrasadas</Text>
          </View>
          <View style={[styles.summaryCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.summaryNum, { color: '#D97706' }]}>
              {data?.summary?.today ?? 0}
            </Text>
            <Text style={[styles.summaryLabel, { color: theme.textMuted }]}>Hoje</Text>
          </View>
          <View style={[styles.summaryCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.summaryNum, { color: '#0284C7' }]}>
              {data?.summary?.upcoming ?? 0}
            </Text>
            <Text style={[styles.summaryLabel, { color: theme.textMuted }]}>Próximas</Text>
          </View>
        </View>

        {/* Filtro por Turma */}
        {data?.classrooms && data.classrooms.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
            <TouchableOpacity
              onPress={() => setSelectedClassroomId('')}
              style={[
                styles.chip,
                {
                  backgroundColor: !selectedClassroomId ? theme.primary : theme.surface,
                  borderColor: !selectedClassroomId ? theme.primary : theme.border,
                },
              ]}
            >
              <Text style={[styles.chipText, { color: !selectedClassroomId ? '#FFF' : theme.text }]}>
                Todas as Turmas
              </Text>
            </TouchableOpacity>
            {data.classrooms.map((c) => {
              const active = selectedClassroomId === c.id;
              return (
                <TouchableOpacity
                  key={c.id}
                  onPress={() => setSelectedClassroomId(active ? '' : c.id)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: active ? theme.primary : theme.surface,
                      borderColor: active ? theme.primary : theme.border,
                    },
                  ]}
                >
                  <Text style={[styles.chipText, { color: active ? '#FFF' : theme.text }]}>
                    {c.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {/* Filtro por Estado */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
          {(
            [
              { key: 'ALL', label: 'Tudo' },
              { key: 'OVERDUE', label: 'Atrasadas' },
              { key: 'TODAY', label: 'Hoje' },
              { key: 'UPCOMING', label: 'Próximas' },
              ...(role === 'STUDENT' ? [{ key: 'COMPLETED', label: 'Entregues' }] : []),
            ] as Array<{ key: typeof statusFilter; label: string }>
          ).map((f) => {
            const active = statusFilter === f.key;
            return (
              <TouchableOpacity
                key={f.key}
                onPress={() => setStatusFilter(f.key)}
                style={[
                  styles.chip,
                  {
                    backgroundColor: active ? '#7C3AED' : theme.surface,
                    borderColor: active ? '#7C3AED' : theme.border,
                  },
                ]}
              >
                <Text style={[styles.chipText, { color: active ? '#FFF' : theme.textMuted }]}>
                  {f.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Lista Cronológica */}
        {isLoading ? (
          <ActivityIndicator size="large" color={theme.primary} style={{ marginTop: 32 }} />
        ) : filteredItems.length === 0 ? (
          <View style={[styles.emptyBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <FontAwesome5 name="calendar-check" size={28} color={theme.textMuted} />
            <Text style={[styles.emptyTitle, { color: theme.text }]}>
              Nenhuma atividade neste filtro
            </Text>
            <Text style={[styles.emptyDesc, { color: theme.textMuted }]}>
              Quando houver atividades com prazo nas suas turmas, elas aparecerão aqui em ordem cronológica.
            </Text>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {filteredItems.map((item) => {
              const badge = badgeStyleForState(item.scheduleState);
              return (
                <TouchableOpacity
                  key={item.id}
                  activeOpacity={0.85}
                  onPress={() => {
                    if (item.classroom?.id) {
                      router.push(`/classes/${item.classroom.id}` as any);
                    }
                  }}
                  style={[
                    styles.taskCard,
                    { backgroundColor: theme.surface, borderColor: theme.border },
                  ]}
                >
                  <View style={styles.taskTop}>
                    <View style={[styles.stateBadge, { backgroundColor: badge.bg }]}>
                      <FontAwesome5 name={badge.icon} size={10} color={badge.color} />
                      <Text style={[styles.stateBadgeText, { color: badge.color }]}>
                        {badge.label}
                      </Text>
                    </View>
                    <Text style={[styles.dateText, { color: theme.textMuted }]}>
                      {formatShortDate(item.dueDate)}
                    </Text>
                  </View>

                  <Text style={[styles.taskTitle, { color: theme.text }]}>{item.title}</Text>
                  <Text style={[styles.taskMeta, { color: theme.textMuted }]}>
                    {item.classroom?.name || 'Turma'} • {item.subject?.name || item.topic} •{' '}
                    {item.totalQuestions > 0 ? `${item.totalQuestions} questões` : 'Redação / Material'}
                  </Text>

                  <View style={[styles.taskFooter, { borderTopColor: theme.border }]}>
                    <Text style={[styles.footerMeta, { color: theme.primary }]}>
                      {role === 'TEACHER' || role === 'SCHOOL'
                        ? `${item.submissionCount}/${item.totalStudents} entregas registradas`
                        : item.completedByStudent
                          ? 'Atividade concluída'
                          : 'Toque para abrir na turma'}
                    </Text>

                    {(role === 'TEACHER' || role === 'SCHOOL' || role === 'ADMIN') ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <TouchableOpacity
                          onPress={(e) => {
                            e.stopPropagation?.();
                            setCloneTargetTask({ id: item.id, title: item.title });
                          }}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 4,
                            backgroundColor: '#EDE9FE',
                            paddingHorizontal: 9,
                            paddingVertical: 5,
                            borderRadius: 8,
                          }}
                        >
                          <FontAwesome5 name="copy" size={10} color="#6D28D9" />
                          <Text style={{ fontSize: 11, fontWeight: '800', color: '#6D28D9' }}>
                            Clonar
                          </Text>
                        </TouchableOpacity>

                        {item.submissionCount < item.totalStudents && (
                          <TouchableOpacity
                            disabled={remindingTaskId === item.id}
                            onPress={(e) => {
                              e.stopPropagation?.();
                              handleRemindPending(item.id);
                            }}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 5,
                              backgroundColor: '#FEF3C7',
                              paddingHorizontal: 10,
                              paddingVertical: 5,
                              borderRadius: 8,
                            }}
                          >
                            <FontAwesome5 name="bell" size={10} color="#B45309" />
                            <Text style={{ fontSize: 11, fontWeight: '800', color: '#B45309' }}>
                              {remindingTaskId === item.id ? 'Enviando...' : 'Notificar Pendentes'}
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    ) : (
                      <FontAwesome5 name="chevron-right" size={12} color={theme.textMuted} />
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>

      <CloneTaskModal
        visible={Boolean(cloneTargetTask)}
        task={cloneTargetTask}
        classrooms={data?.classrooms || []}
        onClose={() => setCloneTargetTask(null)}
        onCloned={() => {
          refetch();
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 16, fontWeight: '800' },
  headerSub: { fontSize: 11.5, marginTop: 1 },
  scrollContent: { padding: 16, gap: 14, paddingBottom: 32 },
  summaryRow: { flexDirection: 'row', gap: 10 },
  summaryCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
  },
  summaryNum: { fontSize: 22, fontWeight: '900' },
  summaryLabel: { fontSize: 11, fontWeight: '700', marginTop: 2 },
  chipsRow: { gap: 8, paddingVertical: 2 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipText: { fontSize: 12, fontWeight: '700' },
  taskCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 6,
  },
  taskTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  stateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  stateBadgeText: { fontSize: 11, fontWeight: '800' },
  dateText: { fontSize: 11.5, fontWeight: '700' },
  taskTitle: { fontSize: 15, fontWeight: '800', marginTop: 2 },
  taskMeta: { fontSize: 12, fontWeight: '600' },
  taskFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 8,
    marginTop: 4,
    borderTopWidth: 1,
  },
  footerMeta: { fontSize: 12, fontWeight: '700' },
  emptyBox: {
    alignItems: 'center',
    padding: 28,
    borderRadius: 16,
    borderWidth: 1,
    gap: 8,
  },
  emptyTitle: { fontSize: 15, fontWeight: '800' },
  emptyDesc: { fontSize: 12.5, textAlign: 'center' },
});

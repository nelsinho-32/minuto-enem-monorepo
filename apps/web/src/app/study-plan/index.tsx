import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import { api } from '@/services/api';
import { useTheme } from '@/hooks/use-theme';
import { useUserStore } from '@/store/useUserStore';
import { StudyTimeReportCard } from '@/components/study/StudyTimeReportCard';

interface StudyPlanItem {
  id: string;
  dayOfWeek: number;
  slotOrder: number;
  subject: string;
  area: string;
  topic: string;
  durationMinutes: number;
  activityType: string;
  completed: boolean;
}

interface StudyPlanResponse {
  weekStart: string;
  totalItems: number;
  completedCount: number;
  progressPercent: number;
  prioritizedSubjects?: string[];
  items: StudyPlanItem[];
}

const DAY_LABELS = [
  { num: 1, short: 'Seg', full: 'Segunda-feira' },
  { num: 2, short: 'Ter', full: 'Terça-feira' },
  { num: 3, short: 'Qua', full: 'Quarta-feira' },
  { num: 4, short: 'Qui', full: 'Quinta-feira' },
  { num: 5, short: 'Sex', full: 'Sexta-feira' },
  { num: 6, short: 'Sáb', full: 'Sábado' },
  { num: 7, short: 'Dom', full: 'Domingo' },
];

function getTodayDayNum(): number {
  const jsDay = new Date().getDay(); // 0=Dom..6=Sab
  return jsDay === 0 ? 7 : jsDay;
}

export default function StudyPlanScreen() {
  const router = useRouter();
  const theme = useTheme();
  const targetCourse = useUserStore((s) => s.targetCourse || 'ENEM');
  const addXp = useUserStore((s) => s.addXp);

  const [plan, setPlan] = useState<StudyPlanResponse | null>(null);
  const [selectedDay, setSelectedDay] = useState<number>(getTodayDayNum());
  const [dailyMinutes, setDailyMinutes] = useState<number>(60);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Modo Foco / Pomodoro integrado ao cronograma
  const [pomodoroMode, setPomodoroMode] = useState<'FOCUS_25' | 'FOCUS_15' | 'BREAK_5'>('FOCUS_25');
  const [pomodoroSeconds, setPomodoroSeconds] = useState<number>(25 * 60);
  const [pomodoroRunning, setPomodoroRunning] = useState<boolean>(false);
  const [completedCycles, setCompletedCycles] = useState<number>(0);

  useEffect(() => {
    if (!pomodoroRunning) return;
    const timer = setInterval(() => {
      setPomodoroSeconds((prev) => {
        if (prev <= 1) {
          setPomodoroRunning(false);
          if (pomodoroMode !== 'BREAK_5') {
            setCompletedCycles((c) => c + 1);
            const mins = pomodoroMode === 'FOCUS_25' ? 25 : 15;
            api
              .post('/study-plan/focus-session', {
                mode: pomodoroMode,
                durationMinutes: mins,
                subject: targetCourse,
              })
              .catch(() => {});
          }
          Alert.alert(
            pomodoroMode === 'BREAK_5' ? 'Pausa concluída!' : 'Ciclo de Foco Concluído!',
            pomodoroMode === 'BREAK_5'
              ? 'Hora de voltar ao seu bloco de estudos.'
              : 'Excelente foco! Faça uma pausa rápida de 5 minutos e marque seu bloco como concluído.'
          );
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [pomodoroRunning, pomodoroMode]);

  const selectPomodoroPreset = (mode: 'FOCUS_25' | 'FOCUS_15' | 'BREAK_5') => {
    setPomodoroRunning(false);
    setPomodoroMode(mode);
    setPomodoroSeconds(mode === 'FOCUS_25' ? 25 * 60 : mode === 'FOCUS_15' ? 15 * 60 : 5 * 60);
  };

  const formattedPomodoro = `${String(Math.floor(pomodoroSeconds / 60)).padStart(2, '0')}:${String(
    pomodoroSeconds % 60
  ).padStart(2, '0')}`;

  const loadPlan = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.get<StudyPlanResponse>('/study-plan');
      setPlan(res);
    } catch {
      Alert.alert('Erro', 'Não foi possível carregar seu cronograma semanal.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPlan();
  }, [loadPlan]);

  const handleRegenerate = async () => {
    setIsGenerating(true);
    try {
      const res = await api.post<StudyPlanResponse>('/study-plan/generate', {
        dailyMinutes,
        targetCourse,
      });
      setPlan(res);
      Alert.alert(
        'Cronograma Adaptado!',
        'Sua agenda da semana foi recalculada priorizando suas matérias de maior atenção no ENEM.'
      );
    } catch {
      Alert.alert('Erro', 'Não foi possível regenerar o cronograma agora.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleToggleItem = async (item: StudyPlanItem) => {
    if (togglingId) return;
    setTogglingId(item.id);
    try {
      const res = await api.patch<{ item: StudyPlanItem; xpAwarded: number }>(
        `/study-plan/${item.id}/toggle`,
        {}
      );
      if (res.xpAwarded > 0) {
        addXp(res.xpAwarded);
      }
      setPlan((prev) => {
        if (!prev) return prev;
        const nextItems = prev.items.map((it) =>
          it.id === item.id ? { ...it, completed: res.item.completed } : it
        );
        const completedCount = nextItems.filter((i) => i.completed).length;
        return {
          ...prev,
          items: nextItems,
          completedCount,
          progressPercent:
            nextItems.length > 0
              ? Math.round((completedCount / nextItems.length) * 100)
              : 0,
        };
      });
    } catch {
      Alert.alert('Erro', 'Falha ao atualizar conclusão da atividade.');
    } finally {
      setTogglingId(null);
    }
  };

  const handleLaunchActivity = (item: StudyPlanItem) => {
    if (item.activityType === 'SIMULADO') {
      router.push('/simulado' as any);
    } else if (item.activityType === 'SM2') {
      router.push({ pathname: '/quiz', params: { mode: 'revisao' } } as any);
    } else if (item.activityType === 'ESSAY') {
      router.push('/classes/tasks' as any);
    } else {
      router.push({
        pathname: '/quiz',
        params: { subject: item.subject, mode: 'pratica' },
      } as any);
    }
  };

  const dayItems = useMemo(
    () => (plan?.items || []).filter((i) => i.dayOfWeek === selectedDay),
    [plan, selectedDay]
  );

  const selectedDayInfo = DAY_LABELS.find((d) => d.num === selectedDay);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View
        style={[
          styles.header,
          { backgroundColor: theme.surface, borderBottomColor: theme.border },
        ]}
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <FontAwesome5 name="arrow-left" size={18} color={theme.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>
            Cronograma Adaptativo
          </Text>
          <Text style={[styles.headerSub, { color: theme.textMuted }]}>
            Plano semanal focado em {targetCourse}
          </Text>
        </View>
        <TouchableOpacity
          onPress={handleRegenerate}
          disabled={isGenerating}
          style={[styles.regenBtn, { backgroundColor: theme.primary }]}
        >
          {isGenerating ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <>
              <FontAwesome5 name="magic" size={11} color="#FFF" />
              <Text style={styles.regenBtnText}>Recalcular</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={{ color: theme.textMuted, marginTop: 10 }}>
            Montando seu plano semanal personalizado...
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          {/* MODO FOCO / POMODORO INTEGRADO */}
          <View
            style={[
              styles.progressCard,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <FontAwesome5 name="stopwatch" size={15} color="#EA580C" />
                <View>
                  <Text style={[styles.progressTitle, { color: theme.text }]}>
                    Modo Foco (Pomodoro)
                  </Text>
                  <Text style={{ fontSize: 11.5, color: theme.textMuted }}>
                    Ciclos concluídos hoje: {completedCycles}
                  </Text>
                </View>
              </View>
              <Text style={{ fontSize: 24, fontWeight: '900', color: pomodoroRunning ? '#EA580C' : theme.text }}>
                {formattedPomodoro}
              </Text>
            </View>

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              {(
                [
                  { key: 'FOCUS_25', label: 'Foco 25m' },
                  { key: 'FOCUS_15', label: 'Sprint 15m' },
                  { key: 'BREAK_5', label: 'Pausa 5m' },
                ] as const
              ).map((preset) => {
                const active = pomodoroMode === preset.key;
                return (
                  <TouchableOpacity
                    key={preset.key}
                    onPress={() => selectPomodoroPreset(preset.key)}
                    style={{
                      flex: 1,
                      paddingVertical: 6,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: active ? '#EA580C' : theme.border,
                      backgroundColor: active ? '#FFF7ED' : theme.surfaceMuted,
                      alignItems: 'center',
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 11.5,
                        fontWeight: '800',
                        color: active ? '#C2410C' : theme.textMuted,
                      }}
                    >
                      {preset.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
              <TouchableOpacity
                onPress={() => {
                  if (pomodoroSeconds === 0) {
                    selectPomodoroPreset(pomodoroMode);
                  }
                  setPomodoroRunning((r) => !r);
                }}
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  paddingVertical: 9,
                  borderRadius: 10,
                  backgroundColor: pomodoroRunning ? '#D97706' : '#EA580C',
                }}
              >
                <FontAwesome5 name={pomodoroRunning ? 'pause' : 'play'} size={11} color="#FFF" />
                <Text style={{ color: '#FFF', fontSize: 12.5, fontWeight: '800' }}>
                  {pomodoroRunning ? 'Pausar Foco' : 'Iniciar Foco'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => selectPomodoroPreset(pomodoroMode)}
                style={{
                  paddingHorizontal: 14,
                  paddingVertical: 9,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: theme.border,
                  backgroundColor: theme.surfaceMuted,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <FontAwesome5 name="redo" size={12} color={theme.text} />
              </TouchableOpacity>
            </View>
          </View>

          {/* METAS PERSONALIZADAS DE TEMPO & RELATÓRIO DE RENDIMENTO POR HORA */}
          <StudyTimeReportCard refreshTrigger={completedCycles} />

          {/* CARD DE PROGRESSO SEMANAL */}
          <View
            style={[
              styles.progressCard,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            <View style={styles.progressHeader}>
              <View>
                <Text style={[styles.progressTitle, { color: theme.text }]}>
                  Progresso da Semana
                </Text>
                <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: 2 }}>
                  {plan?.completedCount || 0} de {plan?.totalItems || 0} blocos concluídos (+20 XP cada)
                </Text>
              </View>
              <Text style={[styles.progressPct, { color: theme.primary }]}>
                {plan?.progressPercent || 0}%
              </Text>
            </View>
            <View style={[styles.progressTrack, { backgroundColor: theme.surfaceMuted }]}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${plan?.progressPercent || 0}%`,
                    backgroundColor: '#16A34A',
                  },
                ]}
              />
            </View>

            {/* TEMPO DIÁRIO DISPONÍVEL */}
            <Text style={[styles.dailyLabel, { color: theme.textSecondary }]}>
              Carga horária diária desejada:
            </Text>
            <View style={styles.minutesRow}>
              {[40, 60, 90, 120].map((mins) => {
                const active = dailyMinutes === mins;
                return (
                  <TouchableOpacity
                    key={mins}
                    onPress={() => setDailyMinutes(mins)}
                    style={[
                      styles.minuteChip,
                      {
                        backgroundColor: active ? theme.primary : theme.surfaceMuted,
                        borderColor: active ? theme.primary : theme.border,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: '800',
                        color: active ? '#FFF' : theme.textSecondary,
                      }}
                    >
                      {mins} min/dia
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* SELETOR DE DIAS DA SEMANA */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.daysRow}
          >
            {DAY_LABELS.map((day) => {
              const itemsForDay = (plan?.items || []).filter(
                (i) => i.dayOfWeek === day.num
              );
              const allDone =
                itemsForDay.length > 0 && itemsForDay.every((i) => i.completed);
              const isSelected = selectedDay === day.num;
              return (
                <TouchableOpacity
                  key={day.num}
                  onPress={() => setSelectedDay(day.num)}
                  style={[
                    styles.dayPill,
                    {
                      backgroundColor: isSelected
                        ? theme.primary
                        : allDone
                          ? theme.isDark
                            ? '#052E16'
                            : '#DCFCE7'
                          : theme.surface,
                      borderColor: isSelected
                        ? theme.primary
                        : allDone
                          ? '#16A34A'
                          : theme.border,
                    },
                  ]}
                >
                  <Text
                    style={{
                      fontSize: 12.5,
                      fontWeight: '800',
                      color: isSelected
                        ? '#FFF'
                        : allDone
                          ? '#16A34A'
                          : theme.text,
                    }}
                  >
                    {day.short}
                  </Text>
                  {allDone && !isSelected && (
                    <FontAwesome5 name="check" size={9} color="#16A34A" />
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* BLOCOS DO DIA SELECIONADO */}
          <Text style={[styles.dayHeading, { color: theme.text }]}>
            {selectedDayInfo?.full}
          </Text>

          <View style={{ gap: 12 }}>
            {dayItems.map((item) => {
              const badgeColor =
                item.activityType === 'SIMULADO'
                  ? '#D97706'
                  : item.activityType === 'ESSAY'
                    ? '#7C3AED'
                    : item.activityType === 'SM2'
                      ? '#DC2626'
                      : '#0284C7';
              return (
                <View
                  key={item.id}
                  style={[
                    styles.blockCard,
                    {
                      backgroundColor: theme.surface,
                      borderColor: item.completed ? '#16A34A' : theme.border,
                    },
                  ]}
                >
                  <TouchableOpacity
                    onPress={() => handleToggleItem(item)}
                    disabled={togglingId === item.id}
                    style={[
                      styles.checkbox,
                      {
                        backgroundColor: item.completed
                          ? '#16A34A'
                          : theme.surfaceMuted,
                        borderColor: item.completed ? '#16A34A' : theme.border,
                      },
                    ]}
                  >
                    {togglingId === item.id ? (
                      <ActivityIndicator size="small" color={theme.primary} />
                    ) : item.completed ? (
                      <FontAwesome5 name="check" size={12} color="#FFF" />
                    ) : null}
                  </TouchableOpacity>

                  <View style={{ flex: 1 }}>
                    <View style={styles.blockMetaRow}>
                      <View
                        style={[
                          styles.typePill,
                          { backgroundColor: `${badgeColor}1F` },
                        ]}
                      >
                        <Text
                          style={{
                            fontSize: 10.5,
                            fontWeight: '800',
                            color: badgeColor,
                          }}
                        >
                          {item.subject} • {item.durationMinutes} min
                        </Text>
                      </View>
                    </View>
                    <Text
                      style={[
                        styles.blockTopic,
                        {
                          color: theme.text,
                          textDecorationLine: item.completed
                            ? 'line-through'
                            : 'none',
                          opacity: item.completed ? 0.65 : 1,
                        },
                      ]}
                    >
                      {item.topic}
                    </Text>

                    <TouchableOpacity
                      onPress={() => handleLaunchActivity(item)}
                      style={[
                        styles.startSlotBtn,
                        { backgroundColor: theme.surfaceMuted },
                      ]}
                    >
                      <FontAwesome5 name="play" size={10} color={theme.primary} />
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: '800',
                          color: theme.primary,
                        }}
                      >
                        Iniciar atividade agora
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 10,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '800' },
  headerSub: { fontSize: 12, marginTop: 1 },
  regenBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  regenBtnText: { color: '#FFF', fontSize: 12, fontWeight: '800' },
  centerLoading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
    maxWidth: 820,
    width: '100%',
    alignSelf: 'center',
  },
  progressCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  progressTitle: { fontSize: 15.5, fontWeight: '800' },
  progressPct: { fontSize: 22, fontWeight: '900' },
  progressTrack: { height: 9, borderRadius: 999, overflow: 'hidden', marginBottom: 14 },
  progressFill: { height: '100%', borderRadius: 999 },
  dailyLabel: { fontSize: 12, fontWeight: '700', marginBottom: 8 },
  minutesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  minuteChip: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  daysRow: { gap: 8, paddingVertical: 4, marginBottom: 16 },
  dayPill: {
    minWidth: 54,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  dayHeading: { fontSize: 17, fontWeight: '800', marginBottom: 12 },
  blockCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    padding: 15,
    borderRadius: 16,
    borderWidth: 1.5,
  },
  checkbox: {
    width: 28,
    height: 28,
    borderRadius: 9,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  blockMetaRow: { flexDirection: 'row', marginBottom: 6 },
  typePill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  blockTopic: { fontSize: 14.5, fontWeight: '700', lineHeight: 20, marginBottom: 10 },
  startSlotBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
});

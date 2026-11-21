import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { FontAwesome5 } from '@expo/vector-icons';
import { api } from '@/services/api';
import { useTheme } from '@/hooks/use-theme';

interface TimeReportResponse {
  dailyGoalMinutes: number;
  weeklyGoalMinutes: number;
  focusMinutesToday: number;
  focusMinutesWeek: number;
  totalMinutesToday: number;
  totalMinutesWeek: number;
  dailyProgressPercent: number;
  weeklyProgressPercent: number;
  sessionsCountWeek: number;
  totalQuestionsWeek: number;
  correctQuestionsWeek: number;
  accuracyPercentWeek: number;
  questionsPerStudyHour: number;
  correctPerStudyHour: number;
}

export function StudyTimeReportCard({ refreshTrigger = 0 }: { refreshTrigger?: number }) {
  const theme = useTheme();
  const [editing, setEditing] = useState(false);
  const [dailyInput, setDailyInput] = useState('60');
  const [weeklyInput, setWeeklyInput] = useState('360');
  const [saving, setSaving] = useState(false);

  const { data, isLoading, refetch } = useQuery<TimeReportResponse>({
    queryKey: ['study-time-report', refreshTrigger],
    queryFn: async () => {
      const res = await api.get<TimeReportResponse>('/study-plan/time-report');
      setDailyInput(String(res.dailyGoalMinutes || 60));
      setWeeklyInput(String(res.weeklyGoalMinutes || 360));
      return res;
    },
  });

  const handleSaveGoals = async () => {
    setSaving(true);
    try {
      await api.patch('/study-plan/goals', {
        dailyStudyGoalMinutes: Number(dailyInput) || 60,
        weeklyStudyGoalMinutes: Number(weeklyInput) || 360,
      });
      setEditing(false);
      refetch();
    } catch {
      // Silencioso
    } finally {
      setSaving(false);
    }
  };

  if (isLoading && !data) {
    return (
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <ActivityIndicator size="small" color={theme.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.headerRow}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
          <FontAwesome5 name="chart-bar" size={14} color="#0284C7" />
          <View>
            <Text style={[styles.title, { color: theme.text }]}>
              Metas de Tempo & Rendimento por Hora
            </Text>
            <Text style={{ fontSize: 11.5, color: theme.textMuted }}>
              Cruza o tempo do Pomodoro com suas questões respondidas na semana
            </Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={() => setEditing((e) => !e)}
          style={[styles.editBtn, { backgroundColor: theme.surfaceMuted }]}
        >
          <Text style={{ fontSize: 11.5, fontWeight: '800', color: theme.primary }}>
            {editing ? 'Fechar' : 'Editar Metas'}
          </Text>
        </TouchableOpacity>
      </View>

      {editing && (
        <View style={[styles.editBox, { backgroundColor: theme.surfaceMuted, borderColor: theme.border }]}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: theme.textMuted }}>
                Meta Diária (min)
              </Text>
              <TextInput
                keyboardType="numeric"
                value={dailyInput}
                onChangeText={setDailyInput}
                style={[styles.input, { color: theme.text, borderColor: theme.border }]}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: theme.textMuted }}>
                Meta Semanal (min)
              </Text>
              <TextInput
                keyboardType="numeric"
                value={weeklyInput}
                onChangeText={setWeeklyInput}
                style={[styles.input, { color: theme.text, borderColor: theme.border }]}
              />
            </View>
          </View>
          <TouchableOpacity
            disabled={saving}
            onPress={handleSaveGoals}
            style={[styles.saveBtn, { backgroundColor: theme.primary }]}
          >
            <Text style={{ color: '#FFF', fontSize: 12, fontWeight: '800' }}>
              {saving ? 'Salvando...' : 'Salvar Metas Personalizadas'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.barsBlock}>
        <View>
          <View style={styles.barHeader}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: theme.text }}>
              Hoje: {data?.totalMinutesToday ?? 0} / {data?.dailyGoalMinutes ?? 60} min
            </Text>
            <Text style={{ fontSize: 12, fontWeight: '800', color: '#0284C7' }}>
              {data?.dailyProgressPercent ?? 0}%
            </Text>
          </View>
          <View style={[styles.track, { backgroundColor: theme.surfaceMuted }]}>
            <View
              style={[
                styles.fill,
                { width: `${data?.dailyProgressPercent ?? 0}%`, backgroundColor: '#0284C7' },
              ]}
            />
          </View>
        </View>

        <View>
          <View style={styles.barHeader}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: theme.text }}>
              Semana: {data?.totalMinutesWeek ?? 0} / {data?.weeklyGoalMinutes ?? 360} min
            </Text>
            <Text style={{ fontSize: 12, fontWeight: '800', color: '#16A34A' }}>
              {data?.weeklyProgressPercent ?? 0}%
            </Text>
          </View>
          <View style={[styles.track, { backgroundColor: theme.surfaceMuted }]}>
            <View
              style={[
                styles.fill,
                { width: `${data?.weeklyProgressPercent ?? 0}%`, backgroundColor: '#16A34A' },
              ]}
            />
          </View>
        </View>
      </View>

      <View style={styles.kpiRow}>
        <View style={[styles.kpiBox, { backgroundColor: theme.surfaceMuted }]}>
          <Text style={[styles.kpiVal, { color: theme.primary }]}>
            {data?.questionsPerStudyHour ?? 0}q/h
          </Text>
          <Text style={[styles.kpiLabel, { color: theme.textMuted }]}>Ritmo por Hora</Text>
        </View>
        <View style={[styles.kpiBox, { backgroundColor: theme.surfaceMuted }]}>
          <Text style={[styles.kpiVal, { color: '#16A34A' }]}>
            {data?.correctPerStudyHour ?? 0} ac/h
          </Text>
          <Text style={[styles.kpiLabel, { color: theme.textMuted }]}>Acertos / Hora</Text>
        </View>
        <View style={[styles.kpiBox, { backgroundColor: theme.surfaceMuted }]}>
          <Text style={[styles.kpiVal, { color: '#EA580C' }]}>
            {data?.accuracyPercentWeek ?? 0}%
          </Text>
          <Text style={[styles.kpiLabel, { color: theme.textMuted }]}>Aproveitamento</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    gap: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  title: { fontSize: 14, fontWeight: '800' },
  editBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  editBox: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    gap: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 4,
    fontSize: 13,
    fontWeight: '700',
  },
  saveBtn: {
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
  },
  barsBlock: { gap: 8 },
  barHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  track: {
    height: 8,
    borderRadius: 999,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 999,
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 2,
  },
  kpiBox: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
  },
  kpiVal: { fontSize: 15, fontWeight: '900' },
  kpiLabel: { fontSize: 10, fontWeight: '700', marginTop: 2 },
});

import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { FontAwesome5 } from '@expo/vector-icons';
import { api } from '@/services/api';
import { useTheme } from '@/hooks/use-theme';

interface BenchmarkResponse {
  classroomId: string;
  classroomName: string;
  participantsCount: number;
  myAccuracyPercent: number;
  myAnsweredCount: number;
  classAverageAccuracyPercent: number;
  classTop25AccuracyPercent: number;
  percentileRank: number;
  positionBand: string;
  areaComparisons: Array<{
    area: string;
    classAccuracyPercent: number;
    myAccuracyPercent: number;
  }>;
}

interface ClassroomBenchmarkCardProps {
  classroomId: string;
}

export function ClassroomBenchmarkCard({ classroomId }: ClassroomBenchmarkCardProps) {
  const theme = useTheme();
  const { data, isLoading } = useQuery<BenchmarkResponse>({
    queryKey: ['classroom-anonymous-benchmark', classroomId],
    queryFn: () => api.get<BenchmarkResponse>(`/classrooms/${classroomId}/benchmark`),
    enabled: Boolean(classroomId),
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <ActivityIndicator size="small" color={theme.primary} />
      </View>
    );
  }

  if (!data || data.participantsCount === 0) return null;

  const isAboveAvg = data.myAccuracyPercent >= data.classAverageAccuracyPercent;

  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.headerRow}>
        <View style={[styles.iconBox, { backgroundColor: '#EDE9FE' }]}>
          <FontAwesome5 name="chart-pie" size={14} color="#7C3AED" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: theme.text }]}>
            Comparativo Anônimo na Turma
          </Text>
          <Text style={[styles.sub, { color: theme.textMuted }]}>
            Sua posição relativa entre {data.participantsCount} colega(s) (sem expor notas individuais)
          </Text>
        </View>
        <View
          style={[
            styles.bandPill,
            { backgroundColor: isAboveAvg ? '#DCFCE7' : '#FEF3C7' },
          ]}
        >
          <Text
            style={{
              fontSize: 11,
              fontWeight: '800',
              color: isAboveAvg ? '#15803D' : '#B45309',
            }}
          >
            {data.positionBand}
          </Text>
        </View>
      </View>

      <View style={styles.metricsRow}>
        <View style={[styles.metricBox, { backgroundColor: theme.surfaceMuted }]}>
          <Text style={[styles.metricVal, { color: theme.primary }]}>
            {data.myAccuracyPercent}%
          </Text>
          <Text style={[styles.metricLabel, { color: theme.textMuted }]}>Seu Acerto</Text>
        </View>
        <View style={[styles.metricBox, { backgroundColor: theme.surfaceMuted }]}>
          <Text style={[styles.metricVal, { color: theme.text }]}>
            {data.classAverageAccuracyPercent}%
          </Text>
          <Text style={[styles.metricLabel, { color: theme.textMuted }]}>Média da Turma</Text>
        </View>
        <View style={[styles.metricBox, { backgroundColor: theme.surfaceMuted }]}>
          <Text style={[styles.metricVal, { color: '#16A34A' }]}>
            {data.classTop25AccuracyPercent}%
          </Text>
          <Text style={[styles.metricLabel, { color: theme.textMuted }]}>Top 25% Turma</Text>
        </View>
      </View>

      {data.areaComparisons && data.areaComparisons.length > 0 && (
        <View style={{ marginTop: 10, gap: 6 }}>
          {data.areaComparisons.slice(0, 4).map((item) => (
            <View key={item.area} style={styles.areaRow}>
              <Text style={[styles.areaName, { color: theme.text }]} numberOfLines={1}>
                {item.area}
              </Text>
              <Text style={{ fontSize: 11.5, fontWeight: '700', color: theme.textMuted }}>
                Você: <Text style={{ color: theme.primary, fontWeight: '800' }}>{item.myAccuracyPercent}%</Text> • Turma:{' '}
                {item.classAccuracyPercent}%
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 14, fontWeight: '800' },
  sub: { fontSize: 11.5, marginTop: 1 },
  bandPill: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 999,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  metricBox: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 9,
    alignItems: 'center',
  },
  metricVal: { fontSize: 17, fontWeight: '900' },
  metricLabel: { fontSize: 10.5, fontWeight: '700', marginTop: 2 },
  areaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  areaName: { fontSize: 12, fontWeight: '700', flex: 1, marginRight: 8 },
});

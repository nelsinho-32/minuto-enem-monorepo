import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { FontAwesome5 } from '@expo/vector-icons';
import { api } from '@/services/api';
import { useTheme } from '@/hooks/use-theme';

interface HeatmapCell {
  subject: string;
  topic: string;
  area: string;
  totalAttempts: number;
  wrongAttempts: number;
  errorRatePercent: number;
  accuracyPercent: number;
  severity: 'CRITICAL' | 'WARNING' | 'GOOD';
}

interface HeatmapResponse {
  classroomId: string;
  classroomName: string;
  totalAnalyzedAttempts: number;
  criticalCount: number;
  warningCount: number;
  cells: HeatmapCell[];
}

interface ClassroomHeatmapCardProps {
  classroomId: string;
}

export function ClassroomHeatmapCard({ classroomId }: ClassroomHeatmapCardProps) {
  const theme = useTheme();
  const { data, isLoading } = useQuery<HeatmapResponse>({
    queryKey: ['classroom-difficulty-heatmap', classroomId],
    queryFn: () => api.get<HeatmapResponse>(`/classrooms/${classroomId}/difficulty-heatmap`),
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

  if (!data || !Array.isArray(data.cells) || data.cells.length === 0) return null;

  const getCellPalette = (sev: HeatmapCell['severity']) => {
    if (sev === 'CRITICAL') {
      return { bg: '#FEE2E2', border: '#FCA5A5', text: '#991B1B', label: 'Crítico' };
    }
    if (sev === 'WARNING') {
      return { bg: '#FEF3C7', border: '#FCD34D', text: '#92400E', label: 'Atenção' };
    }
    return { bg: '#DCFCE7', border: '#86EFAC', text: '#166534', label: 'Dominado' };
  };

  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.headerRow}>
        <View style={[styles.iconBox, { backgroundColor: '#FEE2E2' }]}>
          <FontAwesome5 name="fire" size={14} color="#DC2626" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: theme.text }]}>
            Mapa de Calor de Dificuldades da Turma
          </Text>
          <Text style={[styles.sub, { color: theme.textMuted }]}>
            {data.criticalCount} tópico(s) crítico(s) • {data.totalAnalyzedAttempts} resoluções analisadas
          </Text>
        </View>
      </View>

      <View style={styles.grid}>
        {data.cells.slice(0, 8).map((cell, idx) => {
          const pal = getCellPalette(cell.severity);
          return (
            <View
              key={`${cell.subject}-${cell.topic}-${idx}`}
              style={[
                styles.cell,
                { backgroundColor: pal.bg, borderColor: pal.border },
              ]}
            >
              <View style={styles.cellTop}>
                <Text style={[styles.subjectText, { color: pal.text }]} numberOfLines={1}>
                  {cell.subject}
                </Text>
                <Text style={[styles.rateBadge, { color: pal.text }]}>
                  {cell.errorRatePercent}% erro
                </Text>
              </View>
              <Text style={[styles.topicText, { color: pal.text }]} numberOfLines={2}>
                {cell.topic}
              </Text>
              <Text style={[styles.metaText, { color: pal.text }]}>
                {cell.wrongAttempts}/{cell.totalAttempts} erros • {pal.label}
              </Text>
            </View>
          );
        })}
      </View>
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
    marginBottom: 10,
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
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  cell: {
    width: '48%',
    minWidth: 140,
    flexGrow: 1,
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    gap: 3,
  },
  cellTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  subjectText: { fontSize: 11, fontWeight: '900', flex: 1, marginRight: 4 },
  rateBadge: { fontSize: 11, fontWeight: '900' },
  topicText: { fontSize: 12, fontWeight: '700' },
  metaText: { fontSize: 10.5, fontWeight: '600', marginTop: 2 },
});

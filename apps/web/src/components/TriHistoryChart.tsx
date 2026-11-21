import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { useTheme } from '@/hooks/use-theme';

export interface TriHistoryPoint {
  score: number;
  label: string;
  date: string;
  accuracyPercent?: number | null;
}

interface TriHistoryChartProps {
  history: TriHistoryPoint[];
  targetScore: number;
  targetCourse: string;
  targetInstitution?: string;
}

export function TriHistoryChart({
  history,
  targetScore,
  targetCourse,
  targetInstitution,
}: TriHistoryChartProps) {
  const theme = useTheme();
  const points = (history || []).slice(-8);

  if (points.length === 0) {
    return (
      <View
        style={[
          styles.card,
          { backgroundColor: theme.surface, borderColor: theme.border },
        ]}
      >
        <View style={styles.headerRow}>
          <FontAwesome5 name="chart-line" size={14} color={theme.primary} />
          <Text style={[styles.title, { color: theme.text }]}>
            Evolução Histórica da Nota TRI
          </Text>
        </View>
        <Text style={{ fontSize: 12, color: theme.textMuted, marginTop: 4 }}>
          Complete simulados para visualizar sua curva de evolução comparada à nota de corte de{' '}
          {targetCourse} ({targetScore} pts).
        </Text>
      </View>
    );
  }

  const minVal = 300;
  const maxVal = 1000;
  const targetPct = Math.min(98, Math.max(5, ((targetScore - minVal) / (maxVal - minVal)) * 100));

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.surface, borderColor: theme.border },
      ]}
    >
      <View style={styles.headerRow}>
        <FontAwesome5 name="chart-line" size={14} color={theme.primary} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: theme.text }]}>
            Curva Histórica TRI vs Meta ({targetScore} pts)
          </Text>
          <Text style={{ fontSize: 11.5, color: theme.textMuted }}>
            {targetCourse} {targetInstitution ? `• ${targetInstitution}` : ''} — últimos {points.length} simulados
          </Text>
        </View>
      </View>

      <View style={styles.chartArea}>
        {/* Linha de referência da Nota de Corte */}
        <View
          style={[
            styles.cutoffLine,
            { bottom: `${targetPct}%` as any },
          ]}
        >
          <View style={styles.cutoffPill}>
            <Text style={styles.cutoffPillText}>Corte {targetScore}</Text>
          </View>
        </View>

        <View style={styles.barsRow}>
          {points.map((pt, idx) => {
            const pct = Math.min(100, Math.max(8, ((pt.score - minVal) / (maxVal - minVal)) * 100));
            const reached = pt.score >= targetScore;
            const shortDate = new Date(pt.date).toLocaleDateString('pt-BR', {
              day: '2-digit',
              month: '2-digit',
            });
            return (
              <View key={`${pt.date}-${idx}`} style={styles.barCol}>
                <Text style={[styles.barValue, { color: reached ? '#16A34A' : theme.text }]}>
                  {pt.score}
                </Text>
                <View style={[styles.barTrack, { backgroundColor: theme.surfaceMuted }]}>
                  <View
                    style={[
                      styles.barFill,
                      {
                        height: `${pct}%` as any,
                        backgroundColor: reached ? '#16A34A' : theme.primary,
                      },
                    ]}
                  />
                </View>
                <Text style={[styles.barDate, { color: theme.textMuted }]} numberOfLines={1}>
                  {shortDate}
                </Text>
              </View>
            );
          })}
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
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: { fontSize: 14, fontWeight: '800' },
  chartArea: {
    marginTop: 14,
    height: 155,
    position: 'relative',
    justifyContent: 'flex-end',
  },
  cutoffLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#DC2626',
    zIndex: 2,
    alignItems: 'flex-end',
  },
  cutoffPill: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
    marginTop: -10,
  },
  cutoffPillText: { fontSize: 9.5, fontWeight: '800', color: '#DC2626' },
  barsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-around',
    height: 138,
    gap: 6,
  },
  barCol: {
    flex: 1,
    alignItems: 'center',
    height: '100%',
    justifyContent: 'flex-end',
  },
  barValue: { fontSize: 10.5, fontWeight: '800', marginBottom: 4 },
  barTrack: {
    width: '72%',
    maxWidth: 30,
    flex: 1,
    borderRadius: 8,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  barFill: {
    width: '100%',
    borderRadius: 8,
  },
  barDate: { fontSize: 9.5, fontWeight: '700', marginTop: 5 },
});

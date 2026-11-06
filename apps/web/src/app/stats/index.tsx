import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Href, useRouter } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';

interface AreaMetrics {
  total: number;
  correct: number;
  score: number;
  proficiencyTheta: number;
}

interface WeakTopicItem {
  subject: string;
  area: string;
  totalAttempts: number;
  wrongCount: number;
  correctCount: number;
  errorRatePercent: number;
  accuracyPercent: number;
}

interface UserStatsData {
  userId: string;
  totalAttempts: number;
  totalCorrect: number;
  totalWrong: number;
  accuracyPercent: number;
  triEstimate: number;
  byArea?: {
    CN?: AreaMetrics;
    CH?: AreaMetrics;
    LC?: AreaMetrics;
    MT?: AreaMetrics;
  };
  topWeakTopics?: WeakTopicItem[];
  recentAttempts?: Array<{
    id: string;
    isCorrect: boolean;
    timeSpentMs?: number | null;
  }>;
}

function formatSeconds(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.round(totalSeconds % 60);
  if (mins <= 0) return `${secs}s`;
  return `${mins}m ${String(secs).padStart(2, '0')}s`;
}

export default function StatsScreen() {
  const router = useRouter();

  const {
    data: stats,
    isLoading,
    refetch,
    isRefetching,
  } = useQuery<UserStatsData>({
    queryKey: ['user-stats-overview'],
    queryFn: async () => {
      try {
        const res = await api.get<UserStatsData>('/questions/stats');
        return res;
      } catch {
        return api.get<UserStatsData>('/stats');
      }
    },
  });

  const generalStats = useMemo(() => {
    const totalAnswered = stats?.totalAttempts ?? 0;
    const correctAnswers = stats?.totalCorrect ?? 0;
    const accuracyRate = Math.round(stats?.accuracyPercent ?? 0);

    const attempts = stats?.recentAttempts || [];
    const correctAttempts = attempts.filter((a) => a.isCorrect);
    const avgMs =
      correctAttempts.length > 0
        ? correctAttempts.reduce(
            (acc, curr) => acc + (curr.timeSpentMs || 75000),
            0
          ) / correctAttempts.length
        : attempts.length > 0
          ? attempts.reduce(
              (acc, curr) => acc + (curr.timeSpentMs || 90000),
              0
            ) / attempts.length
          : 0;

    const averageTime =
      avgMs > 0 ? formatSeconds(Math.round(avgMs / 1000)) : '0s';

    return {
      totalAnswered,
      correctAnswers,
      accuracyRate,
      averageTime,
      triScore: Math.round(stats?.triEstimate ?? 500),
    };
  }, [stats]);

  const areaStats = useMemo(() => {
    const byArea = stats?.byArea || {};

    const calcAcc = (areaData?: AreaMetrics) => {
      if (!areaData || !areaData.total || areaData.total <= 0) return 0;
      return Math.round((areaData.correct / areaData.total) * 100);
    };

    return [
      {
        id: 1,
        code: 'MT',
        name: 'Matemática',
        icon: 'calculator',
        color: '#FF4B4B',
        accuracy: calcAcc(byArea.MT),
        total: byArea.MT?.total ?? 0,
        score: Math.round(byArea.MT?.score ?? 500),
        time: '2m 30s',
      },
      {
        id: 2,
        code: 'CN',
        name: 'Natureza',
        icon: 'flask',
        color: '#58CC02',
        accuracy: calcAcc(byArea.CN),
        total: byArea.CN?.total ?? 0,
        score: Math.round(byArea.CN?.score ?? 500),
        time: '2m 15s',
      },
      {
        id: 3,
        code: 'CH',
        name: 'Humanas',
        icon: 'globe-americas',
        color: '#F1C40F',
        accuracy: calcAcc(byArea.CH),
        total: byArea.CH?.total ?? 0,
        score: Math.round(byArea.CH?.score ?? 500),
        time: '1m 50s',
      },
      {
        id: 4,
        code: 'LC',
        name: 'Linguagens',
        icon: 'book',
        color: '#CE82FF',
        accuracy: calcAcc(byArea.LC),
        total: byArea.LC?.total ?? 0,
        score: Math.round(byArea.LC?.score ?? 500),
        time: '2m 00s',
      },
    ];
  }, [stats]);

  const strategicTip = useMemo(() => {
    const worstTopic = stats?.topWeakTopics?.[0];
    if (worstTopic && worstTopic.wrongCount > 0) {
      return `Seu principal ponto de atenção no momento é em "${worstTopic.subject}" (${worstTopic.errorRatePercent}% de erros). Pratique questões desse assunto para maximizar sua nota TRI!`;
    }
    if (generalStats.totalAnswered >= 10 && generalStats.accuracyRate >= 80) {
      return `Excelente consistência! Você está com ${generalStats.accuracyRate}% de acertos gerais. Mantenha as revisões diárias para consolidar sua vaga no ENEM.`;
    }
    return `Resolva simulados e quizzes diários para calibrar sua pontuação TRI e mapear seus pontos fortes em cada área da prova.`;
  }, [stats, generalStats]);

  return (
    <SafeAreaView style={styles.container}>
      {/* 1. HEADER */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <FontAwesome5 name="arrow-left" size={20} color="#2C3A47" />
        </TouchableOpacity>
        <Text style={styles.title}>Estatísticas de Acertos</Text>
        <TouchableOpacity
          onPress={() => refetch()}
          style={styles.refreshButton}
          disabled={isRefetching}
        >
          {isRefetching ? (
            <ActivityIndicator size="small" color="#1CB0F6" />
          ) : (
            <FontAwesome5 name="sync-alt" size={16} color="#8CA0B3" />
          )}
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color="#1CB0F6" />
          <Text style={styles.loadingText}>Carregando estatísticas reais...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* BANNER DE ACESSO AO RAIO-X DE ERROS */}
          <TouchableOpacity
            style={styles.errorsBanner}
            activeOpacity={0.85}
            onPress={() => router.push('/stats/errors' as Href)}
          >
            <View style={styles.errorsBannerIcon}>
              <FontAwesome5 name="microscope" size={20} color="#FF4B4B" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.errorsBannerTitle}>
                Raio-X de Erros & Diagnóstico
              </Text>
              <Text style={styles.errorsBannerSub}>
                Veja onde você errou e inicie baterias de revisão espaçada (SM-2).
              </Text>
            </View>
            <FontAwesome5 name="chevron-right" size={14} color="#FF4B4B" />
          </TouchableOpacity>

          {/* 2. VISÃO GERAL (HERO SECTION) */}
          <Text style={styles.sectionTitle}>Visão Geral</Text>
          <View style={styles.overviewContainer}>
            {/* Card de Precisão */}
            <TouchableOpacity
              style={[
                styles.overviewCard,
                { borderBottomColor: '#1CB0F6', borderBottomWidth: 4 },
              ]}
              activeOpacity={0.7}
              onPress={() => router.push('/stats/correct' as Href)}
            >
              <View style={styles.overviewIconHeader}>
                <FontAwesome5 name="bullseye" size={24} color="#1CB0F6" />
                <Text style={styles.overviewValue}>
                  {generalStats.accuracyRate}%
                </Text>
              </View>
              <Text style={styles.overviewLabel}>Taxa de Acertos</Text>
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <Text style={styles.overviewSub}>
                  {generalStats.correctAnswers} de {generalStats.totalAnswered} questões
                </Text>
                <FontAwesome5 name="chevron-right" size={12} color="#1CB0F6" />
              </View>
            </TouchableOpacity>

            {/* Card de Tempo */}
            <View
              style={[
                styles.overviewCard,
                { borderBottomColor: '#FF9600', borderBottomWidth: 4 },
              ]}
            >
              <View style={styles.overviewIconHeader}>
                <FontAwesome5 name="bolt" size={24} color="#FF9600" />
                <Text style={styles.overviewValue}>
                  {generalStats.averageTime}
                </Text>
              </View>
              <Text style={styles.overviewLabel}>Tempo Médio</Text>
              <Text style={styles.overviewSub}>
                TRI Estimada: {generalStats.triScore} pts
              </Text>
            </View>
          </View>

          {/* 3. DESEMPENHO POR ÁREA DO ENEM */}
          <Text style={styles.sectionTitle}>Desempenho por Área</Text>
          <View style={styles.areasContainer}>
            {areaStats.map((area) => (
              <TouchableOpacity
                key={area.id}
                style={styles.areaCard}
                activeOpacity={0.7}
                onPress={() =>
                  router.push({
                    pathname: '/stats/correct',
                    params: { area: area.name },
                  })
                }
              >
                <View style={styles.areaHeader}>
                  <View
                    style={[
                      styles.areaIconBox,
                      { backgroundColor: area.color },
                    ]}
                  >
                    <FontAwesome5 name={area.icon} size={16} color="#FFF" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.areaName}>{area.name}</Text>
                    <Text style={styles.areaTotalText}>
                      {area.total}{' '}
                      {area.total === 1 ? 'resolução' : 'resoluções'} • TRI ~{' '}
                      {area.score}
                    </Text>
                  </View>
                  <Text style={[styles.areaAccuracyText, { color: area.color }]}>
                    {area.accuracy}%
                  </Text>
                  <FontAwesome5
                    name="chevron-right"
                    size={12}
                    color="#CBD5E1"
                    style={{ marginLeft: 10 }}
                  />
                </View>

                <View style={styles.progressBarBg}>
                  <View
                    style={[
                      styles.progressBarFill,
                      {
                        width: `${Math.min(100, Math.max(area.accuracy, 4))}%`,
                        backgroundColor: area.color,
                      },
                    ]}
                  />
                </View>

                <View style={styles.areaFooter}>
                  <View style={styles.timeBadge}>
                    <FontAwesome5 name="clock" size={12} color="#8CA0B3" />
                    <Text style={styles.timeText}>Tempo médio: {area.time}</Text>
                  </View>

                  {area.total === 0 ? (
                    <Text style={styles.feedbackTextNeutral}>Não iniciado</Text>
                  ) : area.accuracy < 70 ? (
                    <Text style={styles.feedbackTextWarning}>Atenção necessária</Text>
                  ) : (
                    <Text style={styles.feedbackTextGood}>Ótimo ritmo</Text>
                  )}
                </View>
              </TouchableOpacity>
            ))}
          </View>

          {/* 4. INSIGHT DO SISTEMA */}
          <View style={styles.insightCard}>
            <FontAwesome5
              name="lightbulb"
              size={24}
              color="#F1C40F"
              style={{ marginRight: 16 }}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.insightTitle}>Dica Estratégica do Professor</Text>
              <Text style={styles.insightText}>{strategicTip}</Text>
            </View>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F9FC' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 20,
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
  },
  backButton: { width: 40, height: 40, justifyContent: 'center' },
  refreshButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  title: { fontSize: 20, fontWeight: 'bold', color: '#2C3A47' },
  scrollContent: { padding: 20, paddingBottom: 60 },

  centerLoading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 15,
    fontWeight: 'bold',
    color: '#8CA0B3',
  },

  errorsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF5F5',
    borderWidth: 1.5,
    borderColor: '#FFE4E6',
    borderRadius: 16,
    padding: 14,
    marginBottom: 20,
    gap: 12,
  },
  errorsBannerIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#FFE4E6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorsBannerTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#C40000',
  },
  errorsBannerSub: {
    fontSize: 12,
    color: '#7F1D1D',
    marginTop: 2,
    lineHeight: 16,
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2C3A47',
    marginBottom: 16,
    marginTop: 4,
  },

  overviewContainer: { flexDirection: 'row', gap: 12, marginBottom: 28 },
  overviewCard: {
    flex: 1,
    backgroundColor: '#FFF',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  overviewIconHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  overviewValue: { fontSize: 24, fontWeight: 'bold', color: '#2C3A47' },
  overviewLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#4B5563',
    marginBottom: 4,
  },
  overviewSub: { fontSize: 12, color: '#8CA0B3' },

  areasContainer: { gap: 14, marginBottom: 28 },
  areaCard: {
    backgroundColor: '#FFF',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  areaHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  areaIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  areaName: { fontSize: 16, fontWeight: 'bold', color: '#2C3A47' },
  areaTotalText: { fontSize: 11, color: '#8CA0B3', marginTop: 1 },
  areaAccuracyText: { fontSize: 18, fontWeight: 'bold' },

  progressBarBg: {
    width: '100%',
    height: 8,
    backgroundColor: '#F1F5F9',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressBarFill: { height: '100%', borderRadius: 4 },

  areaFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  timeText: { fontSize: 12, fontWeight: 'bold', color: '#8CA0B3' },
  feedbackTextNeutral: { fontSize: 12, fontWeight: 'bold', color: '#94A3B8' },
  feedbackTextWarning: { fontSize: 12, fontWeight: 'bold', color: '#FF4B4B' },
  feedbackTextGood: { fontSize: 12, fontWeight: 'bold', color: '#58CC02' },

  insightCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF9E6',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F1C40F',
  },
  insightTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#D4A017',
    marginBottom: 4,
  },
  insightText: { fontSize: 13, color: '#4B5563', lineHeight: 20 },
});

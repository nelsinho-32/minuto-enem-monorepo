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
import { useRouter, useLocalSearchParams } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { safeAsyncStorage as AsyncStorage } from '@/services/safeStorage';
import { api } from '@/services/api';

const ERROR_STATS_CACHE_KEY = '@minuto_enem:error_stats_cache_v1';

export interface ErrorQuestionItem {
  id: string;
  area: string;
  subject: string;
  topic: string;
  errorCategory: string;
  timeSpent: string;
  timeSeconds: number;
  isFavorite: boolean;
  text: string;
  userOption: string;
  correctOption: string;
  diagnosis: string;
}

export interface SubjectErrorMeta {
  area: string;
  icon: string;
  color: string;
  totalAttempted: number;
  errorRate: number;
  averageTime: string;
}

export interface ErrorStatsApiResponse {
  generalStats?: {
    totalAnswered: number;
    totalErrors: number;
    errorRate: number;
    averageErrorTime: string;
  };
  subjectMeta?: Record<string, SubjectErrorMeta>;
  questions?: ErrorQuestionItem[];
}

function formatSeconds(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.round(totalSeconds % 60);
  if (mins <= 0) return `${secs}s`;
  return `${mins}m ${String(secs).padStart(2, '0')}s`;
}

function getSubjectVisualMeta(subject: string): { icon: string; color: string } {
  const normalized = subject.toLowerCase();
  if (normalized.includes('mat')) return { icon: 'calculator', color: '#FF4B4B' };
  if (normalized.includes('fís') || normalized.includes('fis'))
    return { icon: 'atom', color: '#FF9600' };
  if (normalized.includes('quí') || normalized.includes('qui'))
    return { icon: 'flask', color: '#CE82FF' };
  if (normalized.includes('port') || normalized.includes('ling'))
    return { icon: 'book-open', color: '#1CB0F6' };
  if (normalized.includes('hist') || normalized.includes('hum'))
    return { icon: 'monument', color: '#F1C40F' };
  if (normalized.includes('bio')) return { icon: 'dna', color: '#58CC02' };
  return { icon: 'book', color: '#FF4B4B' };
}

export async function fetchErrorStatsFromApi(): Promise<ErrorStatsApiResponse> {
  try {
    const response = await api.get<ErrorStatsApiResponse | ErrorQuestionItem[]>('/stats/errors');
    const normalized: ErrorStatsApiResponse = Array.isArray(response)
      ? { questions: response }
      : response ?? { questions: [] };

    await AsyncStorage.setItem(ERROR_STATS_CACHE_KEY, JSON.stringify(normalized));
    return normalized;
  } catch (err) {
    const cached = await AsyncStorage.getItem(ERROR_STATS_CACHE_KEY);
    if (cached) {
      return JSON.parse(cached) as ErrorStatsApiResponse;
    }
    throw err instanceof Error ? err : new Error('Não foi possível carregar as estatísticas de erros.');
  }
}

export default function ErrorsScreen() {
  const router = useRouter();
  const { area } = useLocalSearchParams<{ area: string }>();

  const { data, isLoading, error, refetch } = useQuery<ErrorStatsApiResponse, Error>({
    queryKey: ['error-stats'],
    queryFn: fetchErrorStatsFromApi,
    networkMode: 'offlineFirst',
  });

  const { subjectStatsList, worstSubject, generalStats } = useMemo(() => {
    const allQuestions = data?.questions ?? [];
    const filtered = area
      ? allQuestions.filter((q) => q.area === area)
      : allQuestions;

    const grouped = filtered.reduce(
      (acc, q) => {
        if (!acc[q.subject]) {
          acc[q.subject] = {
            questions: [],
            topics: new Set<string>(),
          };
        }
        acc[q.subject].questions.push(q);
        acc[q.subject].topics.add(q.topic);
        return acc;
      },
      {} as Record<string, { questions: ErrorQuestionItem[]; topics: Set<string> }>
    );

    const list = Object.entries(grouped).map(([subject, groupData]) => {
      const apiMeta = data?.subjectMeta?.[subject];
      const visual = getSubjectVisualMeta(subject);
      const avgSec =
        groupData.questions.reduce((acc, q) => acc + (q.timeSeconds || 0), 0) /
        Math.max(groupData.questions.length, 1);

      return {
        subject,
        icon: apiMeta?.icon ?? visual.icon,
        color: apiMeta?.color ?? visual.color,
        errorRate: apiMeta?.errorRate ?? Math.min(100, groupData.questions.length * 10),
        averageTime: apiMeta?.averageTime ?? formatSeconds(avgSec || 120),
        errorsCount: groupData.questions.length,
        topicsCount: groupData.topics.size,
        topicsList: Array.from(groupData.topics),
      };
    });

    list.sort((a, b) => b.errorRate - a.errorRate);

    const totalErrors = filtered.length;
    const totalAnswered =
      data?.generalStats?.totalAnswered ?? Math.max(totalErrors * 4, totalErrors);
    const errorRate =
      data?.generalStats?.errorRate ??
      (totalAnswered > 0 ? Math.round((totalErrors / totalAnswered) * 100) : 0);
    const avgErrorSec =
      filtered.reduce((acc, q) => acc + (q.timeSeconds || 0), 0) /
      Math.max(filtered.length, 1);
    const averageErrorTime =
      data?.generalStats?.averageErrorTime ??
      (filtered.length > 0 ? formatSeconds(avgErrorSec) : '0s');

    return {
      subjectStatsList: list,
      worstSubject: list[0] ?? null,
      generalStats: {
        totalAnswered,
        totalErrors,
        errorRate,
        averageErrorTime,
      },
    };
  }, [data, area]);

  const pageTitle = area ? `Raio-X: ${area}` : 'Raio-X de Erros';

  const handleOpenSubject = (subjectName: string) => {
    router.push({
      pathname: '/stats/error-topics' as any,
      params: { subject: subjectName },
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* 1. HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <FontAwesome5 name="arrow-left" size={20} color="#2C3A47" />
        </TouchableOpacity>
        <Text style={styles.title}>{pageTitle}</Text>
        <TouchableOpacity onPress={() => refetch()} style={styles.refreshButton}>
          <FontAwesome5 name="sync-alt" size={16} color="#1CB0F6" />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color="#1CB0F6" />
          <Text style={styles.loadingText}>Carregando estatísticas de erros...</Text>
        </View>
      ) : error ? (
        <View style={styles.centerState}>
          <FontAwesome5
            name="exclamation-circle"
            size={44}
            color="#FF4B4B"
            style={{ marginBottom: 12 }}
          />
          <Text style={styles.errorText}>{error.message}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => refetch()}>
            <Text style={styles.retryBtnText}>Tentar Novamente</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* 2. VISÃO GERAL: TAXA DE ERRO E TEMPO MÉDIO */}
          <Text style={styles.sectionTitle}>Visão Geral dos Erros</Text>
          <View style={styles.overviewContainer}>
            {/* Card Taxa de Erro */}
            <View
              style={[
                styles.overviewCard,
                { borderBottomColor: '#FF4B4B', borderBottomWidth: 4 },
              ]}
            >
              <View style={styles.overviewIconHeader}>
                <View style={[styles.overviewBadge, { backgroundColor: '#FFE4E6' }]}>
                  <FontAwesome5 name="exclamation-triangle" size={16} color="#FF4B4B" />
                </View>
                <Text style={[styles.overviewValue, { color: '#FF4B4B' }]}>
                  {generalStats.errorRate}%
                </Text>
              </View>
              <Text style={styles.overviewLabel}>Taxa de Erro</Text>
              <Text style={styles.overviewSub}>
                {generalStats.totalErrors} de {generalStats.totalAnswered} questões
              </Text>
            </View>

            {/* Card Tempo Médio */}
            <View
              style={[
                styles.overviewCard,
                { borderBottomColor: '#FF9600', borderBottomWidth: 4 },
              ]}
            >
              <View style={styles.overviewIconHeader}>
                <View style={[styles.overviewBadge, { backgroundColor: '#FFF0D4' }]}>
                  <FontAwesome5 name="stopwatch" size={16} color="#FF9600" />
                </View>
                <Text style={styles.overviewValue}>
                  {generalStats.averageErrorTime}
                </Text>
              </View>
              <Text style={styles.overviewLabel}>Tempo Médio</Text>
              <Text style={styles.overviewSub}>Gasto por questão errada</Text>
            </View>
          </View>

          {subjectStatsList.length === 0 ? (
            <View style={styles.emptyState}>
              <FontAwesome5
                name="medal"
                size={48}
                color="#E2E8F0"
                style={{ marginBottom: 16 }}
              />
              <Text style={styles.emptyText}>
                Sem erros por aqui! Você está dominando o conteúdo.
              </Text>
            </View>
          ) : (
            <>
              {/* 3. PLANO DE AÇÃO DIRECIONADO */}
              {worstSubject && (
                <TouchableOpacity
                  style={styles.actionPlanHero}
                  activeOpacity={0.85}
                  onPress={() => handleOpenSubject(worstSubject.subject)}
                >
                  <View style={styles.heroHeader}>
                    <View style={styles.heroIconBox}>
                      <FontAwesome5 name="crosshairs" size={20} color="#FFF" />
                    </View>
                    <Text style={styles.heroTitle}>Plano de Ação Direcionado</Text>
                  </View>
                  <Text style={styles.heroDescription}>
                    Sua maior dificuldade atual é em{' '}
                    <Text style={{ fontWeight: 'bold', color: '#FFF' }}>
                      {worstSubject.subject}
                    </Text>{' '}
                    ({worstSubject.errorRate}% de taxa de erro e tempo médio de{' '}
                    {worstSubject.averageTime}).
                  </Text>
                  <View style={styles.heroTaskBox}>
                    <FontAwesome5
                      name="layer-group"
                      size={14}
                      color="#2C3A47"
                      style={{ marginRight: 10, marginTop: 2 }}
                    />
                    <Text style={styles.heroTaskText}>
                      Toque aqui para ver os {worstSubject.topicsCount} assuntos de{' '}
                      {worstSubject.subject} onde você mais errou.
                    </Text>
                  </View>
                </TouchableOpacity>
              )}

              {/* 4. LISTA DE MATÉRIAS (CLICÁVEL PARA ABRIR NOVA TELA POR ASSUNTOS) */}
              <Text style={styles.sectionTitle}>Erros por Matéria</Text>
              <Text style={styles.sectionSub}>
                Toque em uma matéria para abrir os erros separados por assunto.
              </Text>

              <View style={styles.subjectsList}>
                {subjectStatsList.map((item) => (
                  <TouchableOpacity
                    key={item.subject}
                    style={styles.subjectCard}
                    activeOpacity={0.75}
                    onPress={() => handleOpenSubject(item.subject)}
                  >
                    <View style={styles.subjectCardHeader}>
                      <View
                        style={[
                          styles.subjectIconBox,
                          { backgroundColor: item.color },
                        ]}
                      >
                        <FontAwesome5 name={item.icon} size={16} color="#FFF" />
                      </View>

                      <View style={styles.subjectMainInfo}>
                        <Text style={styles.subjectName}>{item.subject}</Text>
                        <Text style={styles.subjectSubCount}>
                          {item.errorsCount}{' '}
                          {item.errorsCount === 1 ? 'erro' : 'erros'} em{' '}
                          {item.topicsCount}{' '}
                          {item.topicsCount === 1 ? 'assunto' : 'assuntos'}
                        </Text>
                      </View>

                      <View style={styles.subjectErrorRateBox}>
                        <Text
                          style={[styles.subjectErrorRateValue, { color: item.color }]}
                        >
                          {item.errorRate}%
                        </Text>
                        <Text style={styles.subjectErrorRateLabel}>taxa de erro</Text>
                      </View>

                      <FontAwesome5
                        name="chevron-right"
                        size={14}
                        color="#8CA0B3"
                        style={{ marginLeft: 10 }}
                      />
                    </View>

                    <View style={styles.progressBarBg}>
                      <View
                        style={[
                          styles.progressBarFill,
                          {
                            width: `${item.errorRate}%`,
                            backgroundColor: item.color,
                          },
                        ]}
                      />
                    </View>

                    <View style={styles.subjectCardFooter}>
                      <View style={styles.timeBadge}>
                        <FontAwesome5 name="clock" size={12} color="#8CA0B3" />
                        <Text style={styles.timeText}>
                          Tempo médio: {item.averageTime}
                        </Text>
                      </View>

                      <Text style={styles.viewTopicsLink}>Ver por assuntos</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}
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
  refreshButton: { width: 40, height: 40, justifyContent: 'center', alignItems: 'flex-end' },
  title: { fontSize: 20, fontWeight: 'bold', color: '#2C3A47' },
  scrollContent: { padding: 20, paddingBottom: 60 },
  centerState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  loadingText: { marginTop: 12, fontSize: 15, color: '#8CA0B3', fontWeight: 'bold' },
  errorText: { fontSize: 15, color: '#4B5563', textAlign: 'center', marginBottom: 16 },
  retryBtn: {
    backgroundColor: '#1CB0F6',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
  },
  retryBtnText: { color: '#FFF', fontWeight: 'bold', fontSize: 14 },
  emptyState: { alignItems: 'center', justifyContent: 'center', marginTop: 60 },
  emptyText: { fontSize: 16, color: '#8CA0B3', textAlign: 'center' },

  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2C3A47',
    marginBottom: 6,
  },
  sectionSub: {
    fontSize: 13,
    color: '#8CA0B3',
    marginBottom: 16,
  },

  overviewContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 10,
    marginBottom: 28,
  },
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
  overviewBadge: {
    width: 34,
    height: 34,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  overviewValue: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#2C3A47',
  },
  overviewLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#4B5563',
    marginBottom: 4,
  },
  overviewSub: {
    fontSize: 12,
    color: '#8CA0B3',
  },

  actionPlanHero: {
    backgroundColor: '#FF4B4B',
    borderRadius: 20,
    padding: 20,
    marginBottom: 28,
    shadowColor: '#FF4B4B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  heroIconBox: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  heroTitle: { fontSize: 18, fontWeight: 'bold', color: '#FFF' },
  heroDescription: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.92)',
    lineHeight: 20,
    marginBottom: 14,
  },
  heroTaskBox: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 14,
    alignItems: 'flex-start',
  },
  heroTaskText: {
    flex: 1,
    fontSize: 13,
    color: '#2C3A47',
    fontWeight: 'bold',
    lineHeight: 18,
  },

  subjectsList: {
    gap: 14,
  },
  subjectCard: {
    backgroundColor: '#FFF',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  subjectCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  subjectIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  subjectMainInfo: {
    flex: 1,
  },
  subjectName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2C3A47',
  },
  subjectSubCount: {
    fontSize: 12,
    color: '#8CA0B3',
    marginTop: 2,
  },
  subjectErrorRateBox: {
    alignItems: 'flex-end',
  },
  subjectErrorRateValue: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  subjectErrorRateLabel: {
    fontSize: 10,
    color: '#8CA0B3',
    textTransform: 'uppercase',
    fontWeight: 'bold',
  },
  progressBarBg: {
    width: '100%',
    height: 8,
    backgroundColor: '#F1F5F9',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  subjectCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  timeText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#8CA0B3',
  },
  viewTopicsLink: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#1CB0F6',
  },
});

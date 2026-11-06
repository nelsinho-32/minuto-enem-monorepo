import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  LayoutAnimation,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import {
  ErrorQuestionItem,
  ErrorStatsApiResponse,
  fetchErrorStatsFromApi,
} from '@/app/stats/errors';

function formatSeconds(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = Math.round(totalSeconds % 60);
  if (mins <= 0) return `${secs}s`;
  return `${mins}m ${String(secs).padStart(2, '0')}s`;
}

function getDefaultSubjectMeta(subject: string) {
  const normalized = subject.toLowerCase();
  if (normalized.includes('mat')) {
    return { area: 'Matemática', icon: 'calculator', color: '#FF4B4B', totalAttempted: 20, errorRate: 30, averageTime: '2m 45s' };
  }
  if (normalized.includes('fís') || normalized.includes('fis')) {
    return { area: 'Natureza', icon: 'atom', color: '#FF9600', totalAttempted: 20, errorRate: 28, averageTime: '3m 00s' };
  }
  if (normalized.includes('quí') || normalized.includes('qui')) {
    return { area: 'Natureza', icon: 'flask', color: '#CE82FF', totalAttempted: 20, errorRate: 20, averageTime: '2m 15s' };
  }
  if (normalized.includes('port') || normalized.includes('ling')) {
    return { area: 'Linguagens', icon: 'book-open', color: '#1CB0F6', totalAttempted: 20, errorRate: 15, averageTime: '1m 55s' };
  }
  return {
    area: 'Geral',
    icon: 'book',
    color: '#FF4B4B',
    totalAttempted: 20,
    errorRate: 25,
    averageTime: '2m 30s',
  };
}

export default function ErrorTopicsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { subject } = useLocalSearchParams<{ subject: string }>();
  const selectedSubject = subject || 'Matemática';

  const { data, isLoading, error, refetch } = useQuery<ErrorStatsApiResponse, Error>({
    queryKey: ['error-stats', selectedSubject],
    networkMode: 'offlineFirst',
    queryFn: async () => {
      try {
        const res = await api.get<ErrorStatsApiResponse | ErrorQuestionItem[]>(
          `/stats/errors?subject=${encodeURIComponent(selectedSubject)}`
        );
        return Array.isArray(res) ? { questions: res } : res ?? { questions: [] };
      } catch {
        return fetchErrorStatsFromApi();
      }
    },
  });

  const [questions, setQuestions] = useState<ErrorQuestionItem[]>([]);
  const [collapsedTopics, setCollapsedTopics] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (data?.questions) {
      setQuestions(data.questions);
    }
  }, [data]);

  const favoriteMutation = useMutation({
    mutationFn: async ({ id, isFavorite }: { id: string; isFavorite: boolean }) => {
      return api.put(`/stats/errors/${id}/favorite`, { isFavorite });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['error-stats'] });
    },
  });

  const toggleFavorite = (id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setQuestions((prev) =>
      prev.map((q) => {
        if (q.id !== id) return q;
        const nextFav = !q.isFavorite;
        favoriteMutation.mutate({ id, isFavorite: nextFav });
        return { ...q, isFavorite: nextFav };
      })
    );
  };

  const toggleTopic = (topic: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setCollapsedTopics((prev) => ({
      ...prev,
      [topic]: !prev[topic],
    }));
  };

  const { topicGroups, subjectMeta, totalErrors } = useMemo(() => {
    const subjectQuestions = questions
      .filter((q) => q.subject === selectedSubject)
      .sort((a, b) => {
        if (a.isFavorite === b.isFavorite) return 0;
        return a.isFavorite ? -1 : 1;
      });

    const grouped = subjectQuestions.reduce(
      (acc, q) => {
        if (!acc[q.topic]) acc[q.topic] = [];
        acc[q.topic].push(q);
        return acc;
      },
      {} as Record<string, ErrorQuestionItem[]>
    );

    const groupsList = Object.entries(grouped).map(([topic, items]) => {
      const avgSec =
        items.reduce((sum, item) => sum + (item.timeSeconds || 0), 0) /
        Math.max(items.length, 1);
      return {
        topic,
        items,
        avgTime: formatSeconds(avgSec),
      };
    });

    const meta =
      data?.subjectMeta?.[selectedSubject] ?? getDefaultSubjectMeta(selectedSubject);

    return {
      topicGroups: groupsList,
      subjectMeta: meta,
      totalErrors: subjectQuestions.length,
    };
  }, [questions, selectedSubject, data]);

  const handleStartSpacedRepetition = async (topicName?: string) => {
    try {
      await api.post('/spaced-repetition/sync', {
        subject: selectedSubject,
        topic: topicName,
      });
    } catch {
      // Continua para o quiz mesmo se sync offline
    }

    router.push({
      pathname: '/quiz',
      params: {
        mode: 'revisao',
        subject: selectedSubject,
        topic: topicName || '',
        limit: 10,
      },
    } as any);
  };

  const handleSaveToNotes = (question: ErrorQuestionItem, topicName: string) => {
    router.push({
      pathname: '/notes/new' as any,
      params: {
        title: `Erro em ${selectedSubject}: ${topicName}`,
        content: `Questão: ${question.text}\n\nMinha Resposta: ${question.userOption}\nResposta Correta: ${question.correctOption}\n\nDiagnóstico: ${question.diagnosis}`,
      },
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <FontAwesome5 name="arrow-left" size={20} color="#2C3A47" />
        </TouchableOpacity>
        <Text style={styles.title}>Erros: {selectedSubject}</Text>
        <TouchableOpacity onPress={() => refetch()} style={styles.refreshBtn}>
          <FontAwesome5 name="sync-alt" size={16} color="#1CB0F6" />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="large" color="#1CB0F6" />
          <Text style={styles.loadingText}>Carregando erros de {selectedSubject}...</Text>
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
          {/* RESUMO DA MATÉRIA: TAXA DE ERRO E TEMPO MÉDIO */}
          <View style={[styles.summaryBanner, { borderLeftColor: subjectMeta.color }]}>
            <View style={styles.summaryItem}>
              <Text style={[styles.summaryValue, { color: subjectMeta.color }]}>
                {subjectMeta.errorRate}%
              </Text>
              <Text style={styles.summaryLabel}>Taxa de Erro</Text>
            </View>

            <View style={styles.summaryDivider} />

            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{subjectMeta.averageTime}</Text>
              <Text style={styles.summaryLabel}>Tempo Médio</Text>
            </View>

            <View style={styles.summaryDivider} />

            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>{topicGroups.length}</Text>
              <Text style={styles.summaryLabel}>
                {topicGroups.length === 1 ? 'Assunto' : 'Assuntos'}
              </Text>
            </View>
          </View>

          {/* BOTÃO HERO: INICIAR REVISÃO ESPAÇADA (SM-2) */}
          {totalErrors > 0 && (
            <TouchableOpacity
              style={[
                styles.spacedRepetitionHeroBtn,
                { backgroundColor: subjectMeta.color },
              ]}
              activeOpacity={0.85}
              onPress={() => handleStartSpacedRepetition()}
            >
              <View style={styles.spacedRepetitionHeroIcon}>
                <FontAwesome5 name="brain" size={20} color="#FFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.spacedRepetitionHeroTitle}>
                  Iniciar Bateria de Revisão Espaçada (SM-2)
                </Text>
                <Text style={styles.spacedRepetitionHeroSub}>
                  Treinar erros de {selectedSubject} com repetição inteligente.
                </Text>
              </View>
              <FontAwesome5 name="arrow-right" size={14} color="#FFF" />
            </TouchableOpacity>
          )}

          <Text style={styles.sectionTitle}>
            Separado por Assuntos ({totalErrors}{' '}
            {totalErrors === 1 ? 'erro' : 'erros'})
          </Text>
          <Text style={styles.sectionSub}>
            Veja os assuntos específicos de {selectedSubject} onde ocorreram suas falhas.
          </Text>

          {topicGroups.length === 0 ? (
            <View style={styles.emptyState}>
              <FontAwesome5
                name="check-circle"
                size={48}
                color="#58CC02"
                style={{ marginBottom: 16 }}
              />
              <Text style={styles.emptyText}>
                Nenhum erro registrado em {selectedSubject}!
              </Text>
            </View>
          ) : (
            topicGroups.map(({ topic, items, avgTime }) => {
              const isExpanded = !collapsedTopics[topic];

              return (
                <View key={topic} style={styles.topicSectionCard}>
                  {/* Cabeçalho do Assunto */}
                  <TouchableOpacity
                    style={[
                      styles.topicHeader,
                      isExpanded && styles.topicHeaderActive,
                    ]}
                    activeOpacity={0.8}
                    onPress={() => toggleTopic(topic)}
                  >
                    <View style={styles.topicHeaderLeft}>
                      <View
                        style={[
                          styles.topicIconBox,
                          { backgroundColor: `${subjectMeta.color}18` },
                        ]}
                      >
                        <FontAwesome5
                          name="folder-open"
                          size={15}
                          color={subjectMeta.color}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.topicName}>{topic}</Text>
                        <Text style={styles.topicSubInfo}>
                          {items.length}{' '}
                          {items.length === 1 ? 'questão errada' : 'questões erradas'} • Média: {avgTime}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.topicHeaderActions}>
                      <TouchableOpacity
                        style={[
                          styles.topicQuickReviewBtn,
                          { backgroundColor: subjectMeta.color },
                        ]}
                        activeOpacity={0.8}
                        onPress={() => handleStartSpacedRepetition(topic)}
                      >
                        <FontAwesome5 name="redo-alt" size={10} color="#FFF" />
                        <Text style={styles.topicQuickReviewBtnText}>SM-2</Text>
                      </TouchableOpacity>

                      <FontAwesome5
                        name={isExpanded ? 'chevron-up' : 'chevron-down'}
                        size={15}
                        color="#8CA0B3"
                        style={{ marginLeft: 8 }}
                      />
                    </View>
                  </TouchableOpacity>

                  {/* Questões daquele Assunto */}
                  {isExpanded && (
                    <View style={styles.topicQuestionsList}>
                      {items.map((question) => (
                        <View
                          key={question.id}
                          style={[
                            styles.questionCard,
                            question.isFavorite && styles.favoriteHighlight,
                          ]}
                        >
                          <View style={styles.cardHeader}>
                            <View style={styles.tagBadge}>
                              <FontAwesome5 name="bug" size={10} color="#FF4B4B" />
                              <Text style={styles.tagText}>
                                {question.errorCategory}
                              </Text>
                            </View>

                            <View style={styles.headerRightActions}>
                              <View style={styles.timeBadge}>
                                <FontAwesome5
                                  name="stopwatch"
                                  size={12}
                                  color="#C40000"
                                />
                                <Text style={styles.timeText}>
                                  {question.timeSpent}
                                </Text>
                              </View>

                              <TouchableOpacity
                                onPress={() => toggleFavorite(question.id)}
                                style={styles.favoriteButton}
                              >
                                <FontAwesome5
                                  name="star"
                                  solid={question.isFavorite}
                                  size={18}
                                  color={
                                    question.isFavorite ? '#F1C40F' : '#E2E8F0'
                                  }
                                />
                              </TouchableOpacity>
                            </View>
                          </View>

                          <Text style={styles.questionText}>{question.text}</Text>

                          <View style={styles.contrastContainer}>
                            <View style={styles.contrastRow}>
                              <FontAwesome5
                                name="times"
                                size={12}
                                color="#FF4B4B"
                                style={{ width: 20 }}
                              />
                              <Text style={styles.contrastTextError}>
                                {question.userOption}
                              </Text>
                            </View>
                            <View style={styles.contrastDivider} />
                            <View style={styles.contrastRow}>
                              <FontAwesome5
                                name="check"
                                size={12}
                                color="#58CC02"
                                style={{ width: 20 }}
                              />
                              <Text style={styles.contrastTextSuccess}>
                                {question.correctOption}
                              </Text>
                            </View>
                          </View>

                          <View style={styles.diagnosisBox}>
                            <Text style={styles.diagnosisTitle}>Diagnóstico:</Text>
                            <Text style={styles.diagnosisText}>
                              {question.diagnosis}
                            </Text>
                          </View>

                          <TouchableOpacity
                            style={styles.saveNotesButton}
                            onPress={() => handleSaveToNotes(question, topic)}
                            activeOpacity={0.8}
                          >
                            <FontAwesome5
                              name="bookmark"
                              size={12}
                              color="#1CB0F6"
                            />
                            <Text style={styles.saveNotesText}>
                              Salvar no Caderno
                            </Text>
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              );
            })
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
  refreshBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'flex-end' },
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

  summaryBanner: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    borderRadius: 16,
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderLeftWidth: 6,
    marginBottom: 24,
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  summaryItem: {
    alignItems: 'center',
    flex: 1,
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2C3A47',
    marginBottom: 4,
  },
  summaryLabel: {
    fontSize: 11,
    color: '#8CA0B3',
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  summaryDivider: {
    width: 1,
    height: 32,
    backgroundColor: '#E2E8F0',
  },

  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2C3A47',
    marginBottom: 4,
  },
  sectionSub: {
    fontSize: 13,
    color: '#8CA0B3',
    marginBottom: 16,
  },

  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 60,
  },
  emptyText: {
    fontSize: 16,
    color: '#8CA0B3',
    textAlign: 'center',
  },

  topicSectionCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
    overflow: 'hidden',
  },
  topicHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFF',
  },
  topicHeaderActive: {
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  topicHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingRight: 10,
  },
  topicIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  topicName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2C3A47',
  },
  topicSubInfo: {
    fontSize: 12,
    color: '#8CA0B3',
    marginTop: 2,
  },

  topicQuestionsList: {
    padding: 16,
    backgroundColor: '#F7F9FC',
    gap: 14,
  },
  questionCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  favoriteHighlight: {
    borderColor: '#F1C40F',
    borderWidth: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
    alignItems: 'center',
  },
  tagBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFF5F5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FFE4E6',
  },
  tagText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#C40000',
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFF5F5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FFE4E6',
  },
  timeText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#C40000',
  },
  favoriteButton: {
    padding: 4,
  },
  questionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2C3A47',
    marginBottom: 16,
    lineHeight: 20,
  },
  contrastContainer: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  contrastRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  contrastTextError: {
    fontSize: 13,
    color: '#4B5563',
    textDecorationLine: 'line-through',
  },
  contrastTextSuccess: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#3A8A00',
  },
  contrastDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 8,
  },
  diagnosisBox: {
    backgroundColor: '#FFF9E6',
    padding: 12,
    borderRadius: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#F1C40F',
    marginBottom: 16,
  },
  diagnosisTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#D4A017',
    marginBottom: 4,
  },
  diagnosisText: {
    fontSize: 13,
    color: '#4B5563',
    lineHeight: 18,
  },
  saveNotesButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    backgroundColor: '#F0F9FF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  saveNotesText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#1CB0F6',
  },

  // Estilos da Bateria de Revisão Espaçada (SM-2)
  spacedRepetitionHeroBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  spacedRepetitionHeroIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.22)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  spacedRepetitionHeroTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFF',
  },
  spacedRepetitionHeroSub: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 2,
  },

  topicHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  topicQuickReviewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  topicQuickReviewBtnText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#FFF',
  },
});

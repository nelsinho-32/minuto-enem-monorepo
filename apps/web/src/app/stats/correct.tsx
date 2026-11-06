import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  LayoutAnimation,
  ActivityIndicator,
  Share,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { safeAsyncStorage as AsyncStorage } from '@/services/safeStorage';
import { api } from '@/services/api';

const CORRECT_FAVORITES_CACHE_KEY = '@minuto_enem:correct_favorites_v1';

export interface CorrectQuestionItem {
  id: string;
  questionId?: string;
  area: string;
  subject: string;
  timeSpent: string;
  timeSeconds?: number;
  isFavorite?: boolean;
  text: string;
  correctOption: string;
  explanation: string;
}

export default function CorrectAnswersScreen() {
  const router = useRouter();
  const { area } = useLocalSearchParams<{ area: string }>();

  const [favoriteIds, setFavoriteIds] = useState<Record<string, boolean>>({});

  // Carrega favoritos locais do AsyncStorage
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(CORRECT_FAVORITES_CACHE_KEY);
        if (raw) {
          setFavoriteIds(JSON.parse(raw));
        }
      } catch {}
    })();
  }, []);

  const {
    data: questions = [],
    isLoading,
    refetch,
    isRefetching,
    error,
  } = useQuery<CorrectQuestionItem[], Error>({
    queryKey: ['correct-questions', area],
    networkMode: 'offlineFirst',
    queryFn: async () => {
      try {
        const endpoint = area
          ? `/stats/correct?area=${encodeURIComponent(area)}`
          : '/stats/correct';
        const res = await api.get<CorrectQuestionItem[]>(endpoint);
        if (Array.isArray(res)) return res;
        return [];
      } catch {
        // Fallback para /questions/stats caso ocorra falha de rede
        try {
          const statsRes = await api.get<any>('/questions/stats');
          const recents = statsRes?.recentAttempts || [];
          const correctAttempts = recents.filter((a: any) => a.isCorrect);
          return correctAttempts.map((a: any) => ({
            id: a.id,
            questionId: a.question?.id || a.questionId,
            area: a.question?.area || 'Geral',
            subject: a.question?.subject || 'Geral',
            timeSpent: a.timeSpentMs ? `${Math.round(a.timeSpentMs / 1000)}s` : '1m 20s',
            text: a.question?.text || 'Questão do ENEM resolvida com sucesso!',
            correctOption: 'Opção correta confirmada pela TRI.',
            explanation: a.question?.explanation || 'Resolução oficial da questão.',
          }));
        } catch {
          return [];
        }
      }
    },
  });

  const toggleFavorite = async (id: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    const updated = {
      ...favoriteIds,
      [id]: !favoriteIds[id],
    };
    setFavoriteIds(updated);
    try {
      await AsyncStorage.setItem(
        CORRECT_FAVORITES_CACHE_KEY,
        JSON.stringify(updated)
      );
    } catch {}
  };

  const filteredAndSortedQuestions = useMemo(() => {
    const list = questions.map((q) => ({
      ...q,
      isFavorite: Boolean(favoriteIds[q.id]),
    }));

    return list.sort((a, b) => {
      if (a.isFavorite === b.isFavorite) return 0;
      return a.isFavorite ? -1 : 1;
    });
  }, [questions, favoriteIds]);

  const handleShare = async (question: CorrectQuestionItem) => {
    try {
      await Share.share({
        message: `Olha essa questão de ${question.subject} do Minuto ENEM que eu acertei:\n\n"${question.text}"\n\nGabarito: ${question.correctOption}\n\nExplicação: ${question.explanation}`,
        title: `Minuto ENEM - ${question.subject}`,
      });
    } catch {
      Alert.alert('Compartilhar', 'Não foi possível compartilhar a questão.');
    }
  };

  const handleSaveToNotes = (question: CorrectQuestionItem) => {
    router.push({
      pathname: '/notes/new' as any,
      params: {
        title: `Macete: ${question.subject}`,
        content: `Questão: ${question.text}\n\nResposta: ${question.correctOption}\n\nResolução: ${question.explanation}`,
      },
    });
  };

  const pageTitle = area ? `Acertos em ${area}` : 'Todos os Acertos';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <FontAwesome5 name="arrow-left" size={20} color="#2C3A47" />
        </TouchableOpacity>
        <Text style={styles.title}>{pageTitle}</Text>
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
          <Text style={styles.loadingText}>Carregando suas respostas corretas...</Text>
        </View>
      ) : error ? (
        <View style={styles.emptyState}>
          <FontAwesome5
            name="exclamation-circle"
            size={44}
            color="#FF4B4B"
            style={{ marginBottom: 12 }}
          />
          <Text style={styles.emptyText}>{error.message}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => refetch()}
          >
            <Text style={styles.retryButtonText}>Tentar Novamente</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {filteredAndSortedQuestions.length === 0 ? (
            <View style={styles.emptyState}>
              <FontAwesome5
                name="box-open"
                size={48}
                color="#E2E8F0"
                style={{ marginBottom: 16 }}
              />
              <Text style={styles.emptyText}>
                {area
                  ? `Você ainda não possui acertos registrados em ${area}.`
                  : 'Nenhum acerto registrado ainda. Resolva quizzes para acumular acertos!'}
              </Text>
              <TouchableOpacity
                style={styles.startQuizButton}
                onPress={() =>
                  router.push({
                    pathname: '/quiz',
                    params: area ? { area } : {},
                  } as any)
                }
              >
                <FontAwesome5
                  name="play"
                  size={14}
                  color="#FFF"
                  style={{ marginRight: 8 }}
                />
                <Text style={styles.startQuizButtonText}>
                  Praticar Questões Agora
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={styles.pageSubtitle}>
                Revise suas resoluções certas. Suas favoritas ficam fixadas no topo!
              </Text>

              {filteredAndSortedQuestions.map((question) => (
                <View
                  key={question.id}
                  style={[
                    styles.questionCard,
                    question.isFavorite && styles.favoriteHighlight,
                  ]}
                >
                  <View style={styles.cardHeader}>
                    <Text style={styles.subjectText}>
                      {question.area} • {question.subject}
                    </Text>

                    <View style={styles.headerRightActions}>
                      <View style={styles.timeBadge}>
                        <FontAwesome5 name="clock" size={12} color="#58CC02" />
                        <Text style={styles.timeText}>{question.timeSpent}</Text>
                      </View>

                      {/* BOTÃO DE FAVORITAR */}
                      <TouchableOpacity
                        onPress={() => toggleFavorite(question.id)}
                        style={styles.favoriteButton}
                      >
                        <FontAwesome5
                          name="star"
                          solid={question.isFavorite}
                          size={18}
                          color={question.isFavorite ? '#F1C40F' : '#E2E8F0'}
                        />
                      </TouchableOpacity>
                    </View>
                  </View>

                  <Text style={styles.questionText}>{question.text}</Text>

                  <View style={styles.correctOptionBox}>
                    <FontAwesome5
                      name="check-circle"
                      size={16}
                      color="#58CC02"
                      style={{ marginRight: 8 }}
                    />
                    <Text style={styles.correctOptionText}>
                      {question.correctOption}
                    </Text>
                  </View>

                  <View style={styles.explanationBox}>
                    <Text style={styles.explanationTitle}>
                      Resolução Passo a Passo:
                    </Text>
                    <Text style={styles.explanationText}>
                      {question.explanation}
                    </Text>
                  </View>

                  <View style={styles.actionsRow}>
                    <TouchableOpacity
                      style={styles.actionButton}
                      onPress={() => handleSaveToNotes(question)}
                    >
                      <FontAwesome5 name="bookmark" size={14} color="#8CA0B3" />
                      <Text style={styles.actionText}>Salvar no Caderno</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.actionButton}
                      onPress={() => handleShare(question)}
                    >
                      <FontAwesome5 name="share-alt" size={14} color="#1CB0F6" />
                      <Text style={[styles.actionText, { color: '#1CB0F6' }]}>
                        Compartilhar
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
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
  refreshButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  title: { fontSize: 20, fontWeight: 'bold', color: '#2C3A47' },
  scrollContent: { padding: 20, paddingBottom: 40 },
  pageSubtitle: { fontSize: 14, color: '#8CA0B3', marginBottom: 20 },

  centerLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 15,
    fontWeight: 'bold',
    color: '#8CA0B3',
  },

  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 60,
    padding: 20,
  },
  emptyText: {
    fontSize: 16,
    color: '#8CA0B3',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 20,
  },
  startQuizButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#58CC02',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 14,
  },
  startQuizButtonText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  retryButton: {
    backgroundColor: '#1CB0F6',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  retryButtonText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 13,
  },

  questionCard: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  favoriteHighlight: { borderColor: '#F1C40F', borderWidth: 2 },

  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  subjectText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#8CA0B3',
    textTransform: 'uppercase',
    flex: 1,
  },
  headerRightActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  timeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#DCFCE7',
  },
  timeText: { fontSize: 12, fontWeight: 'bold', color: '#3A8A00' },
  favoriteButton: { padding: 4 },

  questionText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2C3A47',
    marginBottom: 16,
    lineHeight: 22,
  },
  correctOptionBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#58CC02',
    marginBottom: 16,
  },
  correctOptionText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#3A8A00',
    flex: 1,
  },
  explanationBox: {
    backgroundColor: '#F8FAFC',
    padding: 16,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#1CB0F6',
    marginBottom: 20,
  },
  explanationTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1CB0F6',
    marginBottom: 6,
  },
  explanationText: { fontSize: 14, color: '#4B5563', lineHeight: 20 },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderColor: '#E2E8F0',
    paddingTop: 16,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  actionText: { fontSize: 14, fontWeight: 'bold', color: '#8CA0B3' },
});

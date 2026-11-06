import React, { useEffect, useState, useMemo, useCallback } from "react";
import {
  ActivityIndicator,
  Animated,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { FontAwesome5 } from "@expo/vector-icons";
import { safeAsyncStorage as AsyncStorage } from "@/services/safeStorage";
import { api } from "@/services/api";
import { useUserStore } from "@/store/useUserStore";

const COMPLETED_LESSONS_STORAGE_KEY = "@minuto_enem:completed_lessons";

interface TopicItem {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  subjectId: string;
  questionsCount: number;
  systemLessons?: any[];
  teacherMaterials?: any[];
  extraMaterials?: any[];
  lessons?: any[];
}

export default function SubjectScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId } = useUserStore();

  const [subject, setSubject] = useState<any>(null);
  const [topics, setTopics] = useState<TopicItem[]>([]);
  const [completedLessonIds, setCompletedLessonIds] = useState<string[]>([]);
  const [expandedTopicIds, setExpandedTopicIds] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Carrega lições concluídas localmente
  const loadCompletedLessons = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(COMPLETED_LESSONS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setCompletedLessonIds(parsed);
        }
      }
    } catch {}
  }, []);

  const fetchSubject = useCallback(async (isRefresh = false) => {
    if (!id) return;
    if (!isRefresh) setIsLoading(true);
    setError(null);
    const cacheKey = `@minuto_enem:subject_contents_v2_${id}`;

    try {
      let data: any = null;

      // 1. Tenta buscar rota enriquecida de tópicos, aulas e contagem exata de questões
      try {
        data = await api.get<any>(`/subjects/${id}/contents`);
      } catch {
        // Fallback para rota padrão de matéria
        try {
          data = await api.get<any>(`/subjects/${id}`);
        } catch {
          const allSubjects = await api.get<any[]>("/subjects");
          data = allSubjects.find(
            (sub: any) => sub.id === id || sub.slug === id
          );
        }
      }

      if (data) {
        setSubject(data.subject || data);

        // Normalização dos tópicos com contagem de questões e lições
        let rawTopics: any[] = [];
        if (Array.isArray(data.topics) && data.topics.length > 0) {
          rawTopics = data.topics;
        } else if (Array.isArray(data.subject?.topics) && data.subject.topics.length > 0) {
          rawTopics = data.subject.topics;
        }

        const allLessons = Array.isArray(data.systemLessons)
          ? data.systemLessons
          : Array.isArray(data.lessons)
          ? data.lessons
          : [];

        const extraMaterials = Array.isArray(data.teacherMaterials)
          ? data.teacherMaterials
          : Array.isArray(data.extraMaterials)
          ? data.extraMaterials
          : [];

        // Se o backend retornou tópicos, mapeia as lições correspondentes a cada um
        if (rawTopics.length > 0) {
          const enriched = rawTopics.map((top: any) => {
            const topicSystemLessons =
              Array.isArray(top.systemLessons) && top.systemLessons.length > 0
                ? top.systemLessons
                : allLessons.filter((l: any) => l.topicId === top.id);

            const topicTeacherMaterials =
              Array.isArray(top.teacherMaterials) && top.teacherMaterials.length > 0
                ? top.teacherMaterials
                : Array.isArray(top.extraMaterials) && top.extraMaterials.length > 0
                ? top.extraMaterials
                : extraMaterials.filter((m: any) => m.topicId === top.id);

            const combinedLessons = [
              ...topicSystemLessons,
              ...topicTeacherMaterials,
            ];

            const questionsCount =
              top.questionsCount !== undefined
                ? Number(top.questionsCount)
                : top._count?.questions !== undefined
                ? Number(top._count.questions)
                : 0;

            return {
              id: top.id,
              name: top.name,
              slug: top.slug,
              description: top.description,
              subjectId: top.subjectId || data.id,
              questionsCount,
              systemLessons: topicSystemLessons,
              teacherMaterials: topicTeacherMaterials,
              extraMaterials: topicTeacherMaterials,
              lessons: combinedLessons,
            };
          });

          setTopics(enriched);
          // Expande o primeiro tópico por padrão para incentivar a navegação
          if (enriched[0]?.id) {
            setExpandedTopicIds((prev) => ({ ...prev, [enriched[0].id]: true }));
          }
        } else if (allLessons.length > 0) {
          // Fallback quando não há modelo de Topic gerado
          const virtualTopic: TopicItem = {
            id: `topic_${data.id || id}`,
            name: `Conteúdos Gerais de ${data.name || "Matéria"}`,
            slug: data.slug || "geral",
            subjectId: data.id || id,
            questionsCount: data.totalQuestions || allLessons.length * 5,
            systemLessons: allLessons,
            lessons: allLessons,
          };
          setTopics([virtualTopic]);
          setExpandedTopicIds({ [virtualTopic.id]: true });
        } else {
          setTopics([]);
        }

        await AsyncStorage.setItem(cacheKey, JSON.stringify(data));
      } else {
        throw new Error("Matéria não encontrada.");
      }
    } catch (err: any) {
      try {
        const cached = await AsyncStorage.getItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          setSubject(parsed.subject || parsed);
          if (Array.isArray(parsed.topics)) {
            setTopics(parsed.topics);
          }
          return;
        }
      } catch {}
      setError("Não foi possível carregar os tópicos e conteúdos desta matéria.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [id]);

  useEffect(() => {
    fetchSubject();
    loadCompletedLessons();
  }, [fetchSubject, loadCompletedLessons]);

  const onRefresh = useCallback(() => {
    setIsRefreshing(true);
    fetchSubject(true);
    loadCompletedLessons();
  }, [fetchSubject, loadCompletedLessons]);

  const toggleTopicExpand = (topicId: string) => {
    setExpandedTopicIds((prev) => ({
      ...prev,
      [topicId]: !prev[topicId],
    }));
  };

  // Cálculo de progresso geral e por tópico
  const { overallProgress, totalQuestionsSum } = useMemo(() => {
    if (topics.length === 0) return { overallProgress: 0, totalQuestionsSum: 0 };

    let totalLessonsAll = 0;
    let completedLessonsAll = 0;
    let totalQ = 0;

    topics.forEach((t) => {
      const tLessons = t.lessons || t.systemLessons || [];
      totalLessonsAll += tLessons.length;
      completedLessonsAll += tLessons.filter((l: any) =>
        completedLessonIds.includes(l.id)
      ).length;
      totalQ += t.questionsCount || 0;
    });

    const progress =
      totalLessonsAll > 0
        ? Math.round((completedLessonsAll / totalLessonsAll) * 100)
        : 0;

    return { overallProgress: progress, totalQuestionsSum: totalQ };
  }, [topics, completedLessonIds]);

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, styles.centerAll]}>
        <ActivityIndicator size="large" color="#1CB0F6" />
        <Text style={styles.loadingText}>Carregando tópicos e questões...</Text>
      </SafeAreaView>
    );
  }

  if (error || !subject) {
    return (
      <SafeAreaView style={[styles.container, styles.centerAll]}>
        <FontAwesome5
          name="exclamation-triangle"
          size={40}
          color="#FF4B4B"
          style={{ marginBottom: 16 }}
        />
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity
          style={styles.retryButton}
          onPress={() => router.back()}
        >
          <Text style={styles.retryText}>Voltar</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* 1. CABEÇALHO */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <FontAwesome5 name="arrow-left" size={20} color="#2C3A47" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {subject.name}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            colors={["#1CB0F6"]}
          />
        }
      >
        {/* 2. CARD DE APRESENTAÇÃO DA MATÉRIA COM PROGRESSO GERAL */}
        <View style={styles.introBox}>
          <View style={styles.iconCircle}>
            <FontAwesome5
              name={subject.icon || "book"}
              size={28}
              color="#FFF"
            />
          </View>
          <Text style={styles.introTitle}>{subject.name}</Text>
          <Text style={styles.introDesc}>
            Aulas teóricas e questões do ENEM organizadas por tópicos essenciais.
          </Text>

          {/* ESTATÍSTICAS RÁPIDAS */}
          <View style={styles.statsRow}>
            <View style={styles.statChip}>
              <FontAwesome5 name="layer-group" size={13} color="#0369A1" />
              <Text style={styles.statChipText}>
                {topics.length} {topics.length === 1 ? "tópico" : "tópicos"}
              </Text>
            </View>
            <View style={styles.statChip}>
              <FontAwesome5 name="dumbbell" size={13} color="#059669" />
              <Text style={styles.statChipText}>
                {totalQuestionsSum} questões
              </Text>
            </View>
          </View>

          {/* BARRA DE PROGRESSO DO ALUNO NA MATÉRIA */}
          <View style={styles.overallProgressContainer}>
            <View style={styles.progressLabelRow}>
              <Text style={styles.progressLabelText}>Seu avanço na disciplina</Text>
              <Text style={styles.progressPercentText}>{overallProgress}%</Text>
            </View>
            <View style={styles.progressBarBg}>
              <View
                style={[
                  styles.progressBarFill,
                  { width: `${overallProgress}%` },
                ]}
              />
            </View>
          </View>
        </View>

        {/* 3. LISTAGEM DE TÓPICOS REAIS VINDOS DO BACK-END */}
        <View style={styles.topicsHeaderRow}>
          <Text style={styles.sectionHeaderTitle}>Tópicos e Aulas</Text>
          <Text style={styles.sectionHeaderSubtitle}>
            Toque para abrir aulas ou praticar
          </Text>
        </View>

        <View style={styles.topicsContainer}>
          {topics.length > 0 ? (
            topics.map((topic, index) => {
              const topicLessons = topic.lessons || topic.systemLessons || [];
              const completedCount = topicLessons.filter((l: any) =>
                completedLessonIds.includes(l.id)
              ).length;

              const topicProgress =
                topicLessons.length > 0
                  ? Math.round((completedCount / topicLessons.length) * 100)
                  : 0;

              const isCompleted =
                topicLessons.length > 0 && completedCount === topicLessons.length;
              const isExpanded = Boolean(expandedTopicIds[topic.id]);

              return (
                <View key={topic.id} style={styles.topicCard}>
                  {/* CABEÇALHO DO TÓPICO */}
                  <TouchableOpacity
                    style={styles.topicCardHeader}
                    activeOpacity={0.8}
                    onPress={() => toggleTopicExpand(topic.id)}
                  >
                    <View style={styles.topicIndexBadge}>
                      <Text style={styles.topicIndexText}>{index + 1}</Text>
                    </View>

                    <View style={styles.topicInfoCol}>
                      <View style={styles.topicTopRow}>
                        <Text style={styles.topicName} numberOfLines={2}>
                          {topic.name}
                        </Text>
                      </View>

                      {topic.description ? (
                        <Text style={styles.topicDesc} numberOfLines={2}>
                          {topic.description}
                        </Text>
                      ) : null}

                      {/* BADGES DO TÓPICO: QUESTÕES E AULAS */}
                      <View style={styles.topicMetaRow}>
                        <View style={styles.topicQuestionsBadge}>
                          <FontAwesome5 name="dumbbell" size={11} color="#0284C7" />
                          <Text style={styles.topicQuestionsText}>
                            {topic.questionsCount}{" "}
                            {topic.questionsCount === 1 ? "questão" : "questões"}
                          </Text>
                        </View>

                        <View style={styles.topicLessonsBadge}>
                          <FontAwesome5 name="book-reader" size={11} color="#475569" />
                          <Text style={styles.topicLessonsText}>
                            {topicLessons.length}{" "}
                            {topicLessons.length === 1 ? "aula" : "aulas"}
                          </Text>
                        </View>

                        {isCompleted && (
                          <View style={styles.completedBadge}>
                            <FontAwesome5 name="check" size={10} color="#059669" />
                            <Text style={styles.completedBadgeText}>Concluído</Text>
                          </View>
                        )}
                      </View>

                      {/* BARRA DE PROGRESSO DO TÓPICO */}
                      <View style={styles.topicProgressWrapper}>
                        <View style={styles.topicProgressBarBg}>
                          <View
                            style={[
                              styles.topicProgressBarFill,
                              {
                                width: `${topicProgress}%`,
                                backgroundColor: isCompleted ? "#10B981" : "#1CB0F6",
                              },
                            ]}
                          />
                        </View>
                        <Text style={styles.topicProgressPercentText}>
                          {topicProgress}%
                        </Text>
                      </View>
                    </View>

                    <FontAwesome5
                      name={isExpanded ? "chevron-up" : "chevron-down"}
                      size={14}
                      color="#94A3B8"
                      style={{ marginLeft: 8 }}
                    />
                  </TouchableOpacity>

                  {/* AÇÕES E LIÇÕES EXPANDIDAS */}
                  {isExpanded && (
                    <View style={styles.topicExpandedBody}>
                      {/* BOTÃO RÁPIDO: PRATICAR ESTE TÓPICO AGORA */}
                      <TouchableOpacity
                        style={styles.topicPracticeButton}
                        activeOpacity={0.8}
                        onPress={() => {
                          router.push({
                            pathname: "/quiz",
                            params: {
                              mode: "pratica",
                              subjectId: subject.id,
                              topicId: topic.id,
                              subject: subject.name,
                              topic: topic.name,
                              limit: 10,
                            },
                          });
                        }}
                      >
                        <FontAwesome5 name="play" size={14} color="#FFF" />
                        <Text style={styles.topicPracticeButtonText}>
                          Praticar {topic.questionsCount} questões deste tópico
                        </Text>
                      </TouchableOpacity>

                      {/* LISTA DE LIÇÕES / MATERIAIS DESTE TÓPICO */}
                      {topicLessons.length > 0 ? (
                        <View style={styles.topicLessonsList}>
                          <Text style={styles.topicLessonsListTitle}>
                            Conteúdos teóricos:
                          </Text>

                          {topicLessons.map((lesson: any) => {
                            const isLessonDone = completedLessonIds.includes(
                              lesson.id
                            );
                            const isTeacherExtra = Boolean(lesson.classroomId);

                            const materialType =
                              lesson.type ||
                              (lesson.youtubeUrl ||
                              (lesson.videos && lesson.videos.length > 0)
                                ? "VIDEO"
                                : "ARTICLE");

                            return (
                              <TouchableOpacity
                                key={lesson.id}
                                style={[
                                  styles.lessonRowCard,
                                  isLessonDone && styles.lessonRowCardCompleted,
                                ]}
                                activeOpacity={0.7}
                                onPress={() =>
                                  router.push(`/subject/lesson/${lesson.id}`)
                                }
                              >
                                <View
                                  style={[
                                    styles.lessonStatusIcon,
                                    isLessonDone && styles.lessonStatusIconDone,
                                  ]}
                                >
                                  <FontAwesome5
                                    name={
                                      isLessonDone
                                        ? "check"
                                        : materialType === "VIDEO"
                                        ? "play"
                                        : materialType === "PDF"
                                        ? "file-pdf"
                                        : "book-open"
                                    }
                                    size={12}
                                    color={isLessonDone ? "#FFF" : "#0284C7"}
                                  />
                                </View>

                                <View style={{ flex: 1 }}>
                                  <View style={styles.lessonMetaTagRow}>
                                    {isTeacherExtra ? (
                                      <Text style={styles.teacherExtraTag}>
                                        Professor da Turma
                                      </Text>
                                    ) : null}
                                    <Text style={styles.lessonTypeTag}>
                                      {materialType}
                                    </Text>
                                  </View>
                                  <Text
                                    style={[
                                      styles.lessonRowTitle,
                                      isLessonDone && styles.lessonRowTitleDone,
                                    ]}
                                    numberOfLines={2}
                                  >
                                    {lesson.title}
                                  </Text>
                                </View>

                                <FontAwesome5
                                  name="chevron-right"
                                  size={13}
                                  color="#CBD5E1"
                                />
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      ) : null}
                    </View>
                  )}
                </View>
              );
            })
          ) : (
            <View style={styles.emptyContainer}>
              <FontAwesome5 name="book-open" size={32} color="#CBD5E1" />
              <Text style={styles.emptyText}>
                Nenhum tópico cadastrado para esta matéria no momento.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F7F9FC" },
  centerAll: { justifyContent: "center", alignItems: "center", padding: 20 },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: "#8CA0B3",
    fontWeight: "bold",
  },
  errorText: {
    fontSize: 16,
    color: "#4B5563",
    textAlign: "center",
    marginBottom: 24,
    lineHeight: 24,
  },
  retryButton: {
    backgroundColor: "#2C3A47",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  retryText: { color: "#FFF", fontWeight: "bold", fontSize: 16 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 16,
    backgroundColor: "#FFF",
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  backButton: { width: 40, height: 40, justifyContent: "center" },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 18,
    fontWeight: "bold",
    color: "#2C3A47",
  },

  scrollContent: { padding: 18, paddingBottom: 40 },

  introBox: {
    alignItems: "center",
    marginBottom: 24,
    backgroundColor: "#FFF",
    padding: 22,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#1CB0F6",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 14,
  },
  introTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: "#2C3A47",
    marginBottom: 6,
    textAlign: "center",
  },
  introDesc: {
    fontSize: 14,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 16,
  },

  statsRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 18,
  },
  statChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  statChipText: {
    fontSize: 13,
    fontWeight: "bold",
    color: "#334155",
  },

  overallProgressContainer: {
    width: "100%",
    backgroundColor: "#F8FAFC",
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  progressLabelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  progressLabelText: {
    fontSize: 13,
    fontWeight: "bold",
    color: "#475569",
  },
  progressPercentText: {
    fontSize: 13,
    fontWeight: "900",
    color: "#0284C7",
  },
  progressBarBg: {
    height: 8,
    backgroundColor: "#E2E8F0",
    borderRadius: 4,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: "#0284C7",
    borderRadius: 4,
  },

  topicsHeaderRow: {
    marginBottom: 14,
    paddingHorizontal: 4,
  },
  sectionHeaderTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#1E293B",
  },
  sectionHeaderSubtitle: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 2,
  },

  topicsContainer: { gap: 14 },

  topicCard: {
    backgroundColor: "#FFF",
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2,
  },
  topicCardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 16,
  },
  topicIndexBadge: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
    marginTop: 2,
  },
  topicIndexText: {
    fontSize: 15,
    fontWeight: "900",
    color: "#64748B",
  },
  topicInfoCol: { flex: 1 },
  topicTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  topicName: {
    fontSize: 16,
    fontWeight: "800",
    color: "#1E293B",
    lineHeight: 22,
  },
  topicDesc: {
    fontSize: 13,
    color: "#64748B",
    lineHeight: 18,
    marginBottom: 8,
  },

  topicMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 10,
    marginTop: 4,
  },
  topicQuestionsBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#E0F2FE",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  topicQuestionsText: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#0369A1",
  },
  topicLessonsBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  topicLessonsText: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#475569",
  },
  completedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#D1FAE5",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  completedBadgeText: {
    fontSize: 11,
    fontWeight: "900",
    color: "#059669",
    textTransform: "uppercase",
  },

  topicProgressWrapper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  topicProgressBarBg: {
    flex: 1,
    height: 6,
    backgroundColor: "#F1F5F9",
    borderRadius: 3,
    overflow: "hidden",
  },
  topicProgressBarFill: {
    height: "100%",
    borderRadius: 3,
  },
  topicProgressPercentText: {
    fontSize: 11,
    fontWeight: "bold",
    color: "#64748B",
  },

  topicExpandedBody: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    backgroundColor: "#FAFAFA",
  },
  topicPracticeButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#0284C7",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    marginVertical: 10,
    shadowColor: "#0284C7",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  topicPracticeButtonText: {
    color: "#FFF",
    fontSize: 14,
    fontWeight: "bold",
  },

  topicLessonsList: {
    marginTop: 6,
    gap: 8,
  },
  topicLessonsListTitle: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#64748B",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  lessonRowCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF",
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    gap: 12,
  },
  lessonRowCardCompleted: {
    borderColor: "#A7F3D0",
    backgroundColor: "#F0FDF4",
  },
  lessonStatusIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#E0F2FE",
    justifyContent: "center",
    alignItems: "center",
  },
  lessonStatusIconDone: {
    backgroundColor: "#10B981",
  },
  lessonMetaTagRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 3,
  },
  teacherExtraTag: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#7C3AED",
    backgroundColor: "#EDE9FE",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  lessonTypeTag: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#0369A1",
    backgroundColor: "#E0F2FE",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  lessonRowTitle: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#334155",
    lineHeight: 18,
  },
  lessonRowTitleDone: {
    color: "#065F46",
  },

  emptyContainer: {
    alignItems: "center",
    padding: 32,
    backgroundColor: "#FFF",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    color: "#94A3B8",
    textAlign: "center",
  },
});

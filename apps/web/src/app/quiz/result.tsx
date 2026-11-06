import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { FontAwesome5 } from "@expo/vector-icons";
import { api } from "@/services/api";
import { useUserStore } from "@/store/useUserStore";
import { QuizHeader } from "@/components/QuizHeader";
import { OptionButton } from "@/components/OptionButton";
import { useQuestionsQuery } from "@/hooks/useQuestionsQuery";

const OPTION_LETTERS = ["A", "B", "C", "D", "E"];

export default function ResultScreen() {
  const router = useRouter();
  const { xp, currentStreak, lastQuizSession } = useUserStore();
  const {
    pendingSyncCount,
    isSyncing,
    syncPendingResults,
    refreshQueueCount,
  } = useQuestionsQuery();

  const [lastSyncedCount, setLastSyncedCount] = useState(0);
  const [triScore, setTriScore] = useState<number | null>(null);
  const [isCalculatingTri, setIsCalculatingTri] = useState(false);
  const [expandedQuestionId, setExpandedQuestionId] = useState<string | null>(
    null
  );

  const totalQuestions = lastQuizSession?.totalQuestions || 10;
  const correctCount = lastQuizSession?.correctAnswers || 0;
  const accuracyRate =
    totalQuestions > 0
      ? Math.round((correctCount / totalQuestions) * 100)
      : 0;
  const sessionXp = lastQuizSession?.xpEarned || correctCount * 50;

  // 1. Simulação da Nota TRI real vinda do servidor
  useEffect(() => {
    async function calculateServerTri() {
      if (
        !lastQuizSession?.answers ||
        lastQuizSession.answers.length === 0
      ) {
        // Estimativa padrão baseada na acurácia caso não haja lista detalhada
        setTriScore(Math.round(350 + accuracyRate * 5.5));
        return;
      }

      setIsCalculatingTri(true);
      try {
        const payload = lastQuizSession.answers.map((a) => ({
          questionId: a.questionId,
          selectedAnswer: a.selectedAnswer,
          isCorrect: a.isCorrect,
        }));

        const res = await api.post<any>("/tri/simulate", { answers: payload });
        if (res?.triScore) {
          setTriScore(res.triScore);
        } else {
          setTriScore(Math.round(350 + accuracyRate * 5.5));
        }
      } catch {
        // Fallback psicométrico local offline
        setTriScore(Math.round(350 + accuracyRate * 5.5));
      } finally {
        setIsCalculatingTri(false);
      }
    }

    calculateServerTri();
  }, [lastQuizSession, accuracyRate]);

  // 2. Sincronização offline-first
  useEffect(() => {
    let mounted = true;
    const triggerSync = async () => {
      await refreshQueueCount();
      const res = await syncPendingResults();
      if (mounted && res.syncedCount > 0) {
        setLastSyncedCount((prev) => prev + res.syncedCount);
      }
    };

    triggerSync();

    return () => {
      mounted = false;
    };
  }, [refreshQueueCount, syncPendingResults]);

  const handleManualSync = async () => {
    const res = await syncPendingResults();
    if (res.syncedCount > 0) {
      setLastSyncedCount((prev) => prev + res.syncedCount);
    }
  };

  const toggleExpand = (qId: string) => {
    setExpandedQuestionId((prev) => (prev === qId ? null : qId));
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* 1. QUIZ HEADER COMPONENTE OFICIAL (100% CONCLUÍDO) */}
      <View style={styles.headerWrapper}>
        <QuizHeader progress={1.0} streak={currentStreak} xp={xp} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.trophyHero}>
          <FontAwesome5
            name="trophy"
            size={68}
            color="#F1C40F"
            style={styles.icon}
          />
          <Text style={styles.title}>Sessão Finalizada!</Text>
          <Text style={styles.subtitle}>
            Excelente dedicação! Seus resultados foram registrados com sucesso.
          </Text>
        </View>

        {/* 2. PLACAR DE DESEMPENHO E NOTA TRI */}
        <View style={styles.metricsGrid}>
          {/* Card da Nota TRI */}
          <View style={[styles.metricCard, styles.triCard]}>
            <View style={styles.metricHeader}>
              <FontAwesome5 name="chart-line" size={16} color="#1CB0F6" />
              <Text style={styles.metricCardTitle}>Nota TRI Estimada</Text>
            </View>
            {isCalculatingTri ? (
              <ActivityIndicator size="small" color="#1CB0F6" />
            ) : (
              <Text style={styles.triValue}>
                {triScore !== null ? triScore : "---"}
              </Text>
            )}
            <Text style={styles.metricCardSub}>Escala ENEM (300 a 1000)</Text>
          </View>

          {/* Card de Acertos */}
          <View style={styles.metricCard}>
            <View style={styles.metricHeader}>
              <FontAwesome5 name="check-circle" size={16} color="#58CC02" />
              <Text style={styles.metricCardTitle}>Acertos</Text>
            </View>
            <Text style={styles.metricValue}>
              {correctCount}/{totalQuestions}
            </Text>
            <Text style={styles.metricCardSub}>{accuracyRate}% de precisão</Text>
          </View>

          {/* Card de XP Ganho */}
          <View style={styles.metricCard}>
            <View style={styles.metricHeader}>
              <FontAwesome5 name="star" size={16} color="#F1C40F" solid />
              <Text style={styles.metricCardTitle}>XP Ganho</Text>
            </View>
            <Text style={[styles.metricValue, { color: "#D4A017" }]}>
              +{sessionXp}
            </Text>
            <Text style={styles.metricCardSub}>Pontos adicionados</Text>
          </View>
        </View>

        {/* STATUS DE SINCRONIZAÇÃO OFFLINE-FIRST */}
        {isSyncing ? (
          <View style={[styles.syncCard, styles.syncCardLoading]}>
            <ActivityIndicator size="small" color="#1CB0F6" />
            <Text style={styles.syncTextLoading}>
              Sincronizando respostas offline com o banco de dados...
            </Text>
          </View>
        ) : pendingSyncCount > 0 ? (
          <View style={[styles.syncCard, styles.syncCardPending]}>
            <View style={styles.syncPendingHeader}>
              <FontAwesome5 name="cloud-upload-alt" size={18} color="#D97706" />
              <Text style={styles.syncTitlePending}>
                {pendingSyncCount} resposta(s) aguardando conexão
              </Text>
            </View>
            <Text style={styles.syncDescriptionPending}>
              Seus pontos estão salvos no aparelho e serão sincronizados
              assim que a internet for restabelecida.
            </Text>
            <TouchableOpacity
              style={styles.retrySyncButton}
              onPress={handleManualSync}
              activeOpacity={0.8}
            >
              <FontAwesome5 name="sync-alt" size={12} color="#FFF" />
              <Text style={styles.retrySyncButtonText}>
                Sincronizar Agora
              </Text>
            </TouchableOpacity>
          </View>
        ) : lastSyncedCount > 0 ? (
          <View style={[styles.syncCard, styles.syncCardSuccess]}>
            <FontAwesome5 name="check-circle" size={18} color="#58CC02" />
            <Text style={styles.syncTextSuccess}>
              {lastSyncedCount} resposta(s) offline sincronizada(s) com sucesso!
            </Text>
          </View>
        ) : null}

        {/* 3. REVISÃO DO GABARITO OFICIAL USANDO OptionButton */}
        {lastQuizSession?.answers && lastQuizSession.answers.length > 0 && (
          <View style={styles.reviewSection}>
            <Text style={styles.reviewSectionTitle}>
              Gabarito Oficial e Revisão
            </Text>
            <Text style={styles.reviewSectionSub}>
              Toque em uma questão para rever as alternativas e a explicação
              pedagógica:
            </Text>

            {lastQuizSession.answers.map((item, idx) => {
              const isExpanded = expandedQuestionId === item.questionId;

              return (
                <View key={item.questionId || idx} style={styles.reviewCard}>
                  <TouchableOpacity
                    style={styles.reviewCardHeader}
                    activeOpacity={0.7}
                    onPress={() => toggleExpand(item.questionId)}
                  >
                    <View
                      style={[
                        styles.reviewStatusIcon,
                        item.isCorrect
                          ? styles.statusCorrect
                          : styles.statusWrong,
                      ]}
                    >
                      <FontAwesome5
                        name={item.isCorrect ? "check" : "times"}
                        size={12}
                        color="#FFF"
                      />
                    </View>

                    <Text style={styles.reviewQuestionLabel}>
                      Questão {idx + 1}
                    </Text>

                    <Text
                      style={[
                        styles.reviewAnswerBadge,
                        item.isCorrect
                          ? { color: "#15803D" }
                          : { color: "#B91C1C" },
                      ]}
                    >
                      {item.isCorrect
                        ? "Acertou"
                        : `Marcou ${OPTION_LETTERS[item.selectedAnswer] || "?"} • Correta: ${OPTION_LETTERS[item.correctAnswer] || "?"}`}
                    </Text>

                    <FontAwesome5
                      name={isExpanded ? "chevron-up" : "chevron-down"}
                      size={12}
                      color="#8CA0B3"
                    />
                  </TouchableOpacity>

                  {/* Detalhes Expandidos da Questão */}
                  {isExpanded && (
                    <View style={styles.reviewCardBody}>
                      <Text style={styles.reviewQuestionText}>
                        {item.text}
                      </Text>

                      {/* Alternativas renderizadas com OptionButton */}
                      <View style={{ marginVertical: 12 }}>
                        {item.options.map((opt, optIdx) => (
                          <OptionButton
                            key={optIdx}
                            label={OPTION_LETTERS[optIdx] || String(optIdx + 1)}
                            text={opt}
                            isSelected={optIdx === item.selectedAnswer}
                            isAnswered={true}
                            isCorrectOption={optIdx === item.correctAnswer}
                            onPress={() => {}}
                          />
                        ))}
                      </View>

                      {/* Explicação Pedagógica Oficial do Servidor */}
                      {item.explanation ? (
                        <View style={styles.explanationBox}>
                          <View style={styles.explanationHeader}>
                            <FontAwesome5
                              name="lightbulb"
                              size={14}
                              color="#D97706"
                            />
                            <Text style={styles.explanationTitle}>
                              Resolução Comentada
                            </Text>
                          </View>
                          <Text style={styles.explanationText}>
                            {item.explanation}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* FOOTER COM BOTÕES DE AÇÃO */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.retryPracticeButton}
          onPress={() => router.replace("/quiz" as any)}
          activeOpacity={0.8}
        >
          <FontAwesome5 name="redo-alt" size={16} color="#1CB0F6" />
          <Text style={styles.retryPracticeText}>Treinar Novamente</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.mainButton}
          onPress={() => router.replace("/")}
          activeOpacity={0.8}
        >
          <Text style={styles.mainButtonText}>Voltar ao Início</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F7F9FC",
  },
  headerWrapper: {
    backgroundColor: "#FFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  trophyHero: {
    alignItems: "center",
    marginVertical: 16,
  },
  icon: {
    marginBottom: 16,
  },
  title: {
    fontSize: 26,
    fontWeight: "900",
    color: "#2C3A47",
    marginBottom: 6,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 14,
    color: "#8CA0B3",
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 16,
  },

  metricsGrid: {
    flexDirection: "row",
    gap: 12,
    marginVertical: 20,
  },
  metricCard: {
    flex: 1,
    backgroundColor: "#FFF",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center",
  },
  triCard: {
    borderColor: "#BAE6FD",
    backgroundColor: "#F0F9FF",
  },
  metricHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  metricCardTitle: {
    fontSize: 11,
    fontWeight: "bold",
    color: "#64748B",
    textTransform: "uppercase",
  },
  triValue: {
    fontSize: 26,
    fontWeight: "900",
    color: "#0369A1",
  },
  metricValue: {
    fontSize: 22,
    fontWeight: "900",
    color: "#2C3A47",
  },
  metricCardSub: {
    fontSize: 10,
    color: "#94A3B8",
    marginTop: 4,
    fontWeight: "bold",
  },

  syncCard: {
    width: "100%",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    marginBottom: 20,
  },
  syncCardLoading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#F0F9FF",
    borderColor: "#BAE6FD",
  },
  syncTextLoading: {
    flex: 1,
    fontSize: 12,
    fontWeight: "bold",
    color: "#0284C7",
  },
  syncCardPending: {
    backgroundColor: "#FFFBEB",
    borderColor: "#FDE68A",
  },
  syncPendingHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 6,
  },
  syncTitlePending: {
    fontSize: 13,
    fontWeight: "bold",
    color: "#B45309",
  },
  syncDescriptionPending: {
    fontSize: 12,
    color: "#92400E",
    lineHeight: 18,
    marginBottom: 10,
  },
  retrySyncButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#D97706",
    paddingVertical: 8,
    borderRadius: 8,
  },
  retrySyncButtonText: {
    color: "#FFF",
    fontSize: 12,
    fontWeight: "bold",
  },
  syncCardSuccess: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#F0FDF4",
    borderColor: "#BBF7D0",
  },
  syncTextSuccess: {
    flex: 1,
    fontSize: 12,
    fontWeight: "bold",
    color: "#15803D",
  },

  reviewSection: {
    marginTop: 10,
  },
  reviewSectionTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#2C3A47",
    marginBottom: 4,
  },
  reviewSectionSub: {
    fontSize: 13,
    color: "#8CA0B3",
    marginBottom: 14,
  },
  reviewCard: {
    backgroundColor: "#FFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 10,
    overflow: "hidden",
  },
  reviewCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 10,
  },
  reviewStatusIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: "center",
    alignItems: "center",
  },
  statusCorrect: {
    backgroundColor: "#58CC02",
  },
  statusWrong: {
    backgroundColor: "#FF4B4B",
  },
  reviewQuestionLabel: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#2C3A47",
  },
  reviewAnswerBadge: {
    flex: 1,
    fontSize: 12,
    fontWeight: "bold",
  },
  reviewCardBody: {
    padding: 14,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
  },
  reviewQuestionText: {
    fontSize: 14,
    color: "#475569",
    lineHeight: 22,
    marginBottom: 10,
  },
  explanationBox: {
    backgroundColor: "#FFFBEB",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#FDE68A",
    marginTop: 8,
  },
  explanationHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  explanationTitle: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#B45309",
    textTransform: "uppercase",
  },
  explanationText: {
    fontSize: 13,
    color: "#78350F",
    lineHeight: 20,
  },

  footer: {
    flexDirection: "row",
    gap: 12,
    padding: 16,
    backgroundColor: "#FFF",
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
  },
  retryPracticeButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#F0F9FF",
    borderWidth: 1,
    borderColor: "#BAE6FD",
    borderRadius: 14,
    paddingVertical: 14,
  },
  retryPracticeText: {
    color: "#0284C7",
    fontSize: 15,
    fontWeight: "bold",
  },
  mainButton: {
    flex: 1,
    backgroundColor: "#1CB0F6",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#1CB0F6",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 3,
  },
  mainButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "bold",
    textTransform: "uppercase",
  },
});

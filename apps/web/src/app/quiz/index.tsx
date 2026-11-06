import React, { useEffect, useState, useRef } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Markdown from "react-native-markdown-display";
import { SafeAreaView } from "react-native-safe-area-context";
import { FontAwesome5 } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/services/api";
import { useUserStore } from "@/store/useUserStore";
import { QuizHeader } from "@/components/QuizHeader";
import { OptionButton } from "@/components/OptionButton";
import { useQuestionsQuery, QuizQuestion } from "@/hooks/useQuestionsQuery";
import { isDeviceOnline } from "@/services/network";
import {
  enqueueSyncItem,
  saveQuestionsLocal,
  getTaskByIdLocal,
  getQuestionsByTaskIdLocal,
} from "@/database/schema";

const { width, height } = Dimensions.get("window");
const OPTION_LETTERS = ["A", "B", "C", "D", "E"];

export default function QuizScreen() {
  const router = useRouter();
  const {
    userId,
    xp,
    currentStreak,
    addXp,
    incrementAnsweredQuestions,
    completeQuestionStreakUpdate,
    setLastQuizSession,
  } = useUserStore();

  const params = useLocalSearchParams();
  const day = params.day as string | undefined;
  const difficulty = params.difficulty as string | undefined;
  const subject = params.subject as string | undefined;
  const subjectId = params.subjectId as string | undefined;
  const topic = params.topic as string | undefined;
  const topicId = params.topicId as string | undefined;
  const lessonId = params.lessonId as string | undefined;
  const taskId = params.taskId as string | undefined;

  const parsedLimit = params.limit ? Number(params.limit) : 10;
  const initialTimeInSeconds = params.time
    ? Number(params.time) * 60
    : parsedLimit * 180;

  // Busca detalhes da tarefa caso o quiz tenha sido aberto a partir de uma atividade da turma
  const { data: taskData, isLoading: isLoadingTask } = useQuery({
    queryKey: ['task-quiz-detail', taskId],
    queryFn: async () => {
      if (!taskId) return null;
      try {
        const res = await api.get<any>(`/tasks/${taskId}`);
        if (res) {
          const qsToSave = [
            ...(Array.isArray(res.questions) ? res.questions : []),
            ...(Array.isArray(res.customQuestions) ? res.customQuestions : []),
          ];
          if (qsToSave.length > 0) {
            saveQuestionsLocal(
              qsToSave.map((q: any) => ({
                id: String(q.id),
                text: q.text,
                subject: q.subject || res.subject,
                topic: q.topic || res.topic,
                year: q.year,
                difficulty: q.difficulty,
                explanation: q.explanation,
                correctAnswer: q.correctAnswer ?? 0,
                taskId,
                options: Array.isArray(q.options)
                  ? q.options.map((opt: any) =>
                      typeof opt === 'string' ? opt : opt.text
                    )
                  : [],
              }))
            ).catch(() => {});
          }
        }
        return res;
      } catch {
        // Fallback offline: busca tarefa e questões armazenadas no SQLite
        const localTask = await getTaskByIdLocal(taskId);
        const localQuestions = await getQuestionsByTaskIdLocal(taskId);
        if (localTask || localQuestions.length > 0) {
          return {
            ...(localTask || {}),
            questions: localQuestions,
          };
        }
        return null;
      }
    },
    enabled: Boolean(taskId),
  });

  const {
    questions: fetchedQuestions,
    isLoading: isQueryLoading,
    error: queryError,
    isOfflineData,
    queueAnswerOffline,
  } = useQuestionsQuery(
    taskId
      ? undefined
      : {
          day,
          difficulty,
          subject,
          subjectId,
          topic,
          topicId,
          lessonId,
          limit: parsedLimit,
        }
  );

  const isLoading = taskId ? isLoadingTask : isQueryLoading;

  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [timeLeft, setTimeLeft] = useState(initialTimeInSeconds);
  const [totalTime] = useState(initialTimeInSeconds);

  // Histórico detalhado de respostas da sessão para cálculo da TRI e relatório do gabarito
  const [sessionAnswers, setSessionAnswers] = useState<
    Array<{
      questionId: string;
      text: string;
      options: string[];
      selectedAnswer: number;
      correctAnswer: number;
      isCorrect: boolean;
      explanation?: string;
      timeSpentMs?: number;
    }>
  >([]);

  const [serverFeedback, setServerFeedback] = useState<{
    isCorrect: boolean;
    correctAnswer: number;
    explanation?: string;
    xpEarned?: number;
  } | null>(null);

  const questionStartTimeRef = useRef<number>(Date.now());

  // 1. Popula as questões vindas de uma tarefa da turma (se taskId estiver presente)
  useEffect(() => {
    if (taskId && taskData && quizQuestions.length === 0) {
      const qList: QuizQuestion[] = [];

      // Questões reais do banco atreladas à tarefa
      if (Array.isArray(taskData.questions) && taskData.questions.length > 0) {
        for (const q of taskData.questions) {
          qList.push({
            id: q.id,
            year: q.year || 2023,
            subject: q.subject || q.subjectRef?.name || 'Geral',
            area: q.area || 'Geral',
            text: q.text,
            options: Array.isArray(q.options) ? q.options : [],
            correctAnswer: q.correctAnswer ?? 0,
            explanation: q.explanation,
            difficulty: q.difficulty,
            errorRate: q.errorRate,
          });
        }
      }

      // Questões autorais criadas pelo professor na hora
      if (Array.isArray(taskData.customQuestions) && taskData.customQuestions.length > 0) {
        for (const cq of taskData.customQuestions) {
          qList.push({
            id: cq.id || `custom_${Date.now()}_${Math.random()}`,
            year: cq.year || new Date().getFullYear(),
            subject: cq.subject || 'Questão Autoral',
            area: cq.area || 'Geral',
            text: cq.text,
            options: Array.isArray(cq.options) ? cq.options : [],
            correctAnswer: cq.correctAnswer ?? 0,
            explanation: cq.explanation,
          });
        }
      }

      if (qList.length > 0) {
        setQuizQuestions(qList);
        questionStartTimeRef.current = Date.now();
      }
    }
  }, [taskId, taskData, quizQuestions.length]);

  // 2. Popula as questões normais do banco de dados (se não for tarefa da turma)
  useEffect(() => {
    if (
      !taskId &&
      fetchedQuestions &&
      fetchedQuestions.length > 0 &&
      quizQuestions.length === 0
    ) {
      const shuffled = [...fetchedQuestions].sort(() => 0.5 - Math.random());
      setQuizQuestions(shuffled.slice(0, parsedLimit));
      questionStartTimeRef.current = Date.now();
    }
  }, [taskId, fetchedQuestions, parsedLimit, quizQuestions.length]);

  // CRONÔMETRO
  useEffect(() => {
    if (isLoading || timeLeft <= 0 || quizQuestions.length === 0) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isLoading, quizQuestions.length, timeLeft]);

  const handleSelectOption = (index: number) => {
    if (isAnswered || isSubmitting || timeLeft === 0) return;
    setSelectedOption(index);
  };

  /**
   * Submete a alternativa selecionada para a API real (`POST /questions/answer`).
   * Recebe gabarito, explicação e recálculo da TRI/Ofensiva.
   */
  const handleSubmitAnswer = async () => {
    const currentQ = quizQuestions[currentIdx];
    if (
      selectedOption === null ||
      isAnswered ||
      isSubmitting ||
      !currentQ
    ) {
      return;
    }

    const timeSpentMs = Date.now() - questionStartTimeRef.current;
    const isLocalCorrect = selectedOption === currentQ.correctAnswer;
    const xpBase = isLocalCorrect ? 50 : 0;

    setIsSubmitting(true);
    let resolvedCorrectAnswer = currentQ.correctAnswer;
    let resolvedExplanation = currentQ.explanation;
    let isCorrectFinal = isLocalCorrect;

    const online = await isDeviceOnline();

    if (!online) {
      // Salva o progresso na SyncQueue localmente em vez de falhar a requisição
      await enqueueSyncItem('SUBMIT_ANSWER', {
        questionId: String(currentQ.id),
        selectedAnswer: selectedOption,
        selectedOption,
        timeSpentMs,
        taskId: taskId || undefined,
        answeredAt: new Date().toISOString(),
      });

      await queueAnswerOffline({
        userId,
        questionId: currentQ.id,
        selectedOption,
        isCorrect: isLocalCorrect,
        xpEarned: xpBase,
      });
      completeQuestionStreakUpdate();
      setIsSubmitting(false);
    } else {
      try {
        const response = await api.post("/questions/answer", {
          userId,
          questionId: currentQ.id,
          selectedAnswer: selectedOption,
          selectedOption,
          timeSpentMs,
        });

        if (response) {
          if (response.correctAnswer !== undefined) {
            resolvedCorrectAnswer = response.correctAnswer;
            isCorrectFinal = selectedOption === response.correctAnswer;
          }
          if (response.explanation) {
            resolvedExplanation = response.explanation;
          }
          if (response.streak) {
            completeQuestionStreakUpdate(response.streak);
          }
        }
      } catch {
        // Falha de rede: salva na fila offline (SyncQueue) para sincronização posterior
        await enqueueSyncItem('SUBMIT_ANSWER', {
          questionId: String(currentQ.id),
          selectedAnswer: selectedOption,
          selectedOption,
          timeSpentMs,
          taskId: taskId || undefined,
          answeredAt: new Date().toISOString(),
        });

        await queueAnswerOffline({
          userId,
          questionId: currentQ.id,
          selectedOption,
          isCorrect: isLocalCorrect,
          xpEarned: xpBase,
        });
        completeQuestionStreakUpdate();
      } finally {
        setIsSubmitting(false);
      }
    }

    if (isCorrectFinal) {
      addXp(xpBase);
    }
    incrementAnsweredQuestions();

    const answerRecord = {
      questionId: String(currentQ.id),
      text: currentQ.text,
      options: currentQ.options,
      selectedAnswer: selectedOption,
      correctAnswer: resolvedCorrectAnswer,
      isCorrect: isCorrectFinal,
      explanation: resolvedExplanation,
      timeSpentMs,
    };

    setSessionAnswers((prev) => [...prev, answerRecord]);
    setServerFeedback({
      isCorrect: isCorrectFinal,
      correctAnswer: resolvedCorrectAnswer,
      explanation: resolvedExplanation,
      xpEarned: isCorrectFinal ? xpBase : 0,
    });
    setIsAnswered(true);
  };

  const handleNext = () => {
    const isLast = currentIdx >= quizQuestions.length - 1;

    if (timeLeft === 0 || isLast) {
      const correctTotal = sessionAnswers.filter((a) => a.isCorrect).length;
      const totalXp = sessionAnswers.reduce(
        (sum, a) => sum + (a.isCorrect ? 50 : 0),
        0
      );

      // Se for a resolução de uma tarefa vinculada à turma do aluno,
      // submete o resultado para POST /tasks/:taskId/submit
      if (taskId) {
        api.post(`/tasks/${taskId}/submit`, {
          userId,
          answers: sessionAnswers.map((a) => ({
            questionId: a.questionId,
            selectedAnswer: a.selectedAnswer,
            timeSpentMs: a.timeSpentMs,
          })),
          correctCount: correctTotal,
          totalQuestions: quizQuestions.length,
          score: Number(
            ((correctTotal / Math.max(quizQuestions.length, 1)) * 10).toFixed(1)
          ),
          timeSpentMs: sessionAnswers.reduce(
            (acc, curr) => acc + (curr.timeSpentMs || 0),
            0
          ),
        }).catch((err) => {
          console.warn('[Quiz] Falha ao submeter resultado da tarefa:', err);
        });
      }

      // Salva o resumo da sessão para exibição na tela de resultados
      setLastQuizSession({
        totalQuestions: quizQuestions.length,
        correctAnswers: correctTotal,
        xpEarned: totalXp,
        answers: sessionAnswers,
      });

      router.replace("/quiz/result" as any);
      return;
    }

    setCurrentIdx((prev) => prev + 1);
    setSelectedOption(null);
    setIsAnswered(false);
    setServerFeedback(null);
    questionStartTimeRef.current = Date.now();
  };

  // Botão "Responder Depois"
  const handleSkipLater = () => {
    setSelectedOption(null);
    setQuizQuestions((prev) => {
      const updated = [...prev];
      const skipped = updated.splice(currentIdx, 1)[0];
      if (skipped) updated.push(skipped);
      return updated;
    });
    questionStartTimeRef.current = Date.now();
  };

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, styles.centerAll]}>
        <ActivityIndicator size="large" color="#1CB0F6" />
        <Text style={styles.loadingText}>Buscando questões do ENEM...</Text>
      </SafeAreaView>
    );
  }

  if (queryError || quizQuestions.length === 0) {
    return (
      <SafeAreaView style={[styles.container, styles.centerAll]}>
        <FontAwesome5
          name="exclamation-triangle"
          size={40}
          color="#FF4B4B"
          style={{ marginBottom: 16 }}
        />
        <Text style={styles.errorText}>
          {queryError?.message || "Nenhuma questão encontrada para estes filtros."}
        </Text>
        <TouchableOpacity
          style={styles.retryButton}
          onPress={() => router.back()}
        >
          <Text style={styles.retryText}>Voltar</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const question = quizQuestions[currentIdx];
  const isLastQuestion = currentIdx === quizQuestions.length - 1;
  const progressRatio = (currentIdx + 1) / quizQuestions.length;

  const timePercentage = (timeLeft / totalTime) * 100;
  let timerColor = "#58CC02";
  if (timePercentage < 25) timerColor = "#F1C40F";
  if (timeLeft === 0 || timePercentage < 10) timerColor = "#FF4B4B";

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const timeString = `${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`;

  return (
    <SafeAreaView style={styles.container}>
      {/* 1. QUIZ HEADER COMPONENTE OFICIAL */}
      <View style={styles.headerRow}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.closeButton}
        >
          <FontAwesome5 name="times" size={18} color="#8CA0B3" />
        </TouchableOpacity>

        <View style={{ flex: 1 }}>
          <QuizHeader
            progress={progressRatio}
            streak={currentStreak}
            xp={xp}
          />
        </View>
      </View>

      {/* BANNER OFFLINE SE APLICÁVEL */}
      {isOfflineData && (
        <View style={styles.offlineBanner}>
          <FontAwesome5 name="cloud-download-alt" size={12} color="#D97706" />
          <Text style={styles.offlineBannerText}>
            Modo Offline ativo — Questões salvas localmente no dispositivo.
          </Text>
        </View>
      )}

      {/* CRONÔMETRO */}
      <View style={styles.timerWrapper}>
        {(topic || question?.topic) && (
          <View style={styles.topicPracticeHeader}>
            <FontAwesome5 name="bullseye" size={12} color="#0284C7" />
            <Text style={styles.topicPracticeText} numberOfLines={1}>
              Praticando assunto: {topic || question?.topic}
            </Text>
          </View>
        )}
        <View style={styles.timerHeader}>
          <FontAwesome5 name="stopwatch" size={15} color={timerColor} />
          <Text style={[styles.timerText, { color: timerColor }]}>
            {timeString}
          </Text>
          <Text style={styles.progressText}>
            Questão {currentIdx + 1} de {quizQuestions.length}
          </Text>
        </View>
        <View style={styles.timerBarBg}>
          <Animated.View
            style={[
              styles.timerBarFill,
              { width: `${timePercentage}%`, backgroundColor: timerColor },
            ]}
          />
        </View>
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: 220 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ENUNCIADO E METADADOS */}
        <View style={styles.questionBox}>
          <View style={styles.tagsRow}>
            <Text style={styles.subjectLabel}>{question.subject}</Text>
            {(topic || question.topic) && (
              <Text style={styles.topicLabel} numberOfLines={1}>
                {topic || question.topic}
              </Text>
            )}
            {question.area && (
              <Text style={styles.areaLabel}>{question.area}</Text>
            )}
            {question.year && (
              <Text style={styles.yearLabel}>ENEM {question.year}</Text>
            )}
          </View>

          <Markdown
            style={markdownStyles as any}
            rules={{
              image: (node) => (
                <Image
                  key={node.key}
                  source={{ uri: node.attributes.src }}
                  style={{
                    width: width - 48,
                    height: height * 0.3,
                    marginVertical: 14,
                    borderRadius: 12,
                  }}
                  resizeMode="contain"
                />
              ),
            }}
          >
            {(question.text || " ").replace(/\]\(\/\//g, "](https://")}
          </Markdown>
        </View>

        {/* 2. ALTERNATIVAS USANDO O COMPONENTE OptionButton */}
        <View style={styles.optionsContainer}>
          {question.options.map((optText: string, index: number) => {
            const isSelected = selectedOption === index;
            const isCorrectOption =
              isAnswered &&
              index ===
                (serverFeedback?.correctAnswer ?? question.correctAnswer);

            return (
              <OptionButton
                key={index}
                label={OPTION_LETTERS[index] || String(index + 1)}
                text={optText}
                isSelected={isSelected}
                isAnswered={isAnswered}
                isCorrectOption={isCorrectOption}
                onPress={() => handleSelectOption(index)}
              />
            );
          })}
        </View>

        {/* BOTÃO CONFIRMAR RESPOSTA */}
        {!isAnswered && timeLeft > 0 && (
          <TouchableOpacity
            style={[
              styles.submitAnswerButton,
              selectedOption === null && styles.submitAnswerButtonDisabled,
            ]}
            activeOpacity={0.8}
            disabled={selectedOption === null || isSubmitting}
            onPress={handleSubmitAnswer}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.submitAnswerText}>Confirmar Resposta</Text>
            )}
          </TouchableOpacity>
        )}

        {/* BOTÃO PULAR QUESTÃO */}
        {!isAnswered && !isLastQuestion && timeLeft > 0 && (
          <TouchableOpacity style={styles.skipButton} onPress={handleSkipLater}>
            <Text style={styles.skipButtonText}>Responder depois</Text>
            <FontAwesome5 name="angle-double-right" size={13} color="#8CA0B3" />
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* FEEDBACK BOTTOM SHEET COM GABARITO E EXPLICAÇÃO VINDA DO SERVIDOR */}
      {isAnswered && (
        <View
          style={[
            styles.feedbackBottomSheet,
            serverFeedback?.isCorrect
              ? styles.feedbackCorrectBg
              : styles.feedbackWrongBg,
          ]}
        >
          <View style={styles.feedbackHeader}>
            <View style={styles.feedbackTitleRow}>
              <FontAwesome5
                name={serverFeedback?.isCorrect ? "check-circle" : "times-circle"}
                size={22}
                color={serverFeedback?.isCorrect ? "#58CC02" : "#FF4B4B"}
              />
              <Text
                style={[
                  styles.feedbackTitle,
                  {
                    color: serverFeedback?.isCorrect ? "#58CC02" : "#FF4B4B",
                  },
                ]}
              >
                {serverFeedback?.isCorrect
                  ? "Resposta Correta! (+50 XP)"
                  : `Incorreta — Gabarito: Letra ${
                      OPTION_LETTERS[
                        serverFeedback?.correctAnswer ?? question.correctAnswer
                      ]
                    }`}
              </Text>
            </View>
          </View>

          {/* Dificuldade Empírica e Taxa de Erro do INEP */}
          {question.errorRate !== undefined && question.errorRate !== null && (
            <View style={styles.inepStatBox}>
              <FontAwesome5 name="chart-pie" size={13} color="#8CA0B3" />
              <Text style={styles.inepStatText}>
                {question.errorRate}% dos estudantes erraram esta questão no
                ENEM.
              </Text>
            </View>
          )}

          {/* Explicação Pedagógica Oficial */}
          {serverFeedback?.explanation || question.explanation ? (
            <Text style={styles.feedbackExplanation}>
              {serverFeedback?.explanation || question.explanation}
            </Text>
          ) : null}

          <TouchableOpacity style={styles.continueButton} onPress={handleNext}>
            <Text style={styles.continueButtonText}>
              {isLastQuestion ? "Ver Resultado da Prova" : "Próxima Questão"}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}

const markdownStyles = StyleSheet.create({
  body: { fontSize: 16, color: "#2C3A47", lineHeight: 26 },
  strong: { color: "#2C3A47", fontWeight: "bold" },
  paragraph: { marginBottom: 14 },
});

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

  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    backgroundColor: "#FFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F1F5F9",
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 8,
  },

  offlineBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#FFFBEB",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#FDE68A",
  },
  offlineBannerText: { fontSize: 12, color: "#B45309", fontWeight: "bold" },

  timerWrapper: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: "#FFF",
  },
  timerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  topicPracticeHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#E0F2FE",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    marginBottom: 8,
  },
  topicPracticeText: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#0369A1",
    flex: 1,
  },
  timerText: { fontSize: 15, fontWeight: "900" },
  progressText: { fontSize: 13, color: "#8CA0B3", fontWeight: "bold" },
  timerBarBg: {
    height: 6,
    backgroundColor: "#E2E8F0",
    borderRadius: 3,
    overflow: "hidden",
  },
  timerBarFill: { height: "100%", borderRadius: 3 },

  content: { flex: 1, padding: 20 },
  questionBox: {
    backgroundColor: "#FFF",
    padding: 20,
    borderRadius: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  tagsRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  subjectLabel: {
    backgroundColor: "#E0F2FE",
    color: "#0369A1",
    fontSize: 12,
    fontWeight: "bold",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  topicLabel: {
    backgroundColor: "#F3E8FF",
    color: "#7E22CE",
    fontSize: 12,
    fontWeight: "bold",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    maxWidth: 160,
  },
  areaLabel: {
    backgroundColor: "#F1F5F9",
    color: "#475569",
    fontSize: 12,
    fontWeight: "bold",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  yearLabel: {
    backgroundColor: "#FEF3C7",
    color: "#92400E",
    fontSize: 12,
    fontWeight: "bold",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },

  optionsContainer: { marginBottom: 20 },

  submitAnswerButton: {
    backgroundColor: "#1CB0F6",
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: "center",
    shadowColor: "#1CB0F6",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  submitAnswerButtonDisabled: { opacity: 0.45 },
  submitAnswerText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "bold",
    textTransform: "uppercase",
  },

  skipButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
    marginTop: 8,
  },
  skipButtonText: { fontSize: 14, color: "#8CA0B3", fontWeight: "bold" },

  feedbackBottomSheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    paddingBottom: 32,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 2,
    elevation: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
  },
  feedbackCorrectBg: { backgroundColor: "#F0FDF4", borderTopColor: "#58CC02" },
  feedbackWrongBg: { backgroundColor: "#FEF2F2", borderTopColor: "#FF4B4B" },
  feedbackHeader: { marginBottom: 10 },
  feedbackTitleRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  feedbackTitle: { fontSize: 18, fontWeight: "900" },

  inepStatBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "rgba(255,255,255,0.8)",
    padding: 10,
    borderRadius: 10,
    marginBottom: 10,
  },
  inepStatText: { fontSize: 12, color: "#475569", flex: 1 },

  feedbackExplanation: {
    fontSize: 14,
    color: "#334155",
    lineHeight: 22,
    marginBottom: 16,
  },

  continueButton: {
    backgroundColor: "#2C3A47",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
  },
  continueButtonText: {
    color: "#FFF",
    fontSize: 16,
    fontWeight: "bold",
    textTransform: "uppercase",
  },
});

import { useState, useEffect, useCallback, useRef } from 'react';
import { type QuizQuestion } from '@minuto-enem/shared';
import { api } from '@/services/api';
import { useUserStore } from '@/store/useUserStore';
import { useOfflineQueueStore } from '@/store/useOfflineQueueStore';
import { enqueueOfflineQuizAnswer } from './useQuestionsQuery';
import { isDeviceOnline } from '@/services/network';
import { enqueueSyncItem } from '@/database/schema';

export interface QuizSessionAnswer {
  questionId: string;
  text: string;
  options: string[];
  selectedAnswer: number;
  correctAnswer: number;
  isCorrect: boolean;
  explanation?: string;
  timeSpentMs: number;
}

export interface UseQuizOptions {
  questions: QuizQuestion[];
  onFinish?: (session: {
    totalQuestions: number;
    correctAnswers: number;
    xpEarned: number;
    answers: QuizSessionAnswer[];
  }) => void;
}

export function useQuiz({ questions, onFinish }: UseQuizOptions) {
  const { userId, addXp, incrementAnsweredQuestions, completeQuestionStreakUpdate } =
    useUserStore();

  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [earnedXp, setEarnedXp] = useState(0);
  const [totalSessionXp, setTotalSessionXp] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [answersHistory, setAnswersHistory] = useState<QuizSessionAnswer[]>([]);
  const [feedback, setFeedback] = useState<{
    isCorrect: boolean;
    correctAnswer: number;
    explanation?: string;
  } | null>(null);

  const startTimeRef = useRef<number>(Date.now());

  // Inicializa a lista de questões
  useEffect(() => {
    if (questions && questions.length > 0 && quizQuestions.length === 0) {
      setQuizQuestions(questions);
      startTimeRef.current = Date.now();
    }
  }, [questions, quizQuestions.length]);

  const currentQuestion = quizQuestions[currentIndex];
  const totalQuestions = quizQuestions.length;
  const isLastQuestion = currentIndex >= totalQuestions - 1;
  const isFinished = totalQuestions > 0 && currentIndex >= totalQuestions;
  const progress = totalQuestions > 0 ? (currentIndex + 1) / totalQuestions : 0;

  const selectOption = useCallback(
    (index: number) => {
      if (!isAnswered && !isSubmitting) {
        setSelectedOption(index);
      }
    },
    [isAnswered, isSubmitting]
  );

  const submitAnswer = useCallback(async () => {
    if (selectedOption === null || isAnswered || isSubmitting || !currentQuestion) {
      return null;
    }

    const timeSpentMs = Date.now() - startTimeRef.current;
    const isCorrect = selectedOption === currentQuestion.correctAnswer;
    const xpBase = isCorrect ? 50 : 0;

    setIsSubmitting(true);
    let serverExplanation = currentQuestion.explanation;
    let actualCorrectAnswer = currentQuestion.correctAnswer;

    const online = await isDeviceOnline();

    if (!online) {
      // Quando o aluno responder sem conexão (verificado via expo-network),
      // salva o progresso na SyncQueue localmente em vez de falhar a requisição.
      await enqueueSyncItem('SUBMIT_ANSWER', {
        questionId: String(currentQuestion.id),
        selectedAnswer: selectedOption,
        selectedOption,
        timeSpentMs,
        answeredAt: new Date().toISOString(),
      });

      await useOfflineQueueStore.getState().enqueueQuizAnswer({
        questionId: String(currentQuestion.id),
        selectedAnswer: selectedOption,
        timeSpentMs,
      });

      await enqueueOfflineQuizAnswer({
        userId,
        questionId: currentQuestion.id,
        selectedOption,
        isCorrect,
        xpEarned: xpBase,
      });
      completeQuestionStreakUpdate();
      setIsSubmitting(false);
    } else {
      try {
        const response = await api.post('/questions/answer', {
          userId,
          questionId: currentQuestion.id,
          selectedAnswer: selectedOption,
          selectedOption,
          timeSpentMs,
        });

        if (response) {
          if (response.correctAnswer !== undefined) {
            actualCorrectAnswer = response.correctAnswer;
          }
          if (response.explanation) {
            serverExplanation = response.explanation;
          }
          if (response.streak) {
            completeQuestionStreakUpdate(response.streak);
          }
        }
      } catch {
        // Falha de requisição: persiste na SyncQueue local para envio posterior
        await enqueueSyncItem('SUBMIT_ANSWER', {
          questionId: String(currentQuestion.id),
          selectedAnswer: selectedOption,
          selectedOption,
          timeSpentMs,
          answeredAt: new Date().toISOString(),
        });

        await useOfflineQueueStore.getState().enqueueQuizAnswer({
          questionId: String(currentQuestion.id),
          selectedAnswer: selectedOption,
          timeSpentMs,
        });

        await enqueueOfflineQuizAnswer({
          userId,
          questionId: currentQuestion.id,
          selectedOption,
          isCorrect,
          xpEarned: xpBase,
        });
        completeQuestionStreakUpdate();
      } finally {
        setIsSubmitting(false);
      }
    }

    if (isCorrect) {
      addXp(xpBase);
      setEarnedXp(xpBase);
      setTotalSessionXp((prev) => prev + xpBase);
      setCorrectCount((prev) => prev + 1);
    }
    incrementAnsweredQuestions();

    const answerRecord: QuizSessionAnswer = {
      questionId: String(currentQuestion.id),
      text: currentQuestion.text,
      options: currentQuestion.options,
      selectedAnswer: selectedOption,
      correctAnswer: actualCorrectAnswer,
      isCorrect,
      explanation: serverExplanation,
      timeSpentMs,
    };

    setAnswersHistory((prev) => [...prev, answerRecord]);
    setFeedback({
      isCorrect,
      correctAnswer: actualCorrectAnswer,
      explanation: serverExplanation,
    });
    setIsAnswered(true);

    return answerRecord;
  }, [
    selectedOption,
    isAnswered,
    isSubmitting,
    currentQuestion,
    userId,
    completeQuestionStreakUpdate,
    addXp,
    incrementAnsweredQuestions,
  ]);

  const nextQuestion = useCallback(() => {
    if (currentIndex < totalQuestions - 1) {
      setCurrentIndex((prev) => prev + 1);
      setSelectedOption(null);
      setIsAnswered(false);
      setEarnedXp(0);
      setFeedback(null);
      startTimeRef.current = Date.now();
    } else {
      // Fim do Quiz
      const finalHistory = answersHistory;
      onFinish?.({
        totalQuestions,
        correctAnswers: correctCount,
        xpEarned: totalSessionXp,
        answers: finalHistory,
      });
    }
  }, [
    currentIndex,
    totalQuestions,
    answersHistory,
    correctCount,
    totalSessionXp,
    onFinish,
  ]);

  const skipQuestion = useCallback(() => {
    if (isAnswered || isSubmitting) return;

    setSelectedOption(null);
    setQuizQuestions((prev) => {
      const updated = [...prev];
      const skipped = updated.splice(currentIndex, 1)[0];
      if (skipped) {
        updated.push(skipped);
      }
      return updated;
    });
    startTimeRef.current = Date.now();
  }, [isAnswered, isSubmitting, currentIndex]);

  return {
    questions: quizQuestions,
    currentIndex,
    currentQuestion,
    totalQuestions,
    selectedOption,
    isAnswered,
    isSubmitting,
    isCorrect: feedback?.isCorrect ?? false,
    feedback,
    earnedXp,
    totalSessionXp,
    correctCount,
    progress,
    isLastQuestion,
    isFinished,
    answersHistory,
    selectOption,
    submitAnswer,
    nextQuestion,
    skipQuestion,
  };
}

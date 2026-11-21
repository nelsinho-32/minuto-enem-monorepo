import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import { api } from '@/services/api';
import { useTheme } from '@/hooks/use-theme';
import { useUserStore } from '@/store/useUserStore';
import { useOfflineQueueStore } from '@/store/useOfflineQueueStore';
import { getOfflinePackQuestions } from '@/services/offlinePack';
import { QuestionContentRenderer } from '@/components/QuestionContentRenderer';
import { OptionButton } from '@/components/OptionButton';
import type { QuizQuestion } from '@minuto-enem/shared';

interface SimuladoPreset {
  id: string;
  title: string;
  subtitle: string;
  questionCount: number;
  durationMinutes: number;
  areas: string[];
  badge: string;
  accent: string;
  icon: string;
}

const SIMULADO_PRESETS: SimuladoPreset[] = [
  {
    id: 'express',
    title: 'Simulado Express (4 Áreas)',
    subtitle: 'Ideal para treino diário rápido com cálculo TRI',
    questionCount: 15,
    durationMinutes: 45,
    areas: ['Linguagens', 'Humanas', 'Natureza', 'Matemática'],
    badge: '45 min • 15q',
    accent: '#0284C7',
    icon: 'bolt',
  },
  {
    id: 'mini-dia1',
    title: 'Mini-Simulado — Dia 1',
    subtitle: 'Linguagens, Códigos e Ciências Humanas',
    questionCount: 30,
    durationMinutes: 105,
    areas: ['Linguagens', 'Humanas'],
    badge: '1h45 • 30q',
    accent: '#7C3AED',
    icon: 'book-open',
  },
  {
    id: 'mini-dia2',
    title: 'Mini-Simulado — Dia 2',
    subtitle: 'Ciências da Natureza e Matemática',
    questionCount: 30,
    durationMinutes: 105,
    areas: ['Natureza', 'Matemática'],
    badge: '1h45 • 30q',
    accent: '#16A34A',
    icon: 'calculator',
  },
  {
    id: 'oficial-dia1',
    title: 'ENEM Oficial — Dia 1',
    subtitle: 'Simulação completa de 90 questões (5h30)',
    questionCount: 90,
    durationMinutes: 330,
    areas: ['Linguagens', 'Humanas'],
    badge: '5h30 • 90q',
    accent: '#D97706',
    icon: 'landmark',
  },
  {
    id: 'oficial-dia2',
    title: 'ENEM Oficial — Dia 2',
    subtitle: 'Simulação completa de 90 questões (5h00)',
    questionCount: 90,
    durationMinutes: 300,
    areas: ['Natureza', 'Matemática'],
    badge: '5h00 • 90q',
    accent: '#EA580C',
    icon: 'atom',
  },
];

const SISU_REFERENCE_COURSES = [
  { course: 'Medicina (Federal)', cutoff: 795, icon: 'heartbeat' },
  { course: 'Ciência da Computação', cutoff: 740, icon: 'laptop-code' },
  { course: 'Direito', cutoff: 725, icon: 'balance-scale' },
  { course: 'Psicologia', cutoff: 705, icon: 'brain' },
  { course: 'Engenharia Civil', cutoff: 690, icon: 'drafting-compass' },
  { course: 'Enfermagem', cutoff: 675, icon: 'notes-medical' },
  { course: 'Administração', cutoff: 655, icon: 'briefcase' },
  { course: 'Pedagogia', cutoff: 615, icon: 'chalkboard-teacher' },
];

function formatTimer(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  if (h > 0) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function estimateTriScore(
  questions: QuizQuestion[],
  answers: Record<number, number>
): {
  triScore: number;
  correctCount: number;
  accuracyPercent: number;
  coherenceLabel: string;
} {
  if (questions.length === 0) {
    return { triScore: 300, correctCount: 0, accuracyPercent: 0, coherenceLabel: 'Sem dados' };
  }

  let totalWeight = 0;
  let earnedWeight = 0;
  let correctCount = 0;
  let easyTotal = 0;
  let easyCorrect = 0;
  let hardCorrect = 0;

  questions.forEach((q, idx) => {
    const errRate = Math.min(Math.max(Number(q.errorRate ?? 50), 10), 90);
    const weight = 1 + (100 - errRate) / 100;
    totalWeight += weight;

    const isCorrect = answers[idx] === q.correctAnswer;
    if (errRate < 45) {
      easyTotal++;
      if (isCorrect) easyCorrect++;
    }
    if (errRate > 70 && isCorrect) {
      hardCorrect++;
    }
    if (isCorrect) {
      correctCount++;
      earnedWeight += weight;
    }
  });

  const weightedRatio = totalWeight > 0 ? earnedWeight / totalWeight : 0;
  // Penalidade leve de coerência TRI se acertou difíceis mas errou muitas fáceis
  let coherenceFactor = 1.0;
  let coherenceLabel = 'Alta Coerência TRI';
  if (easyTotal >= 3 && easyCorrect / easyTotal < 0.45 && hardCorrect >= 2) {
    coherenceFactor = 0.91;
    coherenceLabel = 'Atenção: Padrão de Chute Detectado';
  } else if (weightedRatio < 0.4) {
    coherenceLabel = 'Coerência em Desenvolvimento';
  }

  const triScore = Math.round(320 + weightedRatio * 640 * coherenceFactor);
  const accuracyPercent = Math.round((correctCount / questions.length) * 100);
  return {
    triScore: Math.min(1000, Math.max(300, triScore)),
    correctCount,
    accuracyPercent,
    coherenceLabel,
  };
}

export default function SimuladoScreen() {
  const router = useRouter();
  const theme = useTheme();
  const targetCourse = useUserStore((s) => s.targetCourse || 'Medicina');
  const targetScore = useUserStore((s) => s.targetScore || 750);
  const addXp = useUserStore((s) => s.addXp);
  const enqueueQuizAnswer = useOfflineQueueStore((s) => s.enqueueQuizAnswer);

  const [stage, setStage] = useState<'SETUP' | 'RUNNING' | 'RESULT'>('SETUP');
  const [activePreset, setActivePreset] = useState<SimuladoPreset | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [usingOfflineData, setUsingOfflineData] = useState(false);

  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [flagged, setFlagged] = useState<Record<number, boolean>>({});
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [isAnswerSheetOpen, setIsAnswerSheetOpen] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const [institutionalExams, setInstitutionalExams] = useState<any[]>([]);
  const [activeInstitutionalExamId, setActiveInstitutionalExamId] = useState<string | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    api
      .get<any[]>('/institutional-exams')
      .then((res) => {
        if (Array.isArray(res)) setInstitutionalExams(res);
      })
      .catch(() => {});
  }, []);

  const startInstitutionalExam = async (examItem: any) => {
    setIsLoading(true);
    setActiveInstitutionalExamId(examItem.id);
    setActivePreset({
      id: `inst-${examItem.id}`,
      title: examItem.title,
      subtitle: 'Simulado Institucional Unificado',
      questionCount: examItem.questionsCount || 20,
      durationMinutes: examItem.durationMinutes || 90,
      areas: ['Linguagens', 'Humanas', 'Natureza', 'Matemática'],
      badge: `${examItem.durationMinutes || 90}m`,
      accent: '#7C3AED',
      icon: 'university',
    });

    try {
      const detail = await api.get<any>(`/institutional-exams/${examItem.id}`);
      const examQuestions: QuizQuestion[] = (detail?.questions || []).map((q: any) => ({
        id: String(q.id),
        subject: String(q.subject || 'Geral'),
        area: String(q.area || 'Geral'),
        year: Number(q.year || 2023),
        difficulty: q.difficulty || 'MEDIUM',
        text: String(q.text || ''),
        options: Array.isArray(q.options) ? q.options.map(String) : [],
        correctAnswer: Number(q.correctAnswer ?? 0),
        explanation: q.explanation ? String(q.explanation) : undefined,
        errorRate: q.errorRate !== undefined ? Number(q.errorRate) : 50,
      }));
      if (examQuestions.length === 0) {
        Alert.alert('Aviso', 'Este simulado institucional ainda não possui questões.');
        return;
      }
      setQuestions(examQuestions);
      setAnswers({});
      setFlagged({});
      setCurrentIdx(0);
      setRemainingSeconds((examItem.durationMinutes || 90) * 60);
      setStage('RUNNING');
    } catch {
      Alert.alert('Erro', 'Não foi possível abrir o simulado institucional.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (stage !== 'RUNNING') {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          handleFinishSimulado(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [stage]);

  const startSimulado = async (preset: SimuladoPreset) => {
    setIsLoading(true);
    setActiveInstitutionalExamId(null);
    setActivePreset(preset);
    setUsingOfflineData(false);

    try {
      let pool: QuizQuestion[] = [];
      try {
        const res = await api.get<any>(`/questions?limit=${Math.max(preset.questionCount * 2, 120)}`);
        const raw = Array.isArray(res)
          ? res
          : Array.isArray(res?.data)
            ? res.data
            : Array.isArray(res?.questions)
              ? res.questions
              : [];
        pool = raw.map((q: any) => ({
          id: String(q.id),
          subject: String(q.subject || 'Geral'),
          area: String(q.area || 'Geral'),
          year: Number(q.year || 2023),
          difficulty: q.difficulty || 'MEDIUM',
          text: String(q.text || ''),
          options: Array.isArray(q.options) ? q.options.map(String) : [],
          correctAnswer: Number(q.correctAnswer ?? 0),
          explanation: q.explanation ? String(q.explanation) : undefined,
          errorRate: q.errorRate !== undefined ? Number(q.errorRate) : 50,
        }));
      } catch {
        // Fallback automático para o pacote offline salvo no dispositivo
        pool = await getOfflinePackQuestions();
        setUsingOfflineData(true);
      }

      const normalizedAreas = preset.areas.map((a) =>
        a
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
      );

      let filtered = pool.filter((q) => {
        const qArea = (q.area || '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase();
        return normalizedAreas.some((a) => qArea.includes(a));
      });

      if (filtered.length < Math.min(preset.questionCount, 5)) {
        filtered = pool;
      }

      if (filtered.length === 0) {
        Alert.alert(
          'Sem questões disponíveis',
          'Conecte-se à internet ou baixe o Pacote Offline no seu Perfil para realizar simulados sem conexão.'
        );
        setIsLoading(false);
        return;
      }

      // Embaralha e seleciona até preset.questionCount
      const shuffled = [...filtered].sort(() => Math.random() - 0.5);
      const selected = shuffled.slice(0, Math.min(preset.questionCount, shuffled.length));

      setQuestions(selected);
      setAnswers({});
      setFlagged({});
      setCurrentIdx(0);
      setRemainingSeconds(preset.durationMinutes * 60);
      setStage('RUNNING');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFinishSimulado = async (autoTimeout = false) => {
    if (isFinishing) return;
    const answeredCount = Object.keys(answers).length;

    if (!autoTimeout && answeredCount < questions.length) {
      const unanswered = questions.length - answeredCount;
      const confirmFinish = () => finalizeExam();
      Alert.alert(
        'Finalizar Simulado?',
        `Você ainda possui ${unanswered} questão(ões) em branco. Deseja entregar o cartão-resposta agora?`,
        [
          { text: 'Continuar Prova', style: 'cancel' },
          { text: 'Entregar Simulado', style: 'destructive', onPress: confirmFinish },
        ]
      );
      return;
    }

    await finalizeExam();
  };

  const finalizeExam = async () => {
    setIsFinishing(true);
    if (timerRef.current) clearInterval(timerRef.current);

    const result = estimateTriScore(questions, answers);
    const earnedXp = result.correctCount * 15 + 40;
    addXp(earnedXp);

    // Se for Simulado Institucional Unificado, registra entrega oficial na escola
    if (activeInstitutionalExamId) {
      const answerMapByQuestionId: Record<string, number> = {};
      Object.entries(answers).forEach(([idxStr, sel]) => {
        const q = questions[Number(idxStr)];
        if (q) answerMapByQuestionId[String(q.id)] = sel;
      });
      await api
        .post(`/institutional-exams/${activeInstitutionalExamId}/submit`, {
          answers: answerMapByQuestionId,
        })
        .catch(() => {});
    }

    // Envia respostas para o servidor (ou fila offline) em background
    const entries = Object.entries(answers);
    for (const [idxStr, selectedAnswer] of entries) {
      const q = questions[Number(idxStr)];
      if (!q) continue;
      api
        .post('/questions/attempt', {
          questionId: String(q.id),
          selectedAnswer,
          timeSpentMs: 45000,
        })
        .catch(() => {
          enqueueQuizAnswer({
            questionId: String(q.id),
            selectedAnswer,
            timeSpentMs: 45000,
          });
        });
    }

    setIsAnswerSheetOpen(false);
    setStage('RESULT');
    setIsFinishing(false);
  };

  const resultMetrics = useMemo(
    () => estimateTriScore(questions, answers),
    [questions, answers]
  );

  const areaBreakdown = useMemo(() => {
    const map = new Map<string, { total: number; correct: number }>();
    questions.forEach((q, idx) => {
      const area = q.area || 'Geral';
      const acc = map.get(area) || { total: 0, correct: 0 };
      acc.total += 1;
      if (answers[idx] === q.correctAnswer) acc.correct += 1;
      map.set(area, acc);
    });
    return Array.from(map.entries()).map(([area, stats]) => ({
      area,
      total: stats.total,
      correct: stats.correct,
      pct: Math.round((stats.correct / Math.max(stats.total, 1)) * 100),
    }));
  }, [questions, answers]);

  const currentQuestion = questions[currentIdx];
  const answeredTotal = Object.keys(answers).length;
  const flaggedTotal = Object.values(flagged).filter(Boolean).length;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      {/* HEADER */}
      <View
        style={[
          styles.header,
          { backgroundColor: theme.surface, borderBottomColor: theme.border },
        ]}
      >
        <TouchableOpacity
          onPress={() => {
            if (stage === 'RUNNING') {
              Alert.alert(
                'Sair do Simulado?',
                'Seu progresso atual nesta prova será descartado.',
                [
                  { text: 'Cancelar', style: 'cancel' },
                  {
                    text: 'Sair',
                    style: 'destructive',
                    onPress: () => setStage('SETUP'),
                  },
                ]
              );
            } else {
              router.back();
            }
          }}
          style={styles.iconBtn}
        >
          <FontAwesome5 name="arrow-left" size={18} color={theme.text} />
        </TouchableOpacity>

        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>
            {stage === 'RUNNING' && activePreset
              ? activePreset.title
              : stage === 'RESULT'
                ? 'Boletim TRI & Simulador SISU'
                : 'Simulado Oficial ENEM'}
          </Text>
          {stage === 'RUNNING' && (
            <Text style={[styles.headerSub, { color: theme.textMuted }]}>
              Questão {currentIdx + 1} de {questions.length} • {answeredTotal} respondida(s)
            </Text>
          )}
        </View>

        {stage === 'RUNNING' && (
          <View style={styles.runningHeaderActions}>
            <View
              style={[
                styles.timerBadge,
                {
                  backgroundColor:
                    remainingSeconds <= 600
                      ? '#FEE2E2'
                      : theme.isDark
                        ? '#0C4A6E'
                        : '#E0F2FE',
                },
              ]}
            >
              <FontAwesome5
                name="clock"
                size={12}
                color={remainingSeconds <= 600 ? '#DC2626' : theme.primary}
              />
              <Text
                style={[
                  styles.timerText,
                  { color: remainingSeconds <= 600 ? '#DC2626' : theme.primary },
                ]}
              >
                {formatTimer(remainingSeconds)}
              </Text>
            </View>

            <TouchableOpacity
              onPress={() => setIsAnswerSheetOpen(true)}
              style={[
                styles.sheetBtn,
                { backgroundColor: theme.surfaceMuted, borderColor: theme.border },
              ]}
            >
              <FontAwesome5 name="th" size={14} color={theme.text} />
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* ETAPA 1: SETUP */}
      {stage === 'SETUP' && (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View
            style={[
              styles.heroBanner,
              {
                backgroundColor: theme.isDark ? '#0C4A6E' : '#0284C7',
              },
            ]}
          >
            <View style={styles.heroBadge}>
              <FontAwesome5 name="graduation-cap" size={12} color="#FFF" />
              <Text style={styles.heroBadgeText}>SIMULADOR TRI + SISU</Text>
            </View>
            <Text style={styles.heroTitle}>Treine como no Dia da Prova</Text>
            <Text style={styles.heroDesc}>
              Questões oficiais do ENEM (2009–2023) com imagens, cronômetro regressivo,
              cartão-resposta para revisar depois e comparação direta com sua meta no SISU (
              {targetCourse} • {targetScore} pts).
            </Text>
          </View>

          {!isLoading && institutionalExams.length > 0 && (
            <View style={{ marginBottom: 18, gap: 10 }}>
              <Text style={{ fontSize: 14, fontWeight: '800', color: theme.text }}>
                Simulados Institucionais da sua Escola
              </Text>
              {institutionalExams.map((ex) => (
                <TouchableOpacity
                  key={ex.id}
                  activeOpacity={0.85}
                  onPress={() => startInstitutionalExam(ex)}
                  style={[
                    styles.presetCard,
                    {
                      backgroundColor: theme.surface,
                      borderColor: '#7C3AED',
                    },
                  ]}
                >
                  <View style={[styles.presetIconBox, { backgroundColor: '#F3E8FF' }]}>
                    <FontAwesome5 name="university" size={18} color="#7C3AED" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.presetTitle, { color: theme.text }]}>
                      {ex.title}
                    </Text>
                    <Text style={[styles.presetSub, { color: theme.textMuted }]}>
                      {ex.questionsCount} questões • {ex.durationMinutes} min
                      {ex.myAttempt ? ` • Sua nota TRI: ${ex.myAttempt.triScore}` : ' • Pendente'}
                    </Text>
                  </View>
                  <FontAwesome5 name="play-circle" size={18} color="#7C3AED" />
                </TouchableOpacity>
              ))}
            </View>
          )}

          {isLoading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color={theme.primary} />
              <Text style={[styles.loadingText, { color: theme.textMuted }]}>
                Montando caderno de prova oficial...
              </Text>
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              {SIMULADO_PRESETS.map((preset) => (
                <TouchableOpacity
                  key={preset.id}
                  activeOpacity={0.85}
                  onPress={() => startSimulado(preset)}
                  style={[
                    styles.presetCard,
                    {
                      backgroundColor: theme.surface,
                      borderColor: theme.border,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.presetIconBox,
                      { backgroundColor: `${preset.accent}1A` },
                    ]}
                  >
                    <FontAwesome5 name={preset.icon} size={18} color={preset.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.presetTopRow}>
                      <Text style={[styles.presetTitle, { color: theme.text }]}>
                        {preset.title}
                      </Text>
                      <View
                        style={[
                          styles.presetBadge,
                          { backgroundColor: `${preset.accent}1A` },
                        ]}
                      >
                        <Text style={[styles.presetBadgeText, { color: preset.accent }]}>
                          {preset.badge}
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.presetSub, { color: theme.textMuted }]}>
                      {preset.subtitle}
                    </Text>
                  </View>
                  <FontAwesome5 name="chevron-right" size={14} color={theme.textMuted} />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </ScrollView>
      )}

      {/* ETAPA 2: PROVA EM ANDAMENTO */}
      {stage === 'RUNNING' && currentQuestion && (
        <>
          <ScrollView contentContainerStyle={styles.scrollContent}>
            {usingOfflineData && (
              <View
                style={[
                  styles.offlinePill,
                  { backgroundColor: theme.isDark ? '#451A03' : '#FEF3C7' },
                ]}
              >
                <FontAwesome5 name="wifi" size={12} color="#D97706" />
                <Text style={{ fontSize: 12, fontWeight: '700', color: '#D97706' }}>
                  Modo Offline ativo — usando questões salvas no dispositivo
                </Text>
              </View>
            )}

            <View
              style={[
                styles.questionCard,
                { backgroundColor: theme.surface, borderColor: theme.border },
              ]}
            >
              <View style={styles.qMetaRow}>
                <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                  <View
                    style={[
                      styles.metaChip,
                      { backgroundColor: theme.isDark ? '#0C4A6E' : '#E0F2FE' },
                    ]}
                  >
                    <Text style={[styles.metaChipText, { color: theme.primary }]}>
                      ENEM {currentQuestion.year}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.metaChip,
                      { backgroundColor: theme.surfaceMuted },
                    ]}
                  >
                    <Text style={[styles.metaChipText, { color: theme.textSecondary }]}>
                      {currentQuestion.subject}
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  onPress={() =>
                    setFlagged((prev) => ({
                      ...prev,
                      [currentIdx]: !prev[currentIdx],
                    }))
                  }
                  style={[
                    styles.flagBtn,
                    {
                      backgroundColor: flagged[currentIdx]
                        ? '#FEF3C7'
                        : theme.surfaceMuted,
                      borderColor: flagged[currentIdx] ? '#F59E0B' : theme.border,
                    },
                  ]}
                >
                  <FontAwesome5
                    name="flag"
                    solid={Boolean(flagged[currentIdx])}
                    size={12}
                    color={flagged[currentIdx] ? '#D97706' : theme.textMuted}
                  />
                  <Text
                    style={{
                      fontSize: 11.5,
                      fontWeight: '700',
                      color: flagged[currentIdx] ? '#D97706' : theme.textMuted,
                    }}
                  >
                    {flagged[currentIdx] ? 'Marcada' : 'Revisar'}
                  </Text>
                </TouchableOpacity>
              </View>

              <QuestionContentRenderer text={currentQuestion.text} />

              <View style={{ marginTop: 18, gap: 10 }}>
                {currentQuestion.options.map((opt, idx) => (
                  <OptionButton
                    key={`${currentQuestion.id}-opt-${idx}`}
                    letter={String.fromCharCode(65 + idx)}
                    text={opt}
                    isSelected={answers[currentIdx] === idx}
                    onPress={() =>
                      setAnswers((prev) => ({
                        ...prev,
                        [currentIdx]: idx,
                      }))
                    }
                  />
                ))}
              </View>
            </View>
          </ScrollView>

          {/* BARRA INFERIOR DE NAVEGAÇÃO DA PROVA */}
          <View
            style={[
              styles.bottomNav,
              { backgroundColor: theme.surface, borderTopColor: theme.border },
            ]}
          >
            <TouchableOpacity
              disabled={currentIdx === 0}
              onPress={() => setCurrentIdx((i) => Math.max(0, i - 1))}
              style={[
                styles.navBtn,
                {
                  backgroundColor: theme.surfaceMuted,
                  opacity: currentIdx === 0 ? 0.45 : 1,
                },
              ]}
            >
              <FontAwesome5 name="chevron-left" size={13} color={theme.text} />
              <Text style={[styles.navBtnText, { color: theme.text }]}>Anterior</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setIsAnswerSheetOpen(true)}
              style={[styles.navCenterBtn, { borderColor: theme.border }]}
            >
              <Text style={[styles.navCenterText, { color: theme.text }]}>
                Cartão ({answeredTotal}/{questions.length})
              </Text>
              {flaggedTotal > 0 && (
                <Text style={{ fontSize: 10.5, color: '#D97706', fontWeight: '700' }}>
                  {flaggedTotal} p/ revisão
                </Text>
              )}
            </TouchableOpacity>

            {currentIdx < questions.length - 1 ? (
              <TouchableOpacity
                onPress={() =>
                  setCurrentIdx((i) => Math.min(questions.length - 1, i + 1))
                }
                style={[styles.navBtn, { backgroundColor: theme.primary }]}
              >
                <Text style={[styles.navBtnText, { color: '#FFF' }]}>Próxima</Text>
                <FontAwesome5 name="chevron-right" size={13} color="#FFF" />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={() => handleFinishSimulado(false)}
                style={[styles.navBtn, { backgroundColor: '#16A34A' }]}
              >
                <FontAwesome5 name="check" size={13} color="#FFF" />
                <Text style={[styles.navBtnText, { color: '#FFF' }]}>Entregar</Text>
              </TouchableOpacity>
            )}
          </View>
        </>
      )}

      {/* ETAPA 3: RESULTADO TRI + SIMULADOR SISU */}
      {stage === 'RESULT' && (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View
            style={[
              styles.scoreHeroCard,
              {
                backgroundColor: theme.isDark ? '#1E293B' : '#0F172A',
              },
            ]}
          >
            <Text style={styles.scoreHeroEyebrow}>NOTA TRI ESTIMADA</Text>
            <Text style={styles.scoreHeroNumber}>{resultMetrics.triScore}</Text>
            <Text style={styles.scoreHeroSub}>
              {resultMetrics.correctCount} de {questions.length} acertos (
              {resultMetrics.accuracyPercent}%) • {resultMetrics.coherenceLabel}
            </Text>

            <View style={styles.goalCompareBox}>
              <FontAwesome5
                name={resultMetrics.triScore >= targetScore ? 'trophy' : 'bullseye'}
                size={16}
                color={resultMetrics.triScore >= targetScore ? '#4ADE80' : '#FBBF24'}
              />
              <Text style={styles.goalCompareText}>
                {resultMetrics.triScore >= targetScore
                  ? `Parabéns! Você superou sua meta para ${targetCourse} (${targetScore} pts) por +${resultMetrics.triScore - targetScore} pontos!`
                  : `Sua meta em ${targetCourse} é ${targetScore} pts. Faltam ${targetScore - resultMetrics.triScore} pontos — continue praticando!`}
              </Text>
            </View>
          </View>

          {/* DESEMPENHO POR ÁREA */}
          <View
            style={[
              styles.sectionCard,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              Desempenho por Área
            </Text>
            {areaBreakdown.map((item) => (
              <View key={item.area} style={{ marginTop: 12 }}>
                <View style={styles.areaRowTop}>
                  <Text style={[styles.areaLabel, { color: theme.text }]}>
                    {item.area}
                  </Text>
                  <Text style={[styles.areaValue, { color: theme.primary }]}>
                    {item.correct}/{item.total} ({item.pct}%)
                  </Text>
                </View>
                <View
                  style={[styles.barTrack, { backgroundColor: theme.surfaceMuted }]}
                >
                  <View
                    style={[
                      styles.barFill,
                      {
                        width: `${item.pct}%`,
                        backgroundColor: item.pct >= 60 ? '#16A34A' : '#D97706',
                      },
                    ]}
                  />
                </View>
              </View>
            ))}
          </View>

          {/* SIMULADOR SISU */}
          <View
            style={[
              styles.sectionCard,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              Simulador SISU — Notas de Corte de Referência
            </Text>
            <Text style={[styles.sectionSub, { color: theme.textMuted }]}>
              Comparação da sua nota TRI ({resultMetrics.triScore} pts) com médias nacionais:
            </Text>

            <View style={{ marginTop: 12, gap: 10 }}>
              {SISU_REFERENCE_COURSES.map((c) => {
                const passed = resultMetrics.triScore >= c.cutoff;
                const diff = resultMetrics.triScore - c.cutoff;
                return (
                  <View
                    key={c.course}
                    style={[
                      styles.sisuRow,
                      {
                        backgroundColor: theme.surfaceMuted,
                        borderColor: passed ? '#16A34A' : theme.border,
                      },
                    ]}
                  >
                    <View style={styles.sisuLeft}>
                      <FontAwesome5
                        name={c.icon}
                        size={14}
                        color={passed ? '#16A34A' : theme.textMuted}
                      />
                      <View>
                        <Text style={[styles.sisuCourse, { color: theme.text }]}>
                          {c.course}
                        </Text>
                        <Text style={{ fontSize: 11.5, color: theme.textMuted }}>
                          Corte médio: {c.cutoff} pts
                        </Text>
                      </View>
                    </View>

                    <View
                      style={[
                        styles.sisuPill,
                        { backgroundColor: passed ? '#DCFCE7' : '#FEE2E2' },
                      ]}
                    >
                      <Text
                        style={{
                          fontSize: 11.5,
                          fontWeight: '800',
                          color: passed ? '#15803D' : '#B91C1C',
                        }}
                      >
                        {passed ? `Passaria (+${diff})` : `Faltam ${Math.abs(diff)}`}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>

          <TouchableOpacity
            onPress={() => setStage('SETUP')}
            style={[styles.primaryCta, { backgroundColor: theme.primary }]}
          >
            <FontAwesome5 name="redo" size={14} color="#FFF" />
            <Text style={styles.primaryCtaText}>Fazer Novo Simulado</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* MODAL CARTÃO-RESPOSTA */}
      <Modal
        visible={isAnswerSheetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setIsAnswerSheetOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalSheet,
              { backgroundColor: theme.surface, borderColor: theme.border },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.text }]}>
                Cartão-Resposta ({answeredTotal}/{questions.length})
              </Text>
              <TouchableOpacity onPress={() => setIsAnswerSheetOpen(false)}>
                <FontAwesome5 name="times" size={18} color={theme.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.gridWrap}>
              {questions.map((q, idx) => {
                const isAns = answers[idx] !== undefined;
                const isFlg = Boolean(flagged[idx]);
                const isCur = idx === currentIdx;
                return (
                  <TouchableOpacity
                    key={`cell-${q.id}-${idx}`}
                    onPress={() => {
                      setCurrentIdx(idx);
                      setIsAnswerSheetOpen(false);
                    }}
                    style={[
                      styles.gridCell,
                      {
                        backgroundColor: isFlg
                          ? '#FEF3C7'
                          : isAns
                            ? '#DCFCE7'
                            : theme.surfaceMuted,
                        borderColor: isCur
                          ? theme.primary
                          : isFlg
                            ? '#F59E0B'
                            : isAns
                              ? '#16A34A'
                              : theme.border,
                        borderWidth: isCur ? 2.5 : 1,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        fontSize: 12.5,
                        fontWeight: '800',
                        color: isFlg
                          ? '#B45309'
                          : isAns
                            ? '#15803D'
                            : theme.text,
                      }}
                    >
                      {idx + 1}
                    </Text>
                    {isAns && (
                      <Text style={{ fontSize: 9.5, fontWeight: '700', color: '#15803D' }}>
                        {String.fromCharCode(65 + answers[idx])}
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <TouchableOpacity
              onPress={() => handleFinishSimulado(false)}
              style={[styles.primaryCta, { backgroundColor: '#16A34A', marginTop: 14 }]}
            >
              <FontAwesome5 name="check-double" size={14} color="#FFF" />
              <Text style={styles.primaryCtaText}>Entregar Cartão-Resposta</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 17, fontWeight: '800' },
  headerSub: { fontSize: 12, marginTop: 1 },
  runningHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  timerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  timerText: { fontSize: 12.5, fontWeight: '800' },
  sheetBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 36,
    maxWidth: 820,
    width: '100%',
    alignSelf: 'center',
  },
  heroBanner: {
    borderRadius: 20,
    padding: 20,
    marginBottom: 18,
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    marginBottom: 10,
  },
  heroBadgeText: { color: '#FFF', fontSize: 11, fontWeight: '800' },
  heroTitle: { color: '#FFF', fontSize: 22, fontWeight: '900', marginBottom: 6 },
  heroDesc: { color: 'rgba(255,255,255,0.92)', fontSize: 13.5, lineHeight: 20 },
  loadingBox: { alignItems: 'center', paddingVertical: 48, gap: 12 },
  loadingText: { fontSize: 14, fontWeight: '600' },
  presetCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  presetIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 4,
  },
  presetTitle: { fontSize: 15, fontWeight: '800', flex: 1 },
  presetBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  presetBadgeText: { fontSize: 11, fontWeight: '800' },
  presetSub: { fontSize: 12.5, lineHeight: 17 },
  offlinePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    marginBottom: 12,
  },
  questionCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
  },
  qMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    gap: 8,
  },
  metaChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  metaChipText: { fontSize: 11.5, fontWeight: '800' },
  flagBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
  },
  bottomNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    gap: 10,
  },
  navBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  navBtnText: { fontSize: 13.5, fontWeight: '800' },
  navCenterBtn: {
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
  navCenterText: { fontSize: 12.5, fontWeight: '800' },
  scoreHeroCard: {
    borderRadius: 20,
    padding: 22,
    alignItems: 'center',
    marginBottom: 16,
  },
  scoreHeroEyebrow: {
    color: '#38BDF8',
    fontSize: 11.5,
    fontWeight: '800',
    letterSpacing: 1,
  },
  scoreHeroNumber: {
    color: '#FFFFFF',
    fontSize: 54,
    fontWeight: '900',
    marginVertical: 4,
  },
  scoreHeroSub: {
    color: '#CBD5E1',
    fontSize: 13.5,
    fontWeight: '600',
    textAlign: 'center',
  },
  goalCompareBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    padding: 12,
    marginTop: 16,
    width: '100%',
  },
  goalCompareText: { color: '#F8FAFC', fontSize: 13, lineHeight: 18, flex: 1 },
  sectionCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
    marginBottom: 16,
  },
  sectionTitle: { fontSize: 16, fontWeight: '800' },
  sectionSub: { fontSize: 12.5, marginTop: 4 },
  areaRowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  areaLabel: { fontSize: 13.5, fontWeight: '700' },
  areaValue: { fontSize: 13, fontWeight: '800' },
  barTrack: { height: 8, borderRadius: 999, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 999 },
  sisuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
  },
  sisuLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  sisuCourse: { fontSize: 13.5, fontWeight: '800' },
  sisuPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  primaryCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
  },
  primaryCtaText: { color: '#FFF', fontSize: 14.5, fontWeight: '800' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.55)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    maxHeight: '78%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  modalTitle: { fontSize: 16, fontWeight: '800' },
  gridWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingBottom: 10,
  },
  gridCell: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

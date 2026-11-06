import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import { io, Socket } from 'socket.io-client';
import { BASE_URL } from '@/services/api';
import { useUserStore } from '@/store/useUserStore';
import { useQuestionsQuery } from '@/hooks/useQuestionsQuery';
import { type ArenaStatus, type DuelOutcome, type QuizQuestion } from '@minuto-enem/shared';
import { DuelProgressBar } from '@/components/DuelProgressBar';
import { DuelResultAnimation } from '@/components/DuelResultAnimation';
import { CreateRoomButton } from '@/components/CreateRoomButton';

const FALLBACK_DUEL_QUESTIONS: QuizQuestion[] = [
  {
    id: 'duel-q1',
    subject: 'Matemática',
    area: 'Matemática',
    year: 2024,
    text: 'Em uma progressão aritmética (PA) de razão 4 e primeiro termo igual a 3, qual é o valor do 10º termo?',
    options: ['35', '39', '43', '47'],
    correctAnswer: 1,
    explanation: 'Pela fórmula do termo geral: a10 = a1 + 9r = 3 + 9(4) = 39.',
  },
  {
    id: 'duel-q2',
    subject: 'Física',
    area: 'Natureza',
    year: 2024,
    text: 'Um móvel percorre 180 km em 2 horas com velocidade constante. Qual sua velocidade em m/s?',
    options: ['20 m/s', '25 m/s', '30 m/s', '90 m/s'],
    correctAnswer: 1,
    explanation: 'Vm = 180 / 2 = 90 km/h. Dividindo por 3,6 obtemos 25 m/s.',
  },
  {
    id: 'duel-q3',
    subject: 'Química',
    area: 'Natureza',
    year: 2023,
    text: 'Qual o pH de uma solução aquosa cuja concentração de íons H+ é 1,0 x 10^-4 mol/L a 25 °C?',
    options: ['2', '4', '7', '10'],
    correctAnswer: 1,
    explanation: 'pH = -log[H+] = -log(10^-4) = 4.',
  },
  {
    id: 'duel-q4',
    subject: 'História',
    area: 'Humanas',
    year: 2023,
    text: 'A promulgação da CLT (Consolidação das Leis do Trabalho) em 1943 ocorreu durante qual período histórico brasileiro?',
    options: ['República da Espada', 'Estado Novo (Era Vargas)', 'Governo JK', 'Regime Militar'],
    correctAnswer: 1,
    explanation: 'A CLT foi sancionada por Getúlio Vargas em 1º de maio de 1943, durante o Estado Novo.',
  },
  {
    id: 'duel-q5',
    subject: 'Biologia',
    area: 'Natureza',
    year: 2024,
    text: 'Qual organela citoplasmática é responsável pela respiração celular aeróbica e síntese de ATP?',
    options: ['Complexo de Golgi', 'Mitocôndria', 'Lisossomo', 'Ribossomo'],
    correctAnswer: 1,
    explanation: 'As mitocôndrias realizam o Ciclo de Krebs e a Fosforilação Oxidativa.',
  },
];

export default function ChallengeMultiplayerArenaScreen() {
  const router = useRouter();
  const { roomId: paramRoomId, subject: paramSubject } = useLocalSearchParams<{
    roomId?: string;
    subject?: string;
  }>();
  const { user, token, addXp, incrementAnsweredQuestions } = useUserStore();
  const { questions: cachedQuestions } = useQuestionsQuery({ limit: 5 });

  const socketRef = useRef<Socket | null>(null);
  const botIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const questionStartTimeRef = useRef<number>(Date.now());

  const [arenaMode, setArenaMode] = useState<'MULTIPLAYER' | 'SOLO'>('MULTIPLAYER');
  const [selectedDay, setSelectedDay] = useState<'1' | '2'>('1');
  const [difficulty, setDifficulty] = useState<'facil' | 'medio' | 'dificil' | 'misto'>('misto');

  // Estados da Arena em Tempo Real (Socket.io)
  const [status, setStatus] = useState<ArenaStatus>('LOBBY');
  const [roomId, setRoomId] = useState<string>('');
  const [isConnectedSocket, setIsConnectedSocket] = useState(false);

  const [duelQuestions, setDuelQuestions] = useState<QuizQuestion[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);

  const [myScore, setMyScore] = useState(0);
  const [myAnsweredCount, setMyAnsweredCount] = useState(0);

  const [opponentName, setOpponentName] = useState('Aguardando oponente...');
  const [opponentScore, setOpponentScore] = useState(0);
  const [opponentAnsweredCount, setOpponentAnsweredCount] = useState(0);

  const totalDuelQuestions = duelQuestions.length || 5;

  const cleanupSocketAndTimers = useCallback(() => {
    if (botIntervalRef.current) {
      clearInterval(botIntervalRef.current);
      botIntervalRef.current = null;
    }
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      cleanupSocketAndTimers();
    };
  }, [cleanupSocketAndTimers]);

  useEffect(() => {
    if (paramRoomId) {
      startMultiplayerMatchmaking(paramRoomId, paramSubject);
    }
  }, [paramRoomId, paramSubject]);

  const prepareDuelQuestions = useCallback((): QuizQuestion[] => {
    if (cachedQuestions && cachedQuestions.length >= 3) {
      return cachedQuestions.slice(0, 5);
    }
    return FALLBACK_DUEL_QUESTIONS;
  }, [cachedQuestions]);

  /**
   * Inicia a conexão Socket.io-client para o duelo em tempo real.
   * Escuta eventos `match_joined`, `match_start`, `match_found`, `scoreboard_update`, `opponent_progress` e `match_finished`.
   */
  const startMultiplayerMatchmaking = (
    customRoomId?: string,
    customSubject?: string
  ) => {
    cleanupSocketAndTimers();

    setStatus('MATCHMAKING');
    if (customRoomId) setRoomId(customRoomId);
    setMyScore(0);
    setMyAnsweredCount(0);
    setOpponentScore(0);
    setOpponentAnsweredCount(0);
    setCurrentIdx(0);
    setSelectedOption(null);
    setIsAnswered(false);
    questionStartTimeRef.current = Date.now();

    const questionsPool = prepareDuelQuestions();
    setDuelQuestions(questionsPool);

    const socket = io(BASE_URL, {
      transports: ['websocket', 'polling'],
      auth: {
        token: token || '',
        userId: user?.id || 'guest',
        userName: user?.name || 'Estudante',
      },
      query: {
        token: token || '',
      },
      reconnectionAttempts: 3,
      timeout: 5000,
    });

    socketRef.current = socket;

    let matchStarted = false;

    socket.on('connect', () => {
      setIsConnectedSocket(true);
      const payload = {
        userId: user?.id || 'guest',
        userName: user?.name || 'Estudante',
        day: selectedDay,
        difficulty,
        matchId: customRoomId || undefined,
        roomId: customRoomId || undefined,
        subject: customSubject || undefined,
        questionsCount: 5,
      };

      socket.emit('join_match', payload);
      socket.emit('join_duel_queue', payload);
    });

    socket.on(
      'match_joined',
      (payload: {
        roomId?: string;
        matchId?: string;
        players?: { userId: string; name: string; score: number }[];
      }) => {
        const activeRoom = payload.roomId || payload.matchId;
        if (activeRoom) setRoomId(activeRoom);

        if (Array.isArray(payload.players) && payload.players.length >= 2) {
          const opponent = payload.players.find((p) => p.userId !== user?.id);
          if (opponent) {
            setOpponentName(opponent.name || 'Adversário');
          }
        }
      }
    );

    socket.on(
      'match_start',
      (payload: {
        roomId?: string;
        matchId?: string;
        questions?: QuizQuestion[];
        players?: { userId: string; name: string; score: number }[];
      }) => {
        matchStarted = true;
        const activeRoom = payload.roomId || payload.matchId;
        if (activeRoom) setRoomId(activeRoom);

        if (Array.isArray(payload.players)) {
          const opponent = payload.players.find((p) => p.userId !== user?.id);
          if (opponent) {
            setOpponentName(opponent.name || 'Adversário');
          }
        }

        if (Array.isArray(payload.questions) && payload.questions.length > 0) {
          setDuelQuestions(payload.questions);
        }
        questionStartTimeRef.current = Date.now();
        setStatus('DUEL');
      }
    );

    socket.on(
      'match_found',
      (payload: {
        roomId: string;
        opponentName: string;
        questions?: QuizQuestion[];
      }) => {
        matchStarted = true;
        setRoomId(payload.roomId);
        setOpponentName(payload.opponentName || 'Rival Federal');
        if (Array.isArray(payload.questions) && payload.questions.length > 0) {
          setDuelQuestions(payload.questions);
        }
        questionStartTimeRef.current = Date.now();
        setStatus('DUEL');
      }
    );

    socket.on(
      'scoreboard_update',
      (payload: {
        players?: { userId: string; name: string; score: number; answeredCount?: number; answers?: any[] }[];
      }) => {
        if (Array.isArray(payload.players)) {
          const opponent = payload.players.find((p) => p.userId !== user?.id);
          if (opponent) {
            setOpponentScore(opponent.score || 0);
            setOpponentAnsweredCount(
              opponent.answeredCount ?? opponent.answers?.length ?? 0
            );
          }
        }
      }
    );

    socket.on(
      'opponent_progress',
      (payload: { score: number; answeredCount: number; userId?: string }) => {
        if (!payload.userId || payload.userId !== user?.id) {
          setOpponentScore(payload.score);
          setOpponentAnsweredCount(payload.answeredCount);
        }
      }
    );

    socket.on(
      'match_finished',
      (payload?: { opponentScore?: number; players?: { userId: string; score: number }[] }) => {
        if (payload?.opponentScore !== undefined) {
          setOpponentScore(payload.opponentScore);
        } else if (Array.isArray(payload?.players)) {
          const opponent = payload.players.find((p) => p.userId !== user?.id);
          if (opponent) setOpponentScore(opponent.score);
        }
        setStatus('FINISHED');
      }
    );

    socket.on('disconnect', () => {
      setIsConnectedSocket(false);
    });

    // Fallback de pareamento com bot caso a sala não receba outro jogador em 2.2s
    setTimeout(() => {
      if (!matchStarted) {
        matchStarted = true;
        const simulatedRivals = [
          'Beatriz (IFPB)',
          'Gabriel (Medicina)',
          'Lucas (ITA)',
          'Mariana (Direito)',
        ];
        const chosenRival =
          simulatedRivals[Math.floor(Math.random() * simulatedRivals.length)];
        setRoomId((prev) => prev || `arena_${Date.now().toString(36)}`);
        setOpponentName(chosenRival);
        questionStartTimeRef.current = Date.now();
        setStatus('DUEL');

        const totalQ = questionsPool.length;
        botIntervalRef.current = setInterval(() => {
          setOpponentAnsweredCount((prevCount) => {
            if (prevCount >= totalQ) {
              if (botIntervalRef.current) clearInterval(botIntervalRef.current);
              return prevCount;
            }
            const nextCount = prevCount + 1;
            const hit = Math.random() > 0.32;
            if (hit) {
              const pts = Math.floor(140 + Math.random() * 60);
              setOpponentScore((s) => s + pts);
            }
            return nextCount;
          });
        }, 5500);
      }
    }, 2200);
  };

  const handleSelectOption = (idx: number) => {
    if (isAnswered || status !== 'DUEL') return;
    setSelectedOption(idx);
    setIsAnswered(true);

    const currentQ = duelQuestions[currentIdx];
    const isCorrect = idx === currentQ?.correctAnswer;
    const pointsEarned = isCorrect ? 200 : 0;

    const nextScore = myScore + pointsEarned;
    const nextAnsweredCount = myAnsweredCount + 1;
    const timeSpent = Math.max(500, Date.now() - questionStartTimeRef.current);

    setMyScore(nextScore);
    setMyAnsweredCount(nextAnsweredCount);

    if (isCorrect) {
      addXp(50);
    }
    incrementAnsweredQuestions();

    // Emite atualização em tempo real via Socket.io para o servidor
    const answerPayload = {
      matchId: roomId,
      roomId,
      questionId: currentQ?.id,
      selectedAnswer: idx,
      selectedOption: idx,
      timeMs: timeSpent,
      isCorrect,
      score: nextScore,
      answeredCount: nextAnsweredCount,
    };

    socketRef.current?.emit('submit_answer', answerPayload);
    socketRef.current?.emit('submit_duel_answer', answerPayload);

    setTimeout(() => {
      if (currentIdx < duelQuestions.length - 1) {
        setCurrentIdx((prev) => prev + 1);
        setSelectedOption(null);
        setIsAnswered(false);
        questionStartTimeRef.current = Date.now();
      } else {
        if (botIntervalRef.current) {
          clearInterval(botIntervalRef.current);
          botIntervalRef.current = null;
        }
        socketRef.current?.emit('finish_duel', {
          roomId,
          matchId: roomId,
          finalScore: nextScore,
        });
        setStatus('FINISHED');
      }
    }, 1100);
  };

  const startSoloChallenge = (limit: number, timeInMinutes: number) => {
    router.push({
      pathname: '/quiz',
      params: {
        mode: 'desafio',
        day: selectedDay,
        difficulty,
        limit,
        time: timeInMinutes,
      },
    });
  };

  const myProgressPercent = Math.round(
    (myAnsweredCount / Math.max(totalDuelQuestions, 1)) * 100
  );
  const opponentProgressPercent = Math.round(
    (opponentAnsweredCount / Math.max(totalDuelQuestions, 1)) * 100
  );

  const duelOutcome: 'VICTORY' | 'DEFEAT' | 'DRAW' =
    myScore > opponentScore
      ? 'VICTORY'
      : myScore < opponentScore
      ? 'DEFEAT'
      : 'DRAW';

  return (
    <SafeAreaView style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            cleanupSocketAndTimers();
            router.back();
          }}
          style={styles.backButton}
        >
          <FontAwesome5 name="arrow-left" size={20} color="#2C3A47" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Arena Multiplayer 1v1</Text>
          <View style={styles.socketStatusRow}>
            <View
              style={[
                styles.socketDot,
                { backgroundColor: isConnectedSocket ? '#58CC02' : '#F1C40F' },
              ]}
            />
            <Text style={styles.socketStatusText}>
              {isConnectedSocket ? 'Socket.io Tempo Real Conectado' : 'Arena Pronta'}
            </Text>
          </View>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* SELETOR DE MODO (MULTIPLAYER 1v1 vs SOLO CONTRA O TEMPO) */}
      {status === 'LOBBY' && (
        <View style={styles.modeSwitchContainer}>
          <TouchableOpacity
            style={[
              styles.modeButton,
              arenaMode === 'MULTIPLAYER' && styles.modeButtonActive,
            ]}
            onPress={() => setArenaMode('MULTIPLAYER')}
          >
            <FontAwesome5
              name="users"
              size={13}
              color={arenaMode === 'MULTIPLAYER' ? '#FFF' : '#64748B'}
            />
            <Text
              style={[
                styles.modeButtonText,
                arenaMode === 'MULTIPLAYER' && styles.modeButtonTextActive,
              ]}
            >
              Duelo 1v1 Online
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.modeButton,
              arenaMode === 'SOLO' && styles.modeButtonActive,
            ]}
            onPress={() => setArenaMode('SOLO')}
          >
            <FontAwesome5
              name="stopwatch"
              size={13}
              color={arenaMode === 'SOLO' ? '#FFF' : '#64748B'}
            />
            <Text
              style={[
                styles.modeButtonText,
                arenaMode === 'SOLO' && styles.modeButtonTextActive,
              ]}
            >
              Solo Contra o Tempo
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* TELA 1: LOBBY DE CONFIGURAÇÃO */}
      {status === 'LOBBY' && (
        <ScrollView contentContainerStyle={styles.lobbyScroll}>
          <View style={styles.tabContainer}>
            <TouchableOpacity
              style={[styles.tab, selectedDay === '1' && styles.tabActive]}
              onPress={() => setSelectedDay('1')}
            >
              <Text
                style={[styles.tabText, selectedDay === '1' && styles.tabTextActive]}
              >
                1º Dia do ENEM
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, selectedDay === '2' && styles.tabActive]}
              onPress={() => setSelectedDay('2')}
            >
              <Text
                style={[styles.tabText, selectedDay === '2' && styles.tabTextActive]}
              >
                2º Dia do ENEM
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.difficultySection}>
            <Text style={styles.difficultyLabel}>Escolha a Dificuldade:</Text>
            <View style={styles.pillRow}>
              {['facil', 'medio', 'dificil', 'misto'].map((level) => (
                <TouchableOpacity
                  key={level}
                  style={[styles.pill, difficulty === level && styles.pillActive]}
                  onPress={() => setDifficulty(level as any)}
                >
                  <Text
                    style={[
                      styles.pillText,
                      difficulty === level && styles.pillTextActive,
                    ]}
                  >
                    {level.charAt(0).toUpperCase() + level.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {arenaMode === 'MULTIPLAYER' ? (
            <View style={styles.arenaHeroCard}>
              <View style={styles.arenaHeroTop}>
                <View style={styles.swordsCircle}>
                  <FontAwesome5 name="bolt" size={28} color="#F1C40F" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.arenaHeroTitle}>
                    Duelo Relâmpago em Tempo Real
                  </Text>
                  <Text style={styles.arenaHeroSub}>
                    Enfrente outro estudante simultaneamente em 5 questões do ENEM. Quem pontuar mais rápido vence!
                  </Text>
                </View>
              </View>

              <View style={styles.rulesList}>
                <View style={styles.ruleItem}>
                  <FontAwesome5 name="check-circle" size={14} color="#58CC02" />
                  <Text style={styles.ruleText}>
                    Barra de progresso simultânea via WebSocket (`socket.io-client`)
                  </Text>
                </View>
                <View style={styles.ruleItem}>
                  <FontAwesome5 name="check-circle" size={14} color="#58CC02" />
                  <Text style={styles.ruleText}>
                    +200 pontos por resposta correta e bônus de XP na Liga
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                style={styles.findMatchButton}
                activeOpacity={0.85}
                onPress={() => startMultiplayerMatchmaking()}
              >
                <FontAwesome5 name="play" size={14} color="#FFF" />
                <Text style={styles.findMatchButtonText}>
                  Procurar Adversário Agora
                </Text>
              </TouchableOpacity>

              <View style={{ marginTop: 10 }}>
                <CreateRoomButton
                  mode="duel"
                  title="Criar Sala Privada de Duelo"
                  onPress={(customId) => {
                    startMultiplayerMatchmaking(customId);
                  }}
                />
              </View>
            </View>
          ) : (
            <View style={styles.cardsContainer}>
              <TouchableOpacity
                style={[styles.card, { borderColor: '#1CB0F6' }]}
                onPress={() => startSoloChallenge(1, 4)}
              >
                <View style={[styles.iconBox, { backgroundColor: '#1CB0F6' }]}>
                  <FontAwesome5 name="stopwatch" size={20} color="#FFF" />
                </View>
                <View style={styles.cardContent}>
                  <Text style={styles.cardTitle}>Aquecimento</Text>
                  <Text style={styles.cardDesc}>1 questão</Text>
                </View>
                <View style={styles.timeTag}>
                  <Text style={styles.timeTagText}>4 min</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.card, { borderColor: '#58CC02' }]}
                onPress={() => startSoloChallenge(5, 15)}
              >
                <View style={[styles.iconBox, { backgroundColor: '#58CC02' }]}>
                  <FontAwesome5 name="running" size={20} color="#FFF" />
                </View>
                <View style={styles.cardContent}>
                  <Text style={styles.cardTitle}>Tiro Curto</Text>
                  <Text style={styles.cardDesc}>5 questões</Text>
                </View>
                <View style={styles.timeTag}>
                  <Text style={styles.timeTagText}>15 min</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.card, { borderColor: '#FF9600' }]}
                onPress={() => startSoloChallenge(10, 30)}
              >
                <View style={[styles.iconBox, { backgroundColor: '#FF9600' }]}>
                  <FontAwesome5 name="dumbbell" size={20} color="#FFF" />
                </View>
                <View style={styles.cardContent}>
                  <Text style={styles.cardTitle}>Resistência</Text>
                  <Text style={styles.cardDesc}>10 questões</Text>
                </View>
                <View style={styles.timeTag}>
                  <Text style={styles.timeTagText}>30 min</Text>
                </View>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      )}

      {/* TELA 2: MATCHMAKING (BUSCANDO OPONENTE) */}
      {status === 'MATCHMAKING' && (
        <View style={styles.matchmakingContainer}>
          <ActivityIndicator size="large" color="#1CB0F6" />
          <Text style={styles.matchmakingTitle}>Procurando oponente na fila...</Text>
          <Text style={styles.matchmakingSub}>
            Conectando via Socket.io ({selectedDay}º Dia • {difficulty.toUpperCase()})
          </Text>

          <TouchableOpacity
            style={styles.cancelMatchButton}
            onPress={() => {
              cleanupSocketAndTimers();
              setStatus('LOBBY');
            }}
          >
            <Text style={styles.cancelMatchText}>Cancelar Busca</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* TELA 3: DUELO EM TEMPO REAL */}
      {(status === 'DUEL' || status === 'FINISHED') && duelQuestions[currentIdx] && (
        <ScrollView contentContainerStyle={styles.duelContainer}>
          {/* BARRA DE PROGRESSO SIMULTÂNEA ANIMADA COM REANIMATED */}
          <DuelProgressBar
            myName={user?.name || 'Você'}
            myScore={myScore}
            myProgressPercent={myProgressPercent}
            opponentName={opponentName}
            opponentScore={opponentScore}
            opponentProgressPercent={opponentProgressPercent}
            totalQuestions={totalDuelQuestions}
          />

          {/* CARTÃO DA QUESTÃO ATUAL */}
          <View style={styles.questionCard}>
            <View style={styles.questionMetaRow}>
              <Text style={styles.questionSubjectBadge}>
                {duelQuestions[currentIdx].subject}
              </Text>
              <Text style={styles.questionCounterText}>
                Questão {currentIdx + 1} de {totalDuelQuestions}
              </Text>
            </View>

            <Text style={styles.questionPrompt}>
              {duelQuestions[currentIdx].text}
            </Text>

            <View style={styles.optionsList}>
              {duelQuestions[currentIdx].options.map((opt, idx) => {
                const isSelected = selectedOption === idx;
                const isCorrect = idx === duelQuestions[currentIdx].correctAnswer;

                let btnStyle: any = styles.optionBtn;
                let txtStyle: any = styles.optionTxt;

                if (isAnswered) {
                  if (isCorrect) {
                    btnStyle = [styles.optionBtn, styles.optionBtnCorrect];
                    txtStyle = [styles.optionTxt, styles.optionTxtCorrect];
                  } else if (isSelected) {
                    btnStyle = [styles.optionBtn, styles.optionBtnWrong];
                    txtStyle = [styles.optionTxt, styles.optionTxtWrong];
                  }
                }

                return (
                  <TouchableOpacity
                    key={idx}
                    style={btnStyle}
                    activeOpacity={0.75}
                    disabled={isAnswered}
                    onPress={() => handleSelectOption(idx)}
                  >
                    <View style={styles.optionLetterCircle}>
                      <Text style={styles.optionLetter}>
                        {String.fromCharCode(65 + idx)}
                      </Text>
                    </View>
                    <Text style={txtStyle}>{opt}</Text>
                    {isAnswered && isCorrect && (
                      <FontAwesome5 name="check-circle" size={18} color="#58CC02" />
                    )}
                    {isAnswered && isSelected && !isCorrect && (
                      <FontAwesome5 name="times-circle" size={18} color="#FF4B4B" />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </ScrollView>
      )}

      {/* OVERLAY DE VITÓRIA / DERROTA COM REACT-NATIVE-REANIMATED */}
      <DuelResultAnimation
        visible={status === 'FINISHED'}
        outcome={duelOutcome}
        myScore={myScore}
        opponentScore={opponentScore}
        opponentName={opponentName}
        xpEarned={duelOutcome === 'VICTORY' ? 250 : duelOutcome === 'DRAW' ? 120 : 60}
        onPlayAgain={() => startMultiplayerMatchmaking()}
        onExit={() => {
          cleanupSocketAndTimers();
          setStatus('LOBBY');
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F9FC' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
  },
  backButton: { width: 40, height: 40, justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#2C3A47' },
  socketStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  socketDot: { width: 7, height: 7, borderRadius: 3.5 },
  socketStatusText: { fontSize: 11, color: '#64748B', fontWeight: '600' },

  modeSwitchContainer: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginTop: 16,
    backgroundColor: '#E2E8F0',
    borderRadius: 14,
    padding: 4,
  },
  modeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 10,
  },
  modeButtonActive: {
    backgroundColor: '#1E293B',
  },
  modeButtonText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#64748B',
  },
  modeButtonTextActive: {
    color: '#FFF',
  },

  lobbyScroll: { paddingBottom: 40, paddingTop: 16 },
  tabContainer: {
    flexDirection: 'row',
    marginHorizontal: 20,
    backgroundColor: '#E2E8F0',
    borderRadius: 16,
    padding: 4,
  },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 12 },
  tabActive: {
    backgroundColor: '#FFF',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  tabText: { fontSize: 14, fontWeight: 'bold', color: '#8CA0B3' },
  tabTextActive: { color: '#2C3A47' },

  difficultySection: { padding: 20 },
  difficultyLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#8CA0B3',
    marginBottom: 12,
  },
  pillRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  pillActive: { backgroundColor: '#CE82FF', borderColor: '#CE82FF' },
  pillText: { fontSize: 14, fontWeight: 'bold', color: '#8CA0B3' },
  pillTextActive: { color: '#FFF' },

  arenaHeroCard: {
    marginHorizontal: 20,
    backgroundColor: '#1E293B',
    borderRadius: 24,
    padding: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 5,
  },
  arenaHeroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 18,
  },
  swordsCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(241, 196, 15, 0.15)',
    borderWidth: 2,
    borderColor: '#F1C40F',
    justifyContent: 'center',
    alignItems: 'center',
  },
  arenaHeroTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 4,
  },
  arenaHeroSub: {
    fontSize: 13,
    color: '#94A3B8',
    lineHeight: 19,
  },
  rulesList: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 14,
    padding: 14,
    gap: 10,
    marginBottom: 20,
  },
  ruleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  ruleText: {
    fontSize: 12,
    color: '#E2E8F0',
    flex: 1,
  },
  findMatchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#58CC02',
    paddingVertical: 16,
    borderRadius: 16,
  },
  findMatchButtonText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },

  cardsContainer: { paddingHorizontal: 20, gap: 16 },
  card: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    padding: 16,
    borderRadius: 20,
    borderWidth: 2,
    alignItems: 'center',
  },
  iconBox: {
    width: 50,
    height: 50,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  cardContent: { flex: 1 },
  cardTitle: { fontSize: 18, fontWeight: 'bold', color: '#2C3A47' },
  cardDesc: { fontSize: 14, color: '#8CA0B3' },
  timeTag: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  timeTagText: { fontSize: 12, fontWeight: 'bold', color: '#4B5563' },

  matchmakingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  matchmakingTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1E293B',
    marginTop: 20,
    marginBottom: 6,
  },
  matchmakingSub: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 28,
  },
  cancelMatchButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: '#FEE2E2',
  },
  cancelMatchText: {
    color: '#DC2626',
    fontWeight: 'bold',
    fontSize: 14,
  },

  duelContainer: {
    padding: 20,
    gap: 18,
    paddingBottom: 60,
  },
  questionCard: {
    backgroundColor: '#FFF',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  questionMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  questionSubjectBadge: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#1CB0F6',
    textTransform: 'uppercase',
  },
  questionCounterText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#94A3B8',
  },
  questionPrompt: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1E293B',
    lineHeight: 24,
    marginBottom: 20,
  },
  optionsList: {
    gap: 12,
  },
  optionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  optionBtnCorrect: {
    borderColor: '#58CC02',
    backgroundColor: '#F0FDF4',
  },
  optionBtnWrong: {
    borderColor: '#FF4B4B',
    backgroundColor: '#FFF5F5',
  },
  optionLetterCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionLetter: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#334155',
  },
  optionTxt: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#334155',
  },
  optionTxtCorrect: {
    color: '#15803D',
    fontWeight: 'bold',
  },
  optionTxtWrong: {
    color: '#B91C1C',
    fontWeight: 'bold',
  },
});

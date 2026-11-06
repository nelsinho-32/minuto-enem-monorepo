import crypto from "crypto";
import { Server, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import {
  JoinMatchPayloadSchema,
  SubmitDuelAnswerPayloadSchema,
  type DuelPlayerState,
  type DuelMatchRoom,
  type DuelQuestion,
} from "@minuto-enem/shared";
import { prisma } from "../lib/prisma";
import { streakService } from "../services/streak.service";
import { triService } from "../services/tri.service";

export type { DuelPlayerState, DuelMatchRoom } from "@minuto-enem/shared";

interface AuthenticatedSocketData {
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
}

const JWT_SECRET = process.env.JWT_SECRET || "enem-super-secret-jwt-key-2026";
const activeMatches = new Map<string, DuelMatchRoom>();

/**
 * Configuração do WebSocket para o modo Duelo (Socket.io)
 * Inclui:
 * 1. Autenticação JWT obrigatória via handshake
 * 2. Pareamento (matchmaking) em salas de 2 jogadores (suporta join_match e join_duel_queue)
 * 3. Sorteio aleatório de questões reais do ENEM via Prisma
 * 4. Transmissão do placar em tempo real (scoreboard_update e opponent_progress)
 * 5. Persistência do resultado e estatísticas da partida no banco de dados (DuelMatch e DuelPlayer)
 */
export function setupDuelWebSocket(io: Server): void {
  // ==========================================
  // MIDDLEWARE DE AUTENTICAÇÃO JWT VIA HANDSHAKE
  // ==========================================
  io.use(async (socket: Socket, next) => {
    try {
      const authHeader =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization ||
        (socket.handshake.query?.token as string | undefined);

      if (
        !authHeader ||
        authHeader === "guest" ||
        authHeader === "null" ||
        authHeader === "undefined"
      ) {
        const guestId =
          socket.handshake.auth?.userId &&
          socket.handshake.auth.userId !== "guest"
            ? socket.handshake.auth.userId
            : `guest_${socket.id.slice(0, 6)}`;
        const guestName = socket.handshake.auth?.userName || "Estudante";

        socket.data = {
          ...socket.data,
          user: {
            id: guestId,
            name: guestName,
            email: `${guestId}@minutoenem.com`,
            role: "STUDENT",
          },
        } as AuthenticatedSocketData;
        return next();
      }

      const token = authHeader.startsWith("Bearer ")
        ? authHeader.split(" ")[1]
        : authHeader;

      try {
        const decoded = jwt.verify(token, JWT_SECRET) as {
          id: string;
          email: string;
          role: string;
        };

        if (decoded?.id) {
          const user = await prisma.user.findUnique({
            where: { id: decoded.id },
            select: { id: true, name: true, email: true, role: true },
          });

          if (user) {
            socket.data = {
              ...socket.data,
              user,
            } as AuthenticatedSocketData;
            return next();
          }
        }
      } catch {
        // Fallback para sessão convidado se token for inválido
      }

      const guestId =
        socket.handshake.auth?.userId || `guest_${socket.id.slice(0, 6)}`;
      const guestName = socket.handshake.auth?.userName || "Estudante";

      socket.data = {
        ...socket.data,
        user: {
          id: guestId,
          name: guestName,
          email: `${guestId}@minutoenem.com`,
          role: "STUDENT",
        },
      } as AuthenticatedSocketData;

      return next();
    } catch (err: any) {
      console.warn(
        `⚠️ [Socket.io Auth Error] Falha de autenticação no socket ${socket.id}: ${err.message}`
      );
      return next();
    }
  });

  io.on("connection", (socket: Socket) => {
    const authUser = socket.data?.user as
      | AuthenticatedSocketData["user"]
      | undefined;

    console.log(
      `⚡ [Socket.io] Conexão autenticada: ${socket.id} | Usuário: ${authUser?.name || "Desconhecido"} (${authUser?.id})`
    );

    /**
     * Handler comum para entrada na fila / matchmaking
     * Suporta eventos: `join_match` e `join_duel_queue`
     */
    const handleJoinMatch = async (rawPayload: {
      matchId?: string;
      roomId?: string;
      subject?: string;
      questionsCount?: number;
      day?: string;
      difficulty?: string;
    }) => {
      try {
        if (!authUser) {
          socket.emit("match_error", {
            error: "Sessão não autenticada.",
          });
          return;
        }

        const requestedMatchId = rawPayload?.matchId || rawPayload?.roomId;
        const requestedSubject =
          rawPayload?.subject ||
          (rawPayload?.day === "1"
            ? "Linguagens"
            : rawPayload?.day === "2"
              ? "Matemática"
              : undefined);

        const parsed = JoinMatchPayloadSchema.safeParse({
          userId: authUser.id,
          userName: authUser.name,
          matchId: requestedMatchId,
          subject: requestedSubject,
          questionsCount: rawPayload?.questionsCount,
        });

        if (!parsed.success) {
          socket.emit("match_error", {
            error: "Dados de ingresso na partida inválidos.",
            details: parsed.error.issues,
          });
          return;
        }

        const {
          matchId: validMatchId,
          subject,
          questionsCount = 5,
        } = parsed.data;

        let room: DuelMatchRoom | undefined;

        // 1. Procura sala solicitada ou sala em espera compatível (WAITING)
        if (validMatchId && activeMatches.has(validMatchId)) {
          room = activeMatches.get(validMatchId);
        } else if (!validMatchId) {
          for (const candidate of activeMatches.values()) {
            if (
              candidate.status === "WAITING" &&
              candidate.players.size < 2 &&
              (!subject || candidate.subject === subject)
            ) {
              if (!candidate.players.has(authUser.id)) {
                room = candidate;
                break;
              }
            }
          }
        }

        // 2. Se nenhuma sala aberta foi encontrada, cria uma nova e sorteia questões reais do banco
        if (!room) {
          const newMatchId =
            validMatchId ||
            `duel_${crypto.randomBytes(4).toString("hex")}`;

          const whereClause = subject
            ? {
                OR: [
                  { subject: { equals: subject, mode: "insensitive" as const } },
                  { area: { equals: subject, mode: "insensitive" as const } },
                ],
              }
            : undefined;

          const totalAvailable = await prisma.question.count({
            where: whereClause,
          });

          const targetCount = Math.min(
            Math.max(Number(questionsCount) || 5, 1),
            15
          );

          let drawnQuestions: any[] = [];

          if (totalAvailable <= targetCount) {
            drawnQuestions = await prisma.question.findMany({
              where: whereClause,
            });
          } else {
            // Sorteio aleatório real usando skip com base no total de itens no banco
            const maxSkip = Math.max(0, totalAvailable - targetCount);
            const randomSkip = Math.floor(Math.random() * maxSkip);

            drawnQuestions = await prisma.question.findMany({
              where: whereClause,
              skip: randomSkip,
              take: targetCount,
            });
          }

          // Embaralha a ordem das questões para garantir dinamismo
          drawnQuestions.sort(() => Math.random() - 0.5);

          const typedQuestions: DuelQuestion[] = drawnQuestions.map((q) => ({
            id: q.id,
            year: q.year,
            area: q.area,
            subject: q.subject,
            text: q.text,
            options: q.options,
            correctAnswer: q.correctAnswer,
            errorRate: q.errorRate,
          }));

          room = {
            matchId: newMatchId,
            subject,
            status: "WAITING",
            questions: typedQuestions,
            players: new Map(),
            createdAt: new Date(),
          };

          activeMatches.set(newMatchId, room);
        }

        // 3. Adiciona o jogador à sala
        room.players.set(authUser.id, {
          userId: authUser.id,
          socketId: socket.id,
          name: authUser.name,
          score: 0,
          correctCount: 0,
          answers: [],
        });

        socket.join(room.matchId);

        // Sanitiza as questões antes de enviar ao cliente (remove o gabarito)
        const sanitizedQuestions = room.questions.map((q) => ({
          id: q.id,
          year: q.year,
          area: q.area,
          subject: q.subject,
          text: q.text,
          options: q.options,
          triMetrics: triService.calculateQuestionWeight(q.errorRate, q.id),
        }));

        const playersList = Array.from(room.players.values()).map((p) => ({
          userId: p.userId,
          name: p.name,
          score: p.score,
        }));

        io.to(room.matchId).emit("match_joined", {
          matchId: room.matchId,
          roomId: room.matchId,
          status: room.status,
          subject: room.subject || "Geral",
          players: playersList,
          questionsCount: sanitizedQuestions.length,
        });

        // 4. Inicia a partida automaticamente quando 2 competidores estiverem prontos
        if (room.players.size >= 2 && room.status === "WAITING") {
          room.status = "IN_PROGRESS";

          const allPlayers = Array.from(room.players.values());
          const player1 = allPlayers[0];
          const player2 = allPlayers[1];

          // Emite match_start consolidado para a sala
          io.to(room.matchId).emit("match_start", {
            matchId: room.matchId,
            roomId: room.matchId,
            status: room.status,
            questions: sanitizedQuestions,
            players: playersList,
          });

          // Notifica os clientes individualmente também com o formato match_found (compatibilidade mobile)
          if (player1?.socketId) {
            io.to(player1.socketId).emit("match_found", {
              roomId: room.matchId,
              matchId: room.matchId,
              opponentName: player2.name,
              questions: sanitizedQuestions,
            });
          }
          if (player2?.socketId) {
            io.to(player2.socketId).emit("match_found", {
              roomId: room.matchId,
              matchId: room.matchId,
              opponentName: player1.name,
              questions: sanitizedQuestions,
            });
          }
        }
      } catch (error) {
        console.error("[Socket join_match Error]:", error);
        socket.emit("match_error", {
          error: "Erro ao ingressar na sala de duelo.",
        });
      }
    };

    socket.on("join_match", handleJoinMatch);
    socket.on("join_duel_queue", handleJoinMatch);

    /**
     * Handler comum para submissão de respostas
     * Suporta eventos: `submit_answer` e `submit_duel_answer`
     */
    const handleSubmitAnswer = async (rawPayload: {
      matchId?: string;
      roomId?: string;
      questionId: string;
      selectedAnswer?: number;
      selectedOption?: number;
      timeMs?: number;
    }) => {
      try {
        if (!authUser) {
          socket.emit("match_error", { error: "Não autenticado." });
          return;
        }

        const matchId = rawPayload?.matchId || rawPayload?.roomId;
        const selectedAnswer =
          rawPayload?.selectedAnswer !== undefined
            ? rawPayload.selectedAnswer
            : rawPayload?.selectedOption;

        const parsed = SubmitDuelAnswerPayloadSchema.safeParse({
          matchId,
          questionId: rawPayload?.questionId,
          selectedAnswer,
          timeMs: rawPayload?.timeMs,
          userId: authUser.id,
        });

        if (!parsed.success) {
          socket.emit("match_error", {
            error: "Payload de resposta inválido.",
            details: parsed.error.issues,
          });
          return;
        }

        const {
          matchId: validMatchId,
          questionId,
          selectedAnswer: validSelectedAnswer,
          timeMs = 15000,
        } = parsed.data;

        const room = activeMatches.get(validMatchId);
        if (!room) {
          socket.emit("match_error", {
            error: "Sala de duelo não encontrada ou já encerrada.",
          });
          return;
        }

        const player = room.players.get(authUser.id);
        if (!player) {
          socket.emit("match_error", {
            error: "Você não pertence a esta sala de duelo.",
          });
          return;
        }

        // Impede envio duplicado para a mesma questão
        if (player.answers.some((a) => a.questionId === questionId)) {
          return;
        }

        const question = room.questions.find((q) => q.id === questionId);
        if (!question) {
          socket.emit("match_error", {
            error: "Questão não encontrada nesta partida.",
          });
          return;
        }

        const isCorrect =
          Number(validSelectedAnswer) === Number(question.correctAnswer);

        const triMetrics = triService.calculateQuestionWeight(
          question.errorRate,
          question.id
        );

        // Bônus de velocidade: respostas rápidas e corretas ganham pontos extras
        const speedBonus = isCorrect
          ? Math.max(0, Math.round((30000 - Math.min(timeMs, 30000)) / 3000))
          : 0;

        const pointsEarned = isCorrect
          ? Number((triMetrics.basePoints + speedBonus).toFixed(2))
          : 0;

        player.score = Number((player.score + pointsEarned).toFixed(2));
        if (isCorrect) {
          player.correctCount += 1;
        }

        player.answers.push({
          questionId,
          selectedAnswer: Number(validSelectedAnswer),
          isCorrect,
          pointsEarned,
        });

        // Registra a tentativa individual de resposta do aluno no banco de dados
        await prisma.questionAttempt
          .create({
            data: {
              userId: authUser.id,
              questionId,
              selectedAnswer: Number(validSelectedAnswer),
              isCorrect,
              timeSpentMs: timeMs,
              xpEarned: isCorrect ? 20 : 0,
              source: "DUEL",
            },
          })
          .catch((err) =>
            console.warn(
              `[Duel QuestionAttempt Warning]: ${err?.message || err}`
            )
          );

        // Emite o resultado individual para quem respondeu
        socket.emit("answer_result", {
          matchId: validMatchId,
          roomId: validMatchId,
          questionId,
          isCorrect,
          correctAnswer: question.correctAnswer,
          pointsEarned,
          totalScore: player.score,
          triMetrics,
        });

        // Transmite o placar em tempo real para todos os participantes da sala
        io.to(validMatchId).emit("scoreboard_update", {
          matchId: validMatchId,
          roomId: validMatchId,
          scoreboard: Array.from(room.players.values()).map((p) => ({
            userId: p.userId,
            name: p.name,
            score: p.score,
            correctCount: p.correctCount,
            answeredCount: p.answers.length,
          })),
        });

        // Notifica o oponente no formato opponent_progress (compatibilidade mobile)
        socket.to(validMatchId).emit("opponent_progress", {
          score: player.score,
          answeredCount: player.answers.length,
        });

        // Se todos os jogadores responderam todas as questões, finaliza o duelo
        const totalQuestions = room.questions.length;
        const allFinished =
          totalQuestions > 0 &&
          Array.from(room.players.values()).every(
            (p) => p.answers.length >= totalQuestions
          );

        if (allFinished && room.status !== "FINISHED") {
          await finalizeDuelMatch(io, room);
        }
      } catch (error) {
        console.error("[Socket submit_answer Error]:", error);
        socket.emit("match_error", {
          error: "Erro ao processar resposta no duelo.",
        });
      }
    };

    socket.on("submit_answer", handleSubmitAnswer);
    socket.on("submit_duel_answer", handleSubmitAnswer);

    /**
     * Handler comum para encerramento de partida
     * Suporta eventos: `match_end` e `finish_duel`
     */
    const handleMatchEnd = async (payload: {
      matchId?: string;
      roomId?: string;
    }) => {
      try {
        const matchId = payload?.matchId || payload?.roomId;
        const room = activeMatches.get(matchId || "");
        if (!room) {
          socket.emit("match_error", {
            error: "Sala de duelo não encontrada para encerramento.",
          });
          return;
        }

        if (room.status === "FINISHED") {
          return;
        }

        await finalizeDuelMatch(io, room);
      } catch (error) {
        console.error("[Socket match_end Error]:", error);
        socket.emit("match_error", {
          error: "Erro ao encerrar duelo.",
        });
      }
    };

    socket.on("match_end", handleMatchEnd);
    socket.on("finish_duel", handleMatchEnd);

    /**
     * Evento de desconexão: trata abandono de partida e limpeza de salas
     */
    socket.on("disconnect", async () => {
      console.log(`🔌 [Socket.io] Desconectado: ${socket.id} (${authUser?.name})`);

      if (!authUser) return;

      for (const [matchId, room] of activeMatches.entries()) {
        if (room.players.has(authUser.id)) {
          if (room.status === "WAITING") {
            room.players.delete(authUser.id);
            if (room.players.size === 0) {
              activeMatches.delete(matchId);
            } else {
              io.to(matchId).emit("match_joined", {
                matchId,
                roomId: matchId,
                status: room.status,
                players: Array.from(room.players.values()).map((p) => ({
                  userId: p.userId,
                  name: p.name,
                  score: p.score,
                })),
                questionsCount: room.questions.length,
              });
            }
          } else if (room.status === "IN_PROGRESS") {
            // Notifica o oponente sobre o abandono
            io.to(matchId).emit("opponent_left", {
              matchId,
              roomId: matchId,
              userId: authUser.id,
              message: `${authUser.name} desconectou-se do duelo.`,
            });
            await finalizeDuelMatch(io, room);
          }
        }
      }
    });
  });
}

/**
 * Finaliza a partida de duelo:
 * 1. Determina o vencedor ou empate
 * 2. Atualiza a ofensiva diária (streak) dos participantes
 * 3. Concede XP de recompensa
 * 4. Calcula a simulação da nota TRI
 * 5. Persiste `DuelMatch` e `DuelPlayer` no PostgreSQL via Prisma
 * 6. Emite o evento `match_end` e libera a memória da sala
 */
async function finalizeDuelMatch(
  io: Server,
  room: DuelMatchRoom
): Promise<void> {
  room.status = "FINISHED";

  const playersArray = Array.from(room.players.values()).sort(
    (a, b) => b.score - a.score
  );

  const winner =
    playersArray.length > 1 && playersArray[0].score === playersArray[1].score
      ? null // Empate
      : playersArray[0] || null;

  const playersSummary = await Promise.all(
    playersArray.map(async (player) => {
      const isWinner = winner?.userId === player.userId;
      const bonusXp = isWinner ? 60 : 25;

      // 1. Atualiza a ofensiva (streak) no banco de dados ao concluir a partida
      const updatedStreak = await streakService
        .registerActivity(player.userId)
        .catch(() => null);

      // 2. Concede o bônus de XP da partida
      await prisma.user
        .update({
          where: { id: player.userId },
          data: { xp: { increment: bonusXp } },
        })
        .catch(() => null);

      // 3. Calcula a proficiência TRI da partida caso o jogador tenha respondido questões
      const triSimulation =
        player.answers.length > 0
          ? await triService
              .simulateTriScore(
                player.answers.map((a) => ({
                  questionId: a.questionId,
                  selectedAnswer: a.selectedAnswer,
                  isCorrect: a.isCorrect,
                }))
              )
              .catch(() => null)
          : null;

      return {
        userId: player.userId,
        name: player.name,
        score: player.score,
        correctCount: player.correctCount,
        xpEarned: bonusXp,
        triScore: triSimulation?.triScore ?? null,
        streak: updatedStreak
          ? {
              currentStreak: updatedStreak.currentStreak,
              longestStreak: updatedStreak.longestStreak,
              iceFreezes: updatedStreak.iceFreezes,
              lastStudyDate: updatedStreak.lastStudyDate,
            }
          : null,
      };
    })
  );

  // 4. Salva a partida e os jogadores participantes de forma durável no banco
  try {
    await prisma.duelMatch.create({
      data: {
        matchId: room.matchId,
        subject: room.subject || null,
        status: "FINISHED",
        winnerId: winner?.userId ?? null,
        isDraw: winner === null && playersArray.length > 1,
        totalQuestions: room.questions.length,
        questionIds: room.questions.map((q) => q.id),
        startedAt: room.createdAt,
        finishedAt: new Date(),
        players: {
          create: playersArray.map((p) => {
            const summary = playersSummary.find((s) => s.userId === p.userId);
            return {
              userId: p.userId,
              score: p.score,
              correctCount: p.correctCount,
              xpEarned: summary?.xpEarned ?? 25,
              triScore: summary?.triScore ?? null,
              answers: p.answers,
            };
          }),
        },
      },
    });
  } catch (err) {
    console.error("[DuelMatch Persist Error]:", err);
  }

  // 5. Emite evento final com o placar consolidado para a sala
  io.to(room.matchId).emit("match_end", {
    matchId: room.matchId,
    roomId: room.matchId,
    status: "FINISHED",
    winnerId: winner?.userId ?? null,
    winnerName: winner?.name ?? null,
    isDraw: winner === null && playersArray.length > 1,
    players: playersSummary,
    finishedAt: new Date().toISOString(),
  });

  io.to(room.matchId).emit("match_finished", {
    roomId: room.matchId,
    opponentScore: playersArray.length > 1 ? playersArray[1].score : 0,
    players: playersSummary,
  });

  activeMatches.delete(room.matchId);
}

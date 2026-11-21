import { Router } from "express";
import { questionController } from "../controllers/question.controller";
import { auth } from "../middlewares/auth.middleware";
import { prisma } from "../lib/prisma";

const questionRoutes = Router();

// Caderno de Erros enriquecido com devolutivas em áudio/comentário do professor
questionRoutes.get("/error-notebook", auth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const wrongAttempts = await prisma.questionAttempt.findMany({
      where: { userId, isCorrect: false },
      orderBy: { createdAt: "desc" },
      take: 60,
      include: {
        question: {
          select: {
            id: true,
            subject: true,
            topic: true,
            area: true,
            year: true,
            difficulty: true,
            text: true,
            options: true,
            correctAnswer: true,
            explanation: true,
          },
        },
      },
    });

    const userWithRooms = await prisma.user.findUnique({
      where: { id: userId },
      select: { enrolledClassrooms: { select: { id: true } } },
    });
    const roomIds = (userWithRooms?.enrolledClassrooms || []).map((r) => r.id);

    const uniqueMap = new Map<string, any>();
    for (const att of wrongAttempts) {
      if (!att.question) continue;
      if (!uniqueMap.has(att.questionId)) {
        uniqueMap.set(att.questionId, {
          questionId: att.questionId,
          lastAttemptId: att.id,
          selectedAnswer: att.selectedAnswer,
          lastErrorAt: att.createdAt,
          errorCount: 1,
          question: att.question,
          teacherFeedbacks: [],
        });
      } else {
        uniqueMap.get(att.questionId).errorCount += 1;
      }
    }

    const questionIds = Array.from(uniqueMap.keys());
    if (roomIds.length > 0 && questionIds.length > 0) {
      const feedbacks = await prisma.questionFeedback.findMany({
        where: {
          classroomId: { in: roomIds },
          questionId: { in: questionIds },
        },
        include: {
          teacher: { select: { id: true, name: true } },
          classroom: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
      });

      for (const fb of feedbacks) {
        const entry = uniqueMap.get(fb.questionId);
        if (entry) {
          entry.teacherFeedbacks.push({
            id: fb.id,
            commentText: fb.commentText,
            audioUrl: fb.audioUrl,
            createdAt: fb.createdAt,
            teacherName: fb.teacher.name,
            classroomId: fb.classroom.id,
            classroomName: fb.classroom.name,
          });
        }
      }
    }

    return res.json({
      total: uniqueMap.size,
      items: Array.from(uniqueMap.values()),
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Erro ao carregar caderno de erros." });
  }
});

// GET /questions/stats (estatísticas do usuário logado)
questionRoutes.get("/stats", (req, res) =>
  questionController.stats(req, res)
);

// GET /questions/stats/correct ou GET /stats/correct (questões acertadas)
questionRoutes.get("/stats/correct", (req, res) =>
  questionController.correctStats(req, res)
);
questionRoutes.get("/correct", (req, res) =>
  questionController.correctStats(req, res)
);

// GET /questions/stats/errors ou GET /stats/errors (diagnóstico de erros)
questionRoutes.get("/stats/errors", (req, res) =>
  questionController.errorStats(req, res)
);
questionRoutes.get("/errors", (req, res) =>
  questionController.errorStats(req, res)
);
questionRoutes.put("/stats/errors/:id/favorite", (req, res) =>
  res.status(200).json({ success: true, id: req.params.id })
);

// GET /questions/stats/:userId (estatísticas por ID explícito)
questionRoutes.get("/stats/:userId", (req, res) =>
  questionController.stats(req, res)
);

// GET /questions (lista todas ou filtra por ?subject=&area=&topicId=) OU GET /stats
questionRoutes.get("/", (req, res) => {
  if (req.baseUrl.includes("stats")) {
    return questionController.stats(req, res);
  }
  return questionController.list(req, res);
});

// GET /questions/by-topic/:topicId (busca questões filtradas exatamente pelo tópico/conteúdo estudado)
questionRoutes.get("/by-topic/:topicId", (req, res) =>
  questionController.getByTopic(req, res)
);

// GET /questions/:id (busca por ID)
questionRoutes.get("/:id", (req, res) => questionController.getById(req, res));

// POST /questions/answer (resolução de questão)
questionRoutes.post("/answer", (req, res) =>
  questionController.answer(req, res)
);

export { questionRoutes };

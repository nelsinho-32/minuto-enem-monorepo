import {
  initSentry,
  sentryRequestHandler,
  sentryErrorHandler,
  Sentry,
} from "./sentry";

// Inicializa a instrumentação do Sentry e profiling o mais cedo possível
initSentry();

import express from "express";
import http from "http";
import cors from "cors";
import path from "path";
import fs from "fs";
import os from "os";
import { Server as SocketIOServer } from "socket.io";
import "dotenv/config";
import { prisma } from "./lib/prisma";
import { streakRoutes } from "./routes/streak.routes";
import { authRoutes } from "./routes/auth.routes";
import { adminSchoolRoutes } from "./routes/admin-school.routes";
import { schoolRoutes } from "./routes/school.routes";
import { classroomRoutes } from "./routes/classroom.routes";
import { questionRoutes } from "./routes/question.routes";
import { searchRoutes } from "./routes/search.routes";
import { aiRoutes } from "./routes/ai.routes";
import { noteRoutes } from "./routes/note.routes";
import { trailRoutes } from "./routes/trail.routes";
import { taskRoutes } from "./routes/task.routes";
import { spacedRepetitionRoutes } from "./routes/spaced-repetition.routes";
import { syncRoutes } from "./routes/sync.routes";
import { announcementRoutes } from "./routes/announcement.routes";
import { streakService } from "./services/streak.service";
import { questionService } from "./services/question.service";
import { questionController } from "./controllers/question.controller";
import { setupDuelWebSocket } from "./websocket/duel.socket";
import { startBackgroundWorkers } from "./queues/background.queue";

// 1. Configuração do Servidor HTTP, Express, CORS e WebSocket (Socket.io)
const app = express();
const httpServer = http.createServer(app);

export const io = new SocketIOServer(httpServer, {
  cors: {
    origin: process.env.CORS_ORIGIN || "*",
    methods: ["GET", "POST"],
  },
});

setupDuelWebSocket(io);
startBackgroundWorkers();
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json());

// Middleware de rastreamento de requisições e escopo do Sentry
app.use(sentryRequestHandler);

// Servir arquivos estáticos da pasta de uploads (PDFs e documentos didáticos)
const uploadsDir = path.resolve(process.cwd(), "uploads");
const pdfsDir = path.join(uploadsDir, "pdfs");
if (!fs.existsSync(pdfsDir)) {
  fs.mkdirSync(pdfsDir, { recursive: true });
}
app.use("/uploads", express.static(uploadsDir));
app.use("/api/uploads", express.static(uploadsDir));

// Log de requisições para facilitar o diagnóstico de rotas chamadas pelo frontend
app.use((req, _res, next) => {
  console.log(
    `➡️ [${new Date().toLocaleTimeString()}] [${req.method}] ${req.originalUrl} - IP: ${req.ip}`
  );
  next();
});

// ==========================================
// ROTAS DA NOSSA API
// ==========================================

// Rota de Teste
app.get("/", (req, res) => {
  res.send("API do App do ENEM rodando perfeitamente! 🚀");
});

// Rotas de Autenticação (suporta /, /auth, /api e /api/auth), Salas, Questões e Ofensiva (Streak)
app.use("/", authRoutes);
app.use("/auth", authRoutes);
app.use("/api", authRoutes);
app.use("/api/auth", authRoutes);
app.use("/admin", adminSchoolRoutes);
app.use("/api/admin", adminSchoolRoutes);
app.use("/schools", schoolRoutes);
app.use("/api/schools", schoolRoutes);
app.use("/classrooms", classroomRoutes);
app.use("/api/classrooms", classroomRoutes);
app.use("/classes", classroomRoutes);
app.use("/api/classes", classroomRoutes);
app.use("/questions", questionRoutes);
app.use("/api/questions", questionRoutes);
app.use("/search", searchRoutes);
app.use("/api/search", searchRoutes);
app.use("/ai", aiRoutes);
app.use("/api/ai", aiRoutes);
app.use("/notes", noteRoutes);
app.use("/api/notes", noteRoutes);
app.use("/trails", trailRoutes);
app.use("/api/trails", trailRoutes);
app.use("/tasks", taskRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/spaced-repetition", spacedRepetitionRoutes);
app.use("/api/spaced-repetition", spacedRepetitionRoutes);
app.use("/flashcards", spacedRepetitionRoutes);
app.use("/api/flashcards", spacedRepetitionRoutes);
app.use("/streak", streakRoutes);
app.use("/api/streak", streakRoutes);
app.use("/sync", syncRoutes);
app.use("/api/sync", syncRoutes);
app.use("/announcements", announcementRoutes);
app.use("/api/announcements", announcementRoutes);
app.use("/stats", questionRoutes);
app.use("/api/stats", questionRoutes);

// Rota para buscar todas as questões (podemos filtrar por matéria depois)
app.get("/api/questions", async (req, res) => {
  try {
    const questions = await prisma.question.findMany({
      orderBy: { year: "desc" }, // Traz as mais recentes primeiro
    });

    return res.json(questions);
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ error: "Erro ao buscar questões do banco de dados." });
  }
});

// ==========================================
// ROTAS DE MATÉRIAS, TÓPICOS E AULAS
// ==========================================

// 1. Retorna todas as matérias, seus tópicos e os títulos das aulas do sistema
const getSubjectsHandler = async (_req: express.Request, res: express.Response) => {
  try {
    const subjects = await prisma.subject.findMany({
      include: {
        lessons: {
          where: { classroomId: null },
          select: { id: true, title: true, topicId: true, type: true },
          orderBy: { createdAt: "asc" },
        },
        topics: {
          select: {
            id: true,
            name: true,
            slug: true,
            _count: { select: { questions: true } },
          },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { name: "asc" },
    });
    return res.json(subjects);
  } catch (error) {
    return res.status(500).json({ error: "Erro ao buscar matérias" });
  }
};
app.get("/subjects", getSubjectsHandler);
app.get("/api/subjects", getSubjectsHandler);

// 2. Retorna os conteúdos completos da matéria: tópicos, aulas do sistema,
// materiais extras da turma do aluno daquela matéria e contagem exata de questões por tópico
app.get("/subjects/:id/contents", (req, res) =>
  questionController.getSubjectContents(req, res)
);
app.get("/api/subjects/:id/contents", (req, res) =>
  questionController.getSubjectContents(req, res)
);

// 3. Retorna uma matéria específica por ID ou Slug
const getSubjectByIdHandler = async (req: express.Request, res: express.Response) => {
  try {
    const id = String(req.params.id);
    const syncedSubject = await questionService.ensureSubjectSynchronized(id);

    const subject = await prisma.subject.findFirst({
      where: syncedSubject
        ? { id: syncedSubject.id }
        : {
            OR: [{ id }, { slug: id }],
          },
      include: {
        lessons: {
          where: { classroomId: null },
          select: {
            id: true,
            title: true,
            type: true,
            topicId: true,
            subjectId: true,
            createdAt: true,
          },
          orderBy: { createdAt: "asc" },
        },
        topics: {
          include: {
            _count: { select: { questions: true } },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!subject) {
      return res.status(404).json({ error: "Matéria não encontrada" });
    }

    return res.json(subject);
  } catch (error) {
    return res.status(500).json({ error: "Erro ao buscar detalhes da matéria" });
  }
};
app.get("/subjects/:id", getSubjectByIdHandler);
app.get("/api/subjects/:id", getSubjectByIdHandler);

// 4. Retorna o conteúdo completo de uma aula específica (incluindo matéria e tópico vinculados)
const getLessonByIdHandler = async (req: express.Request, res: express.Response) => {
  try {
    const lessonId = String(req.params.id);
    let lesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      include: {
        subject: true,
        topic: true,
      },
    });

    if (!lesson) return res.status(404).json({ error: "Aula não encontrada" });

    // Garante que a aula e sua matéria estejam sincronizadas com Topic e Questões
    if (lesson.subjectId && !lesson.topicId) {
      await questionService.ensureSubjectSynchronized(lesson.subjectId);
      lesson = await prisma.lesson.findUnique({
        where: { id: lessonId },
        include: {
          subject: true,
          topic: true,
        },
      });
    }

    const questionsCount = lesson?.topicId
      ? await prisma.question.count({
          where: {
            OR: [{ topicId: lesson.topicId }, { lessonId: lesson.id }],
          },
        })
      : 0;

    return res.json({
      ...lesson,
      questionsCount,
    });
  } catch (error) {
    return res.status(500).json({ error: "Erro ao buscar aula" });
  }
};
app.get("/lessons/:id", getLessonByIdHandler);
app.get("/api/lessons/:id", getLessonByIdHandler);

// ==========================================
// OBSERVABILIDADE E TRATAMENTO DE ERROS (SENTRY)
// ==========================================
// Configura o middleware de captura de erros do Sentry (deve vir após todas as rotas)
Sentry.setupExpressErrorHandler(app);
app.use(sentryErrorHandler);

// Middleware genérico final para respostas de erro JSON
app.use(
  (
    err: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error("[Unhandled API Error]:", err);
    const statusCode = typeof err.statusCode === "number" ? err.statusCode : 500;
    return res.status(statusCode).json({
      error: err.message || "Erro interno do servidor.",
    });
  }
);

// ==========================================
// INICIALIZAÇÃO DO SERVIDOR
// ==========================================
const PORT = Number(process.env.PORT) || 3333;
const HOST = "0.0.0.0";

function getLocalIpAddress(): string {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (
        iface.family === "IPv4" &&
        !iface.internal &&
        !iface.address.startsWith("169.254.") &&
        !iface.address.startsWith("172.")
      ) {
        return iface.address;
      }
    }
  }
  return "localhost";
}

httpServer.listen(PORT, HOST, () => {
  const localIp = getLocalIpAddress();
  console.log(`🚀 API e WebSocket (Socket.io) rodando localmente em: http://localhost:${PORT}`);
  console.log(`📱 API na rede Wi-Fi (Expo/Celular): http://${localIp}:${PORT}`);
  console.log(
    `📚 Busque as questões em: http://${localIp}:${PORT}/api/questions`,
  );

  // Rotina diária (a cada 24h) para verificação de inatividade da ofensiva
  setInterval(() => {
    streakService.processDailyInactivityJob().catch((err) => {
      console.error("[Inactivity Job Error]:", err);
    });
  }, 1000 * 60 * 60 * 24);
});

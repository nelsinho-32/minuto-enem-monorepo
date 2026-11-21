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
import { noteRoutes } from "./routes/note.routes";
import { trailRoutes } from "./routes/trail.routes";
import { taskRoutes } from "./routes/task.routes";
import { spacedRepetitionRoutes } from "./routes/spaced-repetition.routes";
import { reviewRoutes } from "./routes/review.routes";
import { syncRoutes } from "./routes/sync.routes";
import { announcementRoutes } from "./routes/announcement.routes";
import { essayRoutes } from "./routes/essay.routes";
import { chatRoutes } from "./routes/chat.routes";
import { notificationRoutes } from "./routes/notification.routes";
import { studyPlanRoutes } from "./routes/study-plan.routes";
import { teacherBankRoutes } from "./routes/teacher-bank.routes";
import { institutionalExamRoutes } from "./routes/institutional-exam.routes";
import { streakService } from "./services/streak.service";
import { questionService } from "./services/question.service";
import { getActiveStorageProviderName } from "./services/storage.service";
import { realtimeNotificationService } from "./services/realtime-notification.service";
import { questionController } from "./controllers/question.controller";
import { setupDuelWebSocket } from "./websocket/duel.socket";
import {
  searchSisuCourses,
  SISU_INSTITUTIONS,
  SISU_COURSE_DEFINITIONS,
  SISU_MODALITIES,
  getSisuStates,
} from "@minuto-enem/shared";
import { announcementService } from "./services/announcement.service";
import { setupChatWebSocket } from "./websocket/chat.socket";
import { socketAuthMiddleware } from "./websocket/socket-auth.middleware";
import { apiGeneralRateLimiter } from "./middlewares/rate-limit.middleware";
import { auth } from "./middlewares/auth.middleware";

// 1. Configuração de CORS flexível (múltiplas origens separadas por vírgula e curingas de túnel/subdomínio)
function buildCorsOriginValidator():
  | string
  | ((origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => void) {
  const rawCors = (process.env.CORS_ORIGIN || "*").trim();
  if (!rawCors || rawCors === "*") {
    return "*";
  }

  const allowedPatterns = rawCors
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return (origin, callback) => {
    // Permite clientes nativos (Expo Go / iOS / Android / curl) sem header Origin
    if (!origin) {
      return callback(null, true);
    }

    const isAllowed = allowedPatterns.some((pattern) => {
      if (pattern === "*") return true;
      if (pattern.startsWith("*.")) {
        const suffix = pattern.slice(1).toLowerCase();
        try {
          const parsed = new URL(origin);
          return parsed.hostname.toLowerCase().endsWith(suffix);
        } catch {
          return origin.toLowerCase().endsWith(suffix);
        }
      }
      return origin.replace(/\/+$/, "") === pattern.replace(/\/+$/, "");
    });

    if (isAllowed) {
      return callback(null, true);
    }

    // Em desenvolvimento, libera localhost automaticamente
    if (
      process.env.NODE_ENV !== "production" &&
      /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)
    ) {
      return callback(null, true);
    }

    return callback(new Error(`Origem CORS não autorizada: ${origin}`), false);
  };
}

// 2. Configuração do Servidor HTTP, Express, CORS e WebSocket (Socket.io)
export const app = express();
app.set(
  "trust proxy",
  process.env.TRUST_PROXY !== undefined
    ? Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY === "true"
    : 1
);
export const httpServer = http.createServer(app);
const corsOriginConfig = buildCorsOriginValidator();

export const io = new SocketIOServer(httpServer, {
  cors: {
    origin: corsOriginConfig,
    methods: ["GET", "POST"],
  },
});

// Middleware único de autenticação JWT para todas as conexões WebSocket (Chat + Duelo)
io.use(socketAuthMiddleware);
realtimeNotificationService.registerSocketServer(io);
setupDuelWebSocket(io);
setupChatWebSocket(io);

app.use(
  cors({
    origin: corsOriginConfig,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json({ limit: process.env.JSON_BODY_LIMIT || "2mb" }));

// Middleware de rastreamento de requisições e escopo do Sentry
app.use(sentryRequestHandler);

// Proteção geral de Rate Limiting (ignora mídias estáticas e /health)
app.use(apiGeneralRateLimiter);

// Servir arquivos estáticos da pasta de uploads (PDFs e documentos didáticos)
const uploadsDir = path.resolve(process.cwd(), "uploads");
const pdfsDir = path.join(uploadsDir, "pdfs");
if (!fs.existsSync(pdfsDir)) {
  fs.mkdirSync(pdfsDir, { recursive: true });
}
const essaysDir = path.join(uploadsDir, "essays");
if (!fs.existsSync(essaysDir)) {
  fs.mkdirSync(essaysDir, { recursive: true });
}
app.use("/uploads", express.static(uploadsDir));
app.use("/api/uploads", express.static(uploadsDir));

// Servir imagens locais oficiais das provas do ENEM (2009–2023)
const enemMediaCandidates = [
  path.resolve(process.cwd(), "questoes/enem-api/public"),
  path.resolve(process.cwd(), "../../questoes/enem-api/public"),
  path.resolve(__dirname, "../../../questoes/enem-api/public"),
];
const enemMediaDir = enemMediaCandidates.find((p) => fs.existsSync(p));
if (enemMediaDir) {
  app.use("/enem-media", express.static(enemMediaDir));
  app.use("/api/enem-media", express.static(enemMediaDir));
}

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

// Rota de Teste e Healthcheck completo de Infraestrutura
app.get("/", (req, res) => {
  res.send("API do App do ENEM rodando perfeitamente! 🚀");
});

const healthCheckHandler = async (_req: express.Request, res: express.Response) => {
  let dbStatus: "ok" | "error" = "ok";
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    dbStatus = "error";
  }

  return res.status(dbStatus === "ok" ? 200 : 503).json({
    status: dbStatus === "ok" ? "ok" : "degraded",
    uptimeSeconds: Math.round(process.uptime()),
    database: dbStatus,
    storageProvider: getActiveStorageProviderName(),
    rateLimitEnabled: process.env.DISABLE_RATE_LIMIT !== "true",
    websocketAuth: true,
    lanUrl: `http://${getLocalIpAddress()}:${PORT}`,
    timestamp: new Date().toISOString(),
  });
};
app.get("/health", healthCheckHandler);
app.get("/api/health", healthCheckHandler);

// Registro persistente de Expo Push Token para notificações móveis
const registerPushTokenHandler = async (
  req: express.Request,
  res: express.Response
) => {
  try {
    const userId = req.user?.id;
    const token = String(req.body?.token || "").trim();
    const platform = String(req.body?.platform || "expo");
    if (!userId || !token) {
      return res.status(400).json({ error: "Token de notificação push inválido." });
    }
    const ok = await realtimeNotificationService.registerPushToken(
      userId,
      token,
      platform
    );
    return res.json({ registered: ok });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Erro ao registrar push token." });
  }
};
app.post("/users/push-token", auth, registerPushTokenHandler);
app.post("/api/users/push-token", auth, registerPushTokenHandler);

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
app.use("/notes", noteRoutes);
app.use("/api/notes", noteRoutes);
app.use("/trails", trailRoutes);
app.use("/api/trails", trailRoutes);
app.use("/tasks", taskRoutes);
app.use("/api/tasks", taskRoutes);
app.use("/spaced-repetition", spacedRepetitionRoutes);
app.use("/api/spaced-repetition", spacedRepetitionRoutes);
app.use("/reviews", reviewRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/flashcards", spacedRepetitionRoutes);
app.use("/api/flashcards", spacedRepetitionRoutes);
app.use("/streak", streakRoutes);
app.use("/api/streak", streakRoutes);
app.use("/sync", syncRoutes);
app.use("/api/sync", syncRoutes);
app.use("/announcements", announcementRoutes);
app.use("/api/announcements", announcementRoutes);
app.use("/essays", essayRoutes);
app.use("/api/essays", essayRoutes);
app.use("/chat", chatRoutes);
app.use("/api/chat", chatRoutes);
app.use("/notifications", notificationRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/study-plan", studyPlanRoutes);
app.use("/api/study-plan", studyPlanRoutes);
app.use("/teacher-bank", teacherBankRoutes);
app.use("/api/teacher-bank", teacherBankRoutes);
app.use("/institutional-exams", institutionalExamRoutes);
app.use("/api/institutional-exams", institutionalExamRoutes);
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

// Catálogo relacional de Cursos, Instituições e Notas de Corte SISU (com cotas e overrides dinâmicos)
const sisuCoursesHandler = async (req: express.Request, res: express.Response) => {
  try {
    const overrides = await prisma.sisuCutoffOverride.findMany().catch(() => []);
    const results = searchSisuCourses({
      query: typeof req.query.q === "string" ? req.query.q : undefined,
      institution:
        typeof req.query.institution === "string" ? req.query.institution : undefined,
      course: typeof req.query.course === "string" ? req.query.course : undefined,
      state: typeof req.query.state === "string" ? req.query.state : undefined,
      areaFocus: typeof req.query.area === "string" ? req.query.area : undefined,
      modality: typeof req.query.modality === "string" ? req.query.modality : "AC",
      maxCutoff: req.query.maxCutoff ? Number(req.query.maxCutoff) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : 80,
      dynamicOverrides: overrides.map((o) => ({
        institution: o.institution,
        courseSlug: o.courseSlug,
        modality: o.modality,
        cutoffScore: o.cutoffScore,
        referenceEdition: o.referenceEdition,
      })),
    });

    return res.json({
      total: results.length,
      institutions: SISU_INSTITUTIONS.map((i) => ({
        sigla: i.sigla,
        name: i.name,
        city: i.city,
        state: i.state,
      })),
      courses: SISU_COURSE_DEFINITIONS.map((c) => ({
        slug: c.slug,
        name: c.name,
      })),
      modalities: SISU_MODALITIES,
      states: getSisuStates(),
      items: results,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || "Erro ao consultar catálogo SISU." });
  }
};
app.get("/sisu/courses", sisuCoursesHandler);
app.get("/api/sisu/courses", sisuCoursesHandler);

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
  const candidates: Array<{ address: string; score: number }> = [];

  for (const [name, list] of Object.entries(interfaces)) {
    const lower = name.toLowerCase();
    const isVirtual =
      lower.includes("vethernet") ||
      lower.includes("docker") ||
      lower.includes("wsl") ||
      lower.includes("vmware") ||
      lower.includes("virtualbox") ||
      lower.includes("hyper-v") ||
      lower.includes("tailscale");

    for (const iface of list || []) {
      if (
        iface.family === "IPv4" &&
        !iface.internal &&
        !iface.address.startsWith("169.254.")
      ) {
        let score = 0;
        if (lower.includes("wi-fi") || lower.includes("wifi") || lower.includes("wlan")) {
          score += 50;
        } else if (lower.includes("ethernet") || lower.includes("en0")) {
          score += 40;
        }
        if (isVirtual) score -= 100;
        if (iface.address.startsWith("192.168.")) score += 20;
        else if (iface.address.startsWith("10.")) score += 15;
        else if (iface.address.startsWith("172.")) score -= 10;

        candidates.push({ address: iface.address, score });
      }
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.address || "localhost";
}

if (process.env.VITEST !== "true") {
  // Worker periódico (a cada 60s) para disparar notificações de comunicados agendados no horário programado
  setInterval(() => {
    announcementService.dispatchDueScheduledAnnouncements().catch(() => {});
  }, 60_000);

  httpServer.listen(PORT, HOST, () => {
    const localIp = getLocalIpAddress();
    console.log(`🚀 API e WebSocket (Socket.io) rodando localmente em: http://localhost:${PORT}`);
    console.log(`📱 API na rede Wi-Fi (Expo/Celular): http://${localIp}:${PORT}`);
    console.log(
      `📦 Storage ativo: ${getActiveStorageProviderName().toUpperCase()} | Rate Limit: ${process.env.DISABLE_RATE_LIMIT === "true" ? "OFF" : "ON"} | WebSocket JWT Auth: ON`
    );
    console.log(`🩺 Healthcheck: http://${localIp}:${PORT}/health`);

    // Rotina diária (a cada 24h) para verificação de inatividade da ofensiva
    setInterval(() => {
      streakService.processDailyInactivityJob().catch((err) => {
        console.error("[Inactivity Job Error]:", err);
      });
    }, 1000 * 60 * 60 * 24);
  });
}

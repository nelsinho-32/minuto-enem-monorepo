import * as Sentry from "@sentry/node";
import { nodeProfilingIntegration } from "@sentry/profiling-node";
import type { RequestHandler, ErrorRequestHandler, Express } from "express";

const SENTRY_DSN = process.env.SENTRY_DSN;

/**
 * Inicialização global do Sentry no Backend Node.js
 */
export function initSentry() {
  if (!SENTRY_DSN) {
    console.info(
      "ℹ️ [Sentry] SENTRY_DSN não configurado nas variáveis de ambiente. Monitoramento em modo silencioso."
    );
  }

  Sentry.init({
    dsn: SENTRY_DSN || undefined,
    environment: process.env.NODE_ENV || "development",
    release: process.env.npm_package_version
      ? `minuto-enem-api@${process.env.npm_package_version}`
      : "minuto-enem-api@1.0.0",

    // Rastreamento de performance (Tracing)
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.2 : 1.0,

    // Profiling contínuo de CPU
    profileSessionSampleRate: process.env.NODE_ENV === "production" ? 0.2 : 1.0,
    profileLifecycle: "trace",

    integrations: [
      // Rastreamento automático de queries e transações do Prisma (Tracing)
      Sentry.prismaIntegration(),
      // Profiling de execução Node.js
      nodeProfilingIntegration(),
    ],

    // Filtra erros operacionais comuns (ex: 400 Bad Request, 404 Not Found) para evitar ruído
    beforeSend(event, hint) {
      const error = hint.originalException;
      if (
        error &&
        typeof error === "object" &&
        "statusCode" in error &&
        typeof (error as any).statusCode === "number"
      ) {
        const code = (error as any).statusCode;
        if (code >= 400 && code < 500) {
          return null;
        }
      }
      return event;
    },
  });
}

/**
 * Middleware de requisição do Sentry para capturar contexto e rota
 */
export const sentryRequestHandler: RequestHandler = (req, res, next) => {
  if (SENTRY_DSN) {
    Sentry.setContext("http_request", {
      url: req.originalUrl || req.url,
      method: req.method,
      query: req.query,
      ip: req.ip,
    });

    if (req.user) {
      Sentry.setUser({
        id: req.user.id,
        role: req.user.role,
        schoolId: req.user.schoolId || undefined,
      });
    }
  }
  next();
};

/**
 * Middleware de captura de erros do Sentry (compatível com Express)
 */
export const sentryErrorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (SENTRY_DSN) {
    Sentry.captureException(err, {
      extra: {
        route: req.originalUrl || req.url,
        method: req.method,
        body: req.body,
        userId: req.user?.id,
      },
    });
  }
  next(err);
};

/**
 * Objeto Handlers compatível com convenção Sentry.Handlers
 */
export const Handlers = {
  requestHandler: () => sentryRequestHandler,
  errorHandler: () => sentryErrorHandler,
};

// Injeta compatibilidade no próprio objeto Sentry
(Sentry as any).Handlers = Handlers;

export { Sentry };

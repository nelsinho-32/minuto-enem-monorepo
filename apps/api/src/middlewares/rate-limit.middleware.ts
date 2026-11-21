import rateLimit from "express-rate-limit";
import type { Request, Response } from "express";

const IS_RATE_LIMIT_DISABLED = process.env.DISABLE_RATE_LIMIT === "true";

function createJsonRateLimiter(options: {
  windowMs: number;
  limit: number;
  message: string;
  skip?: (req: Request) => boolean;
}) {
  return rateLimit({
    windowMs: options.windowMs,
    limit: options.limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skip: (req) => {
      if (IS_RATE_LIMIT_DISABLED) return true;
      return options.skip ? options.skip(req) : false;
    },
    handler: (req: Request, res: Response) => {
      const resetTime = (req as any).rateLimit?.resetTime as Date | undefined;
      const retryAfterSeconds = resetTime
        ? Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000))
        : Math.ceil(options.windowMs / 1000);

      return res.status(429).json({
        error: options.message,
        retryAfterSeconds,
      });
    },
  });
}

/**
 * Proteção contra força bruta em rotas de autenticação (/login, /register, /refresh).
 * Padrão: 25 tentativas a cada 15 minutos por IP.
 */
export const authRateLimiter = createJsonRateLimiter({
  windowMs: Number(process.env.RATE_LIMIT_AUTH_WINDOW_MS) || 15 * 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_AUTH_MAX) || 25,
  message:
    "Muitas tentativas de autenticação em sequência. Aguarde alguns minutos antes de tentar novamente.",
});

/**
 * Proteção anti-spam para envio de mensagens e criação de salas no Chat.
 * Padrão: 45 requisições por minuto por IP.
 */
export const chatWriteRateLimiter = createJsonRateLimiter({
  windowMs: Number(process.env.RATE_LIMIT_CHAT_WINDOW_MS) || 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_CHAT_MAX) || 45,
  message:
    "Você está enviando mensagens rápido demais. Aguarde alguns segundos e tente novamente.",
});

/**
 * Proteção para uploads de arquivos (fotos de redação manuscrita e PDFs didáticos).
 * Padrão: 20 uploads a cada 10 minutos por IP.
 */
export const uploadRateLimiter = createJsonRateLimiter({
  windowMs: Number(process.env.RATE_LIMIT_UPLOAD_WINDOW_MS) || 10 * 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_UPLOAD_MAX) || 20,
  message:
    "Limite temporário de envio de arquivos atingido. Aguarde alguns minutos antes de enviar novos arquivos.",
});

/**
 * Proteção geral de linha de base para a API REST e buscas.
 * Ignora arquivos estáticos (/enem-media, /uploads) e verificações de saúde (/health).
 * Padrão: 300 requisições por minuto por IP.
 */
export const apiGeneralRateLimiter = createJsonRateLimiter({
  windowMs: Number(process.env.RATE_LIMIT_GENERAL_WINDOW_MS) || 60 * 1000,
  limit: Number(process.env.RATE_LIMIT_GENERAL_MAX) || 300,
  message:
    "Muitas requisições simultâneas detectadas. Aguarde alguns segundos e tente novamente.",
  skip: (req) => {
    const url = req.originalUrl || req.url || "";
    return (
      url.startsWith("/enem-media") ||
      url.startsWith("/api/enem-media") ||
      url.startsWith("/uploads") ||
      url.startsWith("/api/uploads") ||
      url === "/health" ||
      url === "/api/health"
    );
  },
});

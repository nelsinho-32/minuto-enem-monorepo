import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import path from "path";
import dotenv from "dotenv";
import { Sentry } from "../sentry";

if (!process.env.DATABASE_URL) {
  dotenv.config({ path: path.resolve(__dirname, "../../.env") });
  dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
}
dotenv.config();

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);

export const basePrisma = new PrismaClient({ adapter });

/**
 * Dispara o enfileiramento assíncrono no BullMQ (ou fallback não-bloqueante)
 * para gerar e gravar o embedding da questão via Google Gemini sem travar a requisição HTTP.
 */
async function triggerAsyncQuestionEmbedding(questionId: string): Promise<void> {
  try {
    const { enqueueQuestionEmbedding } = await import(
      "../queues/background.queue"
    );
    await enqueueQuestionEmbedding(questionId);
  } catch (error) {
    console.warn(
      `[Prisma Embedding Extension] Falha ao enfileirar embedding da questão ${questionId}:`,
      error instanceof Error ? error.message : error
    );
  }
}

/**
 * Prisma Extension (Middleware moderno do Prisma):
 * Dispara automaticamente a fila de geração de embedding via Google Gemini (BullMQ)
 * sempre que uma questão for criada (`create`), atualizada (`update`) ou sofrer `upsert`.
 */
export const prisma = basePrisma.$extends({
  name: "sentry-slow-query-and-embedding",
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const start = Date.now();
        try {
          const result = await query(args);
          const duration = Date.now() - start;

          // Se a query levar mais de 500ms, emite breadcrumb e alerta para monitoramento
          if (duration >= 500) {
            Sentry.addBreadcrumb({
              category: "db.prisma.slow_query",
              message: `[Slow Query] ${model}.${operation} executou em ${duration}ms`,
              level: "warning",
              data: {
                model,
                operation,
                durationMs: duration,
              },
            });
            console.warn(
              `⚠️ [Prisma Slow Query] ${model}.${operation} demorou ${duration}ms`
            );
          }

          return result;
        } catch (error) {
          Sentry.captureException(error, {
            tags: {
              component: "prisma",
              model,
              operation,
            },
            extra: {
              model,
              operation,
            },
          });
          throw error;
        }
      },
    },
    question: {
      async create({ args, query }) {
        const result = await query(args);
        if (result?.id) {
          await triggerAsyncQuestionEmbedding(result.id);
        }
        return result;
      },
      async update({ args, query }) {
        const result = await query(args);
        if (result?.id) {
          await triggerAsyncQuestionEmbedding(result.id);
        }
        return result;
      },
      async upsert({ args, query }) {
        const result = await query(args);
        if (result?.id) {
          await triggerAsyncQuestionEmbedding(result.id);
        }
        return result;
      },
    },
  },
});

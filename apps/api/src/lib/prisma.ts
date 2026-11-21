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
 * Prisma Extension para monitoramento de queries lentas e erros via Sentry.
 */
export const prisma = basePrisma.$extends({
  name: "sentry-slow-query-monitor",
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const start = Date.now();
        try {
          const result = await query(args);
          const duration = Date.now() - start;

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
  },
});

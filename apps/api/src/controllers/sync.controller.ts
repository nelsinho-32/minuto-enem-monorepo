import { Request, Response } from "express";
import crypto from "crypto";
import {
  SyncActionSchema,
  type SyncAction,
} from "@minuto-enem/shared";
import { syncService } from "../services/sync.service";

export class SyncController {
  /**
   * Endpoint: POST /sync/batch
   * Recebe um lote de ações realizadas offline pelo app do estudante
   * e processa tudo de forma idempotente em uma transação do Prisma.
   */
  async batchSync(req: Request, res: Response): Promise<Response> {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        error: "Não autorizado: token de autenticação ausente ou inválido.",
      });
    }

    // Suporta envio de `{ actions: [...] }` ou diretamente de um array `[...]`
    let rawActions: any[] = [];

    if (Array.isArray(req.body)) {
      rawActions = req.body;
    } else if (req.body && Array.isArray(req.body.actions)) {
      rawActions = req.body.actions;
    } else if (req.body && Array.isArray(req.body.items)) {
      rawActions = req.body.items;
    } else {
      return res.status(400).json({
        error:
          "Formato de requisição inválido. Envie um objeto com a propriedade 'actions' contendo uma lista de ações, ou diretamente um array de ações.",
      });
    }

    if (rawActions.length === 0) {
      return res.status(400).json({
        error: "O lote de sincronização deve conter pelo menos uma ação.",
      });
    }

    // Normaliza itens heterogêneos para o schema SyncAction
    const normalizedActions: any[] = rawActions.map((item) => {
      // Se já está no formato canônico com `type` e `payload`
      if (item.type && item.payload) {
        return {
          idempotencyKey:
            item.idempotencyKey ||
            `sync_auto_${crypto.randomBytes(6).toString("hex")}`,
          type: item.type,
          payload: item.payload,
        };
      }

      // Se é uma tentativa de resposta direta { questionId, selectedOption / selectedAnswer }
      if (item.questionId !== undefined) {
        return {
          idempotencyKey:
            item.idempotencyKey ||
            item.id ||
            `sync_q_${item.questionId}_${item.answeredAt || Date.now()}`,
          type: "QUESTION_ATTEMPT",
          payload: {
            questionId: item.questionId,
            selectedAnswer:
              item.selectedAnswer !== undefined
                ? Number(item.selectedAnswer)
                : Number(item.selectedOption ?? 0),
            timeSpentMs: item.timeSpentMs ?? 15000,
            answeredAt: item.answeredAt || new Date().toISOString(),
          },
        };
      }

      // Se é um progresso de aula { lessonId, trailId? }
      if (item.lessonId !== undefined && item.title === undefined) {
        return {
          idempotencyKey:
            item.idempotencyKey ||
            item.id ||
            `sync_l_${item.lessonId}_${Date.now()}`,
          type: "LESSON_PROGRESS",
          payload: {
            lessonId: item.lessonId,
            trailId: item.trailId,
            completed: item.completed !== false,
            timestamp: item.timestamp || new Date().toISOString(),
          },
        };
      }

      // Se é uma anotação { title, content }
      if (item.title !== undefined) {
        return {
          idempotencyKey:
            item.idempotencyKey ||
            item.id ||
            `sync_n_${crypto.randomBytes(4).toString("hex")}`,
          type: "NOTE_UPSERT",
          payload: {
            id: item.id,
            title: item.title,
            content: item.content || "",
            tags: Array.isArray(item.tags) ? item.tags : [],
            lessonId: item.lessonId || null,
            updatedAt: item.updatedAt || new Date().toISOString(),
          },
        };
      }

      return item;
    });

    // Valida cada ação individualmente com Zod
    const validatedActions: SyncAction[] = [];
    const validationErrors: any[] = [];

    normalizedActions.forEach((item, index) => {
      const parsed = SyncActionSchema.safeParse(item);
      if (parsed.success) {
        validatedActions.push(parsed.data);
      } else {
        validationErrors.push({
          index,
          issues: parsed.error.issues,
        });
      }
    });

    if (validationErrors.length > 0) {
      return res.status(400).json({
        error: "Algumas ações no lote de sincronização são inválidas.",
        validationErrors,
      });
    }

    try {
      const updatedState = await syncService.processBatchSync(
        userId,
        validatedActions
      );

      return res.status(200).json({
        message: "Sincronização offline processada com sucesso.",
        data: updatedState,
      });
    } catch (error: any) {
      console.error("[SyncController batchSync Error]:", error);
      return res.status(error.statusCode || 500).json({
        error: error.message || "Erro interno ao processar sincronização.",
      });
    }
  }
}

export const syncController = new SyncController();

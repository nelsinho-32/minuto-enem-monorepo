import { Request, Response } from "express";
import { aiService } from "../services/ai.service";
import { triService } from "../services/tri.service";
import {
  enqueueEssayOcrCorrection,
  getEssayOcrJobStatus,
} from "../queues/background.queue";
import { AppError } from "../errors/AppError";

export class AiController {
  /**
   * POST /api/ai/tutor
   * Body: { questionId?, studentDoubt?, message?, selectedOption?, previousInteractionId?, userId? }
   */
  async tutorQuestion(req: Request, res: Response): Promise<Response> {
    try {
      const {
        questionId,
        studentDoubt,
        message,
        selectedOption,
        previousInteractionId,
        userId: bodyUserId,
      } = req.body;

      const userId = req.user?.id || bodyUserId;
      const doubt = studentDoubt || message;

      const result = await aiService.tutorQuestionRAG({
        questionId,
        userId,
        studentDoubt: doubt,
        selectedOption,
        previousInteractionId,
      });

      return res.status(200).json({
        ...result,
        reply: result.tutorGuidance,
        content: result.tutorGuidance,
      });
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * POST /api/ai/tutor/stream
   * Stream SSE com o raciocínio socrático em tempo real
   */
  async tutorQuestionStream(req: Request, res: Response): Promise<void> {
    try {
      const {
        questionId,
        studentDoubt,
        message,
        selectedOption,
        previousInteractionId,
        userId: bodyUserId,
      } = req.body;

      const userId = req.user?.id || bodyUserId;
      const doubt = studentDoubt || message;

      const result = await aiService.tutorQuestionRAG({
        questionId,
        userId,
        studentDoubt: doubt,
        selectedOption,
        previousInteractionId,
      });

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const text = result.tutorGuidance;
      const chunks = text.split(/(?=[ \n])/);

      for (const chunk of chunks) {
        res.write(`data: ${JSON.stringify({ delta: chunk })}\n\n`);
        await new Promise((r) => setTimeout(r, 15));
      }

      res.write("data: [DONE]\n\n");
      res.end();
    } catch (error) {
      this.handleError(error, res);
    }
  }

  /**
   * POST /api/ai/essay
   * Body: { theme?, essayText?, imageBase64?, imageMimeType? }
   */
  async gradeEssay(req: Request, res: Response): Promise<Response> {
    try {
      const { theme, essayText, imageBase64, imageMimeType } = req.body;

      const result = await aiService.gradeEssay({
        theme,
        essayText,
        imageBase64,
        imageMimeType,
      });

      return res.status(200).json(result);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * POST /api/ai/essay/async
   * Enfileira a correção de redação (OCR + IA) no BullMQ para evitar timeouts HTTP.
   */
  async enqueueEssay(req: Request, res: Response): Promise<Response> {
    try {
      const { theme, essayText, imageBase64, imageMimeType, userId } = req.body;
      const result = await enqueueEssayOcrCorrection({
        theme,
        essayText,
        imageBase64,
        imageMimeType,
        userId: req.user?.id || userId,
      });

      return res.status(result.queued ? 202 : 200).json(result);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * GET /api/ai/essay/job/:jobId
   * Consulta o status de processamento da redação na fila BullMQ.
   */
  async getEssayJob(req: Request, res: Response): Promise<Response> {
    try {
      const jobId = req.params.jobId as string;
      const status = await getEssayOcrJobStatus(jobId);

      if (!status) {
        return res
          .status(404)
          .json({ error: "Job não encontrado na fila de redações." });
      }

      return res.status(200).json(status);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * POST /api/ai/tri/simulate
   * Body: { answers: [{ questionId, selectedAnswer?, isCorrect? }] }
   */
  async simulateTri(req: Request, res: Response): Promise<Response> {
    try {
      const { answers } = req.body;
      const result = await triService.simulateTriScore(answers);

      return res.status(200).json(result);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * POST /api/ai/distractor/diagnose
   * Body: { questionId: string, selectedOption: number | string, studentDoubt?: string }
   */
  async diagnoseDistractor(req: Request, res: Response): Promise<Response> {
    try {
      const { questionId, selectedOption, studentDoubt } = req.body;

      const result = await aiService.diagnoseDistractor({
        questionId,
        selectedOption,
        studentDoubt,
      });

      return res.status(200).json(result);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * POST /api/ai/questions/generate
   * Body: { skill: string, area?: string, subject?: string, difficulty?: 'EASY'|'MEDIUM'|'HARD', saveToDatabase?: boolean }
   */
  async generateQuestion(req: Request, res: Response): Promise<Response> {
    try {
      const { skill, area, subject, difficulty, saveToDatabase } = req.body;

      const result = await aiService.generateEnemQuestion({
        skill,
        area,
        subject,
        difficulty,
        saveToDatabase,
      });

      return res.status(201).json(result);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  private handleError(error: unknown, res: Response): Response {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({
        error: error.message,
      });
    }

    console.error("[AiController Error]:", error);
    return res.status(500).json({
      error: "Erro interno no motor pedagógico de IA / TRI.",
    });
  }
}

export const aiController = new AiController();


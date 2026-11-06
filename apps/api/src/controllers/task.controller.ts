import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { taskService } from "../services/task.service";
import { AppError } from "../errors/AppError";
import { JwtPayloadData } from "../middlewares/auth.middleware";

const JWT_SECRET = process.env.JWT_SECRET || "enem-super-secret-jwt-key-2026";

function extractUserIdFromRequest(req: Request): string | undefined {
  let userId: string | undefined =
    req.user?.id ||
    req.body?.userId ||
    req.body?.studentId ||
    (req.query?.userId as string | undefined) ||
    (req.query?.studentId as string | undefined);

  if (!userId && req.headers.authorization) {
    const [, token] = req.headers.authorization.split(" ");
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as JwtPayloadData;
        userId = decoded.sub;
      } catch {
        // Token inválido ou expirado
      }
    }
  }

  return userId;
}

export class TaskController {
  /**
   * GET /tasks/questions ou GET /tasks/questions/filter
   * Permite ao professor filtrar questões do banco do ENEM por matéria, ano, assunto ou dificuldade
   * para o modo de Seleção Manual.
   */
  async filterQuestions(req: Request, res: Response): Promise<Response> {
    try {
      const {
        subject,
        subjectId,
        topic,
        topicId,
        year,
        difficulty,
        area,
        search,
        limit,
      } = req.query;

      const questions = await taskService.filterQuestionsForSelection({
        subject: subject as string | undefined,
        subjectId: subjectId as string | undefined,
        topic: topic as string | undefined,
        topicId: topicId as string | undefined,
        year: year as string | undefined,
        difficulty: difficulty as string | undefined,
        area: area as string | undefined,
        search: search as string | undefined,
        limit: limit as string | undefined,
      });

      return res.status(200).json(questions);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * GET /tasks ou GET /tasks/classroom/:classId
   * Listagem de tarefas com escopo estritamente isolado por aluno e turma
   */
  async list(req: Request, res: Response): Promise<Response> {
    try {
      const classId = (req.params.classId ||
        req.params.id ||
        req.query.classId ||
        req.query.classroomId) as string | undefined;
      const user = req.user || extractUserIdFromRequest(req);

      const tasks = await taskService.listTasks(classId, user);
      return res.status(200).json(tasks);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * GET /tasks/:id
   */
  async getById(req: Request, res: Response): Promise<Response> {
    try {
      const user = req.user || extractUserIdFromRequest(req);
      const task = await taskService.getTaskById(
        req.params.id as string,
        user
      );
      return res.status(200).json(task);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * POST /tasks
   * Cria uma nova tarefa suportando Seleção Manual (MANUAL_SELECTION),
   * Sorteio Inteligente por Assunto (RANDOM_BY_TOPIC) e Questão Autoral (CUSTOM_TEACHER_QUESTIONS).
   */
  async create(req: Request, res: Response): Promise<Response> {
    try {
      const classIdFromParams = (req.params.classId || req.params.id) as
        | string
        | undefined;
      const payload = {
        ...req.body,
        ...(classIdFromParams && !req.body?.classId && !req.body?.classroomId
          ? { classroomId: classIdFromParams, classId: classIdFromParams }
          : {}),
      };

      const task = await taskService.createTask(payload);
      return res.status(201).json(task);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * POST /tasks/:taskId/submit
   * Registra a conclusão da tarefa pelo aluno, salva a nota para o painel do professor
   * e dispara a atualização de TRI, Repetição Espaçada (SM-2) e Ofensiva (Streak sem duplicar no dia).
   */
  async submit(req: Request, res: Response): Promise<Response> {
    try {
      const taskId = (req.params.taskId || req.params.id) as string;
      const userId = extractUserIdFromRequest(req);

      const result = await taskService.submitTask(taskId, {
        ...req.body,
        userId,
      });

      return res.status(200).json(result);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * PUT / PATCH /tasks/:id
   */
  async update(req: Request, res: Response): Promise<Response> {
    try {
      const task = await taskService.updateTask(
        req.params.id as string,
        req.body
      );
      return res.status(200).json(task);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * DELETE /tasks/:id
   */
  async delete(req: Request, res: Response): Promise<Response> {
    try {
      const result = await taskService.deleteTask(req.params.id as string);
      return res.status(200).json(result);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  private handleError(error: unknown, res: Response): Response {
    if (error instanceof AppError) {
      return res.status(error.statusCode).json({ error: error.message });
    }

    console.error("[TaskController Error]:", error);
    return res
      .status(500)
      .json({ error: "Erro interno ao gerenciar tarefas da turma." });
  }
}

export const taskController = new TaskController();

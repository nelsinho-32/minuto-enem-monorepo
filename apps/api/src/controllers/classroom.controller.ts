import { Request, Response } from "express";
import { classroomService } from "../services/classroom.service";
import { storageService } from "../services/storage.service";
import { AppError } from "../errors/AppError";

export class ClassroomController {
  /**
   * GET /api/classrooms
   * Lista as turmas associadas ao usuário logado (como professor ou aluno).
   */
  async list(req: Request, res: Response): Promise<Response> {
    try {
      const userId = req.user?.id;
      const role = req.user?.role;

      const classrooms = await classroomService.listClassrooms(userId, role);
      return res.status(200).json(classrooms);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * GET /api/classrooms/:id
   * Retorna os detalhes de uma sala pelo ID ou Código.
   */
  async getById(req: Request, res: Response): Promise<Response> {
    try {
      const classroomId = req.params.id as string;
      const userId = req.user?.id;

      const classroom = await classroomService.getClassroomById(
        classroomId,
        userId
      );
      return res.status(200).json(classroom);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * POST /api/classrooms
   * Requer middlewares: `authenticate` e `isTeacher`
   */
  async create(req: Request, res: Response): Promise<Response> {
    try {
      const { name, code, schoolId } = req.body;
      const teacherId = req.user!.id;

      const classroom = await classroomService.createClassroom({
        name,
        code,
        schoolId: schoolId || (req.user as any)?.schoolId || "default-school",
        teacherId,
      });

      return res.status(201).json(classroom);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * PUT / PATCH /api/classrooms/:id
   * Atualiza nome ou código da sala (apenas pelo professor responsável).
   */
  async update(req: Request, res: Response): Promise<Response> {
    try {
      const classroomId = req.params.id as string;
      const teacherId = req.user!.id;
      const { name, code } = req.body;

      const updated = await classroomService.updateClassroom(
        classroomId,
        { name, code },
        teacherId
      );

      return res.status(200).json(updated);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * DELETE /api/classrooms/:id
   * Remove a sala de aula (apenas pelo professor responsável).
   */
  async delete(req: Request, res: Response): Promise<Response> {
    try {
      const classroomId = req.params.id as string;
      const teacherId = req.user!.id;

      const result = await classroomService.deleteClassroom(
        classroomId,
        teacherId
      );

      return res.status(200).json(result);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * POST /api/classrooms/enroll
   * Requer middleware: `authenticate`
   */
  async enroll(req: Request, res: Response): Promise<Response> {
    try {
      const { code } = req.body;
      const studentId = req.user!.id;

      const classroom = await classroomService.enrollStudent(code, studentId);
      return res.status(200).json(classroom);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * POST /api/classrooms/:id/unenroll
   * Permite ao aluno desvincular-se da turma.
   */
  async unenroll(req: Request, res: Response): Promise<Response> {
    try {
      const classroomId = req.params.id as string;
      const studentId = req.user!.id;

      const result = await classroomService.unenrollStudent(
        classroomId,
        studentId
      );

      return res.status(200).json(result);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * GET /api/classrooms/:id/students
   * Lista os alunos matriculados na sala.
   */
  async listStudents(req: Request, res: Response): Promise<Response> {
    try {
      const classroomId = req.params.id as string;
      const teacherId = req.user?.id;

      const students = await classroomService.listStudents(
        classroomId,
        teacherId
      );

      return res.status(200).json(students);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * POST /api/classrooms/:id/lessons
   * Cria uma nova aula customizada vinculada especificamente à turma informada.
   * Permite ao professor enviar título, descrição e youtubeUrl.
   * Requer autenticação e perfil de professor.
   */
  async createLesson(req: Request, res: Response): Promise<Response> {
    try {
      const classroomId = req.params.id as string;
      const teacherId = req.user!.id;
      const {
        title,
        type,
        description,
        content,
        fileUrl,
        youtubeUrl,
        subjectId,
        topicId,
        subject,
        topic,
      } = req.body;

      const lesson = await classroomService.createLesson(
        classroomId,
        teacherId,
        {
          title,
          type,
          description,
          content,
          fileUrl,
          youtubeUrl,
          subjectId,
          topicId,
          subject,
          topic,
        }
      );

      return res.status(201).json(lesson);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * GET /api/classrooms/:id/lessons
   * Lista as aulas customizadas da turma.
   */
  async listLessons(req: Request, res: Response): Promise<Response> {
    try {
      const classroomId = req.params.id as string;
      const userId = req.user?.id;

      const lessons = await classroomService.listClassroomLessons(
        classroomId,
        userId
      );

      return res.status(200).json(lessons);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * GET / POST /api/classrooms/:id/copilot-analytics
   */
  async copilotAnalytics(req: Request, res: Response): Promise<Response> {
    try {
      const classroomId = req.params.id as string;
      const teacherId = req.user?.id;

      const result = await classroomService.generateCopilotAnalyticsAndTask(
        classroomId,
        teacherId
      );

      return res.status(200).json(result);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * PATCH / POST /api/classrooms/tasks/:taskId/approve
   */
  async approveTask(req: Request, res: Response): Promise<Response> {
    try {
      const taskId = req.params.taskId as string;
      const teacherId = req.user?.id;

      const result = await classroomService.approveTask(taskId, teacherId);
      return res.status(200).json(result);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * GET /api/classrooms/teacher-tracking
   */
  async teacherTracking(req: Request, res: Response): Promise<Response> {
    try {
      const teacherId = req.user?.id;
      const classroomId = (req.query.classId || req.params.id) as string | undefined;

      const result = await classroomService.getTeacherTracking(
        teacherId,
        classroomId
      );

      return res.status(200).json(result);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * GET /api/classrooms/tasks/ai-suggestions
   */
  async getAiSuggestions(req: Request, res: Response): Promise<Response> {
    try {
      const classId = (req.query.classId || req.params.id) as string | undefined;
      const subject = req.query.subject as string | undefined;

      const suggestions = await classroomService.getAiTaskSuggestions(
        classId,
        subject
      );

      return res.status(200).json(suggestions);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * POST /api/classrooms/tasks/approve-suggestion
   */
  async approveSuggestion(req: Request, res: Response): Promise<Response> {
    try {
      const teacherId = req.user?.id;
      const createdTask = await classroomService.approveCopilotSuggestion(
        req.body,
        teacherId
      );

      return res.status(201).json(createdTask);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * POST /api/classrooms/:id/materials/upload-pdf
   * Realiza o upload de arquivos PDF de materiais didáticos da turma.
   * Salva via StorageService desacoplado e retorna a URL pública gerada (fileUrl).
   */
  async uploadPdf(req: Request, res: Response): Promise<Response> {
    try {
      const classroomId = req.params.id as string;
      const teacherId = req.user?.id;
      const file = req.file;

      if (!file) {
        throw new AppError("Nenhum arquivo PDF foi enviado.", 400);
      }

      if (classroomId && classroomId !== "temp") {
        await classroomService.validateTeacherClassroomAccess(
          classroomId,
          teacherId || ""
        );
      }

      const stored = await storageService.saveFile(file, "pdfs");

      return res.status(201).json({
        fileUrl: stored.fileUrl,
        originalName: stored.originalName,
        size: stored.size,
        mimeType: stored.mimeType,
        fileName: stored.fileName,
      });
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * GET /classrooms/:id/analytics
   * Retorna análise aprofundada da turma: Top 5 erros, lista de alunos e alunos em risco
   */
  async analytics(req: Request, res: Response): Promise<Response> {
    try {
      const classroomId = req.params.id as string;
      const analytics = await classroomService.getClassroomAnalytics(classroomId);
      return res.status(200).json(analytics);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  /**
   * POST /classrooms/:id/tasks
   * Atribui uma tarefa ou trilha específica para todos os alunos daquela turma
   */
  async assignTask(req: Request, res: Response): Promise<Response> {
    try {
      const classroomId = req.params.id as string;
      const teacherId = req.user!.id;
      const result = await classroomService.assignTaskOrTrail(
        classroomId,
        teacherId,
        req.body
      );
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

    console.error("[ClassroomController Error]:", error);
    return res.status(500).json({
      error: "Erro interno ao gerenciar sala de aula.",
    });
  }
}

export const classroomController = new ClassroomController();

import {
  CreateTaskInputSchema,
  UpdateTaskInputSchema,
  type CreateTaskInput,
  type UpdateTaskInput,
  type CustomTeacherQuestionInput,
} from "@minuto-enem/shared";
import { Role } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { AppError } from "../errors/AppError";
import { questionService, slugifyText } from "./question.service";
import { triService } from "./tri.service";
import { spacedRepetitionService } from "./spaced-repetition.service";
import { streakService } from "./streak.service";

export {
  CreateTaskInputSchema,
  UpdateTaskInputSchema,
  type CreateTaskInput,
  type UpdateTaskInput,
} from "@minuto-enem/shared";

export interface TaskFilterQuestionsParams {
  subject?: string;
  subjectId?: string;
  topic?: string;
  topicId?: string;
  year?: number | string;
  difficulty?: string;
  area?: string;
  search?: string;
  limit?: number | string;
}

export interface SubmitTaskAnswerItem {
  questionId: string;
  selectedAnswer?: number;
  answer?: number;
  selectedOption?: number;
  optionIndex?: number;
  timeSpentMs?: number;
}

export interface SubmitTaskInput {
  userId?: string;
  studentId?: string;
  answers?: SubmitTaskAnswerItem[] | Record<string, number>;
  score?: number;
  correctCount?: number;
  totalQuestions?: number;
  timeSpentMs?: number;
}

/**
 * Converte rótulos de dificuldade em português ou inglês para o padrão do banco ("EASY" | "MEDIUM" | "HARD").
 */
function normalizeDifficulty(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const clean = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();

  if (clean === "EASY" || clean === "FACIL") return "EASY";
  if (clean === "MEDIUM" || clean === "MEDIO" || clean === "MODERADO")
    return "MEDIUM";
  if (clean === "HARD" || clean === "DIFICIL") return "HARD";
  return undefined;
}

/**
 * Embaralhamento Fisher-Yates para sorteio inteligente e imparcial de questões.
 */
function shuffleArray<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export class TaskService {
  /**
   * Filtra questões do banco do ENEM por matéria, ano, assunto/tópico, dificuldade ou busca textual
   * para apoiar o modo de Seleção Manual pelo professor.
   */
  async filterQuestionsForSelection(params: TaskFilterQuestionsParams) {
    const subjectKey = (params.subjectId || params.subject || "").trim();
    const topicKey = (params.topicId || params.topic || "").trim();
    const yearNum =
      params.year !== undefined && params.year !== ""
        ? Number(params.year)
        : undefined;
    const difficulty = normalizeDifficulty(params.difficulty);
    const search = params.search?.trim();
    const takeLimit =
      params.limit && Number(params.limit) > 0
        ? Math.min(Number(params.limit), 100)
        : 50;

    let resolvedSubjectId: string | undefined;
    let resolvedSubjectName: string | undefined;

    if (subjectKey) {
      const subject = await questionService.ensureSubjectSynchronized(subjectKey);
      if (subject) {
        resolvedSubjectId = subject.id;
        resolvedSubjectName = subject.name;
      }
    }

    let resolvedTopicId: string | undefined;
    let resolvedTopicName: string | undefined;

    if (topicKey) {
      const topicRecord = await prisma.topic.findFirst({
        where: {
          OR: [
            { id: topicKey },
            { slug: { equals: topicKey, mode: "insensitive" } },
            { slug: { equals: slugifyText(topicKey), mode: "insensitive" } },
            { name: { contains: topicKey, mode: "insensitive" } },
          ],
          ...(resolvedSubjectId ? { subjectId: resolvedSubjectId } : {}),
        },
      });
      if (topicRecord) {
        resolvedTopicId = topicRecord.id;
        resolvedTopicName = topicRecord.name;
      } else {
        resolvedTopicName = topicKey;
      }
    }

    return prisma.question.findMany({
      where: {
        ...(resolvedSubjectId
          ? {
              OR: [
                { subjectId: resolvedSubjectId },
                ...(resolvedSubjectName
                  ? [
                      {
                        subject: {
                          equals: resolvedSubjectName,
                          mode: "insensitive" as const,
                        },
                      },
                    ]
                  : []),
              ],
            }
          : subjectKey
          ? { subject: { contains: subjectKey, mode: "insensitive" } }
          : {}),
        ...(resolvedTopicId
          ? { topicId: resolvedTopicId }
          : resolvedTopicName
          ? {
              OR: [
                { topic: { contains: resolvedTopicName, mode: "insensitive" } },
                { text: { contains: resolvedTopicName, mode: "insensitive" } },
              ],
            }
          : {}),
        ...(yearNum && !Number.isNaN(yearNum) ? { year: yearNum } : {}),
        ...(difficulty ? { difficulty } : {}),
        ...(params.area
          ? { area: { contains: params.area.trim(), mode: "insensitive" } }
          : {}),
        ...(search
          ? { text: { contains: search, mode: "insensitive" } }
          : {}),
      },
      include: {
        subjectRef: {
          select: { id: true, name: true, slug: true, icon: true },
        },
        topicRef: {
          select: { id: true, name: true, slug: true },
        },
      },
      orderBy: [{ year: "desc" }, { createdAt: "desc" }],
      take: takeLimit,
    });
  }

  /**
   * Lista tarefas com isolamento rigoroso de escopo (Tenant & Classroom isolation):
   * - Aluno (STUDENT): OBRIGATORIAMENTE filtra tasks onde task.classroomId esteja contido
   *   na lista de turmas em que o aluno logado está matriculado (student.enrolledClassrooms).
   *   Alunos de outras escolas/turmas NUNCA recebem tarefas que não lhes pertencem.
   * - Professor (TEACHER): Visualiza apenas as tarefas das turmas que ele mesmo gerencia.
   * - Gestor Escolar (SCHOOL): Visualiza apenas as tarefas das turmas pertencentes à sua escola.
   * - Admin (ADMIN): Visualização ampla ou filtrada por turma.
   * - Não autenticado: Retorna lista vazia ([]).
   */
  async listTasks(classId?: string, userOrUserId?: any) {
    let currentUser: { id: string; role: Role; schoolId?: string | null } | null = null;

    if (userOrUserId && typeof userOrUserId === "object" && userOrUserId.id) {
      currentUser = {
        id: userOrUserId.id,
        role: userOrUserId.role || Role.STUDENT,
        schoolId: userOrUserId.schoolId,
      };
    } else if (typeof userOrUserId === "string" && userOrUserId.trim()) {
      currentUser = await prisma.user.findUnique({
        where: { id: userOrUserId.trim() },
        select: { id: true, role: true, schoolId: true },
      });
    }

    if (!currentUser) {
      return [];
    }

    let whereClause: any = {};
    const cleanClassId = classId?.trim();

    if (currentUser.role === Role.STUDENT) {
      // 1. Busca as turmas nas quais o aluno está efetivamente matriculado
      const studentWithClassrooms = await prisma.user.findUnique({
        where: { id: currentUser.id },
        select: {
          enrolledClassrooms: {
            select: { id: true, code: true, schoolId: true },
          },
        },
      });

      const enrolledClassrooms = studentWithClassrooms?.enrolledClassrooms || [];
      const enrolledIds = enrolledClassrooms.map((c) => c.id);
      const enrolledCodes = enrolledClassrooms.map((c) => c.code.toUpperCase());

      // Aluno não matriculado em turmas não recebe tarefas
      if (enrolledIds.length === 0) {
        return [];
      }

      if (cleanClassId) {
        // Se foi requisitada uma turma específica, valida se o aluno está matriculado nela
        const targetClass = enrolledClassrooms.find(
          (c) =>
            c.id === cleanClassId ||
            c.code.toUpperCase() === cleanClassId.toUpperCase()
        );

        if (!targetClass) {
          // Bloqueia vazamento de tarefas de outras turmas/escolas
          return [];
        }

        whereClause = {
          OR: [
            { classroomId: targetClass.id },
            { classId: targetClass.id },
            { classId: targetClass.code },
          ],
          status: { in: ["APPROVED", "COMPLETED"] },
        };
      } else {
        // Feed/Mural geral: APENAS tarefas das turmas do aluno
        whereClause = {
          OR: [
            { classroomId: { in: enrolledIds } },
            { classId: { in: [...enrolledIds, ...enrolledCodes] } },
          ],
          status: { in: ["APPROVED", "COMPLETED"] },
        };
      }
    } else if (currentUser.role === Role.TEACHER) {
      // 2. Professor: apenas tarefas das turmas que ele leciona
      if (cleanClassId) {
        const classroom = await prisma.classroom.findFirst({
          where: {
            OR: [
              { id: cleanClassId },
              { code: { equals: cleanClassId.toUpperCase(), mode: "insensitive" } },
            ],
            teacherId: currentUser.id,
          },
          select: { id: true, code: true },
        });

        if (!classroom) {
          return [];
        }

        whereClause = {
          OR: [
            { classroomId: classroom.id },
            { classId: classroom.id },
            { classId: classroom.code },
          ],
        };
      } else {
        const teacherClassrooms = await prisma.classroom.findMany({
          where: { teacherId: currentUser.id },
          select: { id: true, code: true },
        });

        const tIds = teacherClassrooms.map((c) => c.id);
        const tCodes = teacherClassrooms.map((c) => c.code.toUpperCase());

        if (tIds.length === 0) {
          return [];
        }

        whereClause = {
          OR: [
            { classroomId: { in: tIds } },
            { classId: { in: [...tIds, ...tCodes] } },
          ],
        };
      }
    } else if (currentUser.role === Role.SCHOOL) {
      // 3. Gestor Escolar: apenas turmas vinculadas à sua escola
      const schoolClassrooms = await prisma.classroom.findMany({
        where: { schoolId: currentUser.schoolId || "" },
        select: { id: true, code: true },
      });

      const sIds = schoolClassrooms.map((c) => c.id);
      const sCodes = schoolClassrooms.map((c) => c.code.toUpperCase());

      if (sIds.length === 0) {
        return [];
      }

      if (cleanClassId) {
        const matched = schoolClassrooms.find(
          (c) =>
            c.id === cleanClassId ||
            c.code.toUpperCase() === cleanClassId.toUpperCase()
        );

        if (!matched) {
          return [];
        }

        whereClause = {
          OR: [
            { classroomId: matched.id },
            { classId: matched.id },
            { classId: matched.code },
          ],
        };
      } else {
        whereClause = {
          OR: [
            { classroomId: { in: sIds } },
            { classId: { in: [...sIds, ...sCodes] } },
          ],
        };
      }
    } else if (currentUser.role === Role.ADMIN) {
      // 4. Administrador Geral
      if (cleanClassId) {
        const classroom = await prisma.classroom.findFirst({
          where: {
            OR: [
              { id: cleanClassId },
              { code: { equals: cleanClassId.toUpperCase(), mode: "insensitive" } },
            ],
          },
          select: { id: true, code: true },
        });

        whereClause = {
          OR: [
            { classId: cleanClassId },
            { classroomId: cleanClassId },
            ...(classroom
              ? [{ classroomId: classroom.id }, { classId: classroom.code }]
              : []),
          ],
        };
      } else {
        whereClause = {};
      }
    }

    const tasks = await prisma.task.findMany({
      where: whereClause,
      include: {
        classroom: {
          select: { id: true, name: true, code: true, teacherId: true },
        },
        subject: {
          select: { id: true, name: true, slug: true, icon: true },
        },
        topicRef: {
          select: { id: true, name: true, slug: true },
        },
        submissions: currentUser.id
          ? { where: { studentId: currentUser.id } }
          : {
              select: {
                id: true,
                studentId: true,
                score: true,
                correctCount: true,
                totalQuestions: true,
                accuracyPercent: true,
                status: true,
                submittedAt: true,
              },
            },
        _count: {
          select: { submissions: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return tasks.map((task) => ({
      ...task,
      mySubmission:
        currentUser && Array.isArray(task.submissions)
          ? task.submissions[0] || null
          : undefined,
    }));
  }

  /**
   * Busca os detalhes completos de uma tarefa por ID, incluindo questões do banco,
   * questões autorais e submissões registradas, aplicando validação estrita de escopo.
   */
  async getTaskById(id: string, userOrUserId?: any) {
    let currentUser: { id: string; role: Role; schoolId?: string | null } | null = null;

    if (userOrUserId && typeof userOrUserId === "object" && userOrUserId.id) {
      currentUser = {
        id: userOrUserId.id,
        role: userOrUserId.role || Role.STUDENT,
        schoolId: userOrUserId.schoolId,
      };
    } else if (typeof userOrUserId === "string" && userOrUserId.trim()) {
      currentUser = await prisma.user.findUnique({
        where: { id: userOrUserId.trim() },
        select: { id: true, role: true, schoolId: true },
      });
    }

    const task = await prisma.task.findUnique({
      where: { id },
      include: {
        classroom: {
          select: {
            id: true,
            name: true,
            code: true,
            teacherId: true,
            schoolId: true,
            students: {
              select: { id: true, name: true, email: true, xp: true },
            },
          },
        },
        subject: {
          select: { id: true, name: true, slug: true, icon: true },
        },
        topicRef: {
          select: { id: true, name: true, slug: true },
        },
        submissions: {
          include: {
            student: {
              select: { id: true, name: true, email: true },
            },
          },
          orderBy: { submittedAt: "desc" },
        },
      },
    });

    if (!task) {
      throw new AppError("Tarefa não encontrada.", 404);
    }

    // Isolamento estrito de acesso para visualização de tarefa individual
    if (currentUser && currentUser.role === Role.STUDENT && task.classroom) {
      const isEnrolled = task.classroom.students.some((s) => s.id === currentUser!.id);
      if (!isEnrolled) {
        throw new AppError("Você não tem permissão para visualizar tarefas de outra turma.", 403);
      }
    } else if (currentUser && currentUser.role === Role.TEACHER && task.classroom) {
      if (task.classroom.teacherId !== currentUser.id) {
        throw new AppError("Você não tem permissão para visualizar tarefas desta turma.", 403);
      }
    } else if (currentUser && currentUser.role === Role.SCHOOL && task.classroom) {
      if (task.classroom.schoolId !== currentUser.schoolId) {
        throw new AppError("Esta tarefa pertence a outra instituição.", 403);
      }
    }

    const dbQuestions =
      task.questionIds.length > 0
        ? await prisma.question.findMany({
            where: { id: { in: task.questionIds } },
            include: {
              subjectRef: {
                select: { id: true, name: true, slug: true, icon: true },
              },
              topicRef: {
                select: { id: true, name: true, slug: true },
              },
            },
          })
        : [];

    // Preserva a ordem definida em task.questionIds
    const questionOrderMap = new Map(dbQuestions.map((q) => [q.id, q]));
    const orderedQuestions = task.questionIds
      .map((qId) => questionOrderMap.get(qId))
      .filter((q): q is NonNullable<typeof q> => Boolean(q));

    const currentUserId =
      currentUser?.id ||
      (typeof userOrUserId === "string" ? userOrUserId : undefined);

    const mySubmission = currentUserId
      ? task.submissions.find((s) => s.studentId === currentUserId) || null
      : null;

    return {
      ...task,
      questions: orderedQuestions,
      mySubmission,
    };
  }

  /**
   * Cria uma tarefa na turma suportando 3 modos imediatos para o professor (além de IA):
   * 1. MANUAL_SELECTION (Seleção Manual): O professor escolhe questões específicas do banco
   *    (via `questionIds` ou filtros por matéria, ano ou assunto).
   * 2. RANDOM_BY_TOPIC (Sorteio Inteligente por Assunto): O professor escolhe matéria, tópico,
   *    dificuldade e quantidade (ex: 10 questões de Ecologia) e o back-end sorteia questões reais do banco.
   * 3. CUSTOM_TEACHER_QUESTIONS (Questão Autoral): O professor cadastra enunciado e alternativas
   *    próprias diretamente na tarefa.
   */
  async createTask(
    data: CreateTaskInput & {
      subject?: string;
      difficulty?: string;
      year?: number | string;
      quantity?: number;
      count?: number;
      questions?: CustomTeacherQuestionInput[];
    }
  ) {
    const {
      title,
      description,
      topic,
      subjectId,
      subject: rawSubjectName,
      topicId,
      creationMode: rawCreationMode,
      difficulty: rawDifficulty,
      year: rawYear,
      total,
      quantity,
      count,
      questionIds: rawQuestionIds = [],
      customQuestions: rawCustomQuestions = [],
      questions: rawInlineQuestions = [],
      dueDate,
      status,
      classId,
      classroomId,
    } = data;

    const resolvedClassIdentifier = (classroomId || classId || "").trim();
    if (!resolvedClassIdentifier) {
      throw new AppError(
        "O ID da turma (classId ou classroomId) é obrigatório.",
        400
      );
    }

    // Localiza a turma por ID ou código
    const classroom = await prisma.classroom.findFirst({
      where: {
        OR: [
          { id: resolvedClassIdentifier },
          {
            code: {
              equals: resolvedClassIdentifier.toUpperCase(),
              mode: "insensitive",
            },
          },
        ],
      },
      select: { id: true, code: true, name: true },
    });

    // Resolve Matéria (Subject) e Tópico (Topic)
    const subjectCandidate = (subjectId || rawSubjectName || "").trim();
    let resolvedSubject = subjectCandidate
      ? await questionService.ensureSubjectSynchronized(subjectCandidate)
      : null;

    const topicCandidate = (topicId || topic || title || "").trim();
    let resolvedTopicRecord = null;

    if (topicCandidate) {
      resolvedTopicRecord = await prisma.topic.findFirst({
        where: {
          OR: [
            { id: topicCandidate },
            { slug: { equals: topicCandidate, mode: "insensitive" } },
            {
              slug: {
                equals: slugifyText(topicCandidate),
                mode: "insensitive",
              },
            },
            { name: { equals: topicCandidate, mode: "insensitive" } },
            { name: { contains: topicCandidate, mode: "insensitive" } },
          ],
          ...(resolvedSubject ? { subjectId: resolvedSubject.id } : {}),
        },
        include: { subject: true },
      });

      if (!resolvedTopicRecord) {
        // Verifica se topicCandidate é o ID de uma Lesson do sistema
        const lessonMatch = await prisma.lesson.findUnique({
          where: { id: topicCandidate },
        });
        if (lessonMatch?.subjectId) {
          if (!resolvedSubject) {
            resolvedSubject = await questionService.ensureSubjectSynchronized(
              lessonMatch.subjectId
            );
          }
          const refreshedLesson = await prisma.lesson.findUnique({
            where: { id: topicCandidate },
          });
          if (refreshedLesson?.topicId) {
            resolvedTopicRecord = await prisma.topic.findUnique({
              where: { id: refreshedLesson.topicId },
              include: { subject: true },
            });
          }
        }
      }

      if (resolvedTopicRecord && !resolvedSubject) {
        resolvedSubject = resolvedTopicRecord.subject;
      }
    }

    if (!resolvedSubject && topicCandidate) {
      // Caso o topic contenha "Matéria: Tópico" (ex: "Biologia: Ecologia")
      const parts = topicCandidate.split(":");
      if (parts.length > 1) {
        resolvedSubject = await questionService.ensureSubjectSynchronized(
          parts[0].trim()
        );
      }
    }

    if (!resolvedSubject) {
      resolvedSubject =
        (classroom
          ? await questionService.resolveSubject(classroom.name)
          : null) ||
        (await prisma.subject.findFirst({ orderBy: { name: "asc" } }));
      if (resolvedSubject) {
        await questionService.ensureSubjectSynchronized(resolvedSubject.id);
      }
    }

    if (resolvedSubject && !resolvedTopicRecord) {
      const cleanTopicLabel =
        topic?.trim() || title?.trim() || `Geral - ${resolvedSubject.name}`;
      const existingFirstTopic = await prisma.topic.findFirst({
        where: {
          subjectId: resolvedSubject.id,
          OR: [
            { name: { contains: cleanTopicLabel, mode: "insensitive" } },
            { slug: slugifyText(cleanTopicLabel) },
          ],
        },
        include: { subject: true },
      });

      if (existingFirstTopic) {
        resolvedTopicRecord = existingFirstTopic;
      } else {
        resolvedTopicRecord = await prisma.topic.findFirst({
          where: { subjectId: resolvedSubject.id },
          include: { subject: true },
          orderBy: { createdAt: "asc" },
        });
      }
    }

    const resolvedTopicName =
      topic?.trim() ||
      resolvedTopicRecord?.name ||
      title?.trim() ||
      resolvedSubject?.name ||
      "Geral";

    if (!resolvedTopicName) {
      throw new AppError("O tópico ou título da tarefa é obrigatório.", 400);
    }

    const parsedDueDate = dueDate ? new Date(dueDate) : null;
    if (parsedDueDate && Number.isNaN(parsedDueDate.getTime())) {
      throw new AppError("Formato de data de entrega (dueDate) inválido.", 400);
    }

    const normalizedDiff = normalizeDifficulty(rawDifficulty);
    const customQuestionsList =
      Array.isArray(rawCustomQuestions) && rawCustomQuestions.length > 0
        ? rawCustomQuestions
        : Array.isArray(rawInlineQuestions) && rawInlineQuestions.length > 0
        ? rawInlineQuestions
        : [];

    // Determina o modo de criação (creationMode)
    let creationMode:
      | "MANUAL_SELECTION"
      | "RANDOM_BY_TOPIC"
      | "CUSTOM_TEACHER_QUESTIONS"
      | "AI_GENERATED" = "MANUAL_SELECTION";

    const modeUpper = (rawCreationMode || "").toString().trim().toUpperCase();
    if (
      modeUpper === "MANUAL_SELECTION" ||
      modeUpper === "RANDOM_BY_TOPIC" ||
      modeUpper === "CUSTOM_TEACHER_QUESTIONS" ||
      modeUpper === "AI_GENERATED"
    ) {
      creationMode = modeUpper;
    } else if (customQuestionsList.length > 0) {
      creationMode = "CUSTOM_TEACHER_QUESTIONS";
    } else if (Array.isArray(rawQuestionIds) && rawQuestionIds.length > 0) {
      creationMode = "MANUAL_SELECTION";
    } else {
      creationMode = "RANDOM_BY_TOPIC";
    }

    const requestedCount = Number(total ?? quantity ?? count ?? 0);
    let finalQuestionIds: string[] = Array.isArray(rawQuestionIds)
      ? rawQuestionIds.filter(Boolean)
      : [];
    let persistedCustomQuestions: any[] | null = null;

    // =========================================================================
    // MODO 1: SELEÇÃO MANUAL (MANUAL_SELECTION)
    // =========================================================================
    if (creationMode === "MANUAL_SELECTION") {
      if (finalQuestionIds.length > 0) {
        const existingQuestions = await prisma.question.findMany({
          where: { id: { in: finalQuestionIds } },
          select: { id: true, subjectId: true, topicId: true },
        });
        if (existingQuestions.length > 0) {
          const validIdSet = new Set(existingQuestions.map((q) => q.id));
          finalQuestionIds = finalQuestionIds.filter((id) => validIdSet.has(id));
          if (!resolvedSubject && existingQuestions[0].subjectId) {
            resolvedSubject = await prisma.subject.findUnique({
              where: { id: existingQuestions[0].subjectId },
            });
          }
        }
      } else {
        // Caso o professor tenha enviado filtros (matéria, ano, assunto) sem IDs explícitos
        const filtered = await this.filterQuestionsForSelection({
          subjectId: resolvedSubject?.id,
          subject: rawSubjectName || resolvedSubject?.name,
          topicId: resolvedTopicRecord?.id,
          topic: topic,
          year: rawYear,
          difficulty: normalizedDiff,
          limit: requestedCount > 0 ? requestedCount : 10,
        });
        finalQuestionIds = filtered.map((q) => q.id);
      }
    }

    // =========================================================================
    // MODO 2: SORTEIO INTELIGENTE POR ASSUNTO (RANDOM_BY_TOPIC)
    // =========================================================================
    if (creationMode === "RANDOM_BY_TOPIC") {
      const targetQuantity = Math.max(
        Math.min(requestedCount > 0 ? requestedCount : 10, 50),
        1
      );

      const selectedSet = new Set<string>(finalQuestionIds);

      // Camada 1: Questões exatamente do tópico e dificuldade solicitados
      if (resolvedTopicRecord) {
        const exactTopicPool = await prisma.question.findMany({
          where: {
            topicId: resolvedTopicRecord.id,
            ...(normalizedDiff ? { difficulty: normalizedDiff } : {}),
            ...(rawYear && !Number.isNaN(Number(rawYear))
              ? { year: Number(rawYear) }
              : {}),
          },
          select: { id: true },
        });

        for (const q of shuffleArray(exactTopicPool)) {
          if (selectedSet.size >= targetQuantity) break;
          selectedSet.add(q.id);
        }

        // Camada 2: Se ainda faltarem questões para atingir a quantidade pedida,
        // completa com questões do mesmo tópico em qualquer dificuldade
        if (selectedSet.size < targetQuantity && normalizedDiff) {
          const anyDiffTopicPool = await prisma.question.findMany({
            where: {
              topicId: resolvedTopicRecord.id,
              id: { notIn: Array.from(selectedSet) },
            },
            select: { id: true },
          });

          for (const q of shuffleArray(anyDiffTopicPool)) {
            if (selectedSet.size >= targetQuantity) break;
            selectedSet.add(q.id);
          }
        }
      }

      // Camada 3: Completa com questões da mesma Matéria (e dificuldade, se informada)
      if (selectedSet.size < targetQuantity && resolvedSubject) {
        const subjectPool = await prisma.question.findMany({
          where: {
            OR: [
              { subjectId: resolvedSubject.id },
              {
                subject: {
                  equals: resolvedSubject.name,
                  mode: "insensitive",
                },
              },
            ],
            ...(normalizedDiff ? { difficulty: normalizedDiff } : {}),
            id: { notIn: Array.from(selectedSet) },
          },
          select: { id: true },
        });

        for (const q of shuffleArray(subjectPool)) {
          if (selectedSet.size >= targetQuantity) break;
          selectedSet.add(q.id);
        }
      }

      // Camada 4: Completa com questões da mesma Matéria (qualquer dificuldade)
      if (selectedSet.size < targetQuantity && resolvedSubject) {
        const broadSubjectPool = await prisma.question.findMany({
          where: {
            OR: [
              { subjectId: resolvedSubject.id },
              {
                subject: {
                  equals: resolvedSubject.name,
                  mode: "insensitive",
                },
              },
            ],
            id: { notIn: Array.from(selectedSet) },
          },
          select: { id: true },
        });

        for (const q of shuffleArray(broadSubjectPool)) {
          if (selectedSet.size >= targetQuantity) break;
          selectedSet.add(q.id);
        }
      }

      finalQuestionIds = Array.from(selectedSet);
    }

    // =========================================================================
    // MODO 3: QUESTÃO AUTORAL DO PROFESSOR (CUSTOM_TEACHER_QUESTIONS)
    // =========================================================================
    if (
      creationMode === "CUSTOM_TEACHER_QUESTIONS" ||
      customQuestionsList.length > 0
    ) {
      if (customQuestionsList.length === 0 && finalQuestionIds.length === 0) {
        throw new AppError(
          "Para o modo de Questão Autoral (CUSTOM_TEACHER_QUESTIONS), informe ao menos uma questão em customQuestions.",
          400
        );
      }

      persistedCustomQuestions = [];
      const currentYear = new Date().getFullYear();

      for (const customQ of customQuestionsList) {
        const qText = (customQ.text || "").trim();
        if (!qText) {
          throw new AppError(
            "O enunciado de todas as questões autorais é obrigatório.",
            400
          );
        }

        const rawOpts = Array.isArray(customQ.options) ? customQ.options : [];
        if (rawOpts.length < 2) {
          throw new AppError(
            "Cada questão autoral deve possuir no mínimo 2 alternativas.",
            400
          );
        }

        const normalizedOptions: string[] = rawOpts.map((opt: any) =>
          typeof opt === "string" ? opt.trim() : String(opt?.text || "").trim()
        );

        let correctIdx = Number(customQ.correctAnswer ?? 0);
        if (
          Number.isNaN(correctIdx) ||
          correctIdx < 0 ||
          correctIdx >= normalizedOptions.length
        ) {
          correctIdx = 0;
        }

        const qDiff =
          normalizeDifficulty(customQ.difficulty) || normalizedDiff || "MEDIUM";
        const defaultErrorRate =
          qDiff === "EASY" ? 30.0 : qDiff === "HARD" ? 75.0 : 50.0;

        // Salva a questão autoral também na tabela Question vinculada à matéria e tópico
        // para que o aluno possa respondê-la com suporte integral a TRI, SM-2 e estatísticas
        const createdQuestion = await prisma.question.create({
          data: {
            year: customQ.year || currentYear,
            area: customQ.area || resolvedSubject?.name || "Geral",
            subject:
              customQ.subject || resolvedSubject?.name || resolvedTopicName,
            topic:
              customQ.topic || resolvedTopicRecord?.name || resolvedTopicName,
            subjectId: customQ.subjectId || resolvedSubject?.id || null,
            topicId: customQ.topicId || resolvedTopicRecord?.id || null,
            difficulty: qDiff,
            errorRate: defaultErrorRate,
            text: qText,
            options: normalizedOptions,
            correctAnswer: correctIdx,
            explanation:
              customQ.explanation?.trim() ||
              "Questão autoral elaborada pelo professor da turma.",
          },
        });

        finalQuestionIds.push(createdQuestion.id);
        persistedCustomQuestions.push({
          id: createdQuestion.id,
          text: createdQuestion.text,
          options: normalizedOptions,
          correctAnswer: createdQuestion.correctAnswer,
          explanation: createdQuestion.explanation,
          difficulty: createdQuestion.difficulty,
          subject: createdQuestion.subject,
          topic: createdQuestion.topic,
          subjectId: createdQuestion.subjectId,
          topicId: createdQuestion.topicId,
          year: createdQuestion.year,
        });
      }
    }

    const computedTotal =
      finalQuestionIds.length > 0
        ? finalQuestionIds.length
        : requestedCount > 0
        ? requestedCount
        : 0;

    return prisma.task.create({
      data: {
        title: title?.trim() || resolvedTopicName,
        description: description?.trim() || null,
        topic: resolvedTopicName,
        subjectId: resolvedSubject?.id || null,
        topicId: resolvedTopicRecord?.id || null,
        creationMode,
        difficulty: normalizedDiff || null,
        total: computedTotal,
        questionIds: finalQuestionIds,
        ...(persistedCustomQuestions
          ? { customQuestions: persistedCustomQuestions }
          : {}),
        dueDate: parsedDueDate,
        status: status || "APPROVED",
        classId: classroom ? classroom.code : resolvedClassIdentifier,
        classroomId: classroom ? classroom.id : null,
      },
      include: {
        classroom: {
          select: { id: true, name: true, code: true },
        },
        subject: {
          select: { id: true, name: true, slug: true, icon: true },
        },
        topicRef: {
          select: { id: true, name: true, slug: true },
        },
      },
    });
  }

  /**
   * POST /tasks/:taskId/submit
   * Conclui uma tarefa da turma pelo aluno:
   * 1. Corrige e persiste as respostas das questões (`QuestionAttempt`)
   * 2. Salva a nota e o status de conclusão na tarefa (`TaskSubmission`) para o painel do professor
   * 3. Dispara simultaneamente a atualização do histórico geral do aluno:
   *    - Repetição Espaçada SM-2 (`FlashcardReview`)
   *    - Proficiência e Nota Estimada TRI (`TriService`)
   *    - Ofensiva Diária (`StreakService`) — com proteção contra duplicação no mesmo dia!
   */
  async submitTask(taskId: string, input: SubmitTaskInput) {
    if (!taskId?.trim()) {
      throw new AppError("O identificador da tarefa (taskId) é obrigatório.", 400);
    }

    const studentId = (input.userId || input.studentId || "").trim();
    if (!studentId) {
      throw new AppError(
        "O identificador do aluno (userId/studentId) é obrigatório para entregar a tarefa.",
        401
      );
    }

    const [task, student] = await Promise.all([
      prisma.task.findUnique({
        where: { id: taskId.trim() },
        include: {
          classroom: {
            select: { id: true, name: true, code: true, teacherId: true },
          },
          subject: {
            select: { id: true, name: true, slug: true },
          },
          topicRef: {
            select: { id: true, name: true, slug: true },
          },
        },
      }),
      prisma.user.findUnique({
        where: { id: studentId },
      }),
    ]);

    if (!task) {
      throw new AppError("Tarefa não encontrada.", 404);
    }

    if (!student) {
      throw new AppError("Aluno não encontrado.", 404);
    }

    // Busca as questões associadas à tarefa
    const taskQuestions =
      task.questionIds.length > 0
        ? await prisma.question.findMany({
            where: { id: { in: task.questionIds } },
          })
        : [];

    const questionMap = new Map(taskQuestions.map((q) => [q.id, q]));

    // Normaliza as respostas enviadas pelo aluno (suporta array ou objeto { [questionId]: selectedOption })
    const normalizedAnswers: Array<{
      questionId: string;
      selectedAnswer: number;
      timeSpentMs?: number;
    }> = [];

    if (Array.isArray(input.answers)) {
      for (const item of input.answers) {
        if (!item || !item.questionId) continue;
        const rawChoice =
          item.selectedAnswer ??
          item.answer ??
          item.selectedOption ??
          item.optionIndex;
        if (rawChoice !== undefined && rawChoice !== null && !Number.isNaN(Number(rawChoice))) {
          normalizedAnswers.push({
            questionId: String(item.questionId),
            selectedAnswer: Number(rawChoice),
            timeSpentMs: item.timeSpentMs ? Number(item.timeSpentMs) : undefined,
          });
        }
      }
    } else if (input.answers && typeof input.answers === "object") {
      for (const [qId, choice] of Object.entries(input.answers)) {
        if (choice !== undefined && choice !== null && !Number.isNaN(Number(choice))) {
          normalizedAnswers.push({
            questionId: qId,
            selectedAnswer: Number(choice),
          });
        }
      }
    }

    const gradedAnswers: Array<{
      questionId: string;
      selectedAnswer: number;
      correctAnswer: number;
      isCorrect: boolean;
      timeSpentMs: number | null;
      explanation: string | null;
    }> = [];

    const sm2Updates: any[] = [];

    // 1. Se o aluno enviou as respostas no submit, corrige e registra cada tentativa no histórico geral
    if (normalizedAnswers.length > 0) {
      for (const ans of normalizedAnswers) {
        let question = questionMap.get(ans.questionId);
        if (!question) {
          question =
            (await prisma.question.findUnique({
              where: { id: ans.questionId },
            })) || undefined;
        }

        if (!question) continue;

        const isCorrect = question.correctAnswer === ans.selectedAnswer;
        const xpForQuestion = isCorrect ? 10 : 0;
        const perQuestionTimeMs =
          ans.timeSpentMs ??
          (input.timeSpentMs
            ? Math.round(
                Number(input.timeSpentMs) / Math.max(normalizedAnswers.length, 1)
              )
            : null);

        await prisma.$transaction(async (tx) => {
          await tx.questionAttempt.create({
            data: {
              userId: student.id,
              questionId: question!.id,
              selectedAnswer: ans.selectedAnswer,
              isCorrect,
              timeSpentMs: perQuestionTimeMs,
              xpEarned: xpForQuestion,
              source: "TASK",
              taskId: task.id,
            },
          });

          const totalAttempts = await tx.questionAttempt.count({
            where: { questionId: question!.id },
          });
          const wrongAttempts = await tx.questionAttempt.count({
            where: { questionId: question!.id, isCorrect: false },
          });

          const empiricalErrorRate = Number(
            ((wrongAttempts / Math.max(totalAttempts, 1)) * 100).toFixed(2)
          );
          const priorRate = question!.errorRate ?? 50.0;
          const smoothedErrorRate = Number(
            (
              (priorRate * 5 + empiricalErrorRate * totalAttempts) /
              (5 + totalAttempts)
            ).toFixed(2)
          );
          const newDifficultyTier =
            smoothedErrorRate < 45
              ? "EASY"
              : smoothedErrorRate > 70
              ? "HARD"
              : "MEDIUM";

          await tx.question.update({
            where: { id: question!.id },
            data: {
              errorRate: smoothedErrorRate,
              difficulty: newDifficultyTier,
            },
          });
        });

        // Atualiza Repetição Espaçada SM-2 para cada questão da tarefa
        const sm2 = await spacedRepetitionService
          .reviewCard({
            userId: student.id,
            questionId: question.id,
            isCorrect,
            grade: isCorrect ? 4 : 1,
          })
          .catch(() => null);

        if (sm2?.sm2) {
          sm2Updates.push(sm2.sm2);
        }

        gradedAnswers.push({
          questionId: question.id,
          selectedAnswer: ans.selectedAnswer,
          correctAnswer: question.correctAnswer,
          isCorrect,
          timeSpentMs: perQuestionTimeMs,
          explanation: question.explanation,
        });
      }
    } else if (task.questionIds.length > 0) {
      // Caso o aluno já tenha respondido as questões individualmente durante a sessão
      const existingAttempts = await prisma.questionAttempt.findMany({
        where: {
          userId: student.id,
          questionId: { in: task.questionIds },
        },
        orderBy: { createdAt: "desc" },
      });

      const latestByQuestion = new Map<string, (typeof existingAttempts)[0]>();
      for (const att of existingAttempts) {
        if (!latestByQuestion.has(att.questionId)) {
          latestByQuestion.set(att.questionId, att);
        }
      }

      for (const qId of task.questionIds) {
        const att = latestByQuestion.get(qId);
        const q = questionMap.get(qId);
        if (att && q) {
          gradedAnswers.push({
            questionId: q.id,
            selectedAnswer: att.selectedAnswer,
            correctAnswer: q.correctAnswer,
            isCorrect: att.isCorrect,
            timeSpentMs: att.timeSpentMs,
            explanation: q.explanation,
          });
        }
      }
    }

    // 2. Cálculo da nota e métricas de conclusão da tarefa
    const totalQuestions = Math.max(
      Number(
        input.totalQuestions ??
          (task.total || task.questionIds.length || gradedAnswers.length || 1)
      ),
      1
    );

    const correctCount =
      gradedAnswers.length > 0
        ? gradedAnswers.filter((a) => a.isCorrect).length
        : input.correctCount !== undefined
        ? Number(input.correctCount)
        : input.score !== undefined
        ? Math.round((Number(input.score) / 10) * totalQuestions)
        : 0;

    const accuracyPercent = Number(
      Math.min((correctCount / totalQuestions) * 100, 100).toFixed(1)
    );

    // Nota padronizada (0 a 10), respeitando input.score caso tenha sido enviado sem answers
    const computedScore =
      gradedAnswers.length === 0 && input.score !== undefined
        ? Number(Number(input.score).toFixed(1))
        : Number(((correctCount / totalQuestions) * 10).toFixed(1));

    const totalXpForSubmission = correctCount * 10 + 20; // 10 XP por acerto + 20 XP bônus de conclusão da tarefa

    const existingSubmission = await prisma.taskSubmission.findUnique({
      where: {
        taskId_studentId: {
          taskId: task.id,
          studentId: student.id,
        },
      },
    });

    const xpDelta = existingSubmission
      ? Math.max(totalXpForSubmission - existingSubmission.xpEarned, 0)
      : totalXpForSubmission;

    const totalTimeSpentMs =
      input.timeSpentMs !== undefined
        ? Number(input.timeSpentMs)
        : gradedAnswers.reduce((acc, curr) => acc + (curr.timeSpentMs || 0), 0) ||
          null;

    // 3. Salva a submissão da tarefa para o painel do professor
    const submission = await prisma.taskSubmission.upsert({
      where: {
        taskId_studentId: {
          taskId: task.id,
          studentId: student.id,
        },
      },
      create: {
        taskId: task.id,
        studentId: student.id,
        score: computedScore,
        correctCount,
        totalQuestions,
        accuracyPercent,
        timeSpentMs: totalTimeSpentMs,
        status: "CORRIGIDO",
        answers: gradedAnswers,
        xpEarned: totalXpForSubmission,
        submittedAt: new Date(),
      },
      update: {
        score: computedScore,
        correctCount,
        totalQuestions,
        accuracyPercent,
        timeSpentMs: totalTimeSpentMs,
        status: "CORRIGIDO",
        answers: gradedAnswers,
        xpEarned: Math.max(
          totalXpForSubmission,
          existingSubmission?.xpEarned || 0
        ),
        submittedAt: new Date(),
      },
      include: {
        student: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (xpDelta > 0) {
      await prisma.user
        .update({
          where: { id: student.id },
          data: { xp: { increment: xpDelta } },
        })
        .catch(() => null);
    }

    // 4. Atualiza simultaneamente Ofensiva (Streak - sem duplicar no mesmo dia!) e Proficiência TRI
    const [streakResult, triProficiency] = await Promise.all([
      streakService.registerActivity(student.id, "TASK").catch((err) => {
        console.warn("[Task Submit Streak Error]:", err.message);
        return null;
      }),
      triService.calculateStudentProficiency(student.id).catch((err) => {
        console.warn("[Task Submit TRI Error]:", err.message);
        return null;
      }),
    ]);

    const refreshedUser = await prisma.user.findUnique({
      where: { id: student.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        xp: true,
        currentStreak: true,
        longestStreak: true,
        iceFreezes: true,
        lastStudyDate: true,
      },
    });

    return {
      message: "Tarefa concluída e entregue com sucesso!",
      submission,
      score: submission.score,
      correctCount: submission.correctCount,
      totalQuestions: submission.totalQuestions,
      accuracyPercent: submission.accuracyPercent,
      xpEarned: xpDelta,
      answers: gradedAnswers,
      task: {
        id: task.id,
        title: task.title,
        topic: task.topic,
        creationMode: task.creationMode,
        classroomId: task.classroomId,
        classId: task.classId,
        status: "COMPLETED",
      },
      tri: triProficiency,
      sm2: sm2Updates,
      streak: streakResult,
      user: refreshedUser,
    };
  }

  async updateTask(
    id: string,
    data: UpdateTaskInput & { difficulty?: string }
  ) {
    await this.getTaskById(id);

    const parsedDueDate =
      data.dueDate === null
        ? null
        : data.dueDate !== undefined
        ? new Date(data.dueDate)
        : undefined;

    if (
      parsedDueDate instanceof Date &&
      Number.isNaN(parsedDueDate.getTime())
    ) {
      throw new AppError("Formato de data de entrega (dueDate) inválido.", 400);
    }

    return prisma.task.update({
      where: { id },
      data: {
        ...(data.title !== undefined ? { title: data.title.trim() } : {}),
        ...(data.description !== undefined
          ? { description: data.description }
          : {}),
        ...(data.topic !== undefined ? { topic: data.topic.trim() } : {}),
        ...(data.subjectId !== undefined ? { subjectId: data.subjectId } : {}),
        ...(data.topicId !== undefined ? { topicId: data.topicId } : {}),
        ...(data.creationMode !== undefined
          ? { creationMode: data.creationMode }
          : {}),
        ...(data.difficulty !== undefined
          ? { difficulty: normalizeDifficulty(data.difficulty) || null }
          : {}),
        ...(data.total !== undefined ? { total: Number(data.total) } : {}),
        ...(data.questionIds !== undefined
          ? { questionIds: data.questionIds }
          : {}),
        ...(data.customQuestions !== undefined
          ? { customQuestions: data.customQuestions as any }
          : {}),
        ...(parsedDueDate !== undefined ? { dueDate: parsedDueDate } : {}),
        ...(data.classId !== undefined ? { classId: data.classId } : {}),
        ...(data.classroomId !== undefined
          ? { classroomId: data.classroomId }
          : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
      },
      include: {
        classroom: {
          select: { id: true, name: true, code: true },
        },
        subject: {
          select: { id: true, name: true, slug: true, icon: true },
        },
        topicRef: {
          select: { id: true, name: true, slug: true },
        },
      },
    });
  }

  async deleteTask(id: string) {
    await this.getTaskById(id);

    await prisma.task.delete({
      where: { id },
    });

    return { message: "Tarefa excluída com sucesso." };
  }
}

export const taskService = new TaskService();

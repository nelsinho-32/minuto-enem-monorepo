import {
  AnswerQuestionInputSchema,
  UserQuestionStatsSchema,
  type AnswerQuestionInput,
  type UserQuestionStats,
  type WeakTopic,
} from "@minuto-enem/shared";
import { prisma } from "../lib/prisma";
import { AppError } from "../errors/AppError";
import { triService } from "./tri.service";
import { spacedRepetitionService } from "./spaced-repetition.service";
import { streakService } from "./streak.service";

export {
  AnswerQuestionInputSchema,
  UserQuestionStatsSchema,
  type AnswerQuestionInput,
  type UserQuestionStats,
} from "@minuto-enem/shared";

/**
 * Converte um texto para formato slug padronizado (sem acentos, minúsculo e hifenizado).
 */
export function slugifyText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Remove acentos para comparação insensível a diacríticos.
 */
function normalizeComparable(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Extrai palavras-chave relevantes de um título/conteúdo para pareamento semântico com questões.
 */
function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    "para",
    "como",
    "sobre",
    "entre",
    "pelo",
    "pela",
    "pelos",
    "pelas",
    "uma",
    "umas",
    "uns",
    "dos",
    "das",
    "nos",
    "nas",
    "com",
    "sem",
    "mais",
    "menos",
    "muito",
    "onde",
    "quando",
    "qual",
    "quais",
    "aula",
    "geral",
    "introducao",
    "conceitos",
    "basicos",
    "estudo",
    "teoria",
  ]);

  return Array.from(
    new Set(
      normalizeComparable(text)
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 4 && !stopWords.has(w))
    )
  );
}

export class QuestionService {
  /**
   * Localiza uma Matéria (Subject) por ID, slug ou nome (tolerante a acentos e caixa).
   */
  async resolveSubject(subjectIdOrSlug: string) {
    const clean = (subjectIdOrSlug || "").trim();
    if (!clean) {
      return null;
    }

    const direct = await prisma.subject.findFirst({
      where: {
        OR: [
          { id: clean },
          { slug: { equals: clean, mode: "insensitive" } },
          { name: { equals: clean, mode: "insensitive" } },
        ],
      },
    });

    if (direct) {
      return direct;
    }

    const normalizedTarget = normalizeComparable(clean);
    const slugTarget = slugifyText(clean);

    const allSubjects = await prisma.subject.findMany();
    return (
      allSubjects.find(
        (s) =>
          normalizeComparable(s.name) === normalizedTarget ||
          normalizeComparable(s.slug) === normalizedTarget ||
          slugifyText(s.name) === slugTarget ||
          s.slug === slugTarget
      ) || null
    );
  }

  /**
   * Garante de forma idempotente que toda Lição do sistema, Material de professor e Questão
   * pertencentes à matéria informada estejam estritamente vinculados a um Subject e a um Topic/Lesson.
   */
  async ensureSubjectSynchronized(subjectIdOrSlug: string) {
    const subject = await this.resolveSubject(subjectIdOrSlug);
    if (!subject) {
      return null;
    }

    // 1. Busca todas as aulas do sistema (classroomId: null) desta matéria
    let systemLessons = await prisma.lesson.findMany({
      where: {
        subjectId: subject.id,
        classroomId: null,
      },
      orderBy: { createdAt: "asc" },
    });

    // Caso exista alguma lição do sistema sem subjectId mas cujo título/conteúdo pertença à matéria,
    // ou caso a matéria ainda não tenha lições do sistema, garante ao menos um tópico base
    if (systemLessons.length === 0) {
      const existingTopics = await prisma.topic.findMany({
        where: { subjectId: subject.id },
        orderBy: { createdAt: "asc" },
      });

      if (existingTopics.length === 0) {
        const defaultTopic = await prisma.topic.create({
          data: {
            name: `Fundamentos de ${subject.name}`,
            slug: slugifyText(`${subject.slug}-fundamentos`),
            description: `Tópico essencial de ${subject.name} para o ENEM.`,
            subjectId: subject.id,
          },
        });

        const defaultLesson = await prisma.lesson.create({
          data: {
            title: defaultTopic.name,
            content: `Resumo teórico e conceitos fundamentais de ${subject.name} cobrados na matriz de referência do ENEM.`,
            type: "ARTICLE",
            subjectId: subject.id,
            topicId: defaultTopic.id,
            classroomId: null,
          },
        });
        systemLessons = [defaultLesson];
      }
    }

    // 2. Sincroniza cada Lição do sistema com um Tópico (Topic) oficial da matéria
    for (const lesson of systemLessons) {
      const topicSlug = slugifyText(lesson.title || `${subject.slug}-topico`);
      if (!topicSlug) continue;

      let topic = await prisma.topic.findFirst({
        where: {
          subjectId: subject.id,
          OR: [
            ...(lesson.topicId ? [{ id: lesson.topicId }] : []),
            { slug: topicSlug },
            { name: { equals: lesson.title, mode: "insensitive" } },
          ],
        },
      });

      if (!topic) {
        topic = await prisma.topic.create({
          data: {
            name: lesson.title,
            slug: topicSlug,
            description:
              lesson.description ||
              (lesson.content ? lesson.content.slice(0, 180) : null),
            subjectId: subject.id,
          },
        });
      }

      if (lesson.topicId !== topic.id || lesson.subjectId !== subject.id) {
        await prisma.lesson.update({
          where: { id: lesson.id },
          data: {
            topicId: topic.id,
            subjectId: subject.id,
          },
        });
        lesson.topicId = topic.id;
        lesson.subjectId = subject.id;
      }
    }

    const topics = await prisma.topic.findMany({
      where: { subjectId: subject.id },
      orderBy: { createdAt: "asc" },
    });

    const primaryTopic = topics[0] || null;

    // 3. Garante que todo Material de professor (classroomId != null) desta matéria
    // (ou órfão cujo título/conteúdo remeta a esta matéria) tenha subjectId e topicId preenchidos
    if (primaryTopic) {
      const unlinkedTeacherMaterials = await prisma.lesson.findMany({
        where: {
          classroomId: { not: null },
          OR: [
            { subjectId: subject.id, topicId: null },
            {
              subjectId: null,
              OR: [
                { title: { contains: subject.name, mode: "insensitive" } },
                { content: { contains: subject.name, mode: "insensitive" } },
              ],
            },
          ],
        },
      });

      for (const mat of unlinkedTeacherMaterials) {
        const textToMatch = `${mat.title} ${mat.description || ""} ${mat.content || ""}`;
        const matNorm = normalizeComparable(textToMatch);

        let matchedTopic = primaryTopic;
        let bestScore = -1;

        for (const t of topics) {
          const keywords = extractKeywords(t.name);
          const score = keywords.filter((kw) => matNorm.includes(kw)).length;
          if (score > bestScore) {
            bestScore = score;
            matchedTopic = t;
          }
        }

        await prisma.lesson.update({
          where: { id: mat.id },
          data: {
            subjectId: subject.id,
            topicId: matchedTopic.id,
          },
        });
      }
    }

    // 4. Garante que todas as Questões da matéria estejam vinculadas a subjectId, topicId e lessonId
    if (topics.length > 0) {
      const normalizedSubjectName = normalizeComparable(subject.name);
      const candidateSubjectNames = Array.from(
        new Set([
          subject.name,
          subject.slug,
          normalizedSubjectName,
          subject.name.normalize("NFD").replace(/[\u0300-\u036f]/g, ""),
        ])
      );

      const subjectQuestions = await prisma.question.findMany({
        where: {
          OR: [
            { subjectId: subject.id },
            ...candidateSubjectNames.map((nameCandidate) => ({
              subject: { equals: nameCandidate, mode: "insensitive" as const },
            })),
          ],
        },
        orderBy: { id: "asc" },
      });

      const unlinkedQuestions = subjectQuestions.filter(
        (q) =>
          q.subjectId !== subject.id ||
          !q.topicId ||
          !q.lessonId ||
          !q.topic
      );

      if (unlinkedQuestions.length > 0) {
        // Mapa de topicId -> systemLessonId para vincular também lessonId
        const topicToSystemLessonId = new Map<string, string>();
        for (const sysLesson of systemLessons) {
          if (sysLesson.topicId && !topicToSystemLessonId.has(sysLesson.topicId)) {
            topicToSystemLessonId.set(sysLesson.topicId, sysLesson.id);
          }
        }

        // Pré-calcula palavras-chave de cada tópico + aula do sistema correspondente
        const topicProfiles = topics.map((t) => {
          const relatedLesson = systemLessons.find((l) => l.topicId === t.id);
          const keywords = extractKeywords(
            `${t.name} ${t.description || ""} ${relatedLesson?.content || ""}`
          );
          return {
            topic: t,
            lessonId: topicToSystemLessonId.get(t.id) || systemLessons[0]?.id || null,
            keywords,
          };
        });

        for (let idx = 0; idx < unlinkedQuestions.length; idx++) {
          const q = unlinkedQuestions[idx];
          const qTextNorm = normalizeComparable(
            `${q.text} ${q.explanation || ""}`
          );

          // Se já possuía um topicId válido desta matéria, preserva
          let chosenProfile = topicProfiles.find(
            (p) => p.topic.id === q.topicId
          );

          if (!chosenProfile) {
            let bestScore = 0;
            for (const profile of topicProfiles) {
              const score = profile.keywords.filter((kw) =>
                qTextNorm.includes(kw)
              ).length;
              if (score > bestScore) {
                bestScore = score;
                chosenProfile = profile;
              }
            }
          }

          // Fallback determinístico (round-robin) para distribuir questões da matéria entre seus tópicos
          if (!chosenProfile) {
            chosenProfile = topicProfiles[idx % topicProfiles.length];
          }

          await prisma.question.update({
            where: { id: q.id },
            data: {
              subjectId: subject.id,
              topicId: chosenProfile.topic.id,
              lessonId: chosenProfile.lessonId,
              topic: chosenProfile.topic.name,
            },
          });
        }
      }
    }

    return subject;
  }

  /**
   * Sincroniza todas as matérias cadastradas no banco (e vincula eventuais materiais ou questões órfãs).
   */
  async ensureAllSubjectsSynchronized() {
    const subjects = await prisma.subject.findMany({
      orderBy: { name: "asc" },
    });

    for (const subject of subjects) {
      await this.ensureSubjectSynchronized(subject.id);
    }

    // Caso restem materiais de professor sem subjectId, vincula à primeira matéria disponível
    if (subjects.length > 0) {
      const defaultSubject = subjects[0];
      const defaultTopic = await prisma.topic.findFirst({
        where: { subjectId: defaultSubject.id },
      });

      if (defaultTopic) {
        await prisma.lesson.updateMany({
          where: {
            OR: [{ subjectId: null }, { topicId: null }],
          },
          data: {
            subjectId: defaultSubject.id,
            topicId: defaultTopic.id,
          },
        });
      }
    }
  }

  /**
   * GET /subjects/:id/contents
   * Retorna:
   * - Dados da matéria (Subject)
   * - Tópicos da matéria (topics) com a contagem exata de questões disponíveis para cada tópico (questionsCount)
   * - Aulas do sistema (systemLessons) vinculadas aos tópicos
   * - Materiais extras da turma do aluno/professor daquela matéria (teacherMaterials / extraMaterials)
   */
  async getSubjectContents(
    subjectIdOrSlug: string,
    userId?: string,
    classroomId?: string
  ) {
    if (!subjectIdOrSlug?.trim()) {
      throw new AppError("O identificador da matéria é obrigatório.", 400);
    }

    const subject = await this.ensureSubjectSynchronized(subjectIdOrSlug);
    if (!subject) {
      throw new AppError("Matéria não encontrada.", 404);
    }

    // Identifica as turmas nas quais o aluno está matriculado (ou que o professor leciona)
    let allowedClassroomIds: string[] | undefined = undefined;

    if (classroomId?.trim()) {
      allowedClassroomIds = [classroomId.trim()];
    } else if (userId?.trim()) {
      const userClassrooms = await prisma.classroom.findMany({
        where: {
          OR: [
            { students: { some: { id: userId.trim() } } },
            { teacherId: userId.trim() },
          ],
        },
        select: { id: true },
      });
      allowedClassroomIds = userClassrooms.map((c) => c.id);
    }

    const [topics, systemLessons, teacherMaterials] = await Promise.all([
      prisma.topic.findMany({
        where: { subjectId: subject.id },
        include: {
          _count: {
            select: { questions: true },
          },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.lesson.findMany({
        where: {
          subjectId: subject.id,
          classroomId: null,
        },
        include: {
          topic: {
            select: { id: true, name: true, slug: true },
          },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.lesson.findMany({
        where: {
          subjectId: subject.id,
          classroomId:
            allowedClassroomIds !== undefined
              ? { in: allowedClassroomIds }
              : { not: null },
        },
        include: {
          classroom: {
            select: {
              id: true,
              name: true,
              code: true,
              teacher: {
                select: { id: true, name: true, email: true },
              },
            },
          },
          topic: {
            select: { id: true, name: true, slug: true },
          },
          subject: {
            select: { id: true, name: true, slug: true, icon: true },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    // Contagem exata de questões por tópico (incluindo vínculo por topicId ou lessonId)
    const enrichedTopics = await Promise.all(
      topics.map(async (topic) => {
        const topicSystemLessons = systemLessons.filter(
          (l) => l.topicId === topic.id
        );
        const topicLessonIds = topicSystemLessons.map((l) => l.id);
        const topicTeacherMaterials = teacherMaterials.filter(
          (m) => m.topicId === topic.id
        );

        const questionsCount = await prisma.question.count({
          where: {
            subjectId: subject.id,
            OR: [
              { topicId: topic.id },
              ...(topicLessonIds.length > 0
                ? [{ lessonId: { in: topicLessonIds } }]
                : []),
            ],
          },
        });

        return {
          id: topic.id,
          name: topic.name,
          slug: topic.slug,
          description: topic.description,
          subjectId: topic.subjectId,
          questionsCount,
          systemLessons: topicSystemLessons.map((l) => ({
            ...l,
            questionsCount,
          })),
          teacherMaterials: topicTeacherMaterials,
          extraMaterials: topicTeacherMaterials,
          createdAt: topic.createdAt,
          updatedAt: topic.updatedAt,
        };
      })
    );

    const topicCountMap = new Map<string, number>(
      enrichedTopics.map((t) => [t.id, t.questionsCount])
    );

    const enrichedSystemLessons = systemLessons.map((lesson) => ({
      ...lesson,
      questionsCount: lesson.topicId
        ? topicCountMap.get(lesson.topicId) ?? 0
        : 0,
    }));

    const totalQuestions = await prisma.question.count({
      where: { subjectId: subject.id },
    });

    return {
      id: subject.id,
      name: subject.name,
      slug: subject.slug,
      icon: subject.icon,
      subject: {
        id: subject.id,
        name: subject.name,
        slug: subject.slug,
        icon: subject.icon,
      },
      topics: enrichedTopics,
      systemLessons: enrichedSystemLessons,
      lessons: enrichedSystemLessons,
      teacherMaterials,
      extraMaterials: teacherMaterials,
      classroomMaterials: teacherMaterials,
      totalQuestions,
    };
  }

  /**
   * GET /questions/by-topic/:topicId
   * Busca questões filtradas exatamente pelo tópico/conteúdo que o aluno acabou de estudar.
   * Suporta tanto ID/slug de Topic quanto ID/título de Lesson (aula do sistema ou material de professor).
   */
  async getQuestionsByTopic(
    topicIdentifier: string,
    options?: {
      limit?: number;
      difficulty?: string;
    }
  ) {
    const cleanId = (topicIdentifier || "").trim();
    if (!cleanId) {
      throw new AppError("O identificador do tópico (topicId) é obrigatório.", 400);
    }

    // 1. Tenta localizar diretamente como Topic (por ID, slug ou nome)
    let topic = await prisma.topic.findFirst({
      where: {
        OR: [
          { id: cleanId },
          { slug: { equals: cleanId, mode: "insensitive" } },
          { name: { equals: cleanId, mode: "insensitive" } },
        ],
      },
      include: {
        subject: true,
        lessons: {
          where: { classroomId: null },
          select: { id: true },
        },
      },
    });

    let targetLessonId: string | undefined;

    // 2. Se não encontrou Topic direto, verifica se o identificador é de uma Lesson (aula estudada)
    if (!topic) {
      const lesson = await prisma.lesson.findFirst({
        where: {
          OR: [
            { id: cleanId },
            { title: { equals: cleanId, mode: "insensitive" } },
          ],
        },
      });

      if (lesson) {
        targetLessonId = lesson.id;
        if (lesson.subjectId) {
          await this.ensureSubjectSynchronized(lesson.subjectId);
        }

        const refreshedLesson = await prisma.lesson.findUnique({
          where: { id: lesson.id },
        });

        if (refreshedLesson?.topicId) {
          topic = await prisma.topic.findUnique({
            where: { id: refreshedLesson.topicId },
            include: {
              subject: true,
              lessons: {
                where: { classroomId: null },
                select: { id: true },
              },
            },
          });
        }
      }
    } else if (topic.subjectId) {
      // Garante que as questões da matéria deste tópico já estejam devidamente sincronizadas
      await this.ensureSubjectSynchronized(topic.subjectId);
    }

    if (!topic && !targetLessonId) {
      // Última tentativa: sincroniza as matérias caso o topicId seja um slug ainda não gerado
      await this.ensureAllSubjectsSynchronized();

      topic = await prisma.topic.findFirst({
        where: {
          OR: [
            { id: cleanId },
            { slug: { equals: cleanId, mode: "insensitive" } },
            { slug: { equals: slugifyText(cleanId), mode: "insensitive" } },
            { name: { contains: cleanId, mode: "insensitive" } },
          ],
        },
        include: {
          subject: true,
          lessons: {
            where: { classroomId: null },
            select: { id: true },
          },
        },
      });
    }

    if (!topic && !targetLessonId) {
      throw new AppError(
        "Tópico ou conteúdo não encontrado para buscar questões.",
        404
      );
    }

    const relatedLessonIds = new Set<string>();
    if (targetLessonId) {
      relatedLessonIds.add(targetLessonId);
    }
    if (topic?.lessons) {
      for (const l of topic.lessons) {
        relatedLessonIds.add(l.id);
      }
    }

    const difficultyFilter = options?.difficulty?.trim().toUpperCase();
    const takeLimit =
      options?.limit && Number(options.limit) > 0
        ? Math.min(Number(options.limit), 100)
        : undefined;

    const questions = await prisma.question.findMany({
      where: {
        ...(difficultyFilter && ["EASY", "MEDIUM", "HARD"].includes(difficultyFilter)
          ? { difficulty: difficultyFilter }
          : {}),
        OR: [
          ...(topic ? [{ topicId: topic.id }] : []),
          ...(relatedLessonIds.size > 0
            ? [{ lessonId: { in: Array.from(relatedLessonIds) } }]
            : []),
          ...(topic
            ? [{ topic: { equals: topic.name, mode: "insensitive" as const } }]
            : []),
        ],
      },
      include: {
        topicRef: {
          select: { id: true, name: true, slug: true, subjectId: true },
        },
        subjectRef: {
          select: { id: true, name: true, slug: true, icon: true },
        },
      },
      orderBy: [{ year: "desc" }, { errorRate: "asc" }],
      ...(takeLimit ? { take: takeLimit } : {}),
    });

    return questions.map((question) => {
      const triMetrics = triService.calculateQuestionWeight(
        question.errorRate,
        question.id
      );
      return {
        ...question,
        triMetrics,
      };
    });
  }

  /**
   * Lista todas as questões ordenadas das mais recentes para as mais antigas.
   * Suporta filtro opcional por matéria (subject/subjectId), grande área (area) e tópico (topicId).
   */
  async listQuestions(subject?: string, area?: string, topicId?: string) {
    if (topicId?.trim()) {
      return this.getQuestionsByTopic(topicId.trim());
    }

    if (subject?.trim()) {
      const resolvedSubject = await this.resolveSubject(subject.trim());
      if (resolvedSubject) {
        await this.ensureSubjectSynchronized(resolvedSubject.id);
        return prisma.question.findMany({
          where: {
            OR: [
              { subjectId: resolvedSubject.id },
              { subject: { equals: resolvedSubject.name, mode: "insensitive" } },
              { subject: { equals: subject.trim(), mode: "insensitive" } },
            ],
            ...(area ? { area: { equals: area, mode: "insensitive" } } : {}),
          },
          include: {
            topicRef: {
              select: { id: true, name: true, slug: true },
            },
            subjectRef: {
              select: { id: true, name: true, slug: true, icon: true },
            },
          },
          orderBy: { year: "desc" },
        });
      }
    }

    return prisma.question.findMany({
      where: {
        ...(subject ? { subject: { equals: subject, mode: "insensitive" } } : {}),
        ...(area ? { area: { equals: area, mode: "insensitive" } } : {}),
      },
      include: {
        topicRef: {
          select: { id: true, name: true, slug: true },
        },
        subjectRef: {
          select: { id: true, name: true, slug: true, icon: true },
        },
      },
      orderBy: { year: "desc" },
    });
  }

  /**
   * Retorna os detalhes de uma questão específica por ID.
   */
  async getQuestionById(id: string) {
    const question = await prisma.question.findUnique({
      where: { id },
      include: {
        topicRef: {
          select: { id: true, name: true, slug: true, subjectId: true },
        },
        subjectRef: {
          select: { id: true, name: true, slug: true, icon: true },
        },
      },
    });

    if (!question) {
      throw new AppError("Questão não encontrada.", 404);
    }

    // Se a questão ainda não estiver sincronizada com Subject/Topic, sincroniza sob demanda
    if (!question.subjectId || !question.topicId) {
      const syncedSubject = await this.ensureSubjectSynchronized(question.subject);
      if (syncedSubject) {
        const refreshed = await prisma.question.findUnique({
          where: { id },
          include: {
            topicRef: {
              select: { id: true, name: true, slug: true, subjectId: true },
            },
            subjectRef: {
              select: { id: true, name: true, slug: true, icon: true },
            },
          },
        });
        if (refreshed) {
          const triMetrics = triService.calculateQuestionWeight(
            refreshed.errorRate,
            refreshed.id
          );
          return {
            ...refreshed,
            triMetrics,
          };
        }
      }
    }

    const triMetrics = triService.calculateQuestionWeight(
      question.errorRate,
      question.id
    );

    return {
      ...question,
      triMetrics,
    };
  }

  /**
   * Pipeline Integrado de Resolução de Questão:
   * 1. Salva a resposta no banco (`QuestionAttempt`)
   * 2. Recalcula a taxa de erro da questão (`Question.errorRate` e `difficulty`)
   * 3. Atualiza os intervalos de repetição espaçada SM-2 (`FlashcardReview`)
   * 4. Registra a atividade diária e atualiza ofensiva/XP (`StreakService`)
   * 5. Recalcula a proficiência e pontuação estimada TRI do aluno (`TriService`)
   */
  async answerQuestion({
    userId,
    questionId,
    selectedAnswer,
    timeSpentMs,
    source = "QUIZ",
    idempotencyKey,
  }: AnswerQuestionInput) {
    if (!userId) {
      throw new AppError("O ID do usuário (userId) é obrigatório.", 400);
    }

    if (!questionId) {
      throw new AppError("O ID da questão (questionId) é obrigatório.", 400);
    }

    if (
      selectedAnswer === undefined ||
      selectedAnswer === null ||
      Number.isNaN(Number(selectedAnswer))
    ) {
      throw new AppError(
        "A alternativa selecionada (selectedAnswer) é obrigatória.",
        400
      );
    }

    const numericAnswer = Number(selectedAnswer);

    // 1. Verificação de idempotência para sincronizações offline duplicadas
    if (idempotencyKey) {
      const existingSync = await prisma.offlineSyncLog.findUnique({
        where: { idempotencyKey },
        include: {
          attempts: {
            where: { questionId },
          },
        },
      });

      if (existingSync && existingSync.attempts.length > 0) {
        const pastAttempt = existingSync.attempts[0];
        const user = await prisma.user.findUnique({ where: { id: userId } });
        return {
          isCorrect: pastAttempt.isCorrect,
          xpEarned: pastAttempt.xpEarned,
          attemptId: pastAttempt.id,
          user,
          idempotent: true,
        };
      }
    }

    const [user, question] = await Promise.all([
      prisma.user.findUnique({ where: { id: userId } }),
      prisma.question.findUnique({ where: { id: questionId } }),
    ]);

    if (!user) {
      throw new AppError("Usuário não encontrado.", 404);
    }

    if (!question) {
      throw new AppError("Questão não encontrada.", 404);
    }

    const isCorrect = question.correctAnswer === numericAnswer;
    const xpEarned = isCorrect ? 10 : 0;

    // 2. Persistência atômica da tentativa no banco de dados
    const { attempt, updatedQuestion } = await prisma.$transaction(
      async (tx) => {
        let syncLogId: string | undefined;
        if (idempotencyKey) {
          const syncLog = await tx.offlineSyncLog.create({
            data: {
              idempotencyKey,
              userId: user.id,
              status: "SYNCED",
              itemsCount: 1,
              payload: { questionId, selectedAnswer: numericAnswer, isCorrect },
            },
          });
          syncLogId = syncLog.id;
        }

        const newAttempt = await tx.questionAttempt.create({
          data: {
            userId: user.id,
            questionId: question.id,
            selectedAnswer: numericAnswer,
            isCorrect,
            timeSpentMs: timeSpentMs ? Number(timeSpentMs) : null,
            xpEarned,
            source: source || "QUIZ",
            offlineSyncLogId: syncLogId || null,
          },
        });

        // 3. Atualização da taxa de erro da questão no banco (errorRate empírico)
        const totalAttempts = await tx.questionAttempt.count({
          where: { questionId: question.id },
        });

        const wrongAttempts = await tx.questionAttempt.count({
          where: { questionId: question.id, isCorrect: false },
        });

        const empiricalErrorRate = Number(
          ((wrongAttempts / Math.max(totalAttempts, 1)) * 100).toFixed(2)
        );

        // Suavização bayesiana com a taxa prévia do INEP caso haja histórico anterior
        const priorRate = question.errorRate ?? 50.0;
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

        const qUpdated = await tx.question.update({
          where: { id: question.id },
          data: {
            errorRate: smoothedErrorRate,
            difficulty: newDifficultyTier,
          },
        });

        return { attempt: newAttempt, updatedQuestion: qUpdated };
      }
    );

    // 4. Atualiza os intervalos de repetição espaçada SM-2 (FlashcardReview)
    const sm2Result = await spacedRepetitionService
      .reviewCard({
        userId: user.id,
        questionId: question.id,
        isCorrect,
        grade: isCorrect ? 4 : 1,
      })
      .catch((err) => {
        console.warn("[SM-2 Update Error]:", err.message);
        return null;
      });

    // 5. Registra a atividade diária e atualiza ofensiva/XP (StreakService)
    const streakResult = await streakService
      .registerActivity(user.id)
      .catch((err) => {
        console.warn("[Streak Update Error]:", err.message);
        return null;
      });

    // Concede o XP da questão se o usuário acertou
    if (xpEarned > 0) {
      await prisma.user
        .update({
          where: { id: user.id },
          data: { xp: { increment: xpEarned } },
        })
        .catch(() => null);
    }

    // 6. Recalcula a nota e proficiência TRI acumulada do aluno (TriService)
    const triProficiency = await triService
      .calculateStudentProficiency(user.id)
      .catch((err) => {
        console.warn("[TRI Recalculate Error]:", err.message);
        return null;
      });

    const refreshedUser = await prisma.user.findUnique({
      where: { id: user.id },
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
      isCorrect,
      correctAnswer: question.correctAnswer,
      explanation: question.explanation,
      xpEarned,
      attemptId: attempt.id,
      question: {
        id: updatedQuestion.id,
        errorRate: updatedQuestion.errorRate,
        difficulty: updatedQuestion.difficulty,
        subjectId: updatedQuestion.subjectId,
        topicId: updatedQuestion.topicId,
      },
      tri: triProficiency,
      sm2: sm2Result?.sm2 || null,
      streak: streakResult,
      user: refreshedUser,
    };
  }

  /**
   * Retorna as estatísticas reais acumuladas do usuário:
   * - Total de resoluções, acertos e erros
   * - Taxa geral de acertos
   * - Nota estimada TRI
   * - Desempenho por grande área do ENEM
   * - Tópicos com MAIOR taxa de erro (onde o aluno precisa reforçar)
   * - Últimas tentativas registradas
   */
  async getUserStats(userId: string): Promise<UserQuestionStats> {
    if (!userId) {
      throw new AppError("O ID do usuário é obrigatório.", 400);
    }

    const [attempts, triStats] = await Promise.all([
      prisma.questionAttempt.findMany({
        where: { userId },
        include: {
          question: {
            select: {
              id: true,
              subject: true,
              subjectId: true,
              topic: true,
              topicId: true,
              area: true,
              year: true,
              difficulty: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      triService.calculateStudentProficiency(userId),
    ]);

    const totalAttempts = attempts.length;
    const totalCorrect = attempts.filter((a) => a.isCorrect).length;
    const totalWrong = totalAttempts - totalCorrect;
    const accuracyPercent =
      totalAttempts > 0
        ? Number(((totalCorrect / totalAttempts) * 100).toFixed(1))
        : 0;

    // Agrupamento por tópico (subject) para identificar fraquezas
    const topicMap = new Map<
      string,
      {
        subject: string;
        area: string;
        totalAttempts: number;
        wrongCount: number;
        correctCount: number;
      }
    >();

    attempts.forEach((att) => {
      const subject = att.question?.subject || "Geral";
      const area = att.question?.area || "Geral";

      if (!topicMap.has(subject)) {
        topicMap.set(subject, {
          subject,
          area,
          totalAttempts: 0,
          wrongCount: 0,
          correctCount: 0,
        });
      }

      const entry = topicMap.get(subject)!;
      entry.totalAttempts++;
      if (att.isCorrect) {
        entry.correctCount++;
      } else {
        entry.wrongCount++;
      }
    });

    const topWeakTopics: WeakTopic[] = Array.from(topicMap.values())
      .map((t) => {
        const errorRatePercent = Number(
          ((t.wrongCount / Math.max(t.totalAttempts, 1)) * 100).toFixed(1)
        );
        const acc = Number(
          ((t.correctCount / Math.max(t.totalAttempts, 1)) * 100).toFixed(1)
        );
        return {
          ...t,
          errorRatePercent,
          accuracyPercent: acc,
        };
      })
      // Ordena decrescente: tópicos com maior taxa de erro primeiro
      .sort((a, b) => b.errorRatePercent - a.errorRatePercent);

    return {
      userId,
      totalAttempts,
      totalCorrect,
      totalWrong,
      accuracyPercent,
      triEstimate: triStats.triScore,
      byArea: triStats.byArea,
      topWeakTopics,
      recentAttempts: attempts.slice(0, 10).map((a) => ({
        id: a.id,
        questionId: a.questionId,
        isCorrect: a.isCorrect,
        timeSpentMs: a.timeSpentMs,
        xpEarned: a.xpEarned,
        source: a.source,
        createdAt: a.createdAt,
        question: a.question,
      })),
    };
  }
}

export const questionService = new QuestionService();

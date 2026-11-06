import crypto from "crypto";
import {
  CreateClassroomInputSchema,
  EnrollStudentInputSchema,
  CreateClassroomLessonInputSchema,
  type CreateClassroomInput,
  type CreateClassroomLessonInput,
} from "@minuto-enem/shared";
import { prisma } from "../lib/prisma";
import { AppError } from "../errors/AppError";
import { questionService, slugifyText } from "./question.service";

export {
  CreateClassroomInputSchema,
  EnrollStudentInputSchema,
  CreateClassroomLessonInputSchema,
  type CreateClassroomInput,
  type CreateClassroomLessonInput,
} from "@minuto-enem/shared";

/**
 * Valida se uma string é uma URL válida do YouTube.
 * Suporta formatos:
 * - https://www.youtube.com/watch?v=VIDEO_ID
 * - https://youtube.com/watch?v=VIDEO_ID
 * - https://youtu.be/VIDEO_ID
 * - https://www.youtube.com/embed/VIDEO_ID
 * - https://www.youtube.com/shorts/VIDEO_ID
 * - https://m.youtube.com/watch?v=VIDEO_ID
 * - youtu.be/VIDEO_ID
 */
export function isValidYouTubeUrl(url: string): boolean {
  if (!url || typeof url !== "string") return false;
  let trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = `https://${trimmed}`;
  }

  try {
    const parsed = new URL(trimmed);
    const hostname = parsed.hostname.toLowerCase();

    const isYouTubeDomain =
      hostname === "youtube.com" ||
      hostname === "www.youtube.com" ||
      hostname === "m.youtube.com" ||
      hostname === "music.youtube.com" ||
      hostname === "youtu.be";

    if (!isYouTubeDomain) {
      return false;
    }

    if (hostname === "youtu.be") {
      const videoId = parsed.pathname.slice(1).split("/")[0];
      return Boolean(videoId && /^[a-zA-Z0-9_-]{11}$/.test(videoId));
    }

    if (parsed.pathname === "/watch") {
      const v = parsed.searchParams.get("v");
      return Boolean(v && /^[a-zA-Z0-9_-]{11}$/.test(v));
    }

    const pathParts = parsed.pathname.split("/").filter(Boolean);
    if (
      pathParts.length >= 2 &&
      ["embed", "v", "shorts", "live"].includes(pathParts[0])
    ) {
      const videoId = pathParts[1];
      return Boolean(videoId && /^[a-zA-Z0-9_-]{11}$/.test(videoId));
    }

    return false;
  } catch {
    return false;
  }
}

export class ClassroomService {
  /**
   * Lista as salas de aula.
   * Se informado o `userId`, lista salas onde o usuário é professor ou aluno.
   */
  async listClassrooms(userId?: string, role?: string) {
    if (!userId) {
      return [];
    }

    let userRole = role?.toUpperCase();
    if (!userRole) {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { role: true },
      });
      userRole = user?.role;
    }

    if (userRole === "TEACHER") {
      return prisma.classroom.findMany({
        where: { teacherId: userId },
        include: {
          teacher: { select: { id: true, name: true, email: true } },
          _count: { select: { students: true, tasks: true } },
        },
        orderBy: { createdAt: "desc" },
      });
    }

    // Para estudantes (STUDENT), retorna APENAS as salas onde o aluno foi
    // explicitamente matriculado através do código de convite da turma
    return prisma.classroom.findMany({
      where: {
        students: { some: { id: userId } },
      },
      include: {
        teacher: { select: { id: true, name: true, email: true } },
        _count: { select: { students: true, tasks: true } },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Busca detalhes completos de uma sala por ID ou Código.
   */
  async getClassroomById(identifier: string, userId?: string) {
    if (!identifier?.trim()) {
      throw new AppError("Identificador da sala é obrigatório.", 400);
    }

    const cleanIdentifier = identifier.trim();

    const classroom = await prisma.classroom.findFirst({
      where: {
        OR: [
          { id: cleanIdentifier },
          {
            code: {
              equals: cleanIdentifier.toUpperCase(),
              mode: "insensitive",
            },
          },
        ],
      },
      include: {
        teacher: {
          select: { id: true, name: true, email: true },
        },
        students: {
          select: {
            id: true,
            name: true,
            email: true,
            xp: true,
            currentStreak: true,
            lastStudyDate: true,
          },
          orderBy: { xp: "desc" },
        },
        tasks: {
          orderBy: { createdAt: "desc" },
        },
        lessons: {
          orderBy: { createdAt: "desc" },
          include: {
            subject: {
              select: { id: true, name: true, slug: true, icon: true },
            },
            topic: {
              select: { id: true, name: true, slug: true },
            },
          },
        },
        _count: {
          select: { students: true, tasks: true, lessons: true },
        },
      },
    });

    if (!classroom) {
      throw new AppError("Sala de aula não encontrada.", 404);
    }

    // Se o usuário solicitante estiver autenticado, garante que apenas o professor
    // proprietário ou alunos matriculados na sala tenham acesso aos detalhes internos
    if (userId) {
      const isTeacher = classroom.teacherId === userId;
      const isStudent = classroom.students.some((s) => s.id === userId);

      if (!isTeacher && !isStudent) {
        throw new AppError(
          "Você não tem permissão para acessar esta turma. Entre na turma informando o código de convite.",
          403
        );
      }
    }

    return classroom;
  }

  /**
   * Cria uma nova sala (Classroom) vinculada ao professor criador (1:N).
   * Impede estritamente a criação de turmas com o mesmo código para evitar conflitos.
   */
  async createClassroom({ name, teacherId, code }: CreateClassroomInput) {
    if (!name || !name.trim()) {
      throw new AppError("O nome da sala é obrigatório.", 400);
    }

    if (!teacherId) {
      throw new AppError("O identificador do professor é obrigatório.", 400);
    }

    let roomCode = code?.trim().toUpperCase() || "";

    if (!roomCode) {
      // Gera um código único automaticamente caso nenhum tenha sido fornecido
      let uniqueFound = false;
      let attempts = 0;
      while (!uniqueFound && attempts < 20) {
        attempts++;
        roomCode = crypto.randomBytes(3).toString("hex").toUpperCase();
        const existing = await prisma.classroom.findFirst({
          where: {
            code: {
              equals: roomCode,
              mode: "insensitive",
            },
          },
        });
        if (!existing) {
          uniqueFound = true;
        }
      }
      if (!uniqueFound) {
        roomCode = `TUR-${Date.now().toString(36).slice(-4).toUpperCase()}`;
      }
    } else {
      if (roomCode.length < 3) {
        throw new AppError("O código da turma deve ter pelo menos 3 caracteres.", 400);
      }
      if (!/^[A-Z0-9_-]+$/.test(roomCode)) {
        throw new AppError("O código da turma deve conter apenas letras, números e hífens.", 400);
      }

      // Validação de unicidade estrita no banco (case-insensitive)
      const existingCode = await prisma.classroom.findFirst({
        where: {
          code: {
            equals: roomCode,
            mode: "insensitive",
          },
        },
      });

      if (existingCode) {
        throw new AppError(
          `Já existe uma turma cadastrada com o código "${roomCode}". Escolha outro código para evitar conflitos.`,
          409
        );
      }
    }

    try {
      const classroom = await prisma.classroom.create({
        data: {
          name: name.trim(),
          code: roomCode,
          teacherId,
        },
        include: {
          teacher: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          _count: {
            select: { students: true, tasks: true },
          },
        },
      });

      return classroom;
    } catch (err: any) {
      if (err?.code === "P2002") {
        throw new AppError(
          `Já existe uma turma cadastrada com o código "${roomCode}". Escolha outro código para evitar conflitos.`,
          409
        );
      }
      throw err;
    }
  }

  /**
   * Atualiza os dados de uma sala de aula (apenas pelo professor proprietário).
   */
  async updateClassroom(
    id: string,
    data: { name?: string; code?: string },
    teacherId?: string
  ) {
    const classroom = await prisma.classroom.findUnique({
      where: { id },
    });

    if (!classroom) {
      throw new AppError("Sala de aula não encontrada.", 404);
    }

    if (teacherId && classroom.teacherId !== teacherId) {
      throw new AppError(
        "Apenas o professor proprietário da sala pode editá-la.",
        403
      );
    }

    if (data.code) {
      const formattedCode = data.code.trim().toUpperCase();
      if (formattedCode.length < 3) {
        throw new AppError("O código da sala deve ter pelo menos 3 caracteres.", 400);
      }
      if (!/^[A-Z0-9_-]+$/.test(formattedCode)) {
        throw new AppError("O código da sala deve conter apenas letras, números e hífens.", 400);
      }

      const existing = await prisma.classroom.findFirst({
        where: {
          code: {
            equals: formattedCode,
            mode: "insensitive",
          },
        },
      });
      if (existing && existing.id !== id) {
        throw new AppError(
          `Já existe uma turma cadastrada com o código "${formattedCode}". Escolha outro código para evitar conflitos.`,
          409
        );
      }
      data.code = formattedCode;
    }

    return prisma.classroom.update({
      where: { id },
      data: {
        ...(data.name ? { name: data.name.trim() } : {}),
        ...(data.code ? { code: data.code } : {}),
      },
      include: {
        teacher: { select: { id: true, name: true, email: true } },
        _count: { select: { students: true, tasks: true } },
      },
    });
  }

  /**
   * Remove uma sala de aula (apenas pelo professor proprietário).
   */
  async deleteClassroom(id: string, teacherId?: string) {
    const classroom = await prisma.classroom.findUnique({
      where: { id },
    });

    if (!classroom) {
      throw new AppError("Sala de aula não encontrada.", 404);
    }

    if (teacherId && classroom.teacherId !== teacherId) {
      throw new AppError(
        "Apenas o professor proprietário da sala pode excluí-la.",
        403
      );
    }

    await prisma.classroom.delete({
      where: { id },
    });

    return { message: "Sala de aula excluída com sucesso." };
  }

  /**
   * Matricula um aluno na sala (relação N:N) através do código da sala.
   */
  async enrollStudent(code: string, studentId: string) {
    if (!code || !code.trim()) {
      throw new AppError("O código da sala é obrigatório.", 400);
    }

    const cleanCode = code.trim().toUpperCase();

    const classroom = await prisma.classroom.findFirst({
      where: {
        code: {
          equals: cleanCode,
          mode: "insensitive",
        },
      },
      include: { students: { select: { id: true } } },
    });

    if (!classroom) {
      throw new AppError("Sala de aula não encontrada para o código informado.", 404);
    }

    if (classroom.teacherId === studentId) {
      throw new AppError("Você é o professor proprietário desta turma e já possui acesso completo.", 400);
    }

    const isAlreadyEnrolled = classroom.students.some((s) => s.id === studentId);
    if (isAlreadyEnrolled) {
      return classroom;
    }

    const updatedClassroom = await prisma.classroom.update({
      where: { id: classroom.id },
      data: {
        students: {
          connect: { id: studentId },
        },
      },
      include: {
        teacher: {
          select: { id: true, name: true, email: true },
        },
        students: {
          select: { id: true, name: true, email: true, xp: true, currentStreak: true },
        },
        _count: {
          select: { students: true, tasks: true },
        },
      },
    });

    return updatedClassroom;
  }

  /**
   * Remove a matrícula de um aluno da sala.
   */
  async unenrollStudent(classroomId: string, studentId: string) {
    const classroom = await prisma.classroom.findUnique({
      where: { id: classroomId },
    });

    if (!classroom) {
      throw new AppError("Sala de aula não encontrada.", 404);
    }

    await prisma.classroom.update({
      where: { id: classroomId },
      data: {
        students: {
          disconnect: { id: studentId },
        },
      },
    });

    return { message: "Aluno desvinculado da sala com sucesso." };
  }

  /**
   * Retorna os alunos matriculados na sala.
   */
  async listStudents(classroomId: string, teacherId?: string) {
    const classroom = await this.getClassroomById(classroomId);

    if (teacherId && classroom.teacherId !== teacherId) {
      throw new AppError(
        "Acesso negado. Apenas o professor responsável pode listar os alunos.",
        403
      );
    }

    return classroom.students;
  }

  /**
   * Valida se a turma existe e se o professor autenticado é o proprietário responsável.
   */
  async validateTeacherClassroomAccess(classroomId: string, teacherId: string) {
    if (!classroomId?.trim()) {
      throw new AppError("O ID da turma é obrigatório.", 400);
    }
    if (!teacherId?.trim()) {
      throw new AppError("O ID do professor autenticado é obrigatório.", 401);
    }

    const cleanClassroomId = classroomId.trim();
    const classroom = await prisma.classroom.findFirst({
      where: {
        OR: [
          { id: cleanClassroomId },
          {
            code: {
              equals: cleanClassroomId.toUpperCase(),
              mode: "insensitive",
            },
          },
        ],
      },
    });

    if (!classroom) {
      throw new AppError("Turma não encontrada.", 404);
    }

    if (classroom.teacherId !== teacherId) {
      throw new AppError(
        "Acesso negado. Apenas o professor proprietário da turma pode adicionar materiais e realizar uploads para ela.",
        403
      );
    }

    return classroom;
  }

  /**
   * Cria um novo material/aula multimídia customizado vinculado especificamente à turma informada,
   * bem como a uma Matéria (Subject) e a um Tópico/Conteúdo (Topic).
   * Suporta todos os formatos de MaterialType: VIDEO, PDF, ARTICLE, TIP, EXTERNAL_LINK.
   * Exclusivo para o professor proprietário da sala de aula.
   */
  async createLesson(
    classroomId: string,
    teacherId: string,
    data: {
      title: string;
      type?: "VIDEO" | "PDF" | "ARTICLE" | "TIP" | "EXTERNAL_LINK" | string;
      description?: string;
      content?: string;
      fileUrl?: string;
      externalUrl?: string;
      youtubeUrl?: string;
      subjectId?: string;
      topicId?: string;
      subject?: string;
      topic?: string;
    }
  ) {
    // 1. Valida se a turma existe e se o professor proprietário tem permissão
    const classroom = await this.validateTeacherClassroomAccess(classroomId, teacherId);

    // 3. Validação do título
    const title = data.title?.trim();
    if (!title) {
      throw new AppError("O título do material/aula é obrigatório.", 400);
    }
    if (title.length < 3) {
      throw new AppError(
        "O título do material/aula deve ter pelo menos 3 caracteres.",
        400
      );
    }

    const rawYoutubeUrl =
      typeof data.youtubeUrl === "string" ? data.youtubeUrl.trim() : "";
    const rawFileUrl =
      typeof data.fileUrl === "string" && data.fileUrl.trim().length > 0
        ? data.fileUrl.trim()
        : typeof data.externalUrl === "string" && data.externalUrl.trim().length > 0
        ? data.externalUrl.trim()
        : "";
    const rawDescription =
      typeof data.description === "string" ? data.description.trim() : "";
    const rawContent =
      typeof data.content === "string" ? data.content.trim() : "";

    // Normaliza o formato (MaterialType)
    const rawTypeUpper = (data.type || "").toString().trim().toUpperCase();
    let materialType: "VIDEO" | "PDF" | "ARTICLE" | "TIP" | "EXTERNAL_LINK" =
      "VIDEO";

    if (
      rawTypeUpper === "VIDEO" ||
      rawTypeUpper === "PDF" ||
      rawTypeUpper === "ARTICLE" ||
      rawTypeUpper === "TIP" ||
      rawTypeUpper === "EXTERNAL_LINK"
    ) {
      materialType = rawTypeUpper;
    } else if (rawTypeUpper === "LINK") {
      materialType = "EXTERNAL_LINK";
    } else if (!rawTypeUpper) {
      if (rawYoutubeUrl) {
        materialType = "VIDEO";
      } else if (rawFileUrl && /\.pdf(\?.*)?$/i.test(rawFileUrl)) {
        materialType = "PDF";
      } else if (rawFileUrl) {
        materialType = "EXTERNAL_LINK";
      } else {
        materialType = "VIDEO";
      }
    } else {
      throw new AppError(
        "Formato de material inválido. Use VIDEO, PDF, ARTICLE, TIP ou EXTERNAL_LINK.",
        400
      );
    }

    // 4. Validações específicas por formato de material (MaterialType)
    let resolvedYoutubeUrl = rawYoutubeUrl;
    let resolvedFileUrl = rawFileUrl;

    if (materialType === "VIDEO") {
      const candidateVideoUrl = resolvedYoutubeUrl || resolvedFileUrl;
      if (!candidateVideoUrl || !isValidYouTubeUrl(candidateVideoUrl)) {
        throw new AppError(
          "URL do YouTube inválida. Forneça um link válido do YouTube (ex: https://www.youtube.com/watch?v=... ou https://youtu.be/...).",
          400
        );
      }
      resolvedYoutubeUrl = candidateVideoUrl;
    } else if (materialType === "PDF") {
      let candidatePdfUrl = resolvedFileUrl;
      if (
        !candidatePdfUrl &&
        rawContent &&
        (rawContent.startsWith("http") || rawContent.startsWith("/uploads"))
      ) {
        candidatePdfUrl = rawContent;
      }

      if (!candidatePdfUrl) {
        throw new AppError(
          "Para materiais em formato PDF, forneça o arquivo PDF enviado (upload) ou um link externo para o documento.",
          400
        );
      }

      // Aceita tanto upload local (/uploads/...) quanto link externo (http:// ou https://)
      const isLocalPath =
        candidatePdfUrl.startsWith("/uploads/") ||
        candidatePdfUrl.startsWith("uploads/") ||
        candidatePdfUrl.includes("/uploads/pdfs/");
      const isExternalHttp = /^https?:\/\//i.test(candidatePdfUrl);

      if (!isLocalPath && !isExternalHttp) {
        throw new AppError(
          "URL do arquivo PDF inválida. Forneça uma URL pública (ex: https://...) ou o link do arquivo salvo localmente (/uploads/pdfs/...).",
          400
        );
      }

      resolvedFileUrl = candidatePdfUrl.startsWith("uploads/")
        ? `/${candidatePdfUrl}`
        : candidatePdfUrl;

      if (resolvedYoutubeUrl && !isValidYouTubeUrl(resolvedYoutubeUrl)) {
        throw new AppError("URL do YouTube inválida.", 400);
      }
    } else if (materialType === "EXTERNAL_LINK") {
      const linkUrl = resolvedFileUrl || resolvedYoutubeUrl;
      if (!linkUrl) {
        throw new AppError(
          "Para materiais do tipo EXTERNAL_LINK, informe a URL de destino (fileUrl).",
          400
        );
      }
      resolvedFileUrl = linkUrl;
    } else if (materialType === "ARTICLE" || materialType === "TIP") {
      if (!rawContent && !rawDescription) {
        throw new AppError(
          `Para materiais do tipo ${materialType}, o texto/conteúdo é obrigatório.`,
          400
        );
      }
      if (resolvedYoutubeUrl && !isValidYouTubeUrl(resolvedYoutubeUrl)) {
        throw new AppError("URL do YouTube inválida.", 400);
      }
    }

    const description = rawDescription || null;
    const content =
      rawContent ||
      rawDescription ||
      "Conteúdo disponibilizado pelo professor da turma.";

    const videos = resolvedYoutubeUrl ? [resolvedYoutubeUrl] : [];

    // 5. Vinculação estrita à Matéria (Subject) e ao Tópico/Conteúdo (Topic)
    const subjectInput = (data.subjectId || data.subject || "").trim();
    const topicInput = (data.topicId || data.topic || "").trim();

    let resolvedSubject = subjectInput
      ? await questionService.ensureSubjectSynchronized(subjectInput)
      : null;

    let resolvedTopicId: string | null = null;

    if (topicInput) {
      const existingTopic = await prisma.topic.findFirst({
        where: {
          OR: [
            { id: topicInput },
            { slug: { equals: topicInput, mode: "insensitive" } },
            { slug: { equals: slugifyText(topicInput), mode: "insensitive" } },
            { name: { equals: topicInput, mode: "insensitive" } },
          ],
          ...(resolvedSubject ? { subjectId: resolvedSubject.id } : {}),
        },
        include: { subject: true },
      });

      if (existingTopic) {
        resolvedTopicId = existingTopic.id;
        if (!resolvedSubject) {
          resolvedSubject = existingTopic.subject;
        }
      } else {
        // Caso o topicId aponte para uma lição do sistema, recupera o topicId dela
        const sysLesson = await prisma.lesson.findUnique({
          where: { id: topicInput },
        });
        if (sysLesson?.subjectId) {
          if (!resolvedSubject) {
            resolvedSubject = await questionService.ensureSubjectSynchronized(
              sysLesson.subjectId
            );
          }
          const refreshedSysLesson = await prisma.lesson.findUnique({
            where: { id: topicInput },
          });
          resolvedTopicId = refreshedSysLesson?.topicId || null;
        } else if (resolvedSubject) {
          // Se o professor informou o nome de um tópico novo para esta matéria, cria/vincula via upsert
          const customTopicSlug =
            slugifyText(topicInput) || `${resolvedSubject.slug}-topico`;
          const upsertedTopic = await prisma.topic.upsert({
            where: {
              subjectId_slug: {
                subjectId: resolvedSubject.id,
                slug: customTopicSlug,
              },
            },
            create: {
              name: topicInput,
              slug: customTopicSlug,
              description,
              subjectId: resolvedSubject.id,
            },
            update: {},
          });
          resolvedTopicId = upsertedTopic.id;
        }
      }
    }

    if (!resolvedSubject) {
      resolvedSubject =
        (await questionService.resolveSubject(classroom.name)) ||
        (await questionService.resolveSubject(title)) ||
        (await prisma.subject.findFirst({ orderBy: { name: "asc" } }));

      if (resolvedSubject) {
        await questionService.ensureSubjectSynchronized(resolvedSubject.id);
      }
    }

    if (resolvedSubject && !resolvedTopicId) {
      const existingTopics = await prisma.topic.findMany({
        where: { subjectId: resolvedSubject.id },
        orderBy: { createdAt: "asc" },
      });

      if (existingTopics.length > 0) {
        resolvedTopicId = existingTopics[0].id;
      } else {
        const createdTopic = await prisma.topic.create({
          data: {
            name: title,
            slug: slugifyText(title) || `${resolvedSubject.slug}-geral`,
            description,
            subjectId: resolvedSubject.id,
          },
        });
        resolvedTopicId = createdTopic.id;
      }
    }

    // 6. Criação do material/lição customizada vinculada à turma, matéria e tópico
    const lesson = await prisma.lesson.create({
      data: {
        title,
        description,
        content,
        type: materialType,
        fileUrl: resolvedFileUrl || null,
        youtubeUrl: resolvedYoutubeUrl || null,
        videos,
        classroomId: classroom.id,
        subjectId: resolvedSubject?.id || null,
        topicId: resolvedTopicId,
      },
      include: {
        classroom: {
          select: { id: true, name: true, code: true, teacherId: true },
        },
        subject: {
          select: { id: true, name: true, slug: true, icon: true },
        },
        topic: {
          select: { id: true, name: true, slug: true },
        },
      },
    });

    return lesson;
  }

  /**
   * Alias de compatibilidade para criação de aula/material customizado da turma.
   */
  async createClassroomLesson(
    classroomId: string,
    teacherId: string,
    data: {
      title: string;
      type?: "VIDEO" | "PDF" | "ARTICLE" | "TIP" | "EXTERNAL_LINK" | string;
      description?: string;
      content?: string;
      fileUrl?: string;
      externalUrl?: string;
      youtubeUrl?: string;
      subjectId?: string;
      topicId?: string;
      subject?: string;
      topic?: string;
    }
  ) {
    return this.createLesson(classroomId, teacherId, data);
  }

  /**
   * Alias semântico para criação de material multimídia da turma.
   */
  async createMaterial(
    classroomId: string,
    teacherId: string,
    data: {
      title: string;
      type?: "VIDEO" | "PDF" | "ARTICLE" | "TIP" | "EXTERNAL_LINK" | string;
      description?: string;
      content?: string;
      fileUrl?: string;
      externalUrl?: string;
      youtubeUrl?: string;
      subjectId?: string;
      topicId?: string;
      subject?: string;
      topic?: string;
    }
  ) {
    return this.createLesson(classroomId, teacherId, data);
  }

  /**
   * Lista as aulas customizadas da turma para o professor ou alunos matriculados.
   */
  async listClassroomLessons(classroomId: string, userId?: string) {
    if (!classroomId?.trim()) {
      throw new AppError("O ID da turma é obrigatório.", 400);
    }

    // Valida se o usuário tem permissão para visualizar a turma
    await this.getClassroomById(classroomId.trim(), userId);

    return prisma.lesson.findMany({
      where: {
        classroomId: classroomId.trim(),
      },
      include: {
        subject: {
          select: { id: true, name: true, slug: true, icon: true },
        },
        topic: {
          select: { id: true, name: true, slug: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Copiloto Docente:
   * Agrega os dados de erros da turma, diagnostica as maiores lacunas de aprendizado
   * e gera automaticamente uma Task de reforço pendente de aprovação do professor.
   */
  async generateCopilotAnalyticsAndTask(
    classroomId: string,
    teacherId?: string
  ) {
    if (!classroomId) {
      throw new AppError("O ID da sala (classroomId) é obrigatório.", 400);
    }

    const classroom = await prisma.classroom.findUnique({
      where: { id: classroomId },
      include: {
        teacher: { select: { id: true, name: true, email: true } },
        students: {
          select: {
            id: true,
            name: true,
            email: true,
            xp: true,
            currentStreak: true,
          },
        },
      },
    });

    if (!classroom) {
      throw new AppError("Sala de aula não encontrada.", 404);
    }

    if (teacherId && classroom.teacherId !== teacherId) {
      throw new AppError(
        "Acesso negado. Apenas o professor responsável pela sala pode acessar o Copiloto.",
        403
      );
    }

    const studentIds = classroom.students.map((s) => s.id);

    if (studentIds.length === 0) {
      return {
        classroom: {
          id: classroom.id,
          name: classroom.name,
          code: classroom.code,
          totalStudents: 0,
        },
        overview: {
          totalAttempts: 0,
          totalErrors: 0,
          accuracyPercent: 0,
          message: "Nenhum aluno matriculado na turma ainda.",
        },
        learningGaps: [],
        hardestQuestions: [],
        studentsNeedingSupport: [],
        generatedReinforcementTask: null,
      };
    }

    // 1. Coleta todas as tarefas associadas a esta turma
    const classroomTasks = await prisma.task.findMany({
      where: {
        OR: [
          { classroomId: classroom.id },
          { classId: classroom.id },
          { classId: classroom.code },
        ],
      },
      select: { id: true },
    });
    const classroomTaskIds = classroomTasks.map((t) => t.id);

    // 2. Coleta as tentativas de resolução feitas EXCLUSIVAMENTE nas tarefas desta turma
    const attempts =
      classroomTaskIds.length > 0 && studentIds.length > 0
        ? await prisma.questionAttempt.findMany({
            where: {
              taskId: { in: classroomTaskIds },
              userId: { in: studentIds },
            },
            include: {
              question: {
                select: {
                  id: true,
                  year: true,
                  area: true,
                  subject: true,
                  text: true,
                  errorRate: true,
                },
              },
            },
            orderBy: { createdAt: "desc" },
          })
        : [];

    const totalAttempts = attempts.length;
    const errorAttempts = attempts.filter((a) => !a.isCorrect);
    const correctAttempts = attempts.filter((a) => a.isCorrect);
    const accuracyPercent =
      totalAttempts > 0
        ? Number(((correctAttempts.length / totalAttempts) * 100).toFixed(1))
        : 0;

    // 1. Agrupamento de lacunas por disciplina/área
    const gapsBySubjectMap = new Map<
      string,
      {
        subject: string;
        area: string;
        errorCount: number;
        totalCount: number;
      }
    >();

    for (const att of attempts) {
      const subjectName = att.question.subject || "Geral";
      const current = gapsBySubjectMap.get(subjectName) || {
        subject: subjectName,
        area: att.question.area || "Geral",
        errorCount: 0,
        totalCount: 0,
      };

      current.totalCount += 1;
      if (!att.isCorrect) {
        current.errorCount += 1;
      }
      gapsBySubjectMap.set(subjectName, current);
    }

    const learningGaps = Array.from(gapsBySubjectMap.values())
      .map((g) => ({
        ...g,
        errorRatePercent:
          g.totalCount > 0
            ? Number(((g.errorCount / g.totalCount) * 100).toFixed(1))
            : 0,
      }))
      .sort((a, b) => b.errorCount - a.errorCount);

    // 2. Ranking das questões mais erradas pelos alunos da turma
    const questionErrorCountMap = new Map<
      string,
      {
        questionId: string;
        text: string;
        subject: string;
        area: string;
        nationalErrorRate: number | null;
        classErrorCount: number;
        classTotalAttempts: number;
      }
    >();

    for (const att of attempts) {
      const q = att.question;
      const current = questionErrorCountMap.get(q.id) || {
        questionId: q.id,
        text: q.text.slice(0, 160) + "...",
        subject: q.subject,
        area: q.area,
        nationalErrorRate: q.errorRate,
        classErrorCount: 0,
        classTotalAttempts: 0,
      };

      current.classTotalAttempts += 1;
      if (!att.isCorrect) {
        current.classErrorCount += 1;
      }
      questionErrorCountMap.set(q.id, current);
    }

    const hardestQuestions = Array.from(questionErrorCountMap.values())
      .filter((q) => q.classErrorCount > 0)
      .map((q) => ({
        ...q,
        classErrorRatePercent: Number(
          ((q.classErrorCount / q.classTotalAttempts) * 100).toFixed(1)
        ),
      }))
      .sort((a, b) => b.classErrorCount - a.classErrorCount)
      .slice(0, 10);

    // 3. Alunos com maior índice de erros
    const studentErrorMap = new Map<
      string,
      {
        userId: string;
        name: string;
        errorCount: number;
        totalAttempts: number;
      }
    >();

    const studentNameMap = new Map(classroom.students.map((s) => [s.id, s.name]));

    for (const att of attempts) {
      const current = studentErrorMap.get(att.userId) || {
        userId: att.userId,
        name: studentNameMap.get(att.userId) || "Aluno",
        errorCount: 0,
        totalAttempts: 0,
      };

      current.totalAttempts += 1;
      if (!att.isCorrect) {
        current.errorCount += 1;
      }
      studentErrorMap.set(att.userId, current);
    }

    const studentsNeedingSupport = Array.from(studentErrorMap.values())
      .map((s) => ({
        ...s,
        errorRatePercent:
          s.totalAttempts > 0
            ? Number(((s.errorCount / s.totalAttempts) * 100).toFixed(1))
            : 0,
      }))
      .sort((a, b) => b.errorRatePercent - a.errorRatePercent)
      .slice(0, 5);

    // 4. Geração Automática de Task de Reforço com as questões mais erradas
    let generatedTask = null;

    if (hardestQuestions.length > 0) {
      const primaryDeficit = learningGaps[0];
      const targetSubject = primaryDeficit?.subject || "Geral";
      const targetArea = primaryDeficit?.area || "Todas";

      const reinforcementQuestionIds = hardestQuestions
        .slice(0, 5)
        .map((q) => q.questionId);

      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 7);

      const taskTitle = `Reforço Focado: ${targetSubject} (${targetArea})`;
      const taskDescription = `[Copiloto Docente - Sugestão Automática] Identificamos que a turma apresentou ${primaryDeficit?.errorCount} erro(s) em ${targetSubject} (${primaryDeficit?.errorRatePercent}% de erro). Esta lista traz as questões de maior incidência de distratores para nivelamento.`;

      generatedTask = await prisma.task.create({
        data: {
          title: taskTitle,
          topic: `Reforço: ${targetSubject}`,
          description: taskDescription,
          total: reinforcementQuestionIds.length,
          questionIds: reinforcementQuestionIds,
          dueDate,
          status: "PENDING_APPROVAL",
          classId: classroom.code,
          classroomId: classroom.id,
        },
        include: {
          classroom: {
            select: { id: true, name: true, code: true },
          },
        },
      });
    }

    return {
      classroom: {
        id: classroom.id,
        name: classroom.name,
        code: classroom.code,
        totalStudents: classroom.students.length,
        teacher: classroom.teacher,
      },
      overview: {
        totalAttempts,
        totalErrors: errorAttempts.length,
        totalCorrect: correctAttempts.length,
        accuracyPercent,
      },
      learningGaps,
      hardestQuestions,
      studentsNeedingSupport,
      generatedReinforcementTask: generatedTask,
    };
  }

  /**
   * Aprovação de uma tarefa gerada pelo Copiloto Docente.
   */
  async approveTask(taskId: string, teacherId?: string) {
    if (!taskId) {
      throw new AppError("O ID da tarefa é obrigatório.", 400);
    }

    const task = await prisma.task.findUnique({
      where: { id: taskId },
      include: { classroom: true },
    });

    if (!task) {
      throw new AppError("Tarefa não encontrada.", 404);
    }

    if (
      teacherId &&
      task.classroom &&
      task.classroom.teacherId !== teacherId
    ) {
      throw new AppError(
        "Apenas o professor criador da sala pode aprovar esta tarefa.",
        403
      );
    }

    const updated = await prisma.task.update({
      where: { id: taskId },
      data: {
        status: "APPROVED",
      },
    });

    return {
      message: "Tarefa de reforço aprovada e publicada para a turma com sucesso!",
      task: updated,
    };
  }

  /**
   * Retorna os dados consolidados do painel do professor (exercícios entregues, métricas e materiais).
   */
  async getTeacherTracking(teacherId?: string, classroomId?: string) {
    const whereClassroom = classroomId
      ? { id: classroomId }
      : teacherId
      ? { teacherId }
      : undefined;

    const classrooms = await prisma.classroom.findMany({
      where: whereClassroom,
      include: {
        students: { select: { id: true, name: true, xp: true } },
        tasks: true,
      },
    });

    const classroomIds = classrooms.map((c) => c.id);
    const classCodes = classrooms.map((c) => c.code);

    const tasks = await prisma.task.findMany({
      where: {
        OR: [
          { classroomId: { in: classroomIds } },
          { classId: { in: classCodes } },
          ...(classroomId ? [{ classId: classroomId }] : []),
        ],
      },
      include: {
        classroom: {
          include: {
            students: { select: { id: true, name: true, xp: true } },
          },
        },
        subject: {
          select: { id: true, name: true, slug: true, icon: true },
        },
        topicRef: {
          select: { id: true, name: true, slug: true },
        },
        submissions: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const assignments = await Promise.all(
      tasks.map(async (t) => {
        const studentsInClass = t.classroom?.students || [];
        const totalStudents = studentsInClass.length;

        const directSubmissionsMap = new Map(
          (t.submissions || []).map((sub) => [sub.studentId, sub])
        );

        const attempts =
          t.questionIds.length > 0
            ? await prisma.questionAttempt.findMany({
                where: {
                  taskId: t.id,
                  questionId: { in: t.questionIds },
                  userId: { in: studentsInClass.map((s) => s.id) },
                },
                select: {
                  userId: true,
                  questionId: true,
                  isCorrect: true,
                  timeSpentMs: true,
                  createdAt: true,
                },
              })
            : [];

        const submissions = studentsInClass.map((s) => {
          const directSub = directSubmissionsMap.get(s.id);
          if (directSub) {
            const mins = directSub.timeSpentMs
              ? Math.max(Math.round(directSub.timeSpentMs / 60000), 1)
              : 15;
            return {
              studentId: s.id,
              studentName: s.name,
              submittedAt: new Date(directSub.submittedAt).toLocaleDateString(
                "pt-BR"
              ),
              status: "CORRIGIDO" as const,
              score: directSub.score,
              correctCount: directSub.correctCount,
              totalQuestions: directSub.totalQuestions,
              accuracyPercent: directSub.accuracyPercent,
              timeSpent: `${mins} min`,
            };
          }

          const studentAttempts = attempts.filter((a) => a.userId === s.id);
          const hasSubmitted = studentAttempts.length > 0;
          const studentCorrect = studentAttempts.filter((a) => a.isCorrect).length;
          const lastAttempt = studentAttempts[studentAttempts.length - 1];

          return {
            studentId: s.id,
            studentName: s.name,
            submittedAt: lastAttempt
              ? new Date(lastAttempt.createdAt).toLocaleDateString("pt-BR")
              : "Pendente",
            status: hasSubmitted ? ("CORRIGIDO" as const) : ("PENDENTE" as const),
            score: hasSubmitted ? studentCorrect : undefined,
            timeSpent: hasSubmitted ? "18 min" : "0 min",
          };
        });

        const completedSubmissions = submissions.filter(
          (sub) => sub.status === "CORRIGIDO"
        );
        const submittedCount = completedSubmissions.length;
        const gradedCount = submittedCount;
        const averageScore =
          completedSubmissions.length > 0
            ? Number(
                (
                  completedSubmissions.reduce(
                    (acc, curr) => acc + (curr.score ?? 0),
                    0
                  ) / completedSubmissions.length
                ).toFixed(1)
              )
            : 0;

        // Coleta e calcula as questões que a turma mais errou nesta tarefa
        const questionStatsMap = new Map<
          string,
          { errorCount: number; totalCount: number }
        >();

        // 1. A partir das respostas detalhadas em directSubmissions
        for (const sub of t.submissions || []) {
          if (Array.isArray(sub.answers)) {
            for (const ans of sub.answers as any[]) {
              if (ans?.questionId) {
                const stat = questionStatsMap.get(ans.questionId) || {
                  errorCount: 0,
                  totalCount: 0,
                };
                stat.totalCount += 1;
                if (!ans.isCorrect) stat.errorCount += 1;
                questionStatsMap.set(ans.questionId, stat);
              }
            }
          }
        }

        // 2. A partir de tentativas individuais em questionAttempts
        for (const att of attempts) {
          if (att.questionId) {
            const stat = questionStatsMap.get(att.questionId) || {
              errorCount: 0,
              totalCount: 0,
            };
            stat.totalCount += 1;
            if (!att.isCorrect) stat.errorCount += 1;
            questionStatsMap.set(att.questionId, stat);
          }
        }

        const sortedMissedIds = Array.from(questionStatsMap.entries())
          .filter(([_, stat]) => stat.errorCount > 0)
          .sort(
            (a, b) =>
              b[1].errorCount / Math.max(b[1].totalCount, 1) -
              a[1].errorCount / Math.max(a[1].totalCount, 1)
          )
          .slice(0, 5)
          .map(([qId]) => qId);

        const missedQuestionRecords =
          sortedMissedIds.length > 0
            ? await prisma.question.findMany({
                where: { id: { in: sortedMissedIds } },
                select: {
                  id: true,
                  text: true,
                  year: true,
                  subject: true,
                  topic: true,
                  difficulty: true,
                },
              })
            : [];

        const missedMap = new Map(
          missedQuestionRecords.map((q) => [q.id, q])
        );

        const mostMissedQuestions = sortedMissedIds
          .map((qId) => {
            const q = missedMap.get(qId);
            const stat = questionStatsMap.get(qId);
            if (!q || !stat) return null;
            const errorPercent = Number(
              ((stat.errorCount / Math.max(stat.totalCount, 1)) * 100).toFixed(1)
            );
            return {
              questionId: q.id,
              text: q.text,
              year: q.year,
              subject: q.subject,
              topic: q.topic,
              difficulty: q.difficulty,
              errorCount: stat.errorCount,
              totalCount: stat.totalCount,
              errorPercent,
            };
          })
          .filter(Boolean);

        return {
          id: t.id,
          classId: t.classroomId || t.classId,
          creationMode: t.creationMode,
          subject:
            t.subject?.name ||
            t.topic.split(":")[0]?.trim() ||
            t.classroom?.name ||
            "Geral",
          topic: t.topicRef?.name || t.topic,
          title: t.title || t.topic,
          dueDate: t.dueDate
            ? new Date(t.dueDate).toLocaleDateString("pt-BR")
            : "Em 7 dias",
          totalStudents,
          submittedCount,
          gradedCount,
          averageScore,
          color: "#58CC02",
          icon: t.subject?.icon || "atom",
          instructions: t.description || "Resolver questões de reforço",
          comments: [],
          submissions,
          mostMissedQuestions,
        };
      })
    );

    const lessons = await prisma.lesson.findMany({
      where:
        classroomIds.length > 0
          ? {
              OR: [
                { classroomId: { in: classroomIds } },
                { classroomId: null },
              ],
            }
          : undefined,
      take: 16,
      include: { subject: true, topic: true },
      orderBy: { createdAt: "desc" },
    });

    const materials = lessons.map((l) => {
      const uiType =
        l.type === "VIDEO" || (l.videos && l.videos.length > 0)
          ? "video"
          : l.type === "PDF"
          ? "pdf"
          : l.type === "TIP"
          ? "tip"
          : l.type === "EXTERNAL_LINK"
          ? "link"
          : "article";

      return {
        id: l.id,
        classId: l.classroomId || classroomId,
        subjectId: l.subjectId,
        topicId: l.topicId,
        subject: l.subject?.name || "Geral",
        topic: l.topic?.name || l.title,
        title: l.title,
        materialType: l.type,
        type: uiType as "pdf" | "video" | "link" | "tip" | "article",
        dateAdded: new Date(l.createdAt).toLocaleDateString("pt-BR"),
        viewsCount: 24,
        downloadsCount: 12,
        color: "#1CB0F6",
        icon: l.subject?.icon || "book-open",
        description: (l.description || l.content || "").slice(0, 150),
        content: l.content,
        fileUrl: l.fileUrl || undefined,
        youtubeUrl:
          l.youtubeUrl ||
          (l.videos && l.videos.length > 0 ? l.videos[0] : undefined),
        url:
          l.fileUrl ||
          l.youtubeUrl ||
          (l.videos && l.videos.length > 0 ? l.videos[0] : undefined),
        comments: [],
      };
    });

    return {
      assignments,
      materials,
    };
  }

  /**
   * Retorna sugestões pedagógicas inteligentes do Copiloto Docente com base nos erros reais.
   */
  async getAiTaskSuggestions(classId?: string, subject?: string) {
    const questions = await prisma.question.findMany({
      where: {
        errorRate: { gte: 0.35 },
        ...(subject
          ? { subject: { contains: subject, mode: "insensitive" } }
          : {}),
      },
      take: 8,
      orderBy: { errorRate: "desc" },
    });

    if (questions.length > 0) {
      const topicsMap = new Map<string, typeof questions>();
      for (const q of questions) {
        const topic = q.subject || "Geral";
        const list = topicsMap.get(topic) || [];
        list.push(q);
        topicsMap.set(topic, list);
      }

      const suggestions = Array.from(topicsMap.entries()).map(
        ([subj, qList], idx) => {
          const avgError = Math.round(
            (qList.reduce(
              (acc, curr) => acc + (curr.errorRate || 0.4),
              0
            ) /
              qList.length) *
              100
          );
          return {
            id: `ai-sug-${idx + 1}`,
            classId,
            subject: subj,
            topic: `Reforço ENEM: ${subj}`,
            title: `Lista de Fixação: ${subj} (Distratores Comuns)`,
            reason: `Diagnóstico da IA: ${avgError}% de taxa média de erro nas questões selecionadas da base nacional.`,
            totalQuestions: qList.length,
            difficultyLevel: (avgError > 50 ? "Difícil" : "Médio") as
              | "Fácil"
              | "Médio"
              | "Difícil",
            suggestedDays: 7,
            instructions: `Revisar os distratores e fundamentação teórica antes de submeter as respostas.`,
            color: subj.toLowerCase().includes("mat")
              ? "#FF4B4B"
              : subj.toLowerCase().includes("fís")
              ? "#58CC02"
              : "#1CB0F6",
            icon: subj.toLowerCase().includes("mat")
              ? "calculator"
              : subj.toLowerCase().includes("fís")
              ? "atom"
              : "book-open",
            questionIds: qList.map((q) => q.id),
          };
        }
      );

      return suggestions;
    }

    return [];
  }

  /**
   * Aprova uma sugestão do Copiloto Docente e cria a lista como Task ativa no banco.
   */
  async approveCopilotSuggestion(data: any, teacherId?: string) {
    const {
      classId,
      title,
      subject,
      topic,
      instructions,
      totalQuestions,
      questionIds = [],
    } = data;

    const classroom = classId
      ? await prisma.classroom.findFirst({
          where: { OR: [{ id: classId }, { code: classId }] },
        })
      : null;

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 7);

    const newTask = await prisma.task.create({
      data: {
        title: title || `Lista: ${topic}`,
        topic: `${subject}: ${topic}`,
        description: instructions,
        total: totalQuestions || questionIds.length || 10,
        questionIds,
        dueDate,
        status: "APPROVED",
        classId: classroom ? classroom.code : classId || "GERAL",
        classroomId: classroom?.id || null,
      },
    });

    return newTask;
  }

  /**
   * Retorna a análise detalhada da turma específica (GET /classrooms/:id/analytics)
   * 1. Top 5 matérias/assuntos (subject) com maior índice de erro na turma.
   * 2. Lista de alunos da turma com progresso em trilha, streak atual e taxa de conclusão de tarefas.
   * 3. Alunos em risco (sem atividade recente ou com queda brusca de desempenho).
   */
  async getClassroomAnalytics(classroomId: string) {
    const classroom = await prisma.classroom.findUnique({
      where: { id: classroomId },
      include: {
        teacher: { select: { id: true, name: true, email: true } },
        students: {
          select: {
            id: true,
            name: true,
            email: true,
            xp: true,
            currentStreak: true,
            longestStreak: true,
            lastStudyDate: true,
            trailProgresses: {
              select: {
                progressPercent: true,
                status: true,
                trail: { select: { id: true, title: true, area: true } },
              },
            },
          },
        },
        tasks: {
          select: {
            id: true,
            title: true,
            topic: true,
            total: true,
            dueDate: true,
            subject: {
              select: { name: true },
            },
            submissions: {
              select: {
                studentId: true,
                score: true,
                accuracyPercent: true,
                status: true,
                submittedAt: true,
                answers: true,
              },
            },
          },
        },
      },
    });

    if (!classroom) {
      throw new AppError("Turma não encontrada.", 404);
    }

    const totalTasks = classroom.tasks.length;
    const studentIds = classroom.students.map((s) => s.id);
    const classroomTaskIds = classroom.tasks.map((t) => t.id);
    const taskMap = new Map(classroom.tasks.map((t) => [t.id, t]));

    // 1. Top 5 Matérias / Assuntos com maior taxa de erro EXCLUSIVAMENTE nas tarefas desta turma
    let topErrorSubjects: Array<{
      subject: string;
      topic?: string;
      errorCount: number;
      totalAttempts: number;
      errorPercent: number;
    }> = [];

    if (classroomTaskIds.length > 0 && studentIds.length > 0) {
      // 1.1 Resoluções de questões vinculadas especificamente às tarefas desta turma (attempt.taskId = task.id)
      const taskAttempts = await prisma.questionAttempt.findMany({
        where: {
          taskId: { in: classroomTaskIds },
          userId: { in: studentIds },
        },
        include: {
          question: {
            select: { id: true, subject: true, topic: true, area: true },
          },
        },
        take: 5000,
      });

      const subjectStats = new Map<
        string,
        { total: number; errors: number; topic?: string }
      >();

      for (const att of taskAttempts) {
        const task = att.taskId ? taskMap.get(att.taskId) : null;
        const topic = att.question?.topic || task?.topic;
        const subjectName =
          att.question?.subject ||
          (task as any)?.subject?.name ||
          att.question?.area;

        let key = "Geral";
        if (topic && subjectName && topic !== subjectName) {
          key = `${subjectName} - ${topic}`;
        } else if (topic) {
          key = topic;
        } else if (subjectName) {
          key = subjectName;
        }

        const current = subjectStats.get(key) || {
          total: 0,
          errors: 0,
          topic: topic || undefined,
        };
        current.total++;
        if (!att.isCorrect) {
          current.errors++;
        }
        subjectStats.set(key, current);
      }

      // 1.2 Processa também respostas avaliadas gravadas em TaskSubmission.answers das tarefas desta turma
      const questionIdSet = new Set<string>();
      const submissionAnswers: Array<{
        taskId: string;
        questionId: string;
        isCorrect: boolean;
      }> = [];

      for (const t of classroom.tasks) {
        for (const sub of t.submissions) {
          if (!studentIds.includes(sub.studentId)) continue;
          if (Array.isArray(sub.answers)) {
            for (const item of sub.answers as any[]) {
              if (item?.questionId && typeof item.isCorrect === "boolean") {
                submissionAnswers.push({
                  taskId: t.id,
                  questionId: item.questionId,
                  isCorrect: item.isCorrect,
                });
                questionIdSet.add(item.questionId);
              }
            }
          }
        }
      }

      // Se houver submissões gravadas e nenhuma tentativa separada em QuestionAttempt
      if (submissionAnswers.length > 0 && taskAttempts.length === 0) {
        const questions = await prisma.question.findMany({
          where: { id: { in: Array.from(questionIdSet) } },
          select: { id: true, subject: true, topic: true, area: true },
        });
        const qMap = new Map(questions.map((q) => [q.id, q]));

        for (const ans of submissionAnswers) {
          const q = qMap.get(ans.questionId);
          const task = ans.taskId ? taskMap.get(ans.taskId) : null;
          const topic = q?.topic || task?.topic;
          const subjectName =
            q?.subject || (task as any)?.subject?.name || q?.area;

          let key = "Geral";
          if (topic && subjectName && topic !== subjectName) {
            key = `${subjectName} - ${topic}`;
          } else if (topic) {
            key = topic;
          } else if (subjectName) {
            key = subjectName;
          }

          const current = subjectStats.get(key) || {
            total: 0,
            errors: 0,
            topic: topic || undefined,
          };
          current.total++;
          if (!ans.isCorrect) {
            current.errors++;
          }
          subjectStats.set(key, current);
        }
      }

      topErrorSubjects = Array.from(subjectStats.entries())
        .map(([subject, stats]) => ({
          subject,
          topic: stats.topic,
          errorCount: stats.errors,
          totalAttempts: stats.total,
          errorPercent:
            stats.total > 0
              ? Number(((stats.errors / stats.total) * 100).toFixed(1))
              : 0,
        }))
        .filter((item) => item.totalAttempts >= 1)
        .sort((a, b) => b.errorPercent - a.errorPercent)
        .slice(0, 5);
    }

    // 2. Lista de Alunos e Mapeamento de Risco
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const studentsAnalysis = classroom.students.map((student) => {
      // Submissões deste aluno nas tarefas desta turma
      const studentSubmissions = classroom.tasks
        .map((t) => t.submissions.find((sub) => sub.studentId === student.id))
        .filter(Boolean);

      const submittedCount = studentSubmissions.length;
      const taskCompletionRate =
        totalTasks > 0
          ? Number(((submittedCount / totalTasks) * 100).toFixed(1))
          : 100;

      const totalAccuracy = studentSubmissions.reduce(
        (acc, sub) => acc + (sub?.accuracyPercent || 0),
        0
      );
      const averageAccuracy =
        submittedCount > 0
          ? Number((totalAccuracy / submittedCount).toFixed(1))
          : 0;

      // Progresso em trilhas
      const trailProgresses = student.trailProgresses || [];
      const averageTrailProgress =
        trailProgresses.length > 0
          ? Number(
              (
                trailProgresses.reduce((acc, p) => acc + p.progressPercent, 0) /
                trailProgresses.length
              ).toFixed(1)
            )
          : 0;

      // Diagnóstico de risco
      const riskFactors: string[] = [];
      let isAtRisk = false;

      const hasRecentActivity =
        student.lastStudyDate && new Date(student.lastStudyDate) >= sevenDaysAgo;

      if (!hasRecentActivity) {
        isAtRisk = true;
        riskFactors.push("Sem atividade de estudos registrada nos últimos 7 dias.");
      }

      if (totalTasks >= 2 && taskCompletionRate < 50) {
        isAtRisk = true;
        riskFactors.push(
          `Baixa taxa de entrega de tarefas (${taskCompletionRate}% entregue).`
        );
      }

      if (submittedCount >= 2 && averageAccuracy < 50) {
        isAtRisk = true;
        riskFactors.push(
          `Desempenho crítico com média de acertos de ${averageAccuracy}%.`
        );
      }

      return {
        id: student.id,
        name: student.name,
        email: student.email,
        xp: student.xp,
        currentStreak: student.currentStreak,
        longestStreak: student.longestStreak,
        lastStudyDate: student.lastStudyDate,
        taskCompletionRate,
        submittedTasksCount: submittedCount,
        totalClassroomTasks: totalTasks,
        averageAccuracy,
        averageTrailProgress,
        trailsCount: trailProgresses.length,
        isAtRisk,
        riskFactors,
        riskLevel: riskFactors.length >= 2 ? "HIGH" : isAtRisk ? "MEDIUM" : "LOW",
      };
    });

    const atRiskStudents = studentsAnalysis.filter((s) => s.isAtRisk);

    return {
      classroom: {
        id: classroom.id,
        name: classroom.name,
        code: classroom.code,
        teacher: classroom.teacher,
        studentsCount: classroom.students.length,
        tasksCount: totalTasks,
      },
      topErrorSubjects,
      students: studentsAnalysis,
      atRiskStudents,
    };
  }

  /**
   * Atribui uma tarefa ou trilha específica para todos os alunos daquela turma com data de entrega
   * (POST /classrooms/:id/tasks)
   */
  async assignTaskOrTrail(
    classroomId: string,
    teacherId: string,
    payload: {
      title?: string;
      topic?: string;
      description?: string;
      trailId?: string;
      subjectId?: string;
      topicId?: string;
      questionIds?: string[];
      customQuestions?: any[];
      creationMode?: string;
      dueDate?: string | Date;
      total?: number;
    }
  ) {
    const classroom = await prisma.classroom.findUnique({
      where: { id: classroomId },
      include: {
        students: { select: { id: true, name: true } },
      },
    });

    if (!classroom) {
      throw new AppError("Turma não encontrada.", 404);
    }

    let finalQuestionIds = payload.questionIds || [];
    let finalTitle = payload.title?.trim() || "";
    let finalTopic = payload.topic?.trim() || "Geral";
    let finalDescription = payload.description || "";

    // Se o professor passou um trailId, importa as questões daquela trilha
    if (payload.trailId) {
      const trail = await prisma.trail.findUnique({
        where: { id: payload.trailId },
      });

      if (!trail) {
        throw new AppError("Trilha de estudo informada não foi encontrada.", 404);
      }

      if (finalQuestionIds.length === 0 && trail.questionIds.length > 0) {
        finalQuestionIds = trail.questionIds;
      }

      if (!finalTitle) {
        finalTitle = `Trilha: ${trail.title}`;
      }

      if (finalTopic === "Geral" && trail.area) {
        finalTopic = trail.area;
      }

      if (!finalDescription && trail.description) {
        finalDescription = trail.description;
      }
    }

    if (!finalTitle) {
      finalTitle = `Tarefa: ${finalTopic}`;
    }

    let parsedDueDate: Date | null = null;
    if (payload.dueDate) {
      parsedDueDate = new Date(payload.dueDate);
      if (isNaN(parsedDueDate.getTime())) {
        throw new AppError("Data de entrega (dueDate) inválida.", 400);
      }
    } else {
      parsedDueDate = new Date();
      parsedDueDate.setDate(parsedDueDate.getDate() + 7);
    }

    const newTask = await prisma.task.create({
      data: {
        title: finalTitle,
        topic: finalTopic,
        description: finalDescription,
        subjectId: payload.subjectId || null,
        topicId: payload.topicId || null,
        creationMode: payload.creationMode || (payload.trailId ? "RANDOM_BY_TOPIC" : "MANUAL_SELECTION"),
        total: payload.total || finalQuestionIds.length || (payload.customQuestions?.length ?? 5),
        questionIds: finalQuestionIds,
        customQuestions: payload.customQuestions ? (payload.customQuestions as any) : [],
        dueDate: parsedDueDate,
        status: "APPROVED",
        classId: classroom.code,
        classroomId: classroom.id,
      },
    });

    return {
      message: `Tarefa "${newTask.title}" atribuída com sucesso para os ${classroom.students.length} alunos da turma.`,
      task: newTask,
      assignedStudentsCount: classroom.students.length,
    };
  }
}

export const classroomService = new ClassroomService();

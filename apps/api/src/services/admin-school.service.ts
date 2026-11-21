import bcrypt from "bcrypt";
import {
  CreateSchoolInputSchema,
  type CreateSchoolInput,
  searchSisuCourses,
  SISU_INSTITUTIONS,
  SISU_COURSE_DEFINITIONS,
  SISU_MODALITIES,
  getSisuStates,
} from "@minuto-enem/shared";
import { prisma } from "../lib/prisma";
import { AppError } from "../errors/AppError";
import { Role } from "@prisma/client";
import { getActiveStorageProviderName } from "./storage.service";

const SALT_ROUNDS = 10;

export interface CreateSchoolWithManagerDTO extends CreateSchoolInput {
  manager: {
    name: string;
    email: string;
    password: string;
  };
}

export class AdminSchoolService {
  /**
   * Cadastra uma nova Escola e simultaneamente cria o usuário gestor inicial (role: SCHOOL)
   */
  async createSchoolWithManager(data: CreateSchoolWithManagerDTO) {
    const { manager, ...schoolData } = data;

    if (!manager || !manager.email || !manager.password || !manager.name) {
      throw new AppError(
        "Os dados do gestor inicial da escola (name, email e password) são obrigatórios.",
        400
      );
    }

    const validatedSchool = CreateSchoolInputSchema.parse(schoolData);

    const normalizedManagerEmail = manager.email.trim().toLowerCase();
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedManagerEmail },
    });

    if (existingUser) {
      throw new AppError(
        `O e-mail "${normalizedManagerEmail}" já está cadastrado no sistema.`,
        409
      );
    }

    // Gerador de código padrão caso não fornecido (ex: ESC-A1B2)
    const code =
      validatedSchool.code?.trim().toUpperCase() ||
      `ESC-${Date.now().toString(36).slice(-4).toUpperCase()}`;

    // Gerador de slug padrão
    const slug =
      validatedSchool.slug?.trim().toLowerCase() ||
      validatedSchool.name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

    // Validação de duplicidade de código ou slug
    const existingSchool = await prisma.school.findFirst({
      where: {
        OR: [{ code }, { slug }],
      },
    });

    if (existingSchool) {
      throw new AppError(
        `Já existe uma escola registrada com o código "${code}" ou slug "${slug}".`,
        409
      );
    }

    if (validatedSchool.cnpj) {
      const cleanCnpj = validatedSchool.cnpj.replace(/\D/g, "");
      const existingCnpj = await prisma.school.findFirst({
        where: { cnpj: cleanCnpj },
      });
      if (existingCnpj) {
        throw new AppError(`O CNPJ "${validatedSchool.cnpj}" já está em uso.`, 409);
      }
    }

    const hashedPassword = await bcrypt.hash(manager.password, SALT_ROUNDS);

    // Criação atômica da escola e do gestor no banco
    const result = await prisma.$transaction(async (tx) => {
      const school = await tx.school.create({
        data: {
          name: validatedSchool.name.trim(),
          cnpj: validatedSchool.cnpj ? validatedSchool.cnpj.replace(/\D/g, "") : null,
          code,
          slug,
          isActive: validatedSchool.isActive ?? true,
          settings: (validatedSchool.settings as any) ?? {},
        },
      });

      const managerUser = await tx.user.create({
        data: {
          name: manager.name.trim(),
          email: normalizedManagerEmail,
          password: hashedPassword,
          role: Role.SCHOOL,
          schoolId: school.id,
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          schoolId: true,
          createdAt: true,
        },
      });

      return {
        school,
        manager: managerUser,
      };
    });

    return result;
  }

  /**
   * Lista todas as escolas cadastradas (visão global do ADMIN)
   */
  async listSchools(params: {
    search?: string;
    isActive?: boolean | string;
    page?: number | string;
    limit?: number | string;
  }) {
    const page = Math.max(Number(params.page) || 1, 1);
    const limit = Math.min(Math.max(Number(params.limit) || 20, 1), 100);
    const skip = (page - 1) * limit;

    const where: any = {};

    if (params.search?.trim()) {
      const search = params.search.trim();
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { code: { contains: search, mode: "insensitive" } },
        { slug: { contains: search, mode: "insensitive" } },
        { cnpj: { contains: search } },
      ];
    }

    if (params.isActive !== undefined && params.isActive !== "") {
      where.isActive =
        params.isActive === true ||
        params.isActive === "true" ||
        params.isActive === "1";
    }

    const [schools, total] = await Promise.all([
      prisma.school.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          _count: {
            select: {
              users: true,
              classrooms: true,
            },
          },
          users: {
            where: { role: Role.SCHOOL },
            select: { id: true, name: true, email: true },
            take: 2,
          },
        },
      }),
      prisma.school.count({ where }),
    ]);

    return {
      schools: schools.map((s) => ({
        ...s,
        managers: s.users,
        usersCount: s._count.users,
        classroomsCount: s._count.classrooms,
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Altera o status de ativação da escola (Ativar / Desativar)
   */
  async toggleSchoolStatus(schoolId: string, isActive: boolean) {
    const school = await prisma.school.findUnique({
      where: { id: schoolId },
    });

    if (!school) {
      throw new AppError("Escola não encontrada.", 404);
    }

    return prisma.school.update({
      where: { id: schoolId },
      data: { isActive },
    });
  }

  /**
   * Cria um gestor adicional para uma escola existente
   */
  async createManagerForSchool(
    schoolId: string,
    data: { name: string; email: string; password: string }
  ) {
    const school = await prisma.school.findUnique({
      where: { id: schoolId },
    });

    if (!school) {
      throw new AppError("Escola não encontrada.", 404);
    }

    const normalizedEmail = data.email.trim().toLowerCase();
    const existing = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existing) {
      throw new AppError("Este e-mail já está em uso.", 409);
    }

    const hashedPassword = await bcrypt.hash(data.password, SALT_ROUNDS);

    return prisma.user.create({
      data: {
        name: data.name.trim(),
        email: normalizedEmail,
        password: hashedPassword,
        role: Role.SCHOOL,
        schoolId,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        schoolId: true,
        createdAt: true,
      },
    });
  }

  /**
   * Diagnóstico de saúde e curadoria do banco de questões (ADMIN).
   */
  async getQuestionsHealth() {
    const [
      totalQuestions,
      withoutExplanation,
      withoutDifficulty,
      highErrorCount,
      byDifficulty,
    ] = await Promise.all([
      prisma.question.count(),
      prisma.question.count({ where: { OR: [{ explanation: null }, { explanation: "" }] } }),
      prisma.question.count({ where: { difficulty: null } }),
      prisma.question.count({ where: { errorRate: { gte: 0.8 } } }),
      prisma.question.groupBy({ by: ["difficulty"], _count: true }),
    ]);

    const flaggedQuestions = await prisma.question.findMany({
      where: {
        OR: [
          { explanation: null },
          { explanation: "" },
          { errorRate: { gte: 0.8 } },
        ],
      },
      select: {
        id: true,
        subject: true,
        year: true,
        difficulty: true,
        errorRate: true,
        explanation: true,
        text: true,
      },
      orderBy: [{ errorRate: "desc" }, { year: "desc" }],
      take: 25,
    });

    return {
      totalQuestions,
      withoutExplanation,
      withoutDifficulty,
      highErrorCount,
      byDifficulty: byDifficulty.map((d) => ({
        difficulty: d.difficulty || "UNSET",
        count: d._count,
      })),
      flaggedQuestions,
    };
  }

  /**
   * Recalibra errorRate e difficulty das questões com base nas tentativas reais.
   */
  async recalibrateQuestionsDifficulty() {
    const grouped = await prisma.questionAttempt.groupBy({
      by: ["questionId", "isCorrect"],
      _count: true,
    });

    const statsMap = new Map<string, { total: number; wrong: number }>();
    for (const row of grouped) {
      const cur = statsMap.get(row.questionId) || { total: 0, wrong: 0 };
      cur.total += row._count;
      if (!row.isCorrect) cur.wrong += row._count;
      statsMap.set(row.questionId, cur);
    }

    let recalibratedCount = 0;
    for (const [questionId, st] of statsMap.entries()) {
      if (st.total < 3) continue;
      const errRate = Number((st.wrong / st.total).toFixed(3));
      const difficulty = errRate >= 0.65 ? "HARD" : errRate <= 0.35 ? "EASY" : "MEDIUM";
      await prisma.question.update({
        where: { id: questionId },
        data: { errorRate: errRate, difficulty },
      });
      recalibratedCount += 1;
    }

    return {
      recalibratedCount,
      message: `${recalibratedCount} questão(ões) recalibrada(s) com base no histórico real.`,
    };
  }

  /**
   * Lista overrides dinâmicos de notas de corte SISU.
   */
  async listSisuOverrides() {
    return prisma.sisuCutoffOverride.findMany({
      orderBy: [{ updatedAt: "desc" }],
    });
  }

  /**
   * Cria ou atualiza um override dinâmico de nota de corte SISU.
   */
  async upsertSisuOverride(
    adminId: string,
    input: {
      institution?: string;
      courseSlug?: string;
      modality?: string;
      cutoffScore?: number;
      referenceEdition?: string;
    }
  ) {
    const institution = String(input.institution || "").trim().toUpperCase();
    const courseSlug = String(input.courseSlug || "").trim().toLowerCase();
    const modality = String(input.modality || "AC").trim().toUpperCase();
    const cutoffScore = Math.min(900, Math.max(400, Math.round(Number(input.cutoffScore) || 700)));
    const referenceEdition = String(input.referenceEdition || "SISU 2026").trim();

    if (!institution || !courseSlug) {
      throw new AppError("Instituição e slug do curso são obrigatórios.", 400);
    }

    return prisma.sisuCutoffOverride.upsert({
      where: {
        institution_courseSlug_modality: { institution, courseSlug, modality },
      },
      update: {
        cutoffScore,
        referenceEdition,
        updatedById: adminId,
      },
      create: {
        institution,
        courseSlug,
        modality,
        cutoffScore,
        referenceEdition,
        updatedById: adminId,
      },
    });
  }

  /**
   * Monitoramento global de tenants e uso de storage (ADMIN).
   */
  async getTenantsOverview() {
    const [
      schoolsTotal,
      schoolsActive,
      usersActive,
      essaysCount,
      audioFeedbacksCount,
      pdfsCount,
      schoolsBreakdown,
    ] = await Promise.all([
      prisma.school.count(),
      prisma.school.count({ where: { isActive: true } }),
      prisma.user.count({ where: { isActive: true } }),
      prisma.essaySubmission.count(),
      prisma.questionFeedback.count({ where: { audioUrl: { not: null } } }),
      prisma.lesson.count({ where: { type: "PDF" } }),
      prisma.school.findMany({
        select: {
          id: true,
          name: true,
          code: true,
          isActive: true,
          _count: {
            select: { users: true, classrooms: true, institutionalExams: true },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
    ]);

    return {
      storageProvider: getActiveStorageProviderName(),
      summary: {
        schoolsTotal,
        schoolsActive,
        schoolsInactive: schoolsTotal - schoolsActive,
        usersActive,
        essaysCount,
        audioFeedbacksCount,
        pdfsCount,
      },
      tenants: schoolsBreakdown.map((s) => ({
        id: s.id,
        name: s.name,
        code: s.code,
        isActive: s.isActive,
        usersCount: s._count.users,
        classroomsCount: s._count.classrooms,
        examsCount: s._count.institutionalExams,
      })),
    };
  }

  /**
   * Consulta o catálogo relacional SISU mesclando overrides dinâmicos do banco.
   */
  async querySisuCatalog(query: Record<string, any> = {}) {
    const overrides = await prisma.sisuCutoffOverride.findMany().catch(() => []);
    const results = searchSisuCourses({
      query: typeof query.q === "string" ? query.q : undefined,
      institution: typeof query.institution === "string" ? query.institution : undefined,
      course: typeof query.course === "string" ? query.course : undefined,
      state: typeof query.state === "string" ? query.state : undefined,
      areaFocus: typeof query.area === "string" ? query.area : undefined,
      modality: typeof query.modality === "string" ? query.modality : "AC",
      maxCutoff: query.maxCutoff ? Number(query.maxCutoff) : undefined,
      limit: query.limit ? Number(query.limit) : 80,
      dynamicOverrides: overrides.map((o) => ({
        institution: o.institution,
        courseSlug: o.courseSlug,
        modality: o.modality,
        cutoffScore: o.cutoffScore,
        referenceEdition: o.referenceEdition,
      })),
    });

    return {
      total: results.length,
      institutions: SISU_INSTITUTIONS.map((i) => ({
        sigla: i.sigla,
        name: i.name,
        city: i.city,
        state: i.state,
      })),
      courses: SISU_COURSE_DEFINITIONS.map((c) => ({
        slug: c.slug,
        name: c.name,
      })),
      modalities: SISU_MODALITIES,
      states: getSisuStates(),
      items: results,
    };
  }
}

export const adminSchoolService = new AdminSchoolService();

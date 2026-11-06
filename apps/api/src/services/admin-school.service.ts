import bcrypt from "bcrypt";
import {
  CreateSchoolInputSchema,
  type CreateSchoolInput,
} from "@minuto-enem/shared";
import { prisma } from "../lib/prisma";
import { AppError } from "../errors/AppError";
import { Role } from "@prisma/client";

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
}

export const adminSchoolService = new AdminSchoolService();

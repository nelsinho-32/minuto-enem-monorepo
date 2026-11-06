import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { Role } from "@prisma/client";
import {
  RegisterInputSchema,
  LoginInputSchema,
  RefreshTokenInputSchema,
  type RegisterInput,
  type LoginInput,
  type RefreshTokenInput,
  type JwtPayloadData,
} from "@minuto-enem/shared";
import { prisma } from "../lib/prisma";
import { AppError } from "../errors/AppError";
import { streakService } from "./streak.service";

export {
  RegisterInputSchema,
  LoginInputSchema,
  RefreshTokenInputSchema,
  type RegisterInput,
  type LoginInput,
  type RefreshTokenInput,
  type JwtPayloadData,
} from "@minuto-enem/shared";

const SALT_ROUNDS = 10;
const JWT_SECRET = process.env.JWT_SECRET || "enem-super-secret-jwt-key-2026";
const JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET || `${JWT_SECRET}-refresh`;

// Tokens de acesso duram 2 horas; Refresh Tokens duram 7 dias
const ACCESS_TOKEN_EXPIRES_IN = (process.env.JWT_ACCESS_EXPIRES_IN ||
  "2h") as jwt.SignOptions["expiresIn"];
const REFRESH_TOKEN_EXPIRES_IN = (process.env.JWT_REFRESH_EXPIRES_IN ||
  "7d") as jwt.SignOptions["expiresIn"];

export interface AuthTokensResult {
  accessToken: string;
  refreshToken: string;
  token: string;
}

export class AuthService {
  /**
   * Emite o par de tokens JWT: Access Token (curto/médio prazo) e Refresh Token (longo prazo).
   */
  generateTokens(
    userId: string,
    email: string,
    role: Role,
    schoolId?: string | null
  ): AuthTokensResult {
    const payload = {
      email,
      role,
      schoolId: schoolId || undefined,
    };

    const accessToken = jwt.sign(
      {
        ...payload,
        type: "access",
      },
      JWT_SECRET,
      {
        subject: userId,
        expiresIn: ACCESS_TOKEN_EXPIRES_IN,
      }
    );

    const refreshToken = jwt.sign(
      {
        ...payload,
        type: "refresh",
      },
      JWT_REFRESH_SECRET,
      {
        subject: userId,
        expiresIn: REFRESH_TOKEN_EXPIRES_IN,
      }
    );

    return {
      accessToken,
      refreshToken,
      token: accessToken, // Alias para compatibilidade total com clientes antigos
    };
  }

  /**
   * Registra um novo usuário com senha criptografada via bcrypt (salt 10)
   * e diferenciação segura de papéis (STUDENT ou TEACHER).
   */
  async register(data: RegisterInput) {
    const validatedData = RegisterInputSchema.parse(data);
    const { name, email, password, role } = validatedData;

    const normalizedEmail = email.trim().toLowerCase();

    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      throw new AppError("Este e-mail já está cadastrado.", 409);
    }

    const userRole: Role =
      normalizedEmail === "admin@gmail.com"
        ? Role.ADMIN
        : role && Object.values(Role).includes(role as Role)
        ? (role as Role)
        : Role.STUDENT;

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await prisma.user.create({
      data: {
        name: name.trim(),
        email: normalizedEmail,
        password: hashedPassword,
        role: userRole,
        schoolId: (validatedData as any).schoolId || undefined,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        schoolId: true,
        xp: true,
        currentStreak: true,
        longestStreak: true,
        iceFreezes: true,
        lastStudyDate: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const tokens = this.generateTokens(user.id, user.email, user.role, user.schoolId);

    return {
      user,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      token: tokens.token,
    };
  }

  /**
   * Autentica o usuário validando a senha com bcrypt,
   * executa a verificação dinâmica da ofensiva no login e gera Access + Refresh Token.
   */
  async login(data: LoginInput) {
    const validatedData = LoginInputSchema.parse(data);
    const { email, password } = validatedData;

    const normalizedEmail = email.trim().toLowerCase();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      throw new AppError("Credenciais inválidas.", 401);
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new AppError("Credenciais inválidas.", 401);
    }

    // Garante que a conta designada admin@gmail.com possua a role de ADMIN mestre
    if (normalizedEmail === "admin@gmail.com" && user.role !== Role.ADMIN) {
      await prisma.user.update({
        where: { id: user.id },
        data: { role: Role.ADMIN },
      });
      user.role = Role.ADMIN;
    }

    // Verifica e atualiza dinamicamente a ofensiva do usuário no momento do login
    const streakStatus = await streakService.verifyStreakOnLogin(user.id);

    const tokens = this.generateTokens(user.id, user.email, user.role, user.schoolId);

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        schoolId: user.schoolId,
        xp: user.xp,
        currentStreak: streakStatus.currentStreak,
        longestStreak: streakStatus.longestStreak,
        iceFreezes: streakStatus.iceFreezes,
        lastStudyDate: streakStatus.lastStudyDate,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      streakStatus: {
        missedDays: streakStatus.missedDays,
        iceFreezesUsed: streakStatus.iceFreezesUsed,
        streakReset: streakStatus.streakReset,
      },
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      token: tokens.token,
    };
  }

  /**
   * Renova os tokens a partir de um Refresh Token válido.
   */
  async refresh(refreshTokenInput: string) {
    if (!refreshTokenInput || typeof refreshTokenInput !== "string") {
      throw new AppError("Refresh token não informado.", 400);
    }

    try {
      const decoded = jwt.verify(
        refreshTokenInput,
        JWT_REFRESH_SECRET
      ) as JwtPayloadData & { type?: string };

      if (decoded.type && decoded.type !== "refresh") {
        throw new AppError("Token fornecido não é um Refresh Token válido.", 401);
      }

      const user = await prisma.user.findUnique({
        where: { id: decoded.sub },
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
          schoolId: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (!user) {
        throw new AppError("Usuário não encontrado ou sessão revogada.", 401);
      }

      const tokens = this.generateTokens(user.id, user.email, user.role, user.schoolId);

      return {
        user,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        token: tokens.token,
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError("Refresh Token inválido ou expirado.", 401);
    }
  }

  /**
   * Retorna os dados completos e atualizados do usuário autenticado (/auth/me),
   * incluindo turmas vinculadas e métricas segundo o papel (STUDENT ou TEACHER).
   */
  async getMe(userId: string) {
    if (!userId) {
      throw new AppError("ID de usuário inválido ou não autenticado.", 401);
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        schoolId: true,
        school: {
          select: {
            id: true,
            name: true,
            code: true,
            slug: true,
          },
        },
        xp: true,
        currentStreak: true,
        longestStreak: true,
        iceFreezes: true,
        lastStudyDate: true,
        createdAt: true,
        updatedAt: true,
        createdClassrooms: {
          select: {
            id: true,
            name: true,
            code: true,
            createdAt: true,
            _count: {
              select: {
                students: true,
                tasks: true,
              },
            },
          },
        },
        enrolledClassrooms: {
          select: {
            id: true,
            name: true,
            code: true,
            createdAt: true,
            teacher: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        _count: {
          select: {
            createdClassrooms: true,
            enrolledClassrooms: true,
            questionAttempts: true,
          },
        },
      },
    });

    if (!user) {
      throw new AppError("Usuário não encontrado.", 404);
    }

    const isTeacherRole = user.role === Role.TEACHER;

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      xp: user.xp,
      currentStreak: user.currentStreak,
      longestStreak: user.longestStreak,
      iceFreezes: user.iceFreezes,
      lastStudyDate: user.lastStudyDate,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      classroomCount: isTeacherRole
        ? user._count.createdClassrooms
        : user._count.enrolledClassrooms,
      classrooms: isTeacherRole
        ? user.createdClassrooms
        : user.enrolledClassrooms,
      createdClassrooms: user.createdClassrooms,
      enrolledClassrooms: user.enrolledClassrooms,
      totalAttempts: user._count.questionAttempts,
      _count: user._count,
    };
  }
}

export const authService = new AuthService();

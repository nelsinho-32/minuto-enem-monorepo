import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { Role } from "@prisma/client";
import {
  JwtPayloadSchema,
  type JwtPayloadData,
} from "@minuto-enem/shared";
import { prisma } from "../lib/prisma";

export { JwtPayloadSchema, type JwtPayloadData } from "@minuto-enem/shared";

// Extensão da tipagem do Express Request para incluir o usuário autenticado e escopo de tenant
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: Role;
        schoolId?: string | null;
      };
      schoolId?: string;
    }
  }
}

const JWT_SECRET = process.env.JWT_SECRET || "enem-super-secret-jwt-key-2026";

/**
 * Middleware de Autenticação (`auth` / `authenticate`):
 * Valida o Access Token JWT enviado no header `Authorization: Bearer <token>`.
 */
export function auth(
  req: Request,
  res: Response,
  next: NextFunction
): Response | void {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({
      error: "Token de autenticação não fornecido.",
    });
  }

  const parts = authHeader.split(" ");
  if (parts.length !== 2) {
    return res.status(401).json({
      error: "Formato de token inválido. Esperado: Bearer <token>",
    });
  }

  const [scheme, token] = parts;
  if (!/^Bearer$/i.test(scheme)) {
    return res.status(401).json({
      error: "Token malformatado. Utilize o padrão Bearer.",
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayloadData & {
      type?: string;
      schoolId?: string | null;
    };

    // Impede o uso de Refresh Token para acessar endpoints protegidos de API
    if (decoded.type && decoded.type !== "access") {
      return res.status(401).json({
        error: "Token inválido. Utilize um Access Token para esta rota.",
      });
    }

    req.user = {
      id: decoded.sub,
      email: decoded.email,
      role: decoded.role as Role,
      schoolId: decoded.schoolId ?? null,
    };

    return next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({
        error: "Token de acesso expirado.",
        code: "TOKEN_EXPIRED",
      });
    }

    return res.status(401).json({
      error: "Token inválido ou não autorizado.",
    });
  }
}

export const authenticate = auth;

/**
 * Middleware de Autorização flexível para verificar um ou mais papéis permitidos (RBAC).
 * Exemplos:
 * requireRole(['ADMIN'])
 * requireRole(['SCHOOL', 'ADMIN'])
 * requireRole(['TEACHER', 'SCHOOL'])
 */
export function requireRole(allowedRoles: Role[] | Role) {
  const rolesArray = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

  return (req: Request, res: Response, next: NextFunction): Response | void => {
    if (!req.user) {
      return res.status(401).json({
        error: "Usuário não autenticado.",
      });
    }

    if (!rolesArray.includes(req.user.role)) {
      return res.status(403).json({
        error: `Acesso negado. Requer papel: ${rolesArray.join(" ou ")}. Seu papel atual: ${req.user.role}`,
      });
    }

    return next();
  };
}

export const requireRoles = requireRole;

/**
 * Middleware de Autorização (isTeacher):
 * Bloqueia a requisição caso o usuário logado não possua o papel TEACHER (professor).
 */
export function isTeacher(
  req: Request,
  res: Response,
  next: NextFunction
): Response | void {
  return requireRole(Role.TEACHER)(req, res, next);
}

/**
 * Middleware de Autorização (isStudent):
 * Bloqueia a requisição caso o usuário logado não possua o papel STUDENT (aluno).
 */
export function isStudent(
  req: Request,
  res: Response,
  next: NextFunction
): Response | void {
  return requireRole(Role.STUDENT)(req, res, next);
}

/**
 * Middleware de Isolamento de Tenant (Escopo de Escola):
 * Garante que uma conta com role SCHOOL só consiga visualizar e gerenciar
 * turmas, professores e alunos vinculados ao seu próprio schoolId.
 * Usuários ADMIN possuem visão global irrestrita.
 */
export async function requireTenantScope(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> {
  if (!req.user) {
    return res.status(401).json({ error: "Usuário não autenticado." });
  }

  // Admin possui acesso a qualquer escola/tenant
  if (req.user.role === Role.ADMIN) {
    const targetSchoolId = (req.params.schoolId || req.body?.schoolId || req.query?.schoolId) as string | undefined;
    if (targetSchoolId) {
      req.schoolId = targetSchoolId;
    }
    return next();
  }

  // Gestor Escolar deve obrigatoriamente possuir schoolId associado
  if (req.user.role === Role.SCHOOL) {
    let effectiveSchoolId = req.user.schoolId;

    if (!effectiveSchoolId) {
      // Fallback: consulta o banco para carregar o schoolId mais atual do usuário
      const dbUser = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { schoolId: true },
      });
      effectiveSchoolId = dbUser?.schoolId ?? null;
      if (effectiveSchoolId) {
        req.user.schoolId = effectiveSchoolId;
      }
    }

    if (!effectiveSchoolId) {
      return res.status(403).json({
        error: "Acesso negado. Esta conta de gestor escolar não possui nenhuma escola (schoolId) vinculada.",
      });
    }

    // Se a rota recebeu um schoolId na URL ou no corpo, valida que pertence à mesma escola
    const targetSchoolId = (req.params.schoolId || req.body?.schoolId) as string | undefined;
    if (targetSchoolId && targetSchoolId !== effectiveSchoolId) {
      return res.status(403).json({
        error: "Violação de isolamento de tenant. Você não tem permissão para acessar dados de outra escola.",
      });
    }

    req.schoolId = effectiveSchoolId;
    return next();
  }

  return res.status(403).json({
    error: "Acesso negado. Apenas gestores escolares ou administradores podem acessar esta área.",
  });
}

/**
 * Middleware de Escopo do Professor e Turma:
 * Garante que um TEACHER só acesse métricas, tarefas e dados das turmas às quais está vinculado (teacherId).
 * Gestores escolares vinculados à mesma escola ou ADMINs também são autorizados.
 */
export async function requireClassroomTeacherScope(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> {
  if (!req.user) {
    return res.status(401).json({ error: "Usuário não autenticado." });
  }

  const classroomId = (req.params.id || req.params.classroomId) as string | undefined;
  if (!classroomId) {
    return res.status(400).json({ error: "Identificador da turma é obrigatório." });
  }

  const classroom = await prisma.classroom.findUnique({
    where: { id: classroomId },
    select: { id: true, teacherId: true, schoolId: true },
  });

  if (!classroom) {
    return res.status(404).json({ error: "Turma não encontrada." });
  }

  // 1. ADMIN pode acessar qualquer turma
  if (req.user.role === Role.ADMIN) {
    return next();
  }

  // 2. SCHOOL pode acessar qualquer turma pertencente à sua própria escola
  if (req.user.role === Role.SCHOOL) {
    if (!classroom.schoolId || classroom.schoolId !== req.user.schoolId) {
      return res.status(403).json({
        error: "Acesso negado. Esta turma não pertence à sua escola.",
      });
    }
    return next();
  }

  // 3. TEACHER só pode acessar caso seja o professor responsável pela turma
  if (req.user.role === Role.TEACHER) {
    if (classroom.teacherId !== req.user.id) {
      return res.status(403).json({
        error: "Acesso negado. Você não é o professor responsável por esta turma.",
      });
    }
    return next();
  }

  return res.status(403).json({
    error: "Acesso negado para esta turma.",
  });
}

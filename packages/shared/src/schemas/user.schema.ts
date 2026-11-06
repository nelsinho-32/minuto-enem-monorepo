import { z } from "zod";

/**
 * Hierarquia completa de Papéis (Roles) do sistema Minuto ENEM:
 * - ADMIN: Dono do sistema e administrador global da plataforma
 * - SCHOOL: Gestor / Instituição escolar contratante
 * - TEACHER: Professor vinculado a uma escola
 * - STUDENT: Aluno / Estudante
 */
export const UserRoleValues = [
  "ADMIN",
  "SCHOOL",
  "TEACHER",
  "STUDENT",
] as const;

export const RoleSchema = z.enum(UserRoleValues);
export const UserRoleSchema = RoleSchema;

export type Role = z.infer<typeof RoleSchema>;
export type UserRole = z.infer<typeof UserRoleSchema>;

// ============================================================================
// ENTIDADE DE DOMÍNIO INTERNA (Representação completa no banco)
// ============================================================================
export const UserSchema = z.object({
  id: z.string().min(1, "O ID do usuário é obrigatório"),
  name: z.string().trim().min(1, "O nome é obrigatório"),
  email: z.string().trim().email("E-mail inválido"),
  password: z.string().min(6, "A senha deve ter pelo menos 6 caracteres"),
  role: RoleSchema.default("STUDENT"),
  schoolId: z.string().nullable().optional(),
  xp: z.number().int().nonnegative().default(0),
  currentStreak: z.number().int().nonnegative().default(0),
  longestStreak: z.number().int().nonnegative().default(0),
  iceFreezes: z.number().int().nonnegative().default(0),
  lastStudyDate: z.union([z.coerce.date(), z.string()]).nullable().optional(),
  createdAt: z.union([z.coerce.date(), z.string()]).optional(),
  updatedAt: z.union([z.coerce.date(), z.string()]).optional(),
});

export type User = z.infer<typeof UserSchema>;

// ============================================================================
// DTOs DE ENTRADA (Input Schemas)
// ============================================================================
export const CreateUserInputSchema = z.object({
  name: z.string().trim().min(2, "O nome deve ter pelo menos 2 caracteres"),
  email: z
    .string()
    .trim()
    .email("E-mail inválido")
    .transform((val) => val.toLowerCase()),
  password: z.string().min(6, "A senha deve ter pelo menos 6 caracteres"),
  role: RoleSchema.optional().default("STUDENT"),
  schoolId: z.string().optional(),
});

export type CreateUserInput = z.input<typeof CreateUserInputSchema>;

export const UpdateUserInputSchema = z.object({
  name: z.string().trim().min(2).optional(),
  email: z
    .string()
    .trim()
    .email()
    .transform((val) => val.toLowerCase())
    .optional(),
  password: z.string().min(6).optional(),
  role: RoleSchema.optional(),
  schoolId: z.string().nullable().optional(),
  avatar: z.string().nullable().optional(),
  xp: z.number().int().nonnegative().optional(),
  currentStreak: z.number().int().nonnegative().optional(),
  longestStreak: z.number().int().nonnegative().optional(),
  iceFreezes: z.number().int().nonnegative().optional(),
  lastStudyDate: z.union([z.coerce.date(), z.string()]).nullable().optional(),
});

export type UpdateUserInput = z.input<typeof UpdateUserInputSchema>;

export const UpdateUserRoleInputSchema = z.object({
  userId: z.string().min(1, "O ID do usuário é obrigatório"),
  role: RoleSchema,
  schoolId: z.string().optional(),
});

export type UpdateUserRoleInput = z.infer<typeof UpdateUserRoleInputSchema>;

export const UserFilterInputSchema = z.object({
  role: RoleSchema.optional(),
  schoolId: z.string().optional(),
  search: z.string().optional(),
  page: z.number().int().positive().optional().default(1),
  limit: z.number().int().positive().max(100).optional().default(20),
});

export type UserFilterInput = z.infer<typeof UserFilterInputSchema>;

// ============================================================================
// DTOs DE SAÍDA / RESPONSE (Sem vazamento de senha/tokens internos)
// ============================================================================
export const UserResponseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email(),
  role: RoleSchema,
  schoolId: z.string().nullable().optional(),
  schoolName: z.string().optional(),
  school: z.string().optional(), // Retrocompatibilidade visual
  courseOrClass: z.string().optional(),
  avatar: z.string().nullable().optional(),
  xp: z.number().int().nonnegative().default(0),
  currentStreak: z.number().int().nonnegative().default(0),
  longestStreak: z.number().int().nonnegative().default(0),
  iceFreezes: z.number().int().nonnegative().default(0),
  lastStudyDate: z.union([z.coerce.date(), z.string()]).nullable().optional(),
  createdAt: z.union([z.coerce.date(), z.string()]).optional(),
  updatedAt: z.union([z.coerce.date(), z.string()]).optional(),
});

export type UserResponse = z.infer<typeof UserResponseSchema>;

// Alias para manter retrocompatibilidade com código existente
export const PublicUserSchema = UserResponseSchema;
export type PublicUser = z.infer<typeof PublicUserSchema>;

export const UserListResponseSchema = z.object({
  users: z.array(UserResponseSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive().optional(),
  limit: z.number().int().positive().optional(),
});

export type UserListResponse = z.infer<typeof UserListResponseSchema>;

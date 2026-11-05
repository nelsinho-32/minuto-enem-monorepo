import { z } from "zod";

export const RoleSchema = z.enum(["STUDENT", "TEACHER"]);
export const UserRoleSchema = RoleSchema;

export type Role = z.infer<typeof RoleSchema>;
export type UserRole = z.infer<typeof UserRoleSchema>;

export const UserSchema = z.object({
  id: z.string().min(1, "O ID do usuário é obrigatório"),
  name: z.string().trim().min(1, "O nome é obrigatório"),
  email: z.string().trim().email("E-mail inválido"),
  password: z.string().min(6, "A senha deve ter pelo menos 6 caracteres"),
  role: RoleSchema.default("STUDENT"),
  xp: z.number().int().nonnegative().default(0),
  currentStreak: z.number().int().nonnegative().default(0),
  longestStreak: z.number().int().nonnegative().default(0),
  iceFreezes: z.number().int().nonnegative().default(0),
  lastStudyDate: z.union([z.coerce.date(), z.string()]).nullable().optional(),
  createdAt: z.union([z.coerce.date(), z.string()]).optional(),
});

export type User = z.infer<typeof UserSchema>;

export const PublicUserSchema = UserSchema.omit({ password: true }).extend({
  courseOrClass: z.string().optional(),
  school: z.string().optional(),
  avatar: z.string().nullable().optional(),
});

export type PublicUser = z.infer<typeof PublicUserSchema>;

export const CreateUserInputSchema = z.object({
  name: z.string().trim().min(2, "O nome deve ter pelo menos 2 caracteres"),
  email: z
    .string()
    .trim()
    .email("E-mail inválido")
    .transform((val) => val.toLowerCase()),
  password: z.string().min(6, "A senha deve ter pelo menos 6 caracteres"),
  role: RoleSchema.optional().default("STUDENT"),
});

export type CreateUserInput = z.infer<typeof CreateUserInputSchema>;

export const UpdateUserInputSchema = CreateUserInputSchema.partial().extend({
  xp: z.number().int().nonnegative().optional(),
  currentStreak: z.number().int().nonnegative().optional(),
  longestStreak: z.number().int().nonnegative().optional(),
  iceFreezes: z.number().int().nonnegative().optional(),
  lastStudyDate: z.union([z.coerce.date(), z.string()]).nullable().optional(),
});

export type UpdateUserInput = z.infer<typeof UpdateUserInputSchema>;


import { z } from "zod";
import { RoleSchema } from "./user.schema";

export const RegisterInputSchema = z.object({
  name: z.string().trim().min(1, "Nome é obrigatório."),
  email: z
    .string()
    .trim()
    .email("Formato de e-mail inválido.")
    .transform((val) => val.toLowerCase()),
  password: z.string().min(6, "A senha deve ter pelo menos 6 caracteres."),
  role: RoleSchema.optional().default("STUDENT"),
});

export type RegisterInput = z.input<typeof RegisterInputSchema>;

export const LoginInputSchema = z.object({
  email: z
    .string()
    .trim()
    .email("Formato de e-mail inválido.")
    .transform((val) => val.toLowerCase()),
  password: z.string().min(1, "A senha é obrigatória."),
});

export type LoginInput = z.input<typeof LoginInputSchema>;

export const AuthUserSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email(),
  role: RoleSchema,
  xp: z.number().int().nonnegative().optional(),
  currentStreak: z.number().int().nonnegative().optional(),
  longestStreak: z.number().int().nonnegative().optional(),
  iceFreezes: z.number().int().nonnegative().optional(),
  lastStudyDate: z.union([z.coerce.date(), z.string()]).nullable().optional(),
  courseOrClass: z.string().optional(),
  school: z.string().optional(),
  createdAt: z.union([z.coerce.date(), z.string()]).optional(),
});

export type AuthUser = z.infer<typeof AuthUserSchema>;

export const JwtPayloadSchema = z.object({
  sub: z.string().min(1),
  email: z.string().email(),
  role: RoleSchema,
  type: z.enum(["access", "refresh"]).optional(),
  iat: z.number().optional(),
  exp: z.number().optional(),
});

export type JwtPayloadData = z.infer<typeof JwtPayloadSchema>;

export const AuthTokensSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  token: z.string().min(1).optional(),
  expiresIn: z.number().int().positive().optional(),
});

export type AuthTokens = z.infer<typeof AuthTokensSchema>;

export const RefreshTokenInputSchema = z.object({
  refreshToken: z.string().min(1, "O refresh token é obrigatório."),
});

export type RefreshTokenInput = z.infer<typeof RefreshTokenInputSchema>;

export const AuthStreakSummarySchema = z.object({
  missedDays: z.number().int().nonnegative(),
  iceFreezesUsed: z.number().int().nonnegative(),
  streakReset: z.boolean(),
});

export type AuthStreakSummary = z.infer<typeof AuthStreakSummarySchema>;

export const AuthResponseSchema = z.object({
  user: AuthUserSchema,
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  token: z.string().min(1), // Alias para accessToken garantindo retrocompatibilidade total
  streakStatus: AuthStreakSummarySchema.optional(),
});

export type AuthResponse = z.infer<typeof AuthResponseSchema>;

export const AuthMeResponseSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  email: z.string().email(),
  role: RoleSchema,
  xp: z.number().int().nonnegative(),
  currentStreak: z.number().int().nonnegative(),
  longestStreak: z.number().int().nonnegative(),
  iceFreezes: z.number().int().nonnegative(),
  lastStudyDate: z.union([z.coerce.date(), z.string()]).nullable().optional(),
  createdAt: z.union([z.coerce.date(), z.string()]),
  updatedAt: z.union([z.coerce.date(), z.string()]).optional(),
  classroomCount: z.number().int().nonnegative().optional(),
  classrooms: z.array(z.any()).optional(),
  studentClassrooms: z.array(z.any()).optional(),
  _count: z
    .object({
      classrooms: z.number().optional(),
      studentClassrooms: z.number().optional(),
      attempts: z.number().optional(),
    })
    .optional(),
});

export type AuthMeResponse = z.infer<typeof AuthMeResponseSchema>;


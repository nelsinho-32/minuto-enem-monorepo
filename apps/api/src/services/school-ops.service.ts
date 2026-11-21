import bcrypt from "bcrypt";
import QRCode from "qrcode";
import { Role } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { AppError } from "../errors/AppError";
import { realtimeNotificationService } from "./realtime-notification.service";

export interface BulkImportUserEntry {
  name: string;
  email: string;
  role?: "STUDENT" | "TEACHER";
  password?: string;
  classroomCode?: string;
}

export interface DropoutAlertItem {
  studentId: string;
  name: string;
  email: string;
  classroomName: string;
  classroomId: string;
  daysInactive: number | null;
  currentStreak: number;
  longestStreak: number;
  accuracyPercent: number | null;
  riskLevel: "HIGH" | "MEDIUM";
  reasons: string[];
}

export class SchoolOpsService {
  /**
   * Faz parsing de texto em massa (linhas `Nome,email,ROLE,CODIGO_TURMA` ou `;`)
   * ou lista estruturada JSON para cadastro em lote de alunos e professores.
   */
  parseBulkLines(rawText: string, defaultRole: "STUDENT" | "TEACHER" = "STUDENT"): BulkImportUserEntry[] {
    const lines = String(rawText || "")
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    const entries: BulkImportUserEntry[] = [];
    for (const line of lines) {
      const lower = line.toLowerCase();
      if (lower.startsWith("nome,") || lower.startsWith("nome;")) continue;

      const parts = line.split(/[;,]/).map((p) => p.trim());
      if (parts.length < 2) continue;

      const [name, email, maybeRole, maybeClassroom] = parts;
      const normalizedRole =
        maybeRole && maybeRole.toUpperCase() === "TEACHER"
          ? "TEACHER"
          : maybeRole && maybeRole.toUpperCase() === "STUDENT"
            ? "STUDENT"
            : defaultRole;

      const classroomCode =
        maybeClassroom ||
        (maybeRole && !["STUDENT", "TEACHER"].includes(maybeRole.toUpperCase())
          ? maybeRole
          : undefined);

      entries.push({
        name,
        email: email.toLowerCase(),
        role: normalizedRole,
        classroomCode: classroomCode?.toUpperCase(),
      });
    }
    return entries;
  }

  /**
   * Importação em Massa de Alunos e Professores vinculados à Escola e opcionalmente matriculados na Turma.
   */
  async importUsersBulk(params: {
    requesterId: string;
    schoolId?: string | null;
    users?: BulkImportUserEntry[];
    rawText?: string;
    defaultRole?: "STUDENT" | "TEACHER";
    defaultClassroomCode?: string;
    defaultPassword?: string;
  }) {
    let schoolId = params.schoolId || null;
    if (!schoolId) {
      const u = await prisma.user.findUnique({
        where: { id: params.requesterId },
        select: { schoolId: true },
      });
      schoolId = u?.schoolId || null;
    }

    const list: BulkImportUserEntry[] =
      Array.isArray(params.users) && params.users.length > 0
        ? params.users
        : this.parseBulkLines(params.rawText || "", params.defaultRole || "STUDENT");

    if (list.length === 0) {
      throw new AppError(
        "Nenhum usuário válido encontrado para importação. Use o formato: Nome, email@escola.com",
        400
      );
    }

    const defaultPassword = params.defaultPassword?.trim() || "Enem2026@";
    const defaultPasswordHash = await bcrypt.hash(defaultPassword, 10);

    const createdUsers: Array<{ id: string; name: string; email: string; role: string }> = [];
    const skippedEmails: string[] = [];
    const errors: string[] = [];

    for (const item of list.slice(0, 200)) {
      const name = String(item.name || "").trim();
      const email = String(item.email || "").trim().toLowerCase();
      if (!name || !email.includes("@")) {
        errors.push(`Linha ignorada (dados inválidos): ${name || email}`);
        continue;
      }

      const existing = await prisma.user.findUnique({
        where: { email },
        select: { id: true },
      });

      const targetCode = (item.classroomCode || params.defaultClassroomCode || "").trim().toUpperCase();
      let targetClassroomId: string | null = null;
      if (targetCode) {
        const room = await prisma.classroom.findUnique({
          where: { code: targetCode },
          select: { id: true },
        });
        targetClassroomId = room?.id || null;
      }

      if (existing) {
        // Se já existe e foi informado código de turma, garante matrícula na turma
        if (targetClassroomId && (item.role || "STUDENT") === "STUDENT") {
          await prisma.classroom.update({
            where: { id: targetClassroomId },
            data: { students: { connect: { id: existing.id } } },
          });
        }
        skippedEmails.push(email);
        continue;
      }

      const passwordHash = item.password
        ? await bcrypt.hash(item.password, 10)
        : defaultPasswordHash;

      const role: Role = item.role === "TEACHER" ? Role.TEACHER : Role.STUDENT;

      const created = await prisma.user.create({
        data: {
          name,
          email,
          password: passwordHash,
          role,
          schoolId,
          ...(targetClassroomId && role === Role.STUDENT
            ? { enrolledClassrooms: { connect: { id: targetClassroomId } } }
            : {}),
        },
        select: { id: true, name: true, email: true, role: true },
      });

      createdUsers.push(created);
    }

    return {
      totalProcessed: list.length,
      createdCount: createdUsers.length,
      skippedCount: skippedEmails.length,
      defaultPasswordUsed: defaultPassword,
      createdUsers,
      skippedEmails,
      errors,
    };
  }

  /**
   * Gera Link de Convite + QR Code (Data URL PNG) para entrada rápida na turma via celular.
   */
  async generateClassroomInviteQr(classroomId: string, baseOrigin?: string) {
    const classroom = await prisma.classroom.findUnique({
      where: { id: classroomId },
      include: {
        teacher: { select: { name: true } },
        school: { select: { name: true } },
      },
    });

    if (!classroom) {
      throw new AppError("Turma não encontrada para gerar convite QR.", 404);
    }

    const cleanOrigin = (baseOrigin || process.env.PUBLIC_APP_URL || "https://minutoenem.app").replace(
      /\/+$/,
      ""
    );
    const inviteUrl = `${cleanOrigin}/classes/${classroom.id}?joinCode=${encodeURIComponent(classroom.code)}`;
    const deepLink = `minutoenem://join?code=${encodeURIComponent(classroom.code)}`;

    const qrCodeDataUrl = await QRCode.toDataURL(inviteUrl, {
      errorCorrectionLevel: "M",
      width: 320,
      margin: 2,
      color: {
        dark: "#0F172A",
        light: "#FFFFFF",
      },
    });

    return {
      classroomId: classroom.id,
      classroomName: classroom.name,
      code: classroom.code,
      teacherName: classroom.teacher?.name || "Docente",
      schoolName: classroom.school?.name || null,
      inviteUrl,
      deepLink,
      qrCodeDataUrl,
    };
  }

  /**
   * Analisa alunos da escola ou das turmas do professor e identifica riscos preventivos de evasão
   * ou queda de rendimento (inatividade >= 7 dias, ofensiva quebrada ou taxa de acerto < 45%).
   */
  async getDropoutAlerts(userId: string, role: string, tokenSchoolId?: string | null) {
    let classrooms;
    if (role === "TEACHER") {
      classrooms = await prisma.classroom.findMany({
        where: { teacherId: userId },
        include: {
          students: {
            select: {
              id: true,
              name: true,
              email: true,
              xp: true,
              currentStreak: true,
              longestStreak: true,
              lastStudyDate: true,
              createdAt: true,
            },
          },
        },
      });
    } else {
      let schoolId = tokenSchoolId || null;
      if (!schoolId && role === "SCHOOL") {
        const u = await prisma.user.findUnique({
          where: { id: userId },
          select: { schoolId: true },
        });
        schoolId = u?.schoolId || null;
      }
      classrooms = await prisma.classroom.findMany({
        where: schoolId ? { schoolId } : undefined,
        include: {
          students: {
            select: {
              id: true,
              name: true,
              email: true,
              xp: true,
              currentStreak: true,
              longestStreak: true,
              lastStudyDate: true,
              createdAt: true,
            },
          },
        },
      });
    }

    const allStudentIds = Array.from(
      new Set(classrooms.flatMap((c) => c.students.map((s) => s.id)))
    );

    const recentAttempts =
      allStudentIds.length > 0
        ? await prisma.questionAttempt.findMany({
            where: { userId: { in: allStudentIds } },
            orderBy: { createdAt: "desc" },
            take: 1500,
            select: { userId: true, isCorrect: true },
          })
        : [];

    const accuracyMap = new Map<string, { total: number; correct: number }>();
    for (const att of recentAttempts) {
      const cur = accuracyMap.get(att.userId) || { total: 0, correct: 0 };
      if (cur.total < 30) {
        cur.total += 1;
        if (att.isCorrect) cur.correct += 1;
        accuracyMap.set(att.userId, cur);
      }
    }

    const nowMs = Date.now();
    const seenStudents = new Set<string>();
    const alerts: DropoutAlertItem[] = [];

    for (const room of classrooms) {
      for (const st of room.students) {
        if (seenStudents.has(st.id)) continue;
        seenStudents.add(st.id);

        const reasons: string[] = [];
        const refDate = st.lastStudyDate || st.createdAt;
        const daysInactive = refDate
          ? Math.floor((nowMs - new Date(refDate).getTime()) / (1000 * 60 * 60 * 24))
          : null;

        if (!st.lastStudyDate) {
          reasons.push("Ainda não iniciou atividades de estudo");
        } else if (daysInactive !== null && daysInactive >= 7) {
          reasons.push(`Sem estudar há ${daysInactive} dias`);
        }

        if (st.currentStreak === 0 && st.longestStreak >= 3) {
          reasons.push(`Ofensiva interrompida (recorde anterior: ${st.longestStreak}d)`);
        }

        const acc = accuracyMap.get(st.id);
        const accuracyPercent =
          acc && acc.total >= 5 ? Math.round((acc.correct / acc.total) * 100) : null;
        if (accuracyPercent !== null && accuracyPercent < 45) {
          reasons.push(`Queda de rendimento (${accuracyPercent}% de acerto recente)`);
        }

        if (reasons.length > 0) {
          const riskLevel: "HIGH" | "MEDIUM" =
            reasons.length >= 2 ||
            (daysInactive !== null && daysInactive >= 10) ||
            (accuracyPercent !== null && accuracyPercent < 35)
              ? "HIGH"
              : "MEDIUM";

          alerts.push({
            studentId: st.id,
            name: st.name,
            email: st.email,
            classroomName: room.name,
            classroomId: room.id,
            daysInactive,
            currentStreak: st.currentStreak,
            longestStreak: st.longestStreak,
            accuracyPercent,
            riskLevel,
            reasons,
          });
        }
      }
    }

    alerts.sort((a, b) => {
      if (a.riskLevel !== b.riskLevel) return a.riskLevel === "HIGH" ? -1 : 1;
      return (b.daysInactive ?? 999) - (a.daysInactive ?? 999);
    });

    return {
      totalMonitoredStudents: seenStudents.size,
      totalAlerts: alerts.length,
      highRiskCount: alerts.filter((a) => a.riskLevel === "HIGH").length,
      alerts,
    };
  }

  /**
   * Dispara aviso preventivo direto (Notificação persistida + Tempo Real) para alunos em risco.
   */
  async nudgeAtRiskStudents(studentIds: string[], customMessage?: string) {
    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      throw new AppError("Selecione ao menos um aluno para enviar o incentivo.", 400);
    }

    const body =
      customMessage?.trim() ||
      "Sentimos sua falta! Retome seu cronograma semanal hoje — 15 minutos já recuperam seu ritmo rumo ao ENEM.";

    await realtimeNotificationService.notifyUsers(studentIds, {
      type: "DROPOUT_ALERT",
      title: "Sua escola está torcendo por você!",
      body,
      route: "/study-plan",
    });

    return { notifiedCount: studentIds.length };
  }
}

export const schoolOpsService = new SchoolOpsService();

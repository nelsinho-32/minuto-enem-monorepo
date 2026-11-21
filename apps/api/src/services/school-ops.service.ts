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

  /**
   * Lista usuários (professores e alunos) pertencentes à instituição escolar
   * para gestão de acessos e permissões.
   */
  async listSchoolUsers(schoolId?: string | null, roleFilter?: string, search?: string) {
    if (!schoolId) {
      throw new AppError("Instituição escolar não identificada.", 400);
    }

    const whereClause: any = {
      schoolId,
      role:
        roleFilter === "TEACHER"
          ? Role.TEACHER
          : roleFilter === "STUDENT"
            ? Role.STUDENT
            : { in: [Role.TEACHER, Role.STUDENT] },
    };

    if (search && search.trim()) {
      const q = search.trim();
      whereClause.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
      ];
    }

    return prisma.user.findMany({
      where: whereClause,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        xp: true,
        currentStreak: true,
        lastStudyDate: true,
        createdAt: true,
        _count: {
          select: {
            createdClassrooms: true,
            enrolledClassrooms: true,
          },
        },
      },
      orderBy: [{ role: "asc" }, { name: "asc" }],
    });
  }

  /**
   * Ativa ou desativa a conta de um professor ou aluno da escola.
   */
  async setUserActiveStatus(params: {
    requesterId: string;
    schoolId?: string | null;
    targetUserId: string;
    isActive: boolean;
  }) {
    if (!params.schoolId) {
      throw new AppError("Instituição escolar não identificada.", 400);
    }
    if (!params.targetUserId) {
      throw new AppError("ID do usuário é obrigatório.", 400);
    }
    if (params.requesterId === params.targetUserId) {
      throw new AppError("Você não pode desativar sua própria conta.", 400);
    }

    const target = await prisma.user.findUnique({
      where: { id: params.targetUserId },
      select: { id: true, name: true, email: true, role: true, schoolId: true, isActive: true },
    });

    if (!target || target.schoolId !== params.schoolId) {
      throw new AppError("Usuário não encontrado nesta instituição escolar.", 404);
    }

    if (target.role === Role.SCHOOL || target.role === Role.ADMIN) {
      throw new AppError("Não é permitido alterar o status de gestores ou administradores por aqui.", 403);
    }

    const updated = await prisma.user.update({
      where: { id: target.id },
      data: { isActive: Boolean(params.isActive) },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
      },
    });

    await this.recordAuditLog({
      schoolId: params.schoolId,
      actorId: params.requesterId,
      action: params.isActive ? "USER_REACTIVATED" : "USER_DEACTIVATED",
      targetType: target.role,
      targetId: target.id,
      details: { name: target.name, email: target.email, isActive: Boolean(params.isActive) },
    });

    return updated;
  }

  /**
   * Transfere a titularidade de uma turma para outro professor da mesma escola.
   */
  async transferClassroomTeacher(params: {
    requesterId?: string;
    schoolId?: string | null;
    classroomId: string;
    newTeacherId: string;
  }) {
    if (!params.schoolId) {
      throw new AppError("Instituição escolar não identificada.", 400);
    }
    if (!params.classroomId || !params.newTeacherId) {
      throw new AppError("Turma e novo professor são obrigatórios.", 400);
    }

    const classroom = await prisma.classroom.findUnique({
      where: { id: params.classroomId },
      select: { id: true, name: true, code: true, schoolId: true, teacherId: true },
    });

    if (!classroom || classroom.schoolId !== params.schoolId) {
      throw new AppError("Turma não encontrada nesta instituição escolar.", 404);
    }

    const newTeacher = await prisma.user.findUnique({
      where: { id: params.newTeacherId },
      select: { id: true, name: true, email: true, role: true, schoolId: true, isActive: true },
    });

    if (!newTeacher || newTeacher.schoolId !== params.schoolId || newTeacher.role !== Role.TEACHER) {
      throw new AppError("O professor selecionado não pertence a esta instituição.", 400);
    }

    if (newTeacher.isActive === false) {
      throw new AppError("Não é possível transferir a turma para um professor desativado.", 400);
    }

    if (classroom.teacherId === newTeacher.id) {
      throw new AppError("Este professor já é o titular atual desta turma.", 400);
    }

    const previousTeacherId = classroom.teacherId;

    const updated = await prisma.classroom.update({
      where: { id: classroom.id },
      data: { teacherId: newTeacher.id },
      include: {
        teacher: {
          select: { id: true, name: true, email: true },
        },
        _count: {
          select: { students: true, tasks: true },
        },
      },
    });

    try {
      await realtimeNotificationService.notifyUsers([newTeacher.id, previousTeacherId], {
        type: "CLASSROOM_TRANSFER",
        title: `Transferência na turma ${classroom.name}`,
        body: `A titularidade da turma ${classroom.name} (${classroom.code}) foi atribuída a ${newTeacher.name}.`,
        route: `/classes/${classroom.id}`,
      });
    } catch {
      // Não-bloqueante
    }

    await this.recordAuditLog({
      schoolId: params.schoolId,
      actorId: params.requesterId,
      action: "CLASSROOM_TEACHER_TRANSFERRED",
      targetType: "CLASSROOM",
      targetId: classroom.id,
      details: {
        classroomName: classroom.name,
        previousTeacherId,
        newTeacherId: newTeacher.id,
        newTeacherName: newTeacher.name,
      },
    });

    return updated;
  }

  /**
   * Remanejamento em lote de alunos entre duas turmas da mesma instituição.
   */
  async transferStudentsBatch(params: {
    requesterId: string;
    schoolId?: string | null;
    fromClassroomId: string;
    toClassroomId: string;
    studentIds: string[];
  }) {
    if (!params.schoolId) {
      throw new AppError("Instituição escolar não identificada.", 400);
    }
    if (!params.fromClassroomId || !params.toClassroomId) {
      throw new AppError("Informe a turma de origem e a turma de destino.", 400);
    }
    if (params.fromClassroomId === params.toClassroomId) {
      throw new AppError("A turma de destino deve ser diferente da turma de origem.", 400);
    }
    if (!Array.isArray(params.studentIds) || params.studentIds.length === 0) {
      throw new AppError("Selecione ao menos um aluno para remanejar.", 400);
    }

    const [fromRoom, toRoom] = await Promise.all([
      prisma.classroom.findUnique({
        where: { id: params.fromClassroomId },
        select: { id: true, name: true, schoolId: true, students: { select: { id: true } } },
      }),
      prisma.classroom.findUnique({
        where: { id: params.toClassroomId },
        select: { id: true, name: true, schoolId: true },
      }),
    ]);

    if (!fromRoom || fromRoom.schoolId !== params.schoolId || !toRoom || toRoom.schoolId !== params.schoolId) {
      throw new AppError("Uma ou ambas as turmas não pertencem a esta instituição.", 404);
    }

    const enrolledSet = new Set(fromRoom.students.map((s) => s.id));
    const validIds = params.studentIds.filter((id) => enrolledSet.has(id));
    if (validIds.length === 0) {
      throw new AppError("Nenhum dos alunos selecionados pertence à turma de origem.", 400);
    }

    await prisma.$transaction([
      prisma.classroom.update({
        where: { id: fromRoom.id },
        data: { students: { disconnect: validIds.map((id) => ({ id })) } },
      }),
      prisma.classroom.update({
        where: { id: toRoom.id },
        data: { students: { connect: validIds.map((id) => ({ id })) } },
      }),
    ]);

    await this.recordAuditLog({
      schoolId: params.schoolId,
      actorId: params.requesterId,
      action: "STUDENTS_BATCH_REASSIGNED",
      targetType: "CLASSROOM",
      targetId: toRoom.id,
      details: {
        fromClassroomId: fromRoom.id,
        fromClassroomName: fromRoom.name,
        toClassroomId: toRoom.id,
        toClassroomName: toRoom.name,
        movedCount: validIds.length,
      },
    });

    return {
      movedCount: validIds.length,
      fromClassroomName: fromRoom.name,
      toClassroomName: toRoom.name,
    };
  }

  /**
   * Registra evento no log de auditoria institucional.
   */
  async recordAuditLog(params: {
    schoolId?: string | null;
    actorId?: string | null;
    action: string;
    targetType: string;
    targetId?: string | null;
    details?: Record<string, unknown>;
  }) {
    try {
      let actorName = "Sistema";
      if (params.actorId) {
        const actor = await prisma.user.findUnique({
          where: { id: params.actorId },
          select: { name: true },
        });
        if (actor?.name) actorName = actor.name;
      }

      await prisma.auditLog.create({
        data: {
          schoolId: params.schoolId || null,
          actorId: params.actorId || null,
          actorName,
          action: params.action,
          targetType: params.targetType,
          targetId: params.targetId || null,
          details: (params.details || {}) as any,
        },
      });
    } catch {
      // Log de auditoria nunca deve derrubar a operação principal
    }
  }

  /**
   * Lista o histórico de auditoria da escola (com paginação padronizada).
   */
  async listAuditLogs(schoolId?: string | null, limit = 50, skip = 0) {
    if (!schoolId) {
      throw new AppError("Instituição escolar não identificada.", 400);
    }

    return prisma.auditLog.findMany({
      where: { schoolId },
      orderBy: { createdAt: "desc" },
      skip: Math.max(0, skip),
      take: Math.min(100, Math.max(1, limit)),
    });
  }

  /**
   * Lista os alunos matriculados em uma turma específica pertencente à escola.
   */
  async listSchoolClassroomStudents(schoolId?: string | null, classroomId?: string) {
    if (!schoolId || !classroomId) {
      throw new AppError("Escola e turma são obrigatórias.", 400);
    }
    const room = await prisma.classroom.findFirst({
      where: { id: classroomId, schoolId },
      select: {
        id: true,
        name: true,
        students: { select: { id: true, name: true, email: true } },
      },
    });
    if (!room) {
      throw new AppError("Turma não encontrada nesta escola.", 404);
    }
    return room.students;
  }

  /**
   * Calendário Acadêmico Institucional:
   * consolida Simulados Institucionais Unificados, Comunicados Agendados/Publicados
   * e Prazos de Listas/Redações de todas as turmas da escola em uma linha do tempo única.
   */
  async getAcademicCalendar(schoolId?: string | null) {
    if (!schoolId) {
      throw new AppError("Instituição escolar não identificada.", 400);
    }

    const [exams, announcements, classrooms] = await Promise.all([
      prisma.institutionalExam.findMany({
        where: { schoolId },
        orderBy: { startsAt: "asc" },
        take: 40,
      }),
      prisma.announcement.findMany({
        where: { schoolId },
        include: { classroom: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
        take: 40,
      }),
      prisma.classroom.findMany({
        where: { schoolId },
        select: {
          id: true,
          name: true,
          code: true,
          tasks: {
            where: { dueDate: { not: null } },
            select: {
              id: true,
              title: true,
              topic: true,
              dueDate: true,
              total: true,
            },
            orderBy: { dueDate: "asc" },
            take: 30,
          },
        },
      }),
    ]);

    const events: Array<{
      id: string;
      type: "INSTITUTIONAL_EXAM" | "ANNOUNCEMENT" | "CLASSROOM_TASK";
      title: string;
      subtitle: string;
      date: string;
      classroomName?: string | null;
      badge: string;
    }> = [];

    for (const ex of exams) {
      events.push({
        id: `exam-${ex.id}`,
        type: "INSTITUTIONAL_EXAM",
        title: ex.title,
        subtitle: `Simulado Unificado • ${ex.durationMinutes} min • ${ex.questionIds.length} questões`,
        date: ex.startsAt.toISOString(),
        classroomName: "Toda a Escola",
        badge: "Simulado Oficial",
      });
    }

    for (const ann of announcements) {
      const effectiveDate = ann.scheduledFor || ann.createdAt;
      const isScheduled = ann.scheduledFor && ann.scheduledFor.getTime() > Date.now();
      events.push({
        id: `ann-${ann.id}`,
        type: "ANNOUNCEMENT",
        title: ann.title,
        subtitle: ann.content.slice(0, 110),
        date: effectiveDate.toISOString(),
        classroomName: ann.classroom?.name || (ann.targetAudience === "TEACHERS_ONLY" ? "Corpo Docente" : "Comunidade Escolar"),
        badge: isScheduled ? "Comunicado Agendado" : "Comunicado Mural",
      });
    }

    for (const room of classrooms) {
      for (const task of room.tasks) {
        if (!task.dueDate) continue;
        events.push({
          id: `task-${task.id}`,
          type: "CLASSROOM_TASK",
          title: task.title || task.topic,
          subtitle: `Prazo de entrega na turma ${room.name} (${room.code})`,
          date: task.dueDate.toISOString(),
          classroomName: room.name,
          badge: "Entrega de Turma",
        });
      }
    }

    events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    return {
      totalEvents: events.length,
      counts: {
        exams: exams.length,
        announcements: announcements.length,
        tasks: events.filter((e) => e.type === "CLASSROOM_TASK").length,
      },
      events,
    };
  }
}

export const schoolOpsService = new SchoolOpsService();

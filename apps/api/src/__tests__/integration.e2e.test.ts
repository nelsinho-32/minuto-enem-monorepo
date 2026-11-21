import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { Role } from "@prisma/client";
import { app } from "../server";
import { prisma } from "../lib/prisma";
import { authService } from "../services/auth.service";
import { realtimeNotificationService } from "../services/realtime-notification.service";
import { announcementService } from "../services/announcement.service";

const RUN_SUFFIX = `e2e_${Date.now()}`;
let dbAvailable = false;

let schoolId = "";
let classroomId = "";
let classroomCode = "";
let schoolUserId = "";
let teacherUserId = "";
let studentUserId = "";
let importedEmail = `importado_${RUN_SUFFIX}@escola.test`;
let schoolToken = "";
let teacherToken = "";
let studentToken = "";

let customQuestionId = "";
let templateId = "";
let institutionalExamId = "";

describe("Integração E2E com PostgreSQL — Rotas Críticas do Minuto ENEM", () => {
  beforeAll(async () => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbAvailable = true;
    } catch {
      dbAvailable = false;
      return;
    }

    const passwordHash = await bcrypt.hash("SenhaForte123!", 8);

    const school = await prisma.school.create({
      data: {
        name: `Escola E2E ${RUN_SUFFIX}`,
        code: `ESC-${RUN_SUFFIX}`.slice(0, 24).toUpperCase(),
        slug: `escola-${RUN_SUFFIX}`,
        isActive: true,
      },
    });
    schoolId = school.id;

    const [schoolUser, teacherUser, studentUser] = await Promise.all([
      prisma.user.create({
        data: {
          name: "Direção E2E",
          email: `dir_${RUN_SUFFIX}@escola.test`,
          password: passwordHash,
          role: Role.SCHOOL,
          schoolId,
        },
      }),
      prisma.user.create({
        data: {
          name: "Prof. E2E",
          email: `prof_${RUN_SUFFIX}@escola.test`,
          password: passwordHash,
          role: Role.TEACHER,
          schoolId,
        },
      }),
      prisma.user.create({
        data: {
          name: "Aluno E2E",
          email: `aluno_${RUN_SUFFIX}@escola.test`,
          password: passwordHash,
          role: Role.STUDENT,
          schoolId,
          xp: 100,
          currentStreak: 0,
          longestStreak: 5,
        },
      }),
    ]);

    schoolUserId = schoolUser.id;
    teacherUserId = teacherUser.id;
    studentUserId = studentUser.id;

    classroomCode = `TURMA${Date.now().toString().slice(-5)}`;
    const room = await prisma.classroom.create({
      data: {
        name: "3º Ano E2E",
        code: classroomCode,
        schoolId,
        teacherId: teacherUserId,
        students: { connect: [{ id: studentUserId }] },
      },
    });
    classroomId = room.id;

    schoolToken = authService.generateTokens(
      schoolUser.id,
      schoolUser.email,
      Role.SCHOOL,
      schoolId
    ).accessToken;
    teacherToken = authService.generateTokens(
      teacherUser.id,
      teacherUser.email,
      Role.TEACHER,
      schoolId
    ).accessToken;
    studentToken = authService.generateTokens(
      studentUser.id,
      studentUser.email,
      Role.STUDENT,
      schoolId
    ).accessToken;
  });

  afterAll(async () => {
    if (!dbAvailable) return;
    // Limpa todos os dados criados durante o teste E2E
    if (institutionalExamId) {
      await prisma.institutionalExam.deleteMany({ where: { id: institutionalExamId } });
    }
    if (templateId) {
      await prisma.taskTemplate.deleteMany({ where: { id: templateId } });
    }
    if (customQuestionId) {
      await prisma.question.deleteMany({ where: { id: customQuestionId } });
    }
    if (classroomId) {
      await prisma.task.deleteMany({ where: { classroomId } });
      await prisma.classroom.deleteMany({ where: { id: classroomId } });
    }
    if (schoolId) {
      await prisma.auditLog.deleteMany({ where: { schoolId } });
      await prisma.announcement.deleteMany({ where: { schoolId } });
      await prisma.classroom.deleteMany({ where: { schoolId } });
    }
    await prisma.sisuCutoffOverride.deleteMany({
      where: { institution: "USP", courseSlug: "medicina", modality: "L1" },
    });
    await prisma.user.deleteMany({
      where: {
        email: {
          in: [
            `dir_${RUN_SUFFIX}@escola.test`,
            `prof_${RUN_SUFFIX}@escola.test`,
            `prof2_${RUN_SUFFIX}@escola.test`,
            `admin_${RUN_SUFFIX}@escola.test`,
            `aluno_${RUN_SUFFIX}@escola.test`,
            importedEmail,
          ],
        },
      },
    });
    if (schoolId) {
      await prisma.school.deleteMany({ where: { id: schoolId } });
    }
  });

  it("GET /api/health responde 200 OK com métricas de infraestrutura", async () => {
    if (!dbAvailable) return;
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.database).toBe("ok");
    expect(res.body.websocketAuth).toBe(true);
  });

  it("Isolamento de acesso: bloqueia 401 sem token e 403 quando STUDENT tenta rotas restritas", async () => {
    if (!dbAvailable) return;

    const noAuth = await request(app).get("/api/notifications");
    expect(noAuth.status).toBe(401);

    const studentPdf = await request(app)
      .get(`/api/classrooms/${classroomId}/report-pdf`)
      .set("Authorization", `Bearer ${studentToken}`);
    expect(studentPdf.status).toBe(403);

    const studentDropout = await request(app)
      .get("/api/schools/me/dropout-alerts")
      .set("Authorization", `Bearer ${studentToken}`);
    expect(studentDropout.status).toBe(403);

    const studentCustomQ = await request(app)
      .post("/api/teacher-bank/questions")
      .set("Authorization", `Bearer ${studentToken}`)
      .send({ text: "Bloqueado" });
    expect(studentCustomQ.status).toBe(403);
  });

  it("Persiste Push Token e Histórico de Notificações no PostgreSQL com leitura", async () => {
    if (!dbAvailable) return;

    const pushRes = await request(app)
      .post("/api/notifications/push-token")
      .set("Authorization", `Bearer ${studentToken}`)
      .send({ token: `ExponentPushToken[e2e-${RUN_SUFFIX}]`, platform: "android" });
    expect(pushRes.status).toBe(200);
    expect(pushRes.body.registered).toBe(true);

    const savedNotif = await realtimeNotificationService.notifyUser(studentUserId, {
      type: "ESSAY_GRADED",
      title: "Redação E2E corrigida: 920/1000",
      body: "Excelente desempenho nas 5 competências!",
      route: `/classes/${classroomId}`,
    });

    const listRes = await request(app)
      .get("/api/notifications")
      .set("Authorization", `Bearer ${studentToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.unreadCount).toBeGreaterThanOrEqual(1);
    expect(listRes.body.items.some((n: any) => n.id === savedNotif.id)).toBe(true);

    const readRes = await request(app)
      .patch(`/api/notifications/${savedNotif.id}/read`)
      .set("Authorization", `Bearer ${studentToken}`);
    expect(readRes.status).toBe(200);
    expect(readRes.body.updated).toBe(true);
  });

  it("Cronograma Semanal Adaptativo gera agenda da semana e marca conclusão com +20 XP", async () => {
    if (!dbAvailable) return;

    const genRes = await request(app)
      .post("/api/study-plan/generate")
      .set("Authorization", `Bearer ${studentToken}`)
      .send({ dailyMinutes: 90, targetCourse: "Medicina" });
    expect(genRes.status).toBe(200);
    expect(Array.isArray(genRes.body.items)).toBe(true);
    expect(genRes.body.items.length).toBeGreaterThanOrEqual(10);

    const firstItemId = genRes.body.items[0].id;
    const toggleRes = await request(app)
      .patch(`/api/study-plan/${firstItemId}/toggle`)
      .set("Authorization", `Bearer ${studentToken}`);
    expect(toggleRes.status).toBe(200);
    expect(toggleRes.body.item.completed).toBe(true);
    expect(toggleRes.body.xpAwarded).toBe(20);
  });

  it("Banco do Professor: cria questão autoral, salva modelo de lista e aplica na turma", async () => {
    if (!dbAvailable) return;

    const qRes = await request(app)
      .post("/api/teacher-bank/questions")
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({
        area: "Matemática",
        subject: "Matemática",
        topic: "Funções",
        difficulty: "MEDIUM",
        text: "Uma função afim f(x) = 3x + 5 assume qual valor quando x = 4?",
        options: ["12", "15", "17", "19", "21"],
        correctAnswer: 2,
        explanation: "f(4) = 3(4) + 5 = 17.",
      });
    expect(qRes.status).toBe(201);
    expect(qRes.body.isCustom).toBe(true);
    customQuestionId = qRes.body.id;

    const tplRes = await request(app)
      .post("/api/teacher-bank/templates")
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({
        title: "Lista Modelo E2E — Funções",
        topic: "Funções do 1º Grau",
        questionIds: [customQuestionId],
      });
    expect(tplRes.status).toBe(201);
    templateId = tplRes.body.id;

    const applyRes = await request(app)
      .post(`/api/teacher-bank/templates/${templateId}/apply`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({ classroomIds: [classroomId] });
    expect(applyRes.status).toBe(201);
    expect(applyRes.body.appliedCount).toBe(1);
  });

  it("Simulado Institucional Unificado: agenda, aluno responde e escola exporta PDF comparativo", async () => {
    if (!dbAvailable) return;

    const now = Date.now();
    const createRes = await request(app)
      .post("/api/institutional-exams")
      .set("Authorization", `Bearer ${schoolToken}`)
      .send({
        title: `Simulado Geral E2E ${RUN_SUFFIX}`,
        durationMinutes: 60,
        startsAt: new Date(now - 60_000).toISOString(),
        endsAt: new Date(now + 86_400_000).toISOString(),
        classroomIds: [classroomId],
        questionIds: customQuestionId ? [customQuestionId] : undefined,
        autoQuestionCount: 5,
      });
    expect(createRes.status).toBe(201);
    institutionalExamId = createRes.body.id;

    const submitRes = await request(app)
      .post(`/api/institutional-exams/${institutionalExamId}/submit`)
      .set("Authorization", `Bearer ${studentToken}`)
      .send({
        answers: customQuestionId ? { [customQuestionId]: 2 } : {},
      });
    expect(submitRes.status).toBe(201);
    expect(submitRes.body.attempt.triScore).toBeGreaterThanOrEqual(300);

    const pdfRes = await request(app)
      .get(`/api/institutional-exams/${institutionalExamId}/report-pdf`)
      .set("Authorization", `Bearer ${schoolToken}`)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => cb(null, Buffer.concat(chunks)));
      });
    expect(pdfRes.status).toBe(200);
    expect(pdfRes.headers["content-type"]).toContain("application/pdf");
    expect((pdfRes.body as Buffer).subarray(0, 5).toString("ascii")).toBe("%PDF-");
  });

  it("Escola: Importação em massa, QR Code de convite e Alertas Preventivos de Evasão", async () => {
    if (!dbAvailable) return;

    const importRes = await request(app)
      .post("/api/schools/me/import-users")
      .set("Authorization", `Bearer ${schoolToken}`)
      .send({
        rawText: `Estudante Importado, ${importedEmail}, STUDENT, ${classroomCode}`,
      });
    expect(importRes.status).toBe(201);
    expect(importRes.body.createdCount).toBe(1);

    const qrRes = await request(app)
      .get(`/api/classrooms/${classroomId}/invite-qr`)
      .set("Authorization", `Bearer ${teacherToken}`);
    expect(qrRes.status).toBe(200);
    expect(qrRes.body.code).toBe(classroomCode);
    expect(qrRes.body.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);

    const alertsRes = await request(app)
      .get("/api/schools/me/dropout-alerts")
      .set("Authorization", `Bearer ${schoolToken}`);
    expect(alertsRes.status).toBe(200);
    expect(alertsRes.body.totalAlerts).toBeGreaterThanOrEqual(1);

    const nudgeRes = await request(app)
      .post("/api/schools/me/dropout-alerts/nudge")
      .set("Authorization", `Bearer ${schoolToken}`)
      .send({ studentIds: [studentUserId] });
    expect(nudgeRes.status).toBe(200);
    expect(nudgeRes.body.notifiedCount).toBe(1);
  });

  it("Agenda unificada, Devolutiva por questão, Permissões/Transferência, Comunicados agendados e Catálogo SISU", async () => {
    if (!dbAvailable) return;

    // 1. Agenda / Calendário Unificado de Entregas
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString();
    const createdTaskRes = await request(app)
      .post(`/api/classrooms/${classroomId}/tasks`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({
        title: "Lista Agenda E2E",
        topic: "Funções",
        total: 1,
        dueDate: tomorrow,
        questionIds: [customQuestionId],
      });
    expect(createdTaskRes.status).toBe(201);

    const calStudentRes = await request(app)
      .get("/api/tasks/calendar")
      .set("Authorization", `Bearer ${studentToken}`);
    expect(calStudentRes.status).toBe(200);
    expect(calStudentRes.body.items.some((t: any) => t.title === "Lista Agenda E2E")).toBe(true);

    // 2. Devolutiva comentada e em áudio por questão errada
    const fbCreateRes = await request(app)
      .post(`/api/classrooms/${classroomId}/question-feedback`)
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({
        questionId: customQuestionId,
        commentText: "Atenção ao enunciado desta questão de Matemática!",
        audioUrl: "data:audio/webm;base64,GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibQ==",
      });
    expect(fbCreateRes.status).toBe(201);

    const fbListRes = await request(app)
      .get(`/api/classrooms/${classroomId}/question-feedback`)
      .set("Authorization", `Bearer ${studentToken}`);
    expect(fbListRes.status).toBe(200);
    expect(fbListRes.body.feedbacks.length).toBeGreaterThanOrEqual(1);
    expect(fbListRes.body.feedbacks[0].commentText).toContain("Atenção ao enunciado");

    // 3. Agendamento e Segmentação de Comunicados por Turma
    const immediateClassroomAnn = await request(app)
      .post("/api/schools/me/announcements")
      .set("Authorization", `Bearer ${schoolToken}`)
      .send({
        title: "Aviso Turma Específica E2E",
        content: "Recado somente para esta turma.",
        targetAudience: "CLASSROOM",
        classroomId,
      });
    expect(immediateClassroomAnn.status).toBe(201);

    const futureDate = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const scheduledAnn = await request(app)
      .post("/api/schools/me/announcements")
      .set("Authorization", `Bearer ${schoolToken}`)
      .send({
        title: "Comunicado Futuro Agendado",
        content: "Só deve aparecer na semana que vem.",
        targetAudience: "ALL",
        scheduledFor: futureDate,
      });
    expect(scheduledAnn.status).toBe(201);

    const studentAnnList = await request(app)
      .get("/api/announcements")
      .set("Authorization", `Bearer ${studentToken}`);
    expect(studentAnnList.status).toBe(200);
    const titles = (studentAnnList.body || []).map((a: any) => a.title);
    expect(titles).toContain("Aviso Turma Específica E2E");
    expect(titles).not.toContain("Comunicado Futuro Agendado");

    // 4. Gestão de Permissões (desativar e reativar usuário) + Transferência de Turma
    const usersRes = await request(app)
      .get("/api/schools/me/users")
      .set("Authorization", `Bearer ${schoolToken}`);
    expect(usersRes.status).toBe(200);
    expect(usersRes.body.some((u: any) => u.id === studentUserId)).toBe(true);

    const disableRes = await request(app)
      .patch(`/api/schools/me/users/${studentUserId}/status`)
      .set("Authorization", `Bearer ${schoolToken}`)
      .send({ isActive: false });
    expect(disableRes.status).toBe(200);
    expect(disableRes.body.isActive).toBe(false);

    const blockedLogin = await request(app)
      .post("/api/auth/login")
      .send({
        email: `aluno_${RUN_SUFFIX}@escola.test`,
        password: "SenhaForte123!",
      });
    expect(blockedLogin.status).toBe(403);

    await request(app)
      .patch(`/api/schools/me/users/${studentUserId}/status`)
      .set("Authorization", `Bearer ${schoolToken}`)
      .send({ isActive: true });

    const passwordHash2 = await bcrypt.hash("SenhaForte123!", 8);
    const secondTeacher = await prisma.user.create({
      data: {
        name: "Professor Substituto E2E",
        email: `prof2_${RUN_SUFFIX}@escola.test`,
        password: passwordHash2,
        role: Role.TEACHER,
        schoolId,
      },
    });
    const transferRes = await request(app)
      .patch(`/api/schools/me/classrooms/${classroomId}/transfer`)
      .set("Authorization", `Bearer ${schoolToken}`)
      .send({ newTeacherId: secondTeacher.id });
    expect(transferRes.status).toBe(200);
    expect(transferRes.body.teacherId).toBe(secondTeacher.id);

    // 5. Catálogo Relacional SISU & Metas do Aluno
    const sisuRes = await request(app).get("/api/sisu/courses?q=Medicina&institution=USP");
    expect(sisuRes.status).toBe(200);
    expect(sisuRes.body.items.length).toBeGreaterThanOrEqual(1);
    expect(sisuRes.body.items[0].institution).toBe("USP");

    const goalsRes = await request(app)
      .patch("/api/auth/goals")
      .set("Authorization", `Bearer ${studentToken}`)
      .send({
        targetCourse: "Medicina",
        targetInstitution: "USP",
        targetModality: "L1",
        targetScore: 798,
      });
    expect(goalsRes.status).toBe(200);
    expect(goalsRes.body.targetInstitution).toBe("USP");
    expect(goalsRes.body.targetModality).toBe("L1");
    expect(goalsRes.body.targetScore).toBe(798);
  });

  it("Recursos avançados por role: Storage de áudio, Caderno de Erros, Rubricas, Remanejamento, Auditoria, PDF Executivo, Worker e Admin", async () => {
    if (!dbAvailable) return;

    // 1. Áudio em Storage (não base64) + Caderno de Erros com devolutiva
    const storedFeedbacks = await prisma.questionFeedback.findMany({
      where: { classroomId },
    });
    expect(storedFeedbacks.some((f) => f.audioUrl?.startsWith("/uploads/feedback-audio/"))).toBe(true);

    await prisma.questionAttempt.create({
      data: {
        userId: studentUserId,
        questionId: customQuestionId,
        selectedAnswer: 0,
        isCorrect: false,
      },
    });
    const notebookRes = await request(app)
      .get("/api/questions/error-notebook")
      .set("Authorization", `Bearer ${studentToken}`);
    expect(notebookRes.status).toBe(200);
    expect(notebookRes.body.items[0]?.teacherFeedbacks?.length).toBeGreaterThanOrEqual(1);

    // 2. Curva Histórica TRI + Cotas SISU
    const triRes = await request(app)
      .post("/api/auth/tri-history")
      .set("Authorization", `Bearer ${studentToken}`)
      .send({ score: 745, label: "Simulado Express E2E", accuracyPercent: 80 });
    expect(triRes.status).toBe(201);
    expect(triRes.body.triHistory.length).toBeGreaterThanOrEqual(1);

    const sisuQuotaRes = await request(app).get("/api/sisu/courses?q=Medicina&institution=USP&modality=L1");
    expect(sisuQuotaRes.status).toBe(200);
    expect(sisuQuotaRes.body.items[0].modalityCode).toBe("L1");

    // 3. Rubricas de Redação + Lembrete de Pendências na Agenda
    const rubricRes = await request(app)
      .post("/api/essays/rubrics")
      .set("Authorization", `Bearer ${teacherToken}`)
      .send({ competency: 5, title: "Detalhar agente", content: "[C5] Detalhe o agente social." });
    expect(rubricRes.status).toBe(201);

    const rubricListRes = await request(app)
      .get("/api/essays/rubrics")
      .set("Authorization", `Bearer ${teacherToken}`);
    expect(rubricListRes.status).toBe(200);
    expect(rubricListRes.body.length).toBeGreaterThanOrEqual(1);

    const taskForRemind = await prisma.task.findFirst({ where: { classroomId } });
    expect(taskForRemind).toBeTruthy();
    const remindRes = await request(app)
      .post(`/api/tasks/${taskForRemind!.id}/remind-pending`)
      .set("Authorization", `Bearer ${schoolToken}`);
    expect(remindRes.status).toBe(200);
    expect(remindRes.body.notifiedCount).toBeGreaterThanOrEqual(1);

    // 4. Worker de Comunicados Agendados
    const dueScheduled = await prisma.announcement.create({
      data: {
        schoolId,
        title: "Comunicado Agendado Vencido E2E",
        content: "Deve ser disparado pelo worker.",
        targetAudience: "ALL",
        scheduledFor: new Date(Date.now() - 5_000),
        notificationSentAt: null,
      },
    });
    const workerResult = await announcementService.dispatchDueScheduledAnnouncements();
    expect(workerResult.dispatched).toBeGreaterThanOrEqual(1);
    const updatedAnn = await prisma.announcement.findUnique({ where: { id: dueScheduled.id } });
    expect(updatedAnn?.notificationSentAt).not.toBeNull();

    // 5. Escola: Remanejamento em lote de alunos, Log de Auditoria e Boletim Executivo PDF
    const secondRoom = await prisma.classroom.create({
      data: {
        name: "Turma Destino E2E",
        code: `DEST-${RUN_SUFFIX}`.slice(0, 18).toUpperCase(),
        schoolId,
        teacherId: teacherUserId,
      },
    });

    const reassignRes = await request(app)
      .post("/api/schools/me/classrooms/transfer-students")
      .set("Authorization", `Bearer ${schoolToken}`)
      .send({
        fromClassroomId: classroomId,
        toClassroomId: secondRoom.id,
        studentIds: [studentUserId],
      });
    expect(reassignRes.status).toBe(200);
    expect(reassignRes.body.movedCount).toBe(1);

    const auditRes = await request(app)
      .get("/api/schools/me/audit-logs")
      .set("Authorization", `Bearer ${schoolToken}`);
    expect(auditRes.status).toBe(200);
    expect(auditRes.body.some((l: any) => l.action === "STUDENTS_BATCH_REASSIGNED")).toBe(true);

    const execPdfRes = await request(app)
      .get("/api/schools/me/executive-report-pdf")
      .set("Authorization", `Bearer ${schoolToken}`);
    expect(execPdfRes.status).toBe(200);
    expect(execPdfRes.headers["content-type"]).toContain("application/pdf");

    // 6. Admin: Saúde das Questões, Recalibração, Override Dinâmico SISU e Monitoramento de Tenants
    const adminPass = await bcrypt.hash("SenhaForte123!", 8);
    const adminUser = await prisma.user.create({
      data: {
        name: "Admin E2E",
        email: `admin_${RUN_SUFFIX}@escola.test`,
        password: adminPass,
        role: Role.ADMIN,
      },
    });
    const adminToken = authService.generateTokens(adminUser.id, adminUser.email, Role.ADMIN, null).accessToken;

    const healthRes = await request(app)
      .get("/api/admin/questions/health")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(healthRes.status).toBe(200);
    expect(typeof healthRes.body.totalQuestions).toBe("number");

    const recalRes = await request(app)
      .post("/api/admin/questions/recalibrate")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(recalRes.status).toBe(200);

    const overrideRes = await request(app)
      .put("/api/admin/sisu/overrides")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        institution: "USP",
        courseSlug: "medicina",
        modality: "L1",
        cutoffScore: 791,
        referenceEdition: "SISU 2026 Teste",
      });
    expect(overrideRes.status).toBe(200);

    const sisuAfterOverride = await request(app).get("/api/sisu/courses?q=Medicina&institution=USP&modality=L1");
    expect(sisuAfterOverride.status).toBe(200);
    expect(sisuAfterOverride.body.items[0].cutoffScore).toBe(791);

    const tenantsRes = await request(app)
      .get("/api/admin/tenants/overview")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(tenantsRes.status).toBe(200);
    expect(tenantsRes.body.summary.schoolsTotal).toBeGreaterThanOrEqual(1);
  });
});

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import bcrypt from "bcrypt";
import { Role } from "@prisma/client";
import { app } from "../server";
import { prisma } from "../lib/prisma";
import { authService } from "../services/auth.service";
import { realtimeNotificationService } from "../services/realtime-notification.service";

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
    await prisma.user.deleteMany({
      where: {
        email: {
          in: [
            `dir_${RUN_SUFFIX}@escola.test`,
            `prof_${RUN_SUFFIX}@escola.test`,
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
});

import PDFDocument from "pdfkit";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { AppError } from "../errors/AppError";
import { realtimeNotificationService } from "./realtime-notification.service";

export const CreateInstitutionalExamSchema = z.object({
  title: z.string().trim().min(3, "Informe o título do simulado institucional."),
  description: z.string().trim().optional(),
  durationMinutes: z.coerce.number().int().min(15).max(360).default(90),
  startsAt: z.string().min(1),
  endsAt: z.string().min(1),
  classroomIds: z.array(z.string().min(1)).default([]),
  questionIds: z.array(z.string().min(1)).optional(),
  autoQuestionCount: z.coerce.number().int().min(5).max(90).default(20),
});

export interface ComparativeExamPdfData {
  examTitle: string;
  schoolName: string;
  startsAt: Date;
  endsAt: Date;
  totalQuestions: number;
  totalParticipants: number;
  overallAvgTri: number;
  classroomComparisons: Array<{
    classroomName: string;
    classroomCode: string;
    enrolledCount: number;
    participantsCount: number;
    participationPercent: number;
    avgTriScore: number;
    avgAccuracyPercent: number;
  }>;
}

export function renderInstitutionalExamPdfBuffer(
  data: ComparativeExamPdfData
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 42,
      info: {
        Title: `Relatório Comparativo - ${data.examTitle}`,
        Author: "Minuto ENEM",
      },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const primary = "#0284C7";
    const dark = "#0F172A";
    const muted = "#64748B";
    const border = "#CBD5E1";

    doc.rect(0, 0, doc.page.width, 84).fill(primary);
    doc
      .fillColor("#FFFFFF")
      .font("Helvetica-Bold")
      .fontSize(19)
      .text("MINUTO ENEM — Simulado Institucional Comparativo", 42, 20);
    doc
      .font("Helvetica")
      .fontSize(10.5)
      .text(`${data.examTitle}  •  Escola: ${data.schoolName}`, 42, 46);
    doc
      .fontSize(9)
      .text(
        `Janela: ${data.startsAt.toLocaleDateString("pt-BR")} a ${data.endsAt.toLocaleDateString("pt-BR")}  •  ${data.totalQuestions} questões  •  ${data.totalParticipants} entregas`,
        42,
        64
      );

    let y = 106;
    doc.fillColor(dark).font("Helvetica-Bold").fontSize(13).text("Resumo Geral da Aplicação", 42, y);
    y += 22;

    doc.roundedRect(42, y, 240, 48, 6).fillAndStroke("#F8FAFC", border);
    doc
      .fillColor(primary)
      .font("Helvetica-Bold")
      .fontSize(18)
      .text(`${data.overallAvgTri} pts`, 50, y + 8, { width: 224, align: "center" });
    doc
      .fillColor(muted)
      .font("Helvetica")
      .fontSize(9)
      .text("Média TRI Institucional", 50, y + 30, { width: 224, align: "center" });

    doc.roundedRect(298, y, 255, 48, 6).fillAndStroke("#F8FAFC", border);
    doc
      .fillColor("#16A34A")
      .font("Helvetica-Bold")
      .fontSize(18)
      .text(String(data.totalParticipants), 306, y + 8, { width: 239, align: "center" });
    doc
      .fillColor(muted)
      .font("Helvetica")
      .fontSize(9)
      .text("Estudantes Participantes", 306, y + 30, { width: 239, align: "center" });

    y += 72;
    doc
      .fillColor(dark)
      .font("Helvetica-Bold")
      .fontSize(13)
      .text("Comparativo entre Turmas (Ranking TRI)", 42, y);
    y += 20;

    doc.rect(42, y, doc.page.width - 84, 22).fill("#F1F5F9");
    doc.fillColor(dark).font("Helvetica-Bold").fontSize(9);
    doc.text("#", 48, y + 6, { width: 20 });
    doc.text("Turma", 72, y + 6, { width: 170 });
    doc.text("Participação", 248, y + 6, { width: 95, align: "right" });
    doc.text("Acerto Médio", 352, y + 6, { width: 90, align: "right" });
    doc.text("Média TRI", 452, y + 6, { width: 95, align: "right" });
    y += 26;

    if (data.classroomComparisons.length === 0) {
      doc
        .fillColor(muted)
        .font("Helvetica-Oblique")
        .fontSize(9.5)
        .text("Nenhuma turma vinculada ou com entregas registradas.", 48, y);
    } else {
      data.classroomComparisons.forEach((row, idx) => {
        if (y > doc.page.height - 60) {
          doc.addPage();
          y = 48;
        }
        doc.fillColor(dark).font("Helvetica-Bold").fontSize(9.5).text(`${idx + 1}º`, 48, y);
        doc
          .font("Helvetica")
          .text(`${row.classroomName} (${row.classroomCode})`, 72, y, {
            width: 170,
            ellipsis: true,
          });
        doc.text(
          `${row.participantsCount}/${row.enrolledCount} (${row.participationPercent}%)`,
          248,
          y,
          { width: 95, align: "right" }
        );
        doc.text(`${row.avgAccuracyPercent}%`, 352, y, { width: 90, align: "right" });
        doc
          .fillColor(primary)
          .font("Helvetica-Bold")
          .text(`${row.avgTriScore} pts`, 452, y, { width: 95, align: "right" });
        y += 20;
        doc
          .moveTo(42, y - 4)
          .lineTo(doc.page.width - 42, y - 4)
          .strokeColor("#F1F5F9")
          .stroke();
      });
    }

    doc.end();
  });
}

export class InstitutionalExamService {
  private async resolveSchoolIdForUser(userId: string, tokenSchoolId?: string | null) {
    if (tokenSchoolId) return tokenSchoolId;
    const u = await prisma.user.findUnique({
      where: { id: userId },
      select: { schoolId: true },
    });
    if (u?.schoolId) return u.schoolId;

    const firstSchool = await prisma.school.findFirst({
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });
    if (!firstSchool) {
      throw new AppError("Nenhuma escola vinculada para agendar simulado.", 400);
    }
    return firstSchool.id;
  }

  async createExam(
    userId: string,
    tokenSchoolId: string | null | undefined,
    rawInput: unknown
  ) {
    const parsed = CreateInstitutionalExamSchema.safeParse(rawInput);
    if (!parsed.success) {
      throw new AppError(
        parsed.error.issues[0]?.message || "Dados inválidos para simulado institucional.",
        400
      );
    }

    const d = parsed.data;
    const schoolId = await this.resolveSchoolIdForUser(userId, tokenSchoolId);
    const startsAt = new Date(d.startsAt);
    const endsAt = new Date(d.endsAt);

    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
      throw new AppError("Datas de abertura/fechamento inválidas.", 400);
    }
    if (endsAt <= startsAt) {
      throw new AppError("A data de encerramento deve ser posterior à abertura.", 400);
    }

    let classroomIds = d.classroomIds;
    if (classroomIds.length === 0) {
      const schoolRooms = await prisma.classroom.findMany({
        where: { schoolId },
        select: { id: true },
      });
      classroomIds = schoolRooms.map((r) => r.id);
    }

    let questionIds = d.questionIds && d.questionIds.length > 0 ? d.questionIds : [];
    if (questionIds.length === 0) {
      const picked = await prisma.question.findMany({
        take: d.autoQuestionCount,
        orderBy: { year: "desc" },
        select: { id: true },
      });
      questionIds = picked.map((q) => q.id);
    }

    const now = new Date();
    const status = now >= startsAt && now <= endsAt ? "ACTIVE" : now > endsAt ? "CLOSED" : "SCHEDULED";

    const exam = await prisma.institutionalExam.create({
      data: {
        schoolId,
        createdById: userId,
        title: d.title,
        description: d.description || null,
        durationMinutes: d.durationMinutes,
        startsAt,
        endsAt,
        classroomIds,
        questionIds,
        status,
      },
    });

    // Notifica alunos das turmas participantes
    for (const cId of classroomIds) {
      void realtimeNotificationService.notifyClassroomStudents(
        cId,
        {
          type: "INSTITUTIONAL_EXAM",
          title: `Simulado Institucional: ${exam.title}`,
          body: `Disponível de ${startsAt.toLocaleDateString("pt-BR")} até ${endsAt.toLocaleDateString("pt-BR")} (${questionIds.length} questões).`,
          route: "/simulado",
        },
        userId
      );
    }

    return exam;
  }

  async listExams(userId: string, role: string, tokenSchoolId?: string | null) {
    let where: any = {};

    if (role === "STUDENT") {
      const student = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          schoolId: true,
          enrolledClassrooms: { select: { id: true } },
        },
      });
      const enrolledIds = student?.enrolledClassrooms.map((c) => c.id) || [];
      where = {
        OR: [
          ...(enrolledIds.length > 0 ? [{ classroomIds: { hasSome: enrolledIds } }] : []),
          ...(student?.schoolId ? [{ schoolId: student.schoolId }] : []),
        ],
      };
    } else if (role === "SCHOOL" || role === "TEACHER") {
      const schoolId = await this.resolveSchoolIdForUser(userId, tokenSchoolId).catch(() => null);
      if (schoolId) where.schoolId = schoolId;
    }

    const exams = await prisma.institutionalExam.findMany({
      where,
      include: {
        _count: { select: { attempts: true } },
        attempts:
          role === "STUDENT"
            ? {
                where: { studentId: userId },
                select: {
                  id: true,
                  triScore: true,
                  accuracyPercent: true,
                  correctCount: true,
                  totalQuestions: true,
                  submittedAt: true,
                },
              }
            : {
                select: { triScore: true, accuracyPercent: true },
              },
      },
      orderBy: { startsAt: "desc" },
    });

    const now = new Date();
    return exams.map((ex) => {
      const computedStatus =
        now < ex.startsAt ? "SCHEDULED" : now <= ex.endsAt ? "ACTIVE" : "CLOSED";
      const avgTri =
        ex.attempts.length > 0
          ? Math.round(
              ex.attempts.reduce((s, a) => s + a.triScore, 0) / ex.attempts.length
            )
          : null;

      return {
        id: ex.id,
        title: ex.title,
        description: ex.description,
        durationMinutes: ex.durationMinutes,
        startsAt: ex.startsAt,
        endsAt: ex.endsAt,
        status: computedStatus,
        questionsCount: ex.questionIds.length,
        classroomsCount: ex.classroomIds.length,
        attemptsCount: ex._count.attempts,
        averageTriScore: avgTri,
        myAttempt: role === "STUDENT" ? ex.attempts[0] || null : undefined,
      };
    });
  }

  async getExamDetail(examId: string) {
    const exam = await prisma.institutionalExam.findUnique({
      where: { id: examId },
      include: {
        school: { select: { name: true } },
        _count: { select: { attempts: true } },
      },
    });
    if (!exam) throw new AppError("Simulado institucional não encontrado.", 404);

    const questions = await prisma.question.findMany({
      where: { id: { in: exam.questionIds } },
      select: {
        id: true,
        year: true,
        area: true,
        subject: true,
        difficulty: true,
        text: true,
        options: true,
        correctAnswer: true,
        explanation: true,
        errorRate: true,
      },
    });

    return { ...exam, questions };
  }

  async submitExamAttempt(
    examId: string,
    studentId: string,
    answers: Record<string, number>
  ) {
    const exam = await this.getExamDetail(examId);

    const student = await prisma.user.findUnique({
      where: { id: studentId },
      select: {
        id: true,
        enrolledClassrooms: { select: { id: true } },
      },
    });
    const matchedClassroom = student?.enrolledClassrooms.find((c) =>
      exam.classroomIds.includes(c.id)
    );

    let correctCount = 0;
    let totalWeight = 0;
    let earnedWeight = 0;
    const areaStats: Record<string, { total: number; correct: number }> = {};

    for (const q of exam.questions) {
      const errRate = Math.min(Math.max(Number(q.errorRate ?? 50), 10), 90);
      const weight = 1 + (100 - errRate) / 100;
      totalWeight += weight;

      const selected = answers[q.id];
      const isCorrect = selected === q.correctAnswer;
      if (isCorrect) {
        correctCount++;
        earnedWeight += weight;
      }

      const area = q.area || "Geral";
      if (!areaStats[area]) areaStats[area] = { total: 0, correct: 0 };
      areaStats[area].total += 1;
      if (isCorrect) areaStats[area].correct += 1;
    }

    const totalQuestions = Math.max(exam.questions.length, 1);
    const accuracyPercent = Math.round((correctCount / totalQuestions) * 100);
    const ratio = totalWeight > 0 ? earnedWeight / totalWeight : 0;
    const triScore = Math.min(1000, Math.max(300, Math.round(320 + ratio * 640)));

    const attempt = await prisma.institutionalExamAttempt.upsert({
      where: { examId_studentId: { examId, studentId } },
      create: {
        examId,
        studentId,
        classroomId: matchedClassroom?.id || null,
        answers,
        correctCount,
        totalQuestions: exam.questions.length,
        accuracyPercent,
        triScore,
        areaScores: areaStats,
      },
      update: {
        answers,
        correctCount,
        totalQuestions: exam.questions.length,
        accuracyPercent,
        triScore,
        areaScores: areaStats,
        submittedAt: new Date(),
      },
    });

    const xpBonus = correctCount * 15 + 50;
    await prisma.user.update({
      where: { id: studentId },
      data: { xp: { increment: xpBonus } },
    });

    return { attempt, xpEarned: xpBonus };
  }

  async generateComparativePdf(examId: string): Promise<{
    fileName: string;
    buffer: Buffer;
  }> {
    const exam = await prisma.institutionalExam.findUnique({
      where: { id: examId },
      include: {
        school: { select: { name: true } },
        attempts: true,
      },
    });
    if (!exam) throw new AppError("Simulado institucional não encontrado.", 404);

    const classrooms = await prisma.classroom.findMany({
      where: {
        OR: [
          ...(exam.classroomIds.length > 0 ? [{ id: { in: exam.classroomIds } }] : []),
          { schoolId: exam.schoolId },
        ],
      },
      include: {
        students: { select: { id: true } },
      },
    });

    const comparisons = classrooms
      .map((room) => {
        const studentSet = new Set(room.students.map((s) => s.id));
        const roomAttempts = exam.attempts.filter(
          (a) => a.classroomId === room.id || studentSet.has(a.studentId)
        );
        const enrolledCount = room.students.length;
        const participantsCount = roomAttempts.length;
        const avgTriScore =
          participantsCount > 0
            ? Math.round(
                roomAttempts.reduce((s, a) => s + a.triScore, 0) / participantsCount
              )
            : 0;
        const avgAccuracyPercent =
          participantsCount > 0
            ? Math.round(
                roomAttempts.reduce((s, a) => s + a.accuracyPercent, 0) /
                  participantsCount
              )
            : 0;

        return {
          classroomName: room.name,
          classroomCode: room.code,
          enrolledCount,
          participantsCount,
          participationPercent:
            enrolledCount > 0
              ? Math.round((participantsCount / enrolledCount) * 100)
              : 0,
          avgTriScore,
          avgAccuracyPercent,
        };
      })
      .sort((a, b) => b.avgTriScore - a.avgTriScore);

    const overallAvgTri =
      exam.attempts.length > 0
        ? Math.round(
            exam.attempts.reduce((s, a) => s + a.triScore, 0) / exam.attempts.length
          )
        : 0;

    const buffer = await renderInstitutionalExamPdfBuffer({
      examTitle: exam.title,
      schoolName: exam.school.name,
      startsAt: exam.startsAt,
      endsAt: exam.endsAt,
      totalQuestions: exam.questionIds.length,
      totalParticipants: exam.attempts.length,
      overallAvgTri,
      classroomComparisons: comparisons,
    });

    const safeSlug = exam.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .slice(0, 40);

    return {
      fileName: `simulado-comparativo-${safeSlug}.pdf`,
      buffer,
    };
  }
}

export const institutionalExamService = new InstitutionalExamService();

import PDFDocument from "pdfkit";
import { prisma } from "../lib/prisma";
import { AppError } from "../errors/AppError";

export interface PdfReportStudentRow {
  name: string;
  email: string;
  xp: number;
  streak: number;
  answeredCount: number;
  accuracyPercent: number;
  essayAverage: number | null;
  atRisk: boolean;
}

export interface ClassroomPdfReportData {
  classroomName: string;
  classroomCode: string;
  teacherName: string;
  schoolName?: string;
  generatedAt: Date;
  totalStudents: number;
  totalTasks: number;
  totalCorrectedEssays: number;
  essayAverageScore: number | null;
  competenciesAvg: {
    c1: number;
    c2: number;
    c3: number;
    c4: number;
    c5: number;
  } | null;
  areaPerformance: Array<{
    area: string;
    totalAttempts: number;
    accuracyPercent: number;
  }>;
  students: PdfReportStudentRow[];
}

/**
 * Renderiza um documento PDF binário estruturado a partir de `ClassroomPdfReportData`.
 * Função pura e testável (não depende de banco de dados).
 */
export function renderClassroomReportPdfBuffer(
  data: ClassroomPdfReportData
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 42,
      info: {
        Title: `Relatório Pedagógico - ${data.classroomName}`,
        Author: "Minuto ENEM",
        Subject: "Desempenho Pedagógico da Turma (ENEM e Oficina Nota 1000)",
      },
    });

    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const primary = "#0284C7";
    const dark = "#0F172A";
    const muted = "#64748B";
    const border = "#CBD5E1";

    // Faixa superior
    doc.rect(0, 0, doc.page.width, 82).fill(primary);
    doc
      .fillColor("#FFFFFF")
      .font("Helvetica-Bold")
      .fontSize(20)
      .text("MINUTO ENEM — Relatório Pedagógico", 42, 22);
    doc
      .font("Helvetica")
      .fontSize(10.5)
      .text(
        `Turma: ${data.classroomName} (Código: ${data.classroomCode})  •  Professor(a): ${data.teacherName}`,
        42,
        48
      );
    doc
      .fontSize(9)
      .text(
        `Emitido em: ${data.generatedAt.toLocaleString("pt-BR")}${data.schoolName ? `  •  Escola: ${data.schoolName}` : ""}`,
        42,
        64
      );

    doc.moveDown(3);
    doc.fillColor(dark);

    // 1. Indicadores Gerais
    doc.font("Helvetica-Bold").fontSize(13).text("1. Resumo Executivo da Turma", 42, 102);
    doc
      .moveTo(42, 118)
      .lineTo(doc.page.width - 42, 118)
      .strokeColor(border)
      .stroke();

    const kpis = [
      { label: "Alunos Matriculados", value: String(data.totalStudents) },
      { label: "Tarefas Atribuídas", value: String(data.totalTasks) },
      { label: "Redações Corrigidas", value: String(data.totalCorrectedEssays) },
      {
        label: "Média Redação ENEM",
        value: data.essayAverageScore !== null ? `${data.essayAverageScore} / 1000` : "—",
      },
    ];

    const boxWidth = (doc.page.width - 84 - 24) / 4;
    kpis.forEach((kpi, idx) => {
      const x = 42 + idx * (boxWidth + 8);
      const y = 128;
      doc.roundedRect(x, y, boxWidth, 52, 6).fillAndStroke("#F8FAFC", border);
      doc
        .fillColor(primary)
        .font("Helvetica-Bold")
        .fontSize(15)
        .text(kpi.value, x + 8, y + 10, { width: boxWidth - 16, align: "center" });
      doc
        .fillColor(muted)
        .font("Helvetica")
        .fontSize(8.5)
        .text(kpi.label, x + 6, y + 32, { width: boxWidth - 12, align: "center" });
    });

    let cursorY = 198;

    // 2. Médias por Competência da Redação (C1-C5)
    doc.fillColor(dark).font("Helvetica-Bold").fontSize(13).text("2. Oficina Nota 1000 — Médias por Competência (0 a 200)", 42, cursorY);
    cursorY += 18;
    doc
      .moveTo(42, cursorY)
      .lineTo(doc.page.width - 42, cursorY)
      .strokeColor(border)
      .stroke();
    cursorY += 10;

    if (data.competenciesAvg) {
      const compLabels = [
        { k: "C1 (Norma Culta)", v: data.competenciesAvg.c1 },
        { k: "C2 (Tema/Estrutura)", v: data.competenciesAvg.c2 },
        { k: "C3 (Argumentação)", v: data.competenciesAvg.c3 },
        { k: "C4 (Coesão)", v: data.competenciesAvg.c4 },
        { k: "C5 (Intervenção)", v: data.competenciesAvg.c5 },
      ];
      compLabels.forEach((item) => {
        const pct = Math.min(1, Math.max(0, item.v / 200));
        doc.fillColor(dark).font("Helvetica").fontSize(9.5).text(item.k, 42, cursorY);
        doc.roundedRect(175, cursorY + 2, 280, 9, 4).fill("#E2E8F0");
        doc.roundedRect(175, cursorY + 2, Math.max(4, 280 * pct), 9, 4).fill(primary);
        doc
          .fillColor(dark)
          .font("Helvetica-Bold")
          .fontSize(9.5)
          .text(`${item.v} pts`, 468, cursorY, { width: 80, align: "right" });
        cursorY += 18;
      });
    } else {
      doc
        .fillColor(muted)
        .font("Helvetica-Oblique")
        .fontSize(9.5)
        .text("Ainda não há redações corrigidas nesta turma.", 42, cursorY);
      cursorY += 20;
    }

    cursorY += 10;

    // 3. Desempenho por Área do ENEM
    doc.fillColor(dark).font("Helvetica-Bold").fontSize(13).text("3. Desempenho por Grande Área do ENEM", 42, cursorY);
    cursorY += 18;
    doc
      .moveTo(42, cursorY)
      .lineTo(doc.page.width - 42, cursorY)
      .strokeColor(border)
      .stroke();
    cursorY += 10;

    if (data.areaPerformance.length > 0) {
      data.areaPerformance.forEach((ap) => {
        doc
          .fillColor(dark)
          .font("Helvetica-Bold")
          .fontSize(9.5)
          .text(ap.area, 42, cursorY, { width: 220 });
        doc
          .fillColor(muted)
          .font("Helvetica")
          .fontSize(9.5)
          .text(`${ap.totalAttempts} questão(ões) respondida(s)`, 260, cursorY, {
            width: 170,
          });
        doc
          .fillColor(ap.accuracyPercent >= 60 ? "#16A34A" : "#DC2626")
          .font("Helvetica-Bold")
          .fontSize(9.5)
          .text(`${ap.accuracyPercent}% de acerto`, 440, cursorY, {
            width: 110,
            align: "right",
          });
        cursorY += 16;
      });
    } else {
      doc
        .fillColor(muted)
        .font("Helvetica-Oblique")
        .fontSize(9.5)
        .text("Sem tentativas de questões registradas até o momento.", 42, cursorY);
      cursorY += 18;
    }

    cursorY += 12;

    // 4. Tabela de Alunos
    if (cursorY > 680) {
      doc.addPage();
      cursorY = 48;
    }

    doc.fillColor(dark).font("Helvetica-Bold").fontSize(13).text("4. Boletim Individual dos Alunos", 42, cursorY);
    cursorY += 18;

    // Cabeçalho da tabela
    doc.rect(42, cursorY, doc.page.width - 84, 20).fill("#F1F5F9");
    doc.fillColor(dark).font("Helvetica-Bold").fontSize(8.5);
    doc.text("Aluno", 48, cursorY + 6, { width: 175 });
    doc.text("XP", 230, cursorY + 6, { width: 45, align: "right" });
    doc.text("Ofensiva", 282, cursorY + 6, { width: 48, align: "right" });
    doc.text("Questões", 336, cursorY + 6, { width: 52, align: "right" });
    doc.text("Acerto", 394, cursorY + 6, { width: 45, align: "right" });
    doc.text("Redação", 444, cursorY + 6, { width: 50, align: "right" });
    doc.text("Status", 500, cursorY + 6, { width: 50, align: "center" });
    cursorY += 24;

    if (data.students.length === 0) {
      doc
        .fillColor(muted)
        .font("Helvetica-Oblique")
        .fontSize(9.5)
        .text("Nenhum aluno matriculado nesta turma.", 48, cursorY);
    } else {
      for (const st of data.students) {
        if (cursorY > doc.page.height - 65) {
          doc.addPage();
          cursorY = 48;
        }
        doc.fillColor(dark).font("Helvetica").fontSize(8.5);
        doc.text(st.name, 48, cursorY, { width: 175, ellipsis: true });
        doc.text(String(st.xp), 230, cursorY, { width: 45, align: "right" });
        doc.text(`${st.streak}d`, 282, cursorY, { width: 48, align: "right" });
        doc.text(String(st.answeredCount), 336, cursorY, {
          width: 52,
          align: "right",
        });
        doc.text(`${st.accuracyPercent}%`, 394, cursorY, {
          width: 45,
          align: "right",
        });
        doc.text(st.essayAverage !== null ? String(st.essayAverage) : "—", 444, cursorY, {
          width: 50,
          align: "right",
        });
        doc
          .fillColor(st.atRisk ? "#DC2626" : "#16A34A")
          .font("Helvetica-Bold")
          .text(st.atRisk ? "Atenção" : "Regular", 500, cursorY, {
            width: 50,
            align: "center",
          });

        cursorY += 16;
        doc
          .moveTo(42, cursorY - 2)
          .lineTo(doc.page.width - 42, cursorY - 2)
          .strokeColor("#F1F5F9")
          .stroke();
      }
    }

    doc.end();
  });
}

export class PdfReportService {
  /**
   * Coleta os dados pedagógicos reais de uma turma no PostgreSQL e gera o PDF binário.
   */
  async generateClassroomReportPdf(classroomId: string): Promise<{
    fileName: string;
    buffer: Buffer;
  }> {
    const classroom = await prisma.classroom.findUnique({
      where: { id: classroomId },
      include: {
        teacher: { select: { name: true } },
        school: { select: { name: true } },
        students: {
          select: {
            id: true,
            name: true,
            email: true,
            xp: true,
            currentStreak: true,
          },
          orderBy: { name: "asc" },
        },
        tasks: {
          select: { id: true },
        },
      },
    });

    if (!classroom) {
      throw new AppError("Turma não encontrada para geração de relatório PDF.", 404);
    }

    const studentIds = classroom.students.map((s) => s.id);
    const taskIds = classroom.tasks.map((t) => t.id);

    const [attempts, correctedEssays] = await Promise.all([
      studentIds.length > 0
        ? prisma.questionAttempt.findMany({
            where: { userId: { in: studentIds } },
            select: {
              userId: true,
              isCorrect: true,
              question: { select: { area: true } },
            },
          })
        : Promise.resolve([]),
      taskIds.length > 0
        ? prisma.essaySubmission.findMany({
            where: {
              taskId: { in: taskIds },
              status: "CORRECTED",
            },
            select: {
              studentId: true,
              competency1: true,
              competency2: true,
              competency3: true,
              competency4: true,
              competency5: true,
              finalScore: true,
            },
          })
        : Promise.resolve([]),
    ]);

    // Estatísticas por área
    const areaMap = new Map<string, { total: number; correct: number }>();
    const studentAttemptMap = new Map<string, { total: number; correct: number }>();

    for (const att of attempts) {
      const area = att.question?.area || "Geral";
      const areaAcc = areaMap.get(area) || { total: 0, correct: 0 };
      areaAcc.total += 1;
      if (att.isCorrect) areaAcc.correct += 1;
      areaMap.set(area, areaAcc);

      const stAcc = studentAttemptMap.get(att.userId) || { total: 0, correct: 0 };
      stAcc.total += 1;
      if (att.isCorrect) stAcc.correct += 1;
      studentAttemptMap.set(att.userId, stAcc);
    }

    // Estatísticas de redações por aluno e médias C1..C5
    const studentEssayMap = new Map<string, number[]>();
    let c1Sum = 0;
    let c2Sum = 0;
    let c3Sum = 0;
    let c4Sum = 0;
    let c5Sum = 0;
    let scoreSum = 0;

    for (const e of correctedEssays) {
      const score = Number(e.finalScore || 0);
      scoreSum += score;
      c1Sum += Number(e.competency1 || 0);
      c2Sum += Number(e.competency2 || 0);
      c3Sum += Number(e.competency3 || 0);
      c4Sum += Number(e.competency4 || 0);
      c5Sum += Number(e.competency5 || 0);

      const list = studentEssayMap.get(e.studentId) || [];
      list.push(score);
      studentEssayMap.set(e.studentId, list);
    }

    const totalCorrected = correctedEssays.length;
    const competenciesAvg =
      totalCorrected > 0
        ? {
            c1: Math.round(c1Sum / totalCorrected),
            c2: Math.round(c2Sum / totalCorrected),
            c3: Math.round(c3Sum / totalCorrected),
            c4: Math.round(c4Sum / totalCorrected),
            c5: Math.round(c5Sum / totalCorrected),
          }
        : null;

    const students: PdfReportStudentRow[] = classroom.students.map((st) => {
      const att = studentAttemptMap.get(st.id) || { total: 0, correct: 0 };
      const accuracyPercent =
        att.total > 0 ? Math.round((att.correct / att.total) * 100) : 0;
      const essays = studentEssayMap.get(st.id) || [];
      const essayAverage =
        essays.length > 0
          ? Math.round(essays.reduce((a, b) => a + b, 0) / essays.length)
          : null;
      const atRisk =
        (att.total >= 5 && accuracyPercent < 50) ||
        (essayAverage !== null && essayAverage < 560) ||
        (att.total === 0 && st.xp === 0);

      return {
        name: st.name,
        email: st.email,
        xp: st.xp,
        streak: st.currentStreak,
        answeredCount: att.total,
        accuracyPercent,
        essayAverage,
        atRisk,
      };
    });

    const areaPerformance = Array.from(areaMap.entries())
      .map(([area, stats]) => ({
        area,
        totalAttempts: stats.total,
        accuracyPercent: Math.round((stats.correct / Math.max(stats.total, 1)) * 100),
      }))
      .sort((a, b) => b.totalAttempts - a.totalAttempts);

    const buffer = await renderClassroomReportPdfBuffer({
      classroomName: classroom.name,
      classroomCode: classroom.code,
      teacherName: classroom.teacher?.name || "Docente",
      schoolName: classroom.school?.name,
      generatedAt: new Date(),
      totalStudents: classroom.students.length,
      totalTasks: classroom.tasks.length,
      totalCorrectedEssays: totalCorrected,
      essayAverageScore: totalCorrected > 0 ? Math.round(scoreSum / totalCorrected) : null,
      competenciesAvg,
      areaPerformance,
      students,
    });

    const safeSlug = classroom.code
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, "-");
    return {
      fileName: `relatorio-turma-${safeSlug}.pdf`,
      buffer,
    };
  }
}

export const pdfReportService = new PdfReportService();

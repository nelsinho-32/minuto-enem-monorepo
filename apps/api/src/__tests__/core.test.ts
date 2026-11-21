import { describe, it, expect } from "vitest";
import { GradeEssayInputSchema } from "@minuto-enem/shared";
import { triService } from "../services/tri.service";
import { spacedRepetitionService } from "../services/spaced-repetition.service";
import {
  LocalStorageService,
  S3StorageService,
  createStorageService,
} from "../services/storage.service";
import {
  normalizeElasticText,
  computeElasticScore,
} from "../services/search.service";
import { renderClassroomReportPdfBuffer } from "../services/pdf-report.service";
import { extractSocketToken } from "../websocket/socket-auth.middleware";

describe("Minuto ENEM — Regras Críticas de Negócio e Infraestrutura", () => {
  describe("TRI (Teoria de Resposta ao Item)", () => {
    it("classifica questão fácil (<45% erro) com maior peso de coerência", () => {
      const easy = triService.calculateQuestionWeight(25, "q-easy");
      const hard = triService.calculateQuestionWeight(82, "q-hard");

      expect(easy.difficultyTier).toBe("EASY");
      expect(hard.difficultyTier).toBe("HARD");
      expect(easy.dynamicWeight).toBeGreaterThan(hard.dynamicWeight);
      expect(easy.successRate).toBe(75);
      expect(hard.successRate).toBe(18);
    });

    it("aplica fallback neutro (50%) quando errorRate é nulo", () => {
      const neutral = triService.calculateQuestionWeight(null);
      expect(neutral.errorRate).toBe(50);
      expect(neutral.difficultyTier).toBe("MEDIUM");
      expect(neutral.difficultyLogitB).toBe(0);
    });
  });

  describe("Algoritmo SuperMemo-2 (Revisão Espaçada)", () => {
    it("reseta repetições e agenda para 1 dia quando qualidade < 3", () => {
      const res = spacedRepetitionService.calculateSM2(3, 15, 2.5, 1);
      expect(res.repetitions).toBe(0);
      expect(res.interval).toBe(1);
      expect(res.easinessFactor).toBeGreaterThanOrEqual(1.3);
    });

    it("progride intervalos corretamente (1d -> 6d -> interval*EF) para qualidade >= 4", () => {
      const r1 = spacedRepetitionService.calculateSM2(0, 0, 2.5, 5);
      expect(r1.repetitions).toBe(1);
      expect(r1.interval).toBe(1);

      const r2 = spacedRepetitionService.calculateSM2(1, 1, r1.easinessFactor, 5);
      expect(r2.repetitions).toBe(2);
      expect(r2.interval).toBe(6);

      const r3 = spacedRepetitionService.calculateSM2(2, 6, r2.easinessFactor, 5);
      expect(r3.repetitions).toBe(3);
      expect(r3.interval).toBeGreaterThan(10);
    });

    it("classifica chute rápido (<4s e incorreto) como qualidade 0", () => {
      expect(
        spacedRepetitionService.classifyQuality({
          isCorrect: false,
          timeSpentMs: 2200,
        })
      ).toBe(0);
    });
  });

  describe("Oficina Nota 1000 — Validação de Competências (C1 a C5)", () => {
    it("valida notas múltiplas válidas entre 0 e 200 e soma até 1000", () => {
      const parsed = GradeEssayInputSchema.parse({
        competency1: 160,
        competency2: 200,
        competency3: 180,
        competency4: 160,
        competency5: 200,
        generalFeedback: "Ótima argumentação e proposta de intervenção completa.",
      });

      const total =
        parsed.competency1 +
        parsed.competency2 +
        parsed.competency3 +
        parsed.competency4 +
        parsed.competency5;
      expect(total).toBe(900);
    });

    it("rejeita competência acima de 200 pontos", () => {
      const invalid = GradeEssayInputSchema.safeParse({
        competency1: 240,
        competency2: 160,
        competency3: 160,
        competency4: 160,
        competency5: 160,
        generalFeedback: "Teste",
      });
      expect(invalid.success).toBe(false);
    });
  });

  describe("Busca Elástica Unificada (Tolerância a acentos e erros de digitação)", () => {
    it("normaliza acentos e pontua correspondência exata acima de parcial", () => {
      expect(normalizeElasticText("Física Quântica")).toBe("fisica quantica");
      const exact = computeElasticScore("citologia", "Citologia", "Biologia");
      const fuzzy = computeElasticScore("citolgia", "Citologia", "Biologia");
      expect(exact).toBeGreaterThan(fuzzy);
      expect(fuzzy).toBeGreaterThan(0);
    });
  });

  describe("StorageService (Local + S3/R2 Adapter)", () => {
    it("gera URLs públicas corretas para Local, AWS S3 e Cloudflare R2 CDN", () => {
      const local = new LocalStorageService();
      expect(local.getPublicUrl("redacao.jpg", "essays")).toBe(
        "/uploads/essays/redacao.jpg"
      );

      const s3 = new S3StorageService({
        bucket: "minuto-enem",
        region: "sa-east-1",
        accessKeyId: "k",
        secretAccessKey: "s",
      });
      expect(s3.getPublicUrl("aula.pdf", "pdfs")).toBe(
        "https://minuto-enem.s3.sa-east-1.amazonaws.com/pdfs/aula.pdf"
      );

      const r2 = new S3StorageService({
        bucket: "enem-r2",
        region: "auto",
        endpoint: "https://acc.r2.cloudflarestorage.com",
        publicBaseUrl: "https://cdn.minutoenem.com.br",
        accessKeyId: "k",
        secretAccessKey: "s",
      });
      expect(r2.getPublicUrl("folha.png", "essays")).toBe(
        "https://cdn.minutoenem.com.br/essays/folha.png"
      );
    });

    it("faz fallback seguro para LocalStorageService se S3 não tiver credenciais", () => {
      const prev = process.env.STORAGE_PROVIDER;
      process.env.STORAGE_PROVIDER = "s3";
      delete process.env.S3_BUCKET;
      const instance = createStorageService();
      expect(instance).toBeInstanceOf(LocalStorageService);
      if (prev !== undefined) process.env.STORAGE_PROVIDER = prev;
      else delete process.env.STORAGE_PROVIDER;
    });
  });

  describe("Socket.IO JWT Extraction", () => {
    it("extrai token Bearer corretamente e ignora valores guest/null", () => {
      const mockAuthSocket = {
        handshake: { auth: { token: "Bearer abc.def.ghi" }, headers: {}, query: {} },
      } as any;
      expect(extractSocketToken(mockAuthSocket)).toBe("abc.def.ghi");

      const mockGuestSocket = {
        handshake: { auth: { token: "guest" }, headers: {}, query: {} },
      } as any;
      expect(extractSocketToken(mockGuestSocket)).toBeNull();
    });
  });

  describe("Exportação de Relatório Pedagógico em PDF", () => {
    it("gera um buffer PDF binário válido com assinatura %PDF-", async () => {
      const pdfBuffer = await renderClassroomReportPdfBuffer({
        classroomName: "3º Ano A — ENEM 2026",
        classroomCode: "ENEM-3A",
        teacherName: "Prof. Ana Paula",
        schoolName: "Colégio Modelo",
        generatedAt: new Date("2026-11-21T14:00:00Z"),
        totalStudents: 2,
        totalTasks: 4,
        totalCorrectedEssays: 2,
        essayAverageScore: 840,
        competenciesAvg: { c1: 160, c2: 180, c3: 160, c4: 160, c5: 180 },
        areaPerformance: [
          { area: "Matemática", totalAttempts: 40, accuracyPercent: 72 },
          { area: "Natureza", totalAttempts: 35, accuracyPercent: 54 },
        ],
        students: [
          {
            name: "Lucas Silva",
            email: "lucas@escola.com",
            xp: 1250,
            streak: 7,
            answeredCount: 45,
            accuracyPercent: 78,
            essayAverage: 880,
            atRisk: false,
          },
          {
            name: "Mariana Souza",
            email: "mariana@escola.com",
            xp: 320,
            streak: 1,
            answeredCount: 12,
            accuracyPercent: 42,
            essayAverage: 520,
            atRisk: true,
          },
        ],
      });

      expect(Buffer.isBuffer(pdfBuffer)).toBe(true);
      expect(pdfBuffer.length).toBeGreaterThan(1000);
      expect(pdfBuffer.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    });
  });
});

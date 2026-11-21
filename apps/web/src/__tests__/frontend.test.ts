declare const describe: (name: string, fn: () => void) => void;
declare const it: (name: string, fn: () => void) => void;
declare const expect: (actual: any) => any;
import {
  Colors,
  AppPalette,
  getSubjectVisualTheme,
} from "../constants/theme";
import {
  searchSisuCourses,
  getCutoffForModality,
  getModalityInfo,
  getSisuStates,
  SISU_MODALITIES,
  CreateAnnouncementInputSchema,
} from "@minuto-enem/shared";

describe("Frontend Web/Mobile — Design System, Catálogo SISU e Validações", () => {
  it("resolve paleta de cores Light e Dark com contraste adequado", () => {
    expect(Colors.light.background).toBe(AppPalette.background);
    expect(Colors.dark.background).toBe("#0F172A");
    expect(Colors.dark.text).toBe("#F8FAFC");
    expect(Colors.dark.surface).toBe("#1E293B");
  });

  it("mapeia corretamente todas as disciplinas do ENEM para suas áreas e ícones", () => {
    expect(getSubjectVisualTheme("matematica", "Matemática").area).toBe("MATEMATICA");
    expect(getSubjectVisualTheme("redacao", "Redação").area).toBe("LINGUAGENS");
    expect(getSubjectVisualTheme("educacao-fisica", "Educação Física").area).toBe("LINGUAGENS");
    expect(getSubjectVisualTheme("fisica", "Física").area).toBe("NATUREZA");
    expect(getSubjectVisualTheme("historia", "História").area).toBe("HUMANAS");
  });

  it("filtra catálogo relacional SISU por curso, instituição, UF e modalidade de cota", () => {
    const uspMedAc = searchSisuCourses({
      query: "Medicina",
      institution: "USP",
      modality: "AC",
    });
    expect(uspMedAc.length).toBeGreaterThanOrEqual(1);
    expect(uspMedAc[0].institution).toBe("USP");
    expect(uspMedAc[0].modalityCode).toBe("AC");

    const uspMedL1 = searchSisuCourses({
      query: "Medicina",
      institution: "USP",
      modality: "L1",
    });
    expect(uspMedL1[0].cutoffScore).toBeLessThan(uspMedAc[0].cutoffScore);
    expect(getCutoffForModality(800, "L2")).toBe(742);
    expect(getModalityInfo("PCD").code).toBe("PCD");
    expect(SISU_MODALITIES.length).toBeGreaterThanOrEqual(6);
    expect(getSisuStates()).toContain("SP");
  });

  it("aplica overrides dinâmicos do Admin sobre o catálogo SISU", () => {
    const overridden = searchSisuCourses({
      institution: "UFMG",
      course: "Direito",
      modality: "L5",
      dynamicOverrides: [
        {
          institution: "UFMG",
          courseSlug: "direito",
          modality: "L5",
          cutoffScore: 733,
          referenceEdition: "SISU 2026 Oficial",
        },
      ],
    });
    expect(overridden[0].cutoffScore).toBe(733);
    expect(overridden[0].referenceEdition).toBe("SISU 2026 Oficial");
  });

  it("valida schema de comunicados segmentados por turma e agendados", () => {
    const parsed = CreateAnnouncementInputSchema.parse({
      title: "Simulado da Turma 3º A",
      content: "Lembrem-se de trazer caneta preta para o simulado.",
      targetAudience: "CLASSROOM",
      classroomId: "room-123",
      scheduledFor: "2026-12-01T08:00:00.000Z",
    });
    expect(parsed.targetAudience).toBe("CLASSROOM");
    expect(parsed.classroomId).toBe("room-123");
  });
});

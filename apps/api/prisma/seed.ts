import fs from "fs";
import path from "path";
import dotenv from "dotenv";

if (!process.env.DATABASE_URL) {
  dotenv.config({ path: path.resolve(__dirname, "../.env") });
  dotenv.config({ path: path.resolve(__dirname, "../../.env") });
}
dotenv.config();

import { prisma } from "../src/lib/prisma";
import { triService } from "../src/services/tri.service";
import { questionService, slugifyText } from "../src/services/question.service";

interface LessonData {
  title: string;
  content: string;
  videos?: string[];
  references?: string[];
}

interface SubjectData {
  name: string;
  slug: string;
  icon: string;
  lessons: LessonData[];
}

interface RawQuestionData {
  year?: number;
  area: string;
  subject?: string;
  text: string;
  options: string[];
  correctAnswer: number;
  explanation?: string;
  errorRate?: number | null;
}

const AREA_LABELS: Record<string, string> = {
  "ciencias-humanas": "Ciências Humanas",
  "ciencias-natureza": "Ciências da Natureza",
  matematica: "Matemática",
  linguagens: "Linguagens e Códigos",
};

const SUBJECT_TO_AREA: Record<string, string> = {
  historia: "Ciências Humanas",
  geografia: "Ciências Humanas",
  filosofia: "Ciências Humanas",
  sociologia: "Ciências Humanas",
  fisica: "Ciências da Natureza",
  quimica: "Ciências da Natureza",
  biologia: "Ciências da Natureza",
  matematica: "Matemática",
  "lingua-portuguesa": "Linguagens e Códigos",
  literatura: "Linguagens e Códigos",
  artes: "Linguagens e Códigos",
  "educacao-fisica": "Linguagens e Códigos",
  "ingles-ou-espanhou": "Linguagens e Códigos",
};

/**
 * Classificador heurístico baseado em vocabulário e padrões das questões do ENEM
 * para vincular cada questão da prova à sua disciplina específica em materias.json.
 */
function classifyQuestionSubject(text: string, rawArea: string): string {
  const t = text.toLowerCase();

  if (rawArea === "matematica") {
    return "Matematica";
  }

  if (rawArea === "ciencias-natureza") {
    const fisPatterns = [
      /\bvelocidade\b/,
      /\bacelera/,
      /\bnewton\b/,
      /\benergia\b/,
      /\bcalor\b/,
      /\bcircuito\b/,
      /\belé?tr/,
      /\bpotência\b/,
      /\bóptic/,
      /\bonda\b/,
      /\bfrequência\b/,
      /\bpressão\b/,
      /\batrito\b/,
      /\bgravit/,
      /\btermodinâm/,
      /\bjoule\b/,
      /\bvolt\b/,
      /\bampère\b/,
      /\bforça\b/,
      /\bmovimento\b/,
      /\bcinemát/,
      /\bdinâmic/,
    ];
    const quiPatterns = [
      /\bmol\b/,
      /\breação\b/,
      /\bquímic/,
      /\bácido\b/,
      /\bbase\b/,
      /\bph\b/,
      /\bsolução\b/,
      /\bátomo\b/,
      /\bligação\b/,
      /\bcarbono\b/,
      /\borgânic/,
      /\bentalpia\b/,
      /\boxidação\b/,
      /\bredox\b/,
      /\bsolubilidade\b/,
      /\bgás\b/,
      /\beletrólise\b/,
      /\bcomposto\b/,
      /\bdestilação\b/,
    ];
    const bioPatterns = [
      /\bcélula\b/,
      /\bdna\b/,
      /\brna\b/,
      /\bproteína\b/,
      /\bgene\b/,
      /\becossistema\b/,
      /\bespécie\b/,
      /\bfotossíntese\b/,
      /\brespiração\b/,
      /\bvírus\b/,
      /\bbactéria\b/,
      /\bevolução\b/,
      /\bdarwin\b/,
      /\borganel/,
      /\bbiodiversidade\b/,
      /\bbioma\b/,
      /\btecido\b/,
      /\bmutação\b/,
      /\bplanta\b/,
      /\bfisiolog/,
    ];

    const scoreFis = fisPatterns.filter((r) => r.test(t)).length;
    const scoreQui = quiPatterns.filter((r) => r.test(t)).length;
    const scoreBio = bioPatterns.filter((r) => r.test(t)).length;

    if (scoreFis > scoreQui && scoreFis > scoreBio) return "Física";
    if (scoreQui > scoreBio) return "Quimica";
    return "Biologia";
  }

  if (rawArea === "ciencias-humanas") {
    const geoPatterns = [
      /\bmapa\b/,
      /\brelevo\b/,
      /\bclima\b/,
      /\bvegetação\b/,
      /\bbioma\b/,
      /\bmigração\b/,
      /\burbaniz/,
      /\bpopulação\b/,
      /\bagro\b/,
      /\bagrícol/,
      /\bgeopolít/,
      /\bterritório\b/,
      /\bbacia\b/,
      /\bhidrogr/,
      /\bindustrializ/,
      /\bsolo\b/,
      /\bdesmatamento\b/,
      /\bespaço geogr/,
      /\bdesertificação\b/,
      /\bseca\b/,
    ];
    const hisPatterns = [
      /\bséculo\b/,
      /\bguerra\b/,
      /\bimpério\b/,
      /\brepública\b/,
      /\bvargas\b/,
      /\bescrav/,
      /\bditadura\b/,
      /\bmonarquia\b/,
      /\bcolônia\b/,
      /\brevolução\b/,
      /\bmedieval\b/,
      /\bgrécia\b/,
      /\broma\b/,
      /\bfeudal/,
      /\bindependência\b/,
      /\bconstituição\b/,
      /\bhistór/,
      /\bpatriarc/,
      /\bindígena\b/,
    ];
    const filPatterns = [
      /\bfilósofo\b/,
      /\bfilosofia\b/,
      /\bética\b/,
      /\bmoral\b/,
      /\bsócrates\b/,
      /\bplatão\b/,
      /\baristóteles\b/,
      /\bkant\b/,
      /\bdescartes\b/,
      /\bnietzsche\b/,
      /\brazão\b/,
      /\bepistemol/,
    ];
    const socPatterns = [
      /\bsociologia\b/,
      /\bsociedade\b/,
      /\bmarx\b/,
      /\bdurkheim\b/,
      /\bweber\b/,
      /\bcultura\b/,
      /\bmovimento social\b/,
      /\bdesigualdade\b/,
      /\bclasse social\b/,
      /\bcidadania\b/,
      /\binstituição\b/,
      /\btrabalho\b/,
    ];

    const sGeo = geoPatterns.filter((r) => r.test(t)).length;
    const sHis = hisPatterns.filter((r) => r.test(t)).length;
    const sFil = filPatterns.filter((r) => r.test(t)).length;
    const sSoc = socPatterns.filter((r) => r.test(t)).length;

    const max = Math.max(sGeo, sHis, sFil, sSoc);
    if (max > 0) {
      if (sHis === max) return "Historia";
      if (sGeo === max) return "Geografia";
      if (sFil === max) return "Filosofia";
      return "Sociologia";
    }
    return "Historia";
  }

  if (rawArea === "linguagens") {
    const ing = [
      /\bthe\b/,
      /\bof\b/,
      /\band\b/,
      /\bto\b/,
      /\bin\b/,
      /\bis\b/,
      /\bthat\b/,
      /\bfor\b/,
      /\bwith\b/,
      /\bas\b/,
    ];
    const esp = [
      /\bel\b/,
      /\bla\b/,
      /\blos\b/,
      /\blas\b/,
      /\bdel\b/,
      /\ben\b/,
      /\bpara\b/,
      /\bcon\b/,
      /\bpor\b/,
      /\buna\b/,
    ];
    const art = [
      /\bquadro\b/,
      /\bpintura\b/,
      /\bobra\b/,
      /\bartista\b/,
      /\bescultura\b/,
      /\bmúsica\b/,
      /\bteatro\b/,
      /\bdança\b/,
      /\bvanguarda\b/,
      /\bmodernismo\b/,
      /\bvisual\b/,
    ];
    const lit = [
      /\bpoema\b/,
      /\bpoesia\b/,
      /\bverso\b/,
      /\bromance\b/,
      /\bmachado de assis\b/,
      /\bliterár/,
      /\bconto\b/,
      /\bestilo de época\b/,
      /\beu lírico\b/,
      /\bcrônica\b/,
    ];
    const ef = [
      /\besporte\b/,
      /\batividade física\b/,
      /\bexercício\b/,
      /\bcorpo\b/,
      /\bginástica\b/,
      /\bsaúde corporal\b/,
      /\bprática corporal\b/,
    ];

    const sIng = ing.filter((r) => r.test(t)).length;
    const sEsp = esp.filter((r) => r.test(t)).length;
    const sArt = art.filter((r) => r.test(t)).length;
    const sLit = lit.filter((r) => r.test(t)).length;
    const sEf = ef.filter((r) => r.test(t)).length;

    if (sIng >= 4 || sEsp >= 4) return "Ingles ou Espanhou";
    if (sLit > sArt && sLit > sEf) return "Literatura";
    if (sArt > sEf) return "Artes";
    if (sEf > 0) return "Educação Física";
    return "Língua Portuguesa";
  }

  return "Língua Portuguesa";
}

/**
 * Higieniza o título e o corpo da lição vindos de materias.json.
 * Separa títulos longos concatenados com o conteúdo explicativo e extrai links de fotos.
 */
function extractCleanTitleAndContent(
  rawTitle: string,
  rawContent?: string
): { title: string; content: string } {
  let title = (rawTitle || "").trim();
  let content = (rawContent || "").trim();

  // Caso 1: Prefixo de imagem como (foto:http... ) Título Real
  const photoMatch = title.match(/^\(foto:\s*(https?:\/\/[^\s\)]+)\s*\)\s*(.*)/i);
  let extraContent = "";
  if (photoMatch) {
    const imageUrl = photoMatch[1];
    title = photoMatch[2].trim();
    extraContent = `![](${imageUrl})\n\n`;
  }

  // Títulos conhecidos com concatenação direta do corpo teórico
  const splitKnown = [
    "Química Geral e Inorgânica",
    "Físico-Química",
    "Química Ambiental e Poluição",
    "Mecânica Clássica",
    "Eletrodinâmica e Circuitos",
    "Termologia e Termodinâmica",
    "Óptica Geométrica",
    "Genética e Biologia Molecular",
    "Fisiologia Humana",
    "Ecologia e Meio Ambiente",
    "Meio Ambiente e Dinâmicas Ecológicas",
    "Razão e Proporção",
    "Escalas (Numéricas e Gráficas)",
    "Regra de Três (Simples e Composta)",
    "Porcentagem e Fatores de Multiplicação",
    "Medidas de Tendência Central (Média, Mediana e Moda)",
    "Noções de Dispersão (Variância e Desvio Padrão)",
    "Teoria das Probabilidades",
  ];

  for (const known of splitKnown) {
    if (title.startsWith(known) && title.length > known.length) {
      const remainder = title.slice(known.length).trim();
      title = known;
      if (!content) {
        content = remainder;
      } else {
        content = `${remainder}\n\n${content}`;
      }
      break;
    }
  }

  if (extraContent) {
    content = extraContent + (content || "");
  }

  return { title, content };
}

async function main() {
  console.log("🌱 [Seed] Iniciando o Seed Completo do Minuto ENEM...\n");

  const dataDir = path.join(__dirname, "data");
  const materiasPath = path.join(dataDir, "materias.json");
  const questionsPath = path.join(dataDir, "2015_COMPLETO.json");

  // =========================================================================
  // ETAPA 1: MATÉRIAS, LIÇÕES, VÍDEOS E REFERÊNCIAS COM UPSERT IDEMPOTENTE
  // =========================================================================
  console.log("==================================================");
  console.log("📚 ETAPA 1: Importando Matérias e Lições (materias.json)...");
  console.log("==================================================");

  if (!fs.existsSync(materiasPath)) {
    throw new Error(`Arquivo não encontrado: ${materiasPath}`);
  }

  const materiasData: SubjectData[] = JSON.parse(
    fs.readFileSync(materiasPath, "utf-8")
  );

  const subjectMap = new Map<string, { id: string; name: string; slug: string }>();

  let totalSubjectsUpserted = 0;
  let totalLessonsUpserted = 0;

  for (const subject of materiasData) {
    const subjectRecord = await prisma.subject.upsert({
      where: { slug: subject.slug },
      create: {
        name: subject.name,
        slug: subject.slug,
        icon: subject.icon || "book",
      },
      update: {
        name: subject.name,
        icon: subject.icon || "book",
      },
    });

    subjectMap.set(subject.slug, subjectRecord);
    subjectMap.set(subject.name.toLowerCase(), subjectRecord);
    totalSubjectsUpserted++;

    if (Array.isArray(subject.lessons)) {
      for (const lesson of subject.lessons) {
        const { title: cleanTitle, content: cleanContent } =
          extractCleanTitleAndContent(lesson.title, lesson.content);

        const topicSlug = slugifyText(cleanTitle) || `${subject.slug}-topico`;
        const topicRecord = await prisma.topic.upsert({
          where: {
            subjectId_slug: {
              subjectId: subjectRecord.id,
              slug: topicSlug,
            },
          },
          create: {
            name: cleanTitle,
            slug: topicSlug,
            description: cleanContent.slice(0, 180) || null,
            subjectId: subjectRecord.id,
          },
          update: {
            name: cleanTitle,
          },
        });

        const existingLesson = await prisma.lesson.findFirst({
          where: {
            subjectId: subjectRecord.id,
            title: cleanTitle,
            classroomId: null,
          },
        });

        if (existingLesson) {
          await prisma.lesson.update({
            where: { id: existingLesson.id },
            data: {
              content: cleanContent,
              videos: lesson.videos || [],
              references: lesson.references || [],
              topicId: topicRecord.id,
            },
          });
        } else {
          await prisma.lesson.create({
            data: {
              title: cleanTitle,
              content: cleanContent,
              videos: lesson.videos || [],
              references: lesson.references || [],
              subjectId: subjectRecord.id,
              topicId: topicRecord.id,
            },
          });
        }
        totalLessonsUpserted++;
      }
    }
  }

  console.log(
    `✅ [Etapa 1 Concluída] ${totalSubjectsUpserted} Matérias e ${totalLessonsUpserted} Lições sincronizadas via upsert!`
  );

  // =========================================================================
  // ETAPA 2: QUESTÕES, ENUNCIADOS, ALTERNATIVAS, TAXA DE ERRO E PARÂMETROS TRI
  // =========================================================================
  console.log("\n==================================================");
  console.log("📝 ETAPA 2: Importando Questões e Parâmetros TRI em Lotes...");
  console.log("==================================================");

  if (!fs.existsSync(questionsPath)) {
    throw new Error(`Arquivo não encontrado: ${questionsPath}`);
  }

  const rawQuestions: RawQuestionData[] = JSON.parse(
    fs.readFileSync(questionsPath, "utf-8")
  );

  console.log(`📄 Total de questões a processar: ${rawQuestions.length}`);

  const BATCH_SIZE = 25;
  let totalQuestionsProcessed = 0;

  for (let i = 0; i < rawQuestions.length; i += BATCH_SIZE) {
    const batch = rawQuestions.slice(i, i + BATCH_SIZE);

    await prisma.$transaction(async (tx) => {
      for (const q of batch) {
        const detectedSubjectName = classifyQuestionSubject(q.text, q.area);
        const resolvedArea = AREA_LABELS[q.area] || q.area || "Geral";

        // Parâmetros psicométricos reais da TRI via triService
        const rawErrorRate =
          q.errorRate !== null && q.errorRate !== undefined
            ? Number(q.errorRate)
            : 50.0;

        const triMetrics = triService.calculateQuestionWeight(rawErrorRate);

        const existingQuestion = await tx.question.findFirst({
          where: {
            year: q.year || 2015,
            text: q.text,
            correctAnswer: q.correctAnswer,
          },
        });

        if (existingQuestion) {
          await tx.question.update({
            where: { id: existingQuestion.id },
            data: {
              area: resolvedArea,
              subject: detectedSubjectName,
              difficulty: triMetrics.difficultyTier,
              errorRate: triMetrics.errorRate,
              options: q.options,
              explanation: q.explanation || "Resolução indisponível no momento.",
            },
          });
        } else {
          await tx.question.create({
            data: {
              year: q.year || 2015,
              area: resolvedArea,
              subject: detectedSubjectName,
              difficulty: triMetrics.difficultyTier,
              errorRate: triMetrics.errorRate,
              text: q.text,
              options: q.options,
              correctAnswer: q.correctAnswer,
              explanation: q.explanation || "Resolução indisponível no momento.",
            },
          });
        }
      }
    });

    totalQuestionsProcessed += batch.length;
    console.log(
      `   ⏳ Lote ${Math.floor(i / BATCH_SIZE) + 1} finalizado (${totalQuestionsProcessed}/${rawQuestions.length} questões)...`
    );
  }

  console.log(
    `✅ [Etapa 2 Concluída] ${totalQuestionsProcessed} Questões importadas e calibradas com métricas TRI!`
  );

  console.log("🔗 Sincronizando vínculos entre Matérias, Tópicos, Lições e Questões...");
  await questionService.ensureAllSubjectsSynchronized();
  console.log("✅ Vínculos entre Matérias, Tópicos, Lições e Questões sincronizados!");

  // =========================================================================
  // ETAPA 3: GERAÇÃO DAS TRILHAS DE ESTUDO INICIAIS
  // =========================================================================
  console.log("\n==================================================");
  console.log("🗺️  ETAPA 3: Gerando Trilhas de Estudo por Disciplina e Grandes Áreas...");
  console.log("==================================================");

  let totalTrailsCreated = 0;

  // 1. Trilhas Específicas por Matéria
  for (const subject of materiasData) {
    const subjectRecord = subjectMap.get(subject.slug);
    if (!subjectRecord) continue;

    const subjectLessons = await prisma.lesson.findMany({
      where: { subjectId: subjectRecord.id },
      select: { id: true },
      orderBy: { createdAt: "asc" },
    });

    const subjectQuestions = await prisma.question.findMany({
      where: {
        OR: [
          { subject: { equals: subject.name, mode: "insensitive" } },
          { subject: { equals: subject.slug, mode: "insensitive" } },
        ],
      },
      take: 12,
      select: { id: true },
      orderBy: { errorRate: "asc" },
    });

    const lessonIds = subjectLessons.map((l) => l.id);
    const questionIds = subjectQuestions.map((q) => q.id);
    const totalSteps = Math.max(lessonIds.length + questionIds.length, 1);
    const resolvedArea =
      SUBJECT_TO_AREA[subject.slug] || "Conhecimentos Gerais";

    const trailTitle = `Trilha Completa de ${subject.name}`;
    const trailDescription = `Trilha estruturada em ${subject.name} cobrindo conceitos essenciais, videoaulas, leitura aprofundada e questões de treino graduadas pela TRI do ENEM.`;

    const existingTrail = await prisma.trail.findFirst({
      where: { title: trailTitle },
    });

    if (existingTrail) {
      await prisma.trail.update({
        where: { id: existingTrail.id },
        data: {
          description: trailDescription,
          area: resolvedArea,
          subjectId: subjectRecord.id,
          lessonIds,
          questionIds,
          totalSteps,
        },
      });
    } else {
      await prisma.trail.create({
        data: {
          title: trailTitle,
          description: trailDescription,
          area: resolvedArea,
          subjectId: subjectRecord.id,
          lessonIds,
          questionIds,
          totalSteps,
        },
      });
    }
    totalTrailsCreated++;
  }

  // 2. Trilhas Integradas por Grande Área do ENEM
  const grandAreas = [
    {
      title: "Trilha Master: Ciências Humanas e suas Tecnologias",
      area: "Ciências Humanas",
      slugs: ["historia", "geografia", "filosofia", "sociologia"],
      description: "Preparação completa para o 1º dia do ENEM: História, Geografia, Filosofia e Sociologia com questões comentadas.",
    },
    {
      title: "Trilha Master: Ciências da Natureza e suas Tecnologias",
      area: "Ciências da Natureza",
      slugs: ["biologia", "quimica", "fisica"],
      description: "Domine Biologia, Química e Física para o 2º dia do ENEM com foco nos tópicos de maior incidência.",
    },
    {
      title: "Trilha Master: Linguagens, Códigos e suas Tecnologias",
      area: "Linguagens e Códigos",
      slugs: ["lingua-portuguesa", "literatura", "artes", "educacao-fisica", "ingles-ou-espanhou"],
      description: "Interpretação textual, gêneros literários, artes e gramática aplicada para elevar sua nota no ENEM.",
    },
    {
      title: "Trilha Master: Matemática e suas Tecnologias",
      area: "Matemática",
      slugs: ["matematica"],
      description: "Reta final de Matemática para atingir 800+ no ENEM: aritmética, funções, geometria e estatística.",
    },
  ];

  for (const grandArea of grandAreas) {
    const areaSubjects = await prisma.subject.findMany({
      where: { slug: { in: grandArea.slugs } },
      select: { id: true },
    });
    const areaSubjectIds = areaSubjects.map((s) => s.id);

    const areaLessons = await prisma.lesson.findMany({
      where: { subjectId: { in: areaSubjectIds } },
      take: 20,
      select: { id: true },
    });

    const areaQuestions = await prisma.question.findMany({
      where: { area: { equals: grandArea.area, mode: "insensitive" } },
      take: 20,
      select: { id: true },
      orderBy: { errorRate: "asc" },
    });

    const lessonIds = areaLessons.map((l) => l.id);
    const questionIds = areaQuestions.map((q) => q.id);
    const totalSteps = Math.max(lessonIds.length + questionIds.length, 1);

    const existingAreaTrail = await prisma.trail.findFirst({
      where: { title: grandArea.title },
    });

    if (existingAreaTrail) {
      await prisma.trail.update({
        where: { id: existingAreaTrail.id },
        data: {
          description: grandArea.description,
          area: grandArea.area,
          lessonIds,
          questionIds,
          totalSteps,
        },
      });
    } else {
      await prisma.trail.create({
        data: {
          title: grandArea.title,
          description: grandArea.description,
          area: grandArea.area,
          lessonIds,
          questionIds,
          totalSteps,
        },
      });
    }
    totalTrailsCreated++;
  }

  console.log(
    `✅ [Etapa 3 Concluída] ${totalTrailsCreated} Trilhas de Estudo criadas e associadas com sucesso!`
  );

  console.log("\n==================================================");
  console.log("🎉 SEED DO MINUTO ENEM FINALIZADO COM SUCESSO!");
  console.log("==================================================");
}

main()
  .catch((e) => {
    console.error("❌ [Seed Error] Erro crítico na execução do seed:\n", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

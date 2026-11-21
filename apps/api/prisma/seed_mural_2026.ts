import path from "path";
import dotenv from "dotenv";

if (!process.env.DATABASE_URL) {
  dotenv.config({ path: path.resolve(__dirname, "../.env") });
  dotenv.config({ path: path.resolve(__dirname, "../../.env") });
}
dotenv.config();

import { AnnouncementAudience } from "@prisma/client";
import { prisma } from "../src/lib/prisma";

const TITLE = "Tema da Redação ENEM 2026 — Prática na Oficina Nota 1000";
const CONTENT =
  "Atenção, estudantes e professores! Já está em destaque no nosso mural a proposta modelo sobre o tema da redação do ENEM 2026: \"Caminhos para combater a desinformação algorítmica e fortalecer a educação midiática no Brasil\".\n\n" +
  "• Alunos: revisem os repertórios socioculturais (Byung-Chul Han, Paulo Freire e Constituição Federal de 1988) e enviem sua folha manuscrita na Oficina Nota 1000 dentro da sua turma.\n" +
  "• Professores: acompanhem os envios pendentes para correção comentada nas 5 competências oficiais (0 a 1000 pontos).";

async function main() {
  let schools = await prisma.school.findMany({
    select: { id: true, name: true },
  });

  if (schools.length === 0) {
    const defaultSchool = await prisma.school.upsert({
      where: { code: "MINUTO-ENEM" },
      create: {
        name: "Rede Minuto ENEM",
        code: "MINUTO-ENEM",
        slug: "rede-minuto-enem",
        isActive: true,
      },
      update: {},
      select: { id: true, name: true },
    });
    schools = [defaultSchool];
  }

  let createdCount = 0;
  for (const school of schools) {
    const existing = await prisma.announcement.findFirst({
      where: {
        schoolId: school.id,
        title: TITLE,
      },
    });

    if (!existing) {
      await prisma.announcement.create({
        data: {
          schoolId: school.id,
          title: TITLE,
          content: CONTENT,
          targetAudience: AnnouncementAudience.ALL,
        },
      });
      createdCount++;
    }
  }

  console.log(
    `✅ Notícia do Tema da Redação ENEM 2026 publicada para ${schools.length} escola(s) (${createdCount} nova(s)).`
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

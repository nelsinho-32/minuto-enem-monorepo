import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, ".env") });
dotenv.config(); // fallback se estiver na raiz

import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "npx tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});

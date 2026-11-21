import { Router } from "express";
import { searchController } from "../controllers/search.controller";

const searchRoutes = Router();

// Busca Elástica Unificada (Conteúdo do Sistema, Minha Turma, Minhas Anotações e Questões ENEM)
searchRoutes.get("/elastic", (req, res) =>
  searchController.elasticSearch(req, res)
);

// Busca textual + filtros exatos de questões
searchRoutes.get("/", (req, res) =>
  searchController.searchQuestions(req, res)
);
searchRoutes.post("/", (req, res) =>
  searchController.searchQuestions(req, res)
);
searchRoutes.get("/questions", (req, res) =>
  searchController.searchQuestions(req, res)
);
searchRoutes.post("/questions", (req, res) =>
  searchController.searchQuestions(req, res)
);

export { searchRoutes };

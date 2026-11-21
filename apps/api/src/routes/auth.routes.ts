import { Router } from "express";
import { authController } from "../controllers/auth.controller";
import { auth } from "../middlewares/auth.middleware";
import { authRateLimiter } from "../middlewares/rate-limit.middleware";

const authRoutes = Router();

// ==========================================
// ROTAS PÚBLICAS DE CADASTRO E LOGIN
// ==========================================

// Cadastro de usuário (suporta /register, /signup e /users)
authRoutes.post("/register", authRateLimiter, (req, res) =>
  authController.register(req, res)
);
authRoutes.post("/signup", authRateLimiter, (req, res) =>
  authController.register(req, res)
);
authRoutes.post("/users", authRateLimiter, (req, res) =>
  authController.register(req, res)
);

// Login e sessão (suporta /login e /sessions)
authRoutes.post("/login", authRateLimiter, (req, res) =>
  authController.login(req, res)
);
authRoutes.post("/sessions", authRateLimiter, (req, res) =>
  authController.login(req, res)
);

// Renovação de sessão via Refresh Token
authRoutes.post("/refresh", authRateLimiter, (req, res) =>
  authController.refresh(req, res)
);
authRoutes.post("/refresh-token", authRateLimiter, (req, res) =>
  authController.refresh(req, res)
);

// ==========================================
// ROTAS PROTEGIDAS VIA MIDDLEWARE JWT
// ==========================================

// Perfil do usuário autenticado atual
authRoutes.get("/me", auth, (req, res) => authController.me(req, res));

// Atualização da meta universitária / SISU do aluno
authRoutes.patch("/goals", auth, (req, res) => authController.updateGoals(req, res));
authRoutes.patch("/me/goals", auth, (req, res) => authController.updateGoals(req, res));
authRoutes.post("/tri-history", auth, (req, res) => authController.appendTriHistory(req, res));

export { authRoutes };

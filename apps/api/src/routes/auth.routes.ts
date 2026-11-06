import { Router } from "express";
import { authController } from "../controllers/auth.controller";
import { auth } from "../middlewares/auth.middleware";

const authRoutes = Router();

// ==========================================
// ROTAS PÚBLICAS DE CADASTRO E LOGIN
// ==========================================

// Cadastro de usuário (suporta /register, /signup e /users)
authRoutes.post("/register", (req, res) => authController.register(req, res));
authRoutes.post("/signup", (req, res) => authController.register(req, res));
authRoutes.post("/users", (req, res) => authController.register(req, res));

// Login e sessão (suporta /login e /sessions)
authRoutes.post("/login", (req, res) => authController.login(req, res));
authRoutes.post("/sessions", (req, res) => authController.login(req, res));

// Renovação de sessão via Refresh Token
authRoutes.post("/refresh", (req, res) => authController.refresh(req, res));
authRoutes.post("/refresh-token", (req, res) => authController.refresh(req, res));

// ==========================================
// ROTAS PROTEGIDAS VIA MIDDLEWARE JWT
// ==========================================

// Perfil do usuário autenticado atual
authRoutes.get("/me", auth, (req, res) => authController.me(req, res));

export { authRoutes };

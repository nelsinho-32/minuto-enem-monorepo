import { Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma";

export interface SocketUserContext {
  id: string;
  name: string;
  email: string;
  role: string;
  schoolId?: string | null;
  isAuthenticated: boolean;
}

const JWT_SECRET = process.env.JWT_SECRET || "enem-super-secret-jwt-key-2026";

/**
 * Extrai o token JWT bruto do handshake do Socket.IO (auth, header Authorization ou query).
 */
export function extractSocketToken(socket: Socket): string | null {
  const raw =
    socket.handshake.auth?.token ||
    socket.handshake.headers?.authorization ||
    (typeof socket.handshake.query?.token === "string"
      ? socket.handshake.query.token
      : undefined);

  if (!raw || typeof raw !== "string") return null;

  const trimmed = raw.trim();
  if (
    !trimmed ||
    trimmed === "guest" ||
    trimmed === "null" ||
    trimmed === "undefined"
  ) {
    return null;
  }

  return trimmed.startsWith("Bearer ") ? trimmed.slice(7).trim() : trimmed;
}

/**
 * Middleware único de autenticação JWT para o Socket.IO.
 * - Valida token Access JWT (sub ou id), rejeitando tokens inválidos ou Refresh Tokens.
 * - Carrega o usuário real do PostgreSQL e vincula `socket.data.user`.
 * - Inscreve automaticamente o socket autenticado no canal pessoal `user:<id>`.
 * - Permite sessão convidada anônima (apenas se nenhum token foi enviado e SOCKET_ALLOW_GUEST !== "false"),
 *   com `isAuthenticated: false` para que módulos restritos como o Chat bloqueiem acessos não autenticados.
 */
export async function socketAuthMiddleware(
  socket: Socket,
  next: (err?: Error) => void
): Promise<void> {
  try {
    const token = extractSocketToken(socket);

    if (!token) {
      if (process.env.SOCKET_ALLOW_GUEST === "false") {
        return next(new Error("Autenticação WebSocket obrigatória."));
      }

      const requestedGuestId =
        typeof socket.handshake.auth?.userId === "string" &&
        socket.handshake.auth.userId !== "guest"
          ? socket.handshake.auth.userId
          : `guest_${socket.id.slice(0, 6)}`;

      const guestName =
        typeof socket.handshake.auth?.userName === "string" &&
        socket.handshake.auth.userName.trim()
          ? socket.handshake.auth.userName.trim()
          : "Estudante";

      socket.data.user = {
        id: requestedGuestId.startsWith("guest_")
          ? requestedGuestId
          : `guest_${requestedGuestId}`,
        name: guestName,
        email: `${requestedGuestId}@minutoenem.local`,
        role: "STUDENT",
        schoolId: null,
        isAuthenticated: false,
      } satisfies SocketUserContext;

      return next();
    }

    let decoded: {
      sub?: string;
      id?: string;
      email?: string;
      role?: string;
      type?: string;
    };

    try {
      decoded = jwt.verify(token, JWT_SECRET) as typeof decoded;
    } catch {
      return next(new Error("Token WebSocket inválido ou expirado."));
    }

    if (decoded.type && decoded.type !== "access") {
      return next(new Error("Utilize um Access Token válido no WebSocket."));
    }

    const userId = decoded.sub || decoded.id;
    if (!userId) {
      return next(new Error("Payload JWT sem identificador de usuário."));
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        schoolId: true,
      },
    });

    if (!user) {
      return next(new Error("Usuário do token WebSocket não encontrado."));
    }

    socket.data.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      schoolId: user.schoolId ?? null,
      isAuthenticated: true,
    } satisfies SocketUserContext;

    // Canal pessoal para futuras notificações em tempo real
    socket.join(`user:${user.id}`);

    return next();
  } catch (err: any) {
    console.warn(
      `⚠️ [Socket.io Auth] Falha no handshake ${socket.id}: ${err?.message || err}`
    );
    return next(new Error("Falha ao autenticar conexão em tempo real."));
  }
}

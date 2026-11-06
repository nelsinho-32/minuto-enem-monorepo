import {
  CreateNoteInputSchema,
  UpdateNoteInputSchema,
  type CreateNoteInput,
  type UpdateNoteInput,
} from "@minuto-enem/shared";
import { prisma } from "../lib/prisma";
import { AppError } from "../errors/AppError";

export {
  CreateNoteInputSchema,
  UpdateNoteInputSchema,
  type CreateNoteInput,
  type UpdateNoteInput,
} from "@minuto-enem/shared";

export class NoteService {
  /**
   * Lista as anotações do usuário, com suporte a filtro por aula e busca textual.
   */
  async listByUser(userId?: string, lessonId?: string, search?: string) {
    return prisma.note.findMany({
      where: {
        ...(userId ? { userId } : {}),
        ...(lessonId ? { lessonId } : {}),
        ...(search
          ? {
              OR: [
                { title: { contains: search, mode: "insensitive" } },
                { content: { contains: search, mode: "insensitive" } },
                { tags: { has: search.toLowerCase() } },
              ],
            }
          : {}),
      },
      include: {
        lesson: {
          select: { id: true, title: true, subjectId: true },
        },
      },
      orderBy: { updatedAt: "desc" },
    });
  }

  /**
   * Busca uma anotação por ID garantindo a privacidade do aluno.
   */
  async getById(id: string, userId?: string) {
    const note = await prisma.note.findUnique({
      where: { id },
      include: {
        lesson: {
          select: { id: true, title: true, subjectId: true },
        },
      },
    });

    if (!note) {
      throw new AppError("Anotação não encontrada.", 404);
    }

    if (userId && note.userId !== userId) {
      throw new AppError(
        "Acesso negado. Esta anotação pertence a outro usuário.",
        403
      );
    }

    return note;
  }

  /**
   * Cria uma nova anotação pessoal de estudo.
   */
  async create(data: CreateNoteInput) {
    const validatedData = CreateNoteInputSchema.parse(data);
    const { userId, title, content, tags = [], lessonId } = validatedData;

    if (!userId) {
      throw new AppError("O ID do usuário (userId) é obrigatório.", 400);
    }

    return prisma.note.create({
      data: {
        userId,
        title: title.trim(),
        content: content.trim(),
        tags: Array.isArray(tags)
          ? tags.map((t) => t.trim().toLowerCase())
          : [],
        lessonId: lessonId || null,
      },
      include: {
        lesson: {
          select: { id: true, title: true },
        },
      },
    });
  }

  /**
   * Atualiza uma anotação existente assegurando que o autor seja o solicitante.
   */
  async update(id: string, data: UpdateNoteInput, userId?: string) {
    const existing = await this.getById(id, userId);

    return prisma.note.update({
      where: { id: existing.id },
      data: {
        ...(data.title !== undefined ? { title: data.title.trim() } : {}),
        ...(data.content !== undefined
          ? { content: data.content.trim() }
          : {}),
        ...(data.tags !== undefined
          ? { tags: data.tags.map((t) => t.trim().toLowerCase()) }
          : {}),
        ...(data.lessonId !== undefined ? { lessonId: data.lessonId } : {}),
      },
      include: {
        lesson: {
          select: { id: true, title: true },
        },
      },
    });
  }

  /**
   * Exclui uma anotação pessoal.
   */
  async delete(id: string, userId?: string) {
    const existing = await this.getById(id, userId);

    await prisma.note.delete({
      where: { id: existing.id },
    });

    return { message: "Anotação excluída com sucesso." };
  }
}

export const noteService = new NoteService();

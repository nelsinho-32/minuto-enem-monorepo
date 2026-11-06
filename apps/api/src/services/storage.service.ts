import fs from "fs";
import path from "path";
import crypto from "crypto";
import { AppError } from "../errors/AppError";

export interface StoredFile {
  fileUrl: string;
  originalName: string;
  size: number;
  mimeType: string;
  fileName: string;
}

export interface StorageSaveOptions {
  subfolder?: string;
  allowedExtensions?: string[];
  maxSizeBytes?: number;
}

/**
 * Contrato de serviço de armazenamento de arquivos (StorageService).
 * Desacoplado para suportar facilmente Local Disk, AWS S3 ou Supabase Storage.
 */
export interface IStorageService {
  saveFile(
    file: Express.Multer.File,
    subfolderOrOptions?: string | StorageSaveOptions
  ): Promise<StoredFile>;
  deleteFile(fileUrlOrPath: string): Promise<boolean>;
  getPublicUrl(fileName: string, subfolder?: string): string;
}

/**
 * Implementação local para salvar arquivos na pasta de uploads do servidor
 */
export class LocalStorageService implements IStorageService {
  private baseDir: string;
  private publicPrefix: string;

  constructor(
    baseDir: string = path.resolve(process.cwd(), "uploads"),
    publicPrefix: string = "/uploads"
  ) {
    this.baseDir = baseDir;
    this.publicPrefix = publicPrefix;
    this.ensureBaseDirectory();
  }

  private ensureBaseDirectory(): void {
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  /**
   * Salva o arquivo enviado no disco local dentro do subdiretório indicado (padrão: "pdfs")
   * com um nome único gerado por UUID.
   */
  async saveFile(
    file: Express.Multer.File,
    subfolderOrOptions: string | StorageSaveOptions = "pdfs"
  ): Promise<StoredFile> {
    if (!file) {
      throw new AppError("Nenhum arquivo recebido para armazenamento.", 400);
    }

    const options: StorageSaveOptions =
      typeof subfolderOrOptions === "string"
        ? { subfolder: subfolderOrOptions }
        : subfolderOrOptions;

    const subfolder = (options.subfolder || "pdfs").replace(/^\/+|\/+$/g, "");
    const targetDir = path.join(this.baseDir, subfolder);

    // Garante que o subdiretório exista
    await fs.promises.mkdir(targetDir, { recursive: true });

    // Determina extensão do arquivo
    let ext = path.extname(file.originalname).toLowerCase();
    if (!ext && file.mimetype === "application/pdf") {
      ext = ".pdf";
    }

    if (options.allowedExtensions && options.allowedExtensions.length > 0) {
      const isAllowed = options.allowedExtensions.some(
        (allowed) => allowed.toLowerCase() === ext
      );
      if (!isAllowed) {
        throw new AppError(
          `Formato de arquivo não permitido (${ext}). Formatos aceitos: ${options.allowedExtensions.join(", ")}`,
          400
        );
      }
    }

    // Gera nome único com UUID v4
    const uniqueFileName = `${crypto.randomUUID()}${ext}`;
    const destinationPath = path.join(targetDir, uniqueFileName);

    // Escreve buffer na pasta local ou move arquivo temporário caso diskStorage tenha sido utilizado
    if (file.buffer) {
      await fs.promises.writeFile(destinationPath, file.buffer);
    } else if (file.path) {
      await fs.promises.copyFile(file.path, destinationPath);
      // Remove arquivo temporário se aplicável
      try {
        await fs.promises.unlink(file.path);
      } catch {
        // Ignora erro ao limpar temporário
      }
    } else {
      throw new AppError(
        "Estrutura do arquivo inválida: buffer ou caminho temporário não encontrado.",
        400
      );
    }

    const publicUrl = this.getPublicUrl(uniqueFileName, subfolder);

    return {
      fileUrl: publicUrl,
      originalName: file.originalname,
      size: file.size,
      mimeType: file.mimetype || "application/pdf",
      fileName: uniqueFileName,
    };
  }

  /**
   * Remove um arquivo salvo a partir de sua URL pública ou caminho relativo.
   */
  async deleteFile(fileUrlOrPath: string): Promise<boolean> {
    try {
      if (!fileUrlOrPath) return false;

      let relativePath = fileUrlOrPath;
      if (relativePath.startsWith(this.publicPrefix)) {
        relativePath = relativePath.slice(this.publicPrefix.length);
      }
      relativePath = relativePath.replace(/^\/+/, "");

      const absolutePath = path.join(this.baseDir, relativePath);
      if (fs.existsSync(absolutePath)) {
        await fs.promises.unlink(absolutePath);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Retorna a URL pública relativa do arquivo para consumo pelo front-end
   */
  getPublicUrl(fileName: string, subfolder: string = "pdfs"): string {
    const cleanSub = subfolder.replace(/^\/+|\/+$/g, "");
    return `${this.publicPrefix}/${cleanSub}/${fileName}`;
  }
}

/**
 * Fábrica para instanciar o serviço de Storage apropriado.
 * Permite alternar facilmente entre Local, AWS S3 ou Supabase Storage via variável de ambiente.
 */
export function createStorageService(): IStorageService {
  const provider = (process.env.STORAGE_PROVIDER || "local").toLowerCase();

  switch (provider) {
    case "local":
    default:
      return new LocalStorageService();
  }
}

export const storageService = createStorageService();


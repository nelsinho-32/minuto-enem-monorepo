import fs from "fs";
import path from "path";
import crypto from "crypto";
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
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

export type StorageProviderType = "local" | "s3" | "r2" | "supabase" | "minio";

/**
 * Contrato de serviço de armazenamento de arquivos (StorageService).
 * Desacoplado para suportar Local Disk, AWS S3, Cloudflare R2, MinIO ou Supabase Storage.
 */
export interface IStorageService {
  saveFile(
    file: Express.Multer.File,
    subfolderOrOptions?: string | StorageSaveOptions
  ): Promise<StoredFile>;
  deleteFile(fileUrlOrPath: string): Promise<boolean>;
  getPublicUrl(fileName: string, subfolder?: string): string;
}

interface PreparedUploadFile {
  buffer: Buffer;
  uniqueFileName: string;
  subfolder: string;
  mimeType: string;
  originalName: string;
  size: number;
  tempFilePath?: string;
}

/**
 * Normaliza opções, valida extensão/tamanho e extrai o Buffer do arquivo enviado via Multer.
 */
async function prepareUploadFile(
  file: Express.Multer.File,
  subfolderOrOptions: string | StorageSaveOptions = "pdfs"
): Promise<PreparedUploadFile> {
  if (!file) {
    throw new AppError("Nenhum arquivo recebido para armazenamento.", 400);
  }

  const options: StorageSaveOptions =
    typeof subfolderOrOptions === "string"
      ? { subfolder: subfolderOrOptions }
      : subfolderOrOptions;

  const subfolder = (options.subfolder || "pdfs").replace(/^\/+|\/+$/g, "");

  if (options.maxSizeBytes && file.size > options.maxSizeBytes) {
    const maxMb = (options.maxSizeBytes / (1024 * 1024)).toFixed(1);
    throw new AppError(
      `Arquivo excede o limite máximo permitido de ${maxMb} MB.`,
      400
    );
  }

  let ext = path.extname(file.originalname).toLowerCase();
  if (!ext) {
    if (file.mimetype === "application/pdf") ext = ".pdf";
    else if (file.mimetype === "image/png") ext = ".png";
    else if (file.mimetype === "image/webp") ext = ".webp";
    else if (file.mimetype?.startsWith("image/")) ext = ".jpg";
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

  let buffer: Buffer;
  if (file.buffer) {
    buffer = file.buffer;
  } else if (file.path) {
    buffer = await fs.promises.readFile(file.path);
  } else {
    throw new AppError(
      "Estrutura do arquivo inválida: buffer ou caminho temporário não encontrado.",
      400
    );
  }

  return {
    buffer,
    uniqueFileName: `${crypto.randomUUID()}${ext}`,
    subfolder,
    mimeType: file.mimetype || "application/octet-stream",
    originalName: file.originalname,
    size: file.size || buffer.length,
    tempFilePath: file.path,
  };
}

async function cleanupTempFile(tempFilePath?: string): Promise<void> {
  if (!tempFilePath) return;
  try {
    await fs.promises.unlink(tempFilePath);
  } catch {
    // Ignora falha ao remover arquivo temporário
  }
}

/**
 * Implementação local para salvar arquivos na pasta `uploads/` do servidor.
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
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  async saveFile(
    file: Express.Multer.File,
    subfolderOrOptions: string | StorageSaveOptions = "pdfs"
  ): Promise<StoredFile> {
    const prepared = await prepareUploadFile(file, subfolderOrOptions);
    const targetDir = path.join(this.baseDir, prepared.subfolder);
    await fs.promises.mkdir(targetDir, { recursive: true });

    const destinationPath = path.join(targetDir, prepared.uniqueFileName);
    await fs.promises.writeFile(destinationPath, prepared.buffer);
    await cleanupTempFile(prepared.tempFilePath);

    return {
      fileUrl: this.getPublicUrl(prepared.uniqueFileName, prepared.subfolder),
      originalName: prepared.originalName,
      size: prepared.size,
      mimeType: prepared.mimeType,
      fileName: prepared.uniqueFileName,
    };
  }

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

  getPublicUrl(fileName: string, subfolder: string = "pdfs"): string {
    const cleanSub = subfolder.replace(/^\/+|\/+$/g, "");
    return `${this.publicPrefix}/${cleanSub}/${fileName}`;
  }
}

export interface S3StorageConfig {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint?: string;
  publicBaseUrl?: string;
  forcePathStyle?: boolean;
}

/**
 * Implementação em Nuvem compatível com AWS S3, Cloudflare R2, MinIO e Supabase Storage (S3 API).
 * Ativada automaticamente quando `STORAGE_PROVIDER=s3` (ou `r2` / `supabase` / `minio`) e as credenciais estiverem definidas.
 */
export class S3StorageService implements IStorageService {
  private client: S3Client;
  private bucket: string;
  private region: string;
  private endpoint?: string;
  private publicBaseUrl?: string;

  constructor(config: S3StorageConfig) {
    this.bucket = config.bucket;
    this.region = config.region;
    this.endpoint = config.endpoint?.replace(/\/+$/, "");
    this.publicBaseUrl = config.publicBaseUrl?.replace(/\/+$/, "");

    this.client = new S3Client({
      region: this.region,
      ...(this.endpoint ? { endpoint: this.endpoint } : {}),
      forcePathStyle:
        config.forcePathStyle !== undefined
          ? config.forcePathStyle
          : Boolean(this.endpoint),
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async saveFile(
    file: Express.Multer.File,
    subfolderOrOptions: string | StorageSaveOptions = "pdfs"
  ): Promise<StoredFile> {
    const prepared = await prepareUploadFile(file, subfolderOrOptions);
    const objectKey = `${prepared.subfolder}/${prepared.uniqueFileName}`;

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
        Body: prepared.buffer,
        ContentType: prepared.mimeType,
        CacheControl: "public, max-age=31536000, immutable",
      })
    );

    await cleanupTempFile(prepared.tempFilePath);

    return {
      fileUrl: this.getPublicUrl(prepared.uniqueFileName, prepared.subfolder),
      originalName: prepared.originalName,
      size: prepared.size,
      mimeType: prepared.mimeType,
      fileName: prepared.uniqueFileName,
    };
  }

  private extractObjectKey(fileUrlOrPath: string): string | null {
    if (!fileUrlOrPath) return null;
    const clean = fileUrlOrPath.trim();

    if (this.publicBaseUrl && clean.startsWith(this.publicBaseUrl)) {
      return clean.slice(this.publicBaseUrl.length).replace(/^\/+/, "");
    }

    if (clean.startsWith("http://") || clean.startsWith("https://")) {
      try {
        const parsed = new URL(clean);
        let pathname = parsed.pathname.replace(/^\/+/, "");
        if (pathname.startsWith(`${this.bucket}/`)) {
          pathname = pathname.slice(this.bucket.length + 1);
        }
        return pathname || null;
      } catch {
        return null;
      }
    }

    return clean.replace(/^\/+/, "");
  }

  async deleteFile(fileUrlOrPath: string): Promise<boolean> {
    try {
      const key = this.extractObjectKey(fileUrlOrPath);
      if (!key) return false;

      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: key,
        })
      );
      return true;
    } catch {
      return false;
    }
  }

  getPublicUrl(fileName: string, subfolder: string = "pdfs"): string {
    const cleanSub = subfolder.replace(/^\/+|\/+$/g, "");
    const key = `${cleanSub}/${fileName}`;

    if (this.publicBaseUrl) {
      return `${this.publicBaseUrl}/${key}`;
    }

    if (this.endpoint) {
      return `${this.endpoint}/${this.bucket}/${key}`;
    }

    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
  }
}

let activeProviderName: StorageProviderType = "local";

export function getActiveStorageProviderName(): StorageProviderType {
  return activeProviderName;
}

/**
 * Fábrica para instanciar o serviço de Storage apropriado.
 * Suporta `local` (padrão) e provedores S3-compatíveis (`s3`, `r2`, `supabase`, `minio`).
 * Faz fallback seguro para `LocalStorageService` se faltarem credenciais em ambiente local.
 */
export function createStorageService(): IStorageService {
  const rawProvider = (process.env.STORAGE_PROVIDER || "local").toLowerCase();

  if (["s3", "r2", "supabase", "minio"].includes(rawProvider)) {
    const bucket = process.env.S3_BUCKET?.trim();
    const accessKeyId = process.env.S3_ACCESS_KEY_ID?.trim();
    const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY?.trim();

    if (bucket && accessKeyId && secretAccessKey) {
      activeProviderName = rawProvider as StorageProviderType;
      return new S3StorageService({
        bucket,
        region: process.env.S3_REGION?.trim() || (rawProvider === "r2" ? "auto" : "us-east-1"),
        accessKeyId,
        secretAccessKey,
        endpoint: process.env.S3_ENDPOINT?.trim() || undefined,
        publicBaseUrl: process.env.S3_PUBLIC_URL?.trim() || undefined,
        forcePathStyle:
          process.env.S3_FORCE_PATH_STYLE !== undefined
            ? process.env.S3_FORCE_PATH_STYLE === "true"
            : undefined,
      });
    }

    console.warn(
      `⚠️ [StorageService] STORAGE_PROVIDER="${rawProvider}" configurado, porém faltam variáveis (S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY). Usando LocalStorageService como fallback seguro.`
    );
  }

  activeProviderName = "local";
  return new LocalStorageService();
}

export const storageService = createStorageService();

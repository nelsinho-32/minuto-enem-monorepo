import { Request, Response, NextFunction } from "express";
import multer from "multer";
import { AppError } from "../errors/AppError";

const MAX_PDF_SIZE_BYTES = 15 * 1024 * 1024; // 15MB

/**
 * Validador de formato: aceita estritamente arquivos com extensão .pdf ou MIME application/pdf
 */
const pdfFileFilter: multer.Options["fileFilter"] = (
  _req: Request,
  file: Express.Multer.File,
  callback: multer.FileFilterCallback
) => {
  const isPdfMime =
    file.mimetype === "application/pdf" ||
    file.mimetype === "application/x-pdf" ||
    file.mimetype === "application/acrobat" ||
    file.mimetype === "applications/vnd.pdf";

  const isPdfExt = file.originalname.toLowerCase().endsWith(".pdf");

  if (isPdfMime || isPdfExt) {
    callback(null, true);
  } else {
    callback(
      new AppError(
        "Formato de arquivo inválido. Apenas arquivos PDF (.pdf) são permitidos.",
        400
      )
    );
  }
};

/**
 * Configuração do multer com armazenamento em memória (para desacoplamento total via StorageService)
 * e limite de 15MB por arquivo.
 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_PDF_SIZE_BYTES,
  },
  fileFilter: pdfFileFilter,
});

const uploadFields = upload.fields([
  { name: "file", maxCount: 1 },
  { name: "pdf", maxCount: 1 },
]);

/**
 * Middleware para upload de arquivo PDF de material de turma.
 * Aceita o arquivo nos campos 'file' ou 'pdf'.
 */
export function uploadPdfMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  uploadFields(req, res, (err: any) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return next(
            new AppError(
              "O arquivo PDF excede o limite máximo permitido de 15MB.",
              400
            )
          );
        }
        return next(
          new AppError(`Erro no processamento do arquivo: ${err.message}`, 400)
        );
      }
      return next(err);
    }

    // Normaliza req.file a partir dos campos configurados
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    if (files) {
      if (files["file"] && files["file"].length > 0) {
        req.file = files["file"][0];
      } else if (files["pdf"] && files["pdf"].length > 0) {
        req.file = files["pdf"][0];
      }
    }

    if (!req.file) {
      return next(
        new AppError(
          "Nenhum arquivo PDF foi enviado. Envie o documento no campo 'file' ou 'pdf'.",
          400
        )
      );
    }

    next();
  });
}


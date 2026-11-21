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

/**
 * Validador de formato para fotos de redação (JPG, PNG, WEBP, HEIC)
 */
const essayImageFileFilter: multer.Options["fileFilter"] = (
  _req: Request,
  file: Express.Multer.File,
  callback: multer.FileFilterCallback
) => {
  const isImageMime =
    file.mimetype.startsWith("image/") ||
    file.mimetype === "application/octet-stream";

  const lowerName = file.originalname.toLowerCase();
  const isImageExt =
    lowerName.endsWith(".jpg") ||
    lowerName.endsWith(".jpeg") ||
    lowerName.endsWith(".png") ||
    lowerName.endsWith(".webp") ||
    lowerName.endsWith(".heic") ||
    lowerName.endsWith(".heif");

  if (isImageMime || isImageExt) {
    callback(null, true);
  } else {
    callback(
      new AppError(
        "Formato de imagem inválido. Envie uma foto da redação em formato JPG, PNG, WEBP ou HEIC.",
        400
      )
    );
  }
};

const uploadEssayMulter = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024, // 15MB
  },
  fileFilter: essayImageFileFilter,
});

const uploadEssayFields = uploadEssayMulter.fields([
  { name: "file", maxCount: 1 },
  { name: "image", maxCount: 1 },
  { name: "photo", maxCount: 1 },
  { name: "essay", maxCount: 1 },
]);

/**
 * Middleware para upload de foto da folha de redação (Oficina Nota 1000).
 * Aceita a imagem nos campos 'file', 'image', 'photo' ou 'essay'.
 */
export function uploadEssayImageMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  uploadEssayFields(req, res, (err: any) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") {
          return next(
            new AppError(
              "A foto da redação excede o limite máximo permitido de 15MB.",
              400
            )
          );
        }
        return next(
          new AppError(`Erro no processamento da imagem: ${err.message}`, 400)
        );
      }
      return next(err);
    }

    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    if (files) {
      if (files["file"] && files["file"].length > 0) {
        req.file = files["file"][0];
      } else if (files["image"] && files["image"].length > 0) {
        req.file = files["image"][0];
      } else if (files["photo"] && files["photo"].length > 0) {
        req.file = files["photo"][0];
      } else if (files["essay"] && files["essay"].length > 0) {
        req.file = files["essay"][0];
      }
    }

    // Se a imagem já foi enviada via URL em req.body.imageUrl, permite continuar
    if (!req.file && (!req.body?.imageUrl || typeof req.body.imageUrl !== "string")) {
      return next(
        new AppError(
          "Nenhuma imagem enviada. Anexe uma foto da redação nos campos 'file', 'image' ou envie a 'imageUrl'.",
          400
        )
      );
    }

    next();
  });
}

const MAX_AUDIO_SIZE_BYTES = 8 * 1024 * 1024; // 8MB

const audioFileFilter: multer.Options["fileFilter"] = (
  _req: Request,
  file: Express.Multer.File,
  callback: multer.FileFilterCallback
) => {
  const mime = (file.mimetype || "").toLowerCase();
  const name = (file.originalname || "").toLowerCase();
  const validExt = [".webm", ".mp3", ".m4a", ".wav", ".ogg", ".aac", ".mp4"].some((ext) =>
    name.endsWith(ext)
  );
  if (mime.startsWith("audio/") || mime === "video/webm" || validExt) {
    callback(null, true);
  } else {
    callback(
      new AppError(
        "Formato de áudio inválido. Utilize WEBM, MP3, M4A, WAV ou OGG.",
        400
      )
    );
  }
};

const uploadAudioMulter = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AUDIO_SIZE_BYTES },
  fileFilter: audioFileFilter,
});

const uploadAudioFields = uploadAudioMulter.fields([
  { name: "audio", maxCount: 1 },
  { name: "file", maxCount: 1 },
]);

/**
 * Middleware opcional para upload de áudio em devolutivas por questão.
 * Se a requisição for JSON sem multipart, segue normalmente.
 */
export function uploadOptionalAudioMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const contentType = req.headers["content-type"] || "";
  if (!contentType.includes("multipart/form-data")) {
    return next();
  }

  uploadAudioFields(req, res, (err: any) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
        return next(new AppError("O arquivo de áudio excede o limite de 8MB.", 400));
      }
      return next(err);
    }

    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    if (files?.["audio"]?.[0]) {
      req.file = files["audio"][0];
    } else if (files?.["file"]?.[0]) {
      req.file = files["file"][0];
    }

    next();
  });
}


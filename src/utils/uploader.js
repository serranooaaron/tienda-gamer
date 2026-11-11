import crypto from "node:crypto";
import fs from "node:fs";
import { open, unlink } from "node:fs/promises";
import path from "node:path";
import multer from "multer";
import __dirname from "../../dirname.js";

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const UPLOADS_URL = "/image/uploads";

// Formatos aceptados y la firma con la que empieza cada archivo de ese tipo.
const IMAGE_TYPES = {
  "image/png": { ext: "png", matches: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  "image/jpeg": { ext: "jpg", matches: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  "image/webp": { ext: "webp", matches: (b) => b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP" },
};

// En los tests se usa una carpeta temporal para no dejar archivos en public/.
const uploadsDir = () => process.env.UPLOAD_DIR || path.join(__dirname, "public", "image", "uploads");

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const dir = uploadsDir();
    fs.mkdir(dir, { recursive: true }, (error) => cb(error, dir));
  },
  // Nombre aleatorio con la extensión del tipo real: el nombre que manda el navegador no se usa nunca.
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${IMAGE_TYPES[file.mimetype].ext}`),
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 0 },
  fileFilter: (_req, file, cb) => {
    if (IMAGE_TYPES[file.mimetype]) return cb(null, true);
    const error = new Error("Solo se aceptan imágenes PNG, JPG o WebP");
    error.status = 400;
    return cb(error);
  },
}).single("image");

// El tipo que declara el navegador se puede falsear: se confirma leyendo los primeros bytes.
const hasValidSignature = async (file) => {
  const handle = await open(file.path, "r");
  try {
    const { buffer, bytesRead } = await handle.read(Buffer.alloc(12), 0, 12, 0);
    return bytesRead === 12 && IMAGE_TYPES[file.mimetype].matches(buffer);
  } finally {
    await handle.close();
  }
};

const uploadErrorMessage = (error) => {
  if (error instanceof multer.MulterError) {
    return error.code === "LIMIT_FILE_SIZE" ? "La imagen no puede superar 2 MB" : "Envía una sola imagen en el campo \"image\"";
  }
  return error.status === 400 ? error.message : null;
};

// Middleware: recibe la imagen, la valida y deja en req.imageUrl su dirección pública.
export const uploadProductImage = (req, res, next) => {
  upload(req, res, async (error) => {
    if (error) {
      const message = uploadErrorMessage(error);
      if (!message) return res.status(500).json({ status: "error", message: "No fue posible guardar la imagen" });
      return res.status(400).json({ status: "error", message });
    }
    if (!req.file) return res.status(400).json({ status: "error", message: "Elige una imagen para subir" });

    try {
      if (!(await hasValidSignature(req.file))) {
        await unlink(req.file.path).catch(() => {});
        return res.status(400).json({ status: "error", message: "El archivo no es una imagen válida" });
      }
    } catch {
      await unlink(req.file.path).catch(() => {});
      return res.status(500).json({ status: "error", message: "No fue posible guardar la imagen" });
    }

    req.imageUrl = `${UPLOADS_URL}/${req.file.filename}`;
    return next();
  });
};

// Imágenes subidas desde el panel, para ofrecerlas en el selector junto a las de fábrica.
export const listUploadedImages = async () => {
  const files = await fs.promises.readdir(uploadsDir()).catch(() => []);
  return files.filter((file) => /\.(png|jpe?g|webp)$/i.test(file)).sort().reverse().map((file) => `${UPLOADS_URL}/${file}`);
};

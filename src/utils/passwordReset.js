// "Olvidé mi contraseña": tokens de un solo uso que vencen a los 30 minutos.
// El token viaja solo en el link del email; en la base queda su hash SHA-256.
import crypto from "node:crypto";
import mongoose from "mongoose";
import PasswordReset from "../models/passwordReset.model.js";
import { appUrl, escapeHtml, mailer } from "./mailer.js";

export const RESET_MINUTES = 30;
const TOKEN_FORMAT = /^[A-Za-z0-9_-]{43}$/;

const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");

// Crea un pedido nuevo (borrando los anteriores de esa cuenta) y envía el email.
export const sendResetEmail = async (user) => {
  const base = appUrl();
  if (!base) throw new Error("Falta APP_URL: no se puede armar el link de recuperación");
  const token = crypto.randomBytes(32).toString("base64url");
  await PasswordReset.deleteMany({ user: user._id });
  await PasswordReset.create({
    user: user._id,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + RESET_MINUTES * 60 * 1000),
  });

  const link = `${base}/restablecer?token=${token}`;
  const greeting = `Hola, ${user.first_name}:`;
  await mailer.send({
    to: user.email,
    name: `${user.first_name} ${user.last_name}`,
    subject: "Crear una contraseña nueva · Tienda Gamer",
    text: `${greeting}\n\nPediste crear una contraseña nueva. Entra a este link (vence en ${RESET_MINUTES} minutos y sirve una sola vez):\n${link}\n\nSi no fuiste tú, ignora este email: tu contraseña no cambia.`,
    html: `<p>${escapeHtml(greeting)}</p><p>Pediste crear una contraseña nueva. El link vence en ${RESET_MINUTES} minutos y sirve una sola vez.</p><p><a href="${escapeHtml(link)}">Crear una contraseña nueva</a></p><p>Si no fuiste tú, ignora este email: tu contraseña no cambia.</p>`,
  });
};

// El $gt es nuestro (sanitizeFilter lo trataría como texto): el valor es una fecha del servidor.
const validFilter = (token) => ({ tokenHash: hashToken(token), expiresAt: mongoose.trusted({ $gt: new Date() }) });

// Pedido vigente para un token, o null. No lo consume: sirve para mostrar el formulario.
export const findValidReset = async (token) => {
  if (typeof token !== "string" || !TOKEN_FORMAT.test(token)) return null;
  return PasswordReset.findOne(validFilter(token)).lean();
};

// Consume el pedido en una sola operación: de dos usos simultáneos del mismo link, gana uno.
export const consumeReset = async (token) => {
  if (typeof token !== "string" || !TOKEN_FORMAT.test(token)) return null;
  return PasswordReset.findOneAndDelete(validFilter(token)).lean();
};

export const clearResets = (userId) => PasswordReset.deleteMany({ user: userId });

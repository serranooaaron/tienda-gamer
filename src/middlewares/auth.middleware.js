import mongoose from "mongoose";
import { COOKIE_NAME, verifyToken } from "../utils/auth.js";
import RevokedToken from "../models/revokedToken.model.js";
import User from "../models/user.model.js";

const readToken = (token) => {
  try {
    return verifyToken(token);
  } catch {
    return null;
  }
};

// Cuenta del token, o null si ya no existe o si su versión de sesión cambió
// (la contraseña se recuperó después de firmar el token).
const currentAccount = async (payload) => {
  if (!payload || !mongoose.Types.ObjectId.isValid(payload.id)) return null;
  const user = await User.findById(payload.id).select("role sessionVersion").lean();
  if (!user || (user.sessionVersion ?? 0) !== (payload.sv ?? 0)) return null;
  return user;
};

// Lee la cookie en cada request y deja el usuario disponible para rutas y vistas.
// Un token vencido, alterado, de una sesión ya cerrada o anterior a recuperar la contraseña
// no cuenta como sesión. El rol sale de la base: quitar el rol de administrador corta el acceso al instante.
export const attachUser = async (req, res, next) => {
  try {
    const token = req.cookies?.[COOKIE_NAME];
    if (token) {
      const payload = readToken(token);
      const revoked = payload?.jti ? await RevokedToken.exists({ jti: payload.jti }) : false;
      const account = revoked ? null : await currentAccount(payload);
      if (account) req.user = { ...payload, role: account.role };
      else res.clearCookie(COOKIE_NAME);
    }
    res.locals.user = req.user || null;
    res.locals.isAdmin = req.user?.role === "admin";
    next();
  } catch (error) {
    next(error);
  }
};

const wantsHtml = (req) => !req.originalUrl.startsWith("/api/");

export const requireAuth = (req, res, next) => {
  if (req.user) return next();
  if (wantsHtml(req)) {
    return res.redirect(`/login?next=${encodeURIComponent(req.originalUrl)}`);
  }
  return res.status(401).json({ status: "error", message: "Debes iniciar sesion" });
};

export const requireRole = (role) => (req, res, next) => {
  if (!req.user) return requireAuth(req, res, next);
  if (req.user.role === role) return next();
  if (wantsHtml(req)) return res.status(403).render("error", { code: 403, message: "No tienes permiso para ver esta pagina" });
  return res.status(403).json({ status: "error", message: "No tienes permiso para esta accion" });
};

export const requireAdmin = requireRole("admin");

import { COOKIE_NAME, verifyToken } from "../utils/auth.js";
import RevokedToken from "../models/revokedToken.model.js";

const readToken = (token) => {
  try {
    return verifyToken(token);
  } catch {
    return null;
  }
};

// Lee la cookie en cada request y deja el usuario disponible para rutas y vistas.
// Un token vencido, alterado o de una sesión ya cerrada no cuenta como sesión.
export const attachUser = async (req, res, next) => {
  try {
    const token = req.cookies?.[COOKIE_NAME];
    if (token) {
      const payload = readToken(token);
      const revoked = payload?.jti ? await RevokedToken.exists({ jti: payload.jti }) : false;
      if (payload && !revoked) req.user = payload;
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

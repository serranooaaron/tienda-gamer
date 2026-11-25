import express from "express";
import Cart from "../models/cart.model.js";
import User from "../models/user.model.js";
import RevokedToken from "../models/revokedToken.model.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { COOKIE_NAME, cookieOptions, createHash, isValidPassword, signToken } from "../utils/auth.js";
import { createLoginLimiter, loginLimiter, registerLimiter, waitMessage } from "../utils/loginLimiter.js";
import { passwordProblem } from "../../public/js/passwordPolicy.js";
import { RESET_MINUTES, clearResets, consumeReset, findValidReset, sendResetEmail } from "../utils/passwordReset.js";

const sessionsRouter = express.Router();

// "Olvidé mi contraseña": cada pedido cuenta, haya cuenta o no. 3 por email y conexión y
// 10 por conexión cada hora: nadie puede llenar de emails una casilla ni probar direcciones.
export const forgotLimiter = createLoginLimiter({ windowMs: 60 * 60 * 1000, maxPerAccount: 3, maxPerIp: 10 });
const FORGOT_MESSAGE = `Si el email tiene una cuenta, te enviamos un link para crear una contraseña nueva. Vence en ${RESET_MINUTES} minutos.`;
const EXPIRED_LINK = "El link venció o ya se usó. Pide uno nuevo.";

// Pide el link para crear una contraseña nueva. La respuesta es siempre la misma, exista o
// no la cuenta, y el email se envía después de responder: ni el mensaje ni la demora
// revelan qué emails están registrados.
sessionsRouter.post("/forgot", async (req, res) => {
  try {
    const wait = forgotLimiter.retryAfter(req);
    if (wait) return res.status(429).set("Retry-After", String(wait)).json({ status: "error", message: waitMessage(wait, "Demasiados pedidos") });
    const email = typeof req.body?.email === "string" ? req.body.email.toLowerCase().trim() : "";
    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ status: "error", message: "Escribe un email válido" });
    }
    forgotLimiter.fail(req);

    const user = await User.findOne({ email }).lean();
    res.json({ status: "success", message: FORGOT_MESSAGE });
    if (user) sendResetEmail(user).catch((error) => console.error(`No se pudo enviar el email de recuperación: ${error.message}`));
  } catch (error) {
    if (!res.headersSent) res.status(500).json({ status: "error", message: "No fue posible procesar el pedido" });
  }
});

// Crea la contraseña nueva con el token del email. Consume el token (sirve una sola vez),
// aplica la regla de contraseñas y cierra todas las sesiones abiertas de la cuenta.
sessionsRouter.post("/reset", async (req, res) => {
  try {
    const token = req.body?.token;
    const newPassword = typeof req.body?.newPassword === "string" ? req.body.newPassword : "";
    const pending = await findValidReset(token);
    const user = pending ? await User.findById(pending.user).lean() : null;
    if (!user) return res.status(400).json({ status: "error", message: EXPIRED_LINK });

    const problem = passwordProblem(newPassword, { email: user.email, first_name: user.first_name, last_name: user.last_name });
    if (problem) return res.status(400).json({ status: "error", message: problem });

    // Recién con todo validado se consume el token; si dos pedidos llegan juntos, gana uno.
    if (!(await consumeReset(token))) return res.status(400).json({ status: "error", message: EXPIRED_LINK });
    await User.updateOne({ _id: user._id }, { $set: { password: await createHash(newPassword) }, $inc: { sessionVersion: 1 } });
    await clearResets(user._id);
    // Quien recuperó su cuenta puede volver a intentar el login sin esperar el bloqueo.
    loginLimiter.succeed({ ip: req.ip, body: { email: user.email } });
    res.clearCookie(COOKIE_NAME, { ...cookieOptions(), maxAge: undefined });
    return res.json({ status: "success", message: "Listo: ya puedes ingresar con tu contraseña nueva." });
  } catch (error) {
    return res.status(500).json({ status: "error", message: "No fue posible cambiar la contraseña" });
  }
});

sessionsRouter.post("/register", async (req, res) => {
  try {
    const wait = registerLimiter.retryAfter(req);
    if (wait) {
      return res
        .status(429)
        .set("Retry-After", String(wait))
        .json({ status: "error", message: waitMessage(wait, "Demasiados registros desde esta conexión") });
    }
    registerLimiter.fail(req);

    const { first_name, last_name, email, password } = req.body;

    if (!first_name || !last_name || !email || !password) {
      return res.status(400).json({ status: "error", message: "Completa todos los campos" });
    }
    // La misma regla que muestra el formulario: el servidor es el que decide.
    const problem = passwordProblem(String(password), { email, first_name, last_name });
    if (problem) {
      return res.status(400).json({ status: "error", message: problem });
    }

    const exists = await User.exists({ email: String(email).toLowerCase().trim() });
    if (exists) {
      return res.status(409).json({ status: "error", message: "Ya existe una cuenta con ese email" });
    }

    // Cada usuario nace con su propio carrito: el carrito queda atado a la cuenta.
    const cart = await Cart.create({});
    const user = await User.create({
      first_name,
      last_name,
      email,
      password: await createHash(String(password)),
      cart: cart._id
    });

    res.cookie(COOKIE_NAME, signToken(user), cookieOptions());
    return res.status(201).json({ status: "success", message: "Cuenta creada" });
  } catch (error) {
    if (error.name === "ValidationError") {
      return res.status(400).json({ status: "error", message: "Revisa los datos ingresados" });
    }
    return res.status(500).json({ status: "error", message: "No fue posible crear la cuenta" });
  }
});

sessionsRouter.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ status: "error", message: "Ingresa email y contraseña" });
    }

    // Bloqueado por demasiados fallos: ni siquiera se compara la contraseña.
    const wait = loginLimiter.retryAfter(req);
    if (wait) {
      return res.status(429).set("Retry-After", String(wait)).json({ status: "error", message: waitMessage(wait) });
    }

    const user = await User.findOne({ email: String(email).toLowerCase().trim() }).select("+password");
    // Mismo mensaje si el email no existe o la contraseña falla: no se revela que cuentas existen.
    if (!user || !(await isValidPassword(String(password), user.password))) {
      loginLimiter.fail(req);
      return res.status(401).json({ status: "error", message: "Email o contraseña incorrectos" });
    }
    loginLimiter.succeed(req);

    if (!user.cart) {
      const cart = await Cart.create({});
      user.cart = cart._id;
      await user.save();
    }

    res.cookie(COOKIE_NAME, signToken(user), cookieOptions());
    return res.json({ status: "success", message: "Sesion iniciada", payload: { role: user.role } });
  } catch (error) {
    return res.status(500).json({ status: "error", message: "No fue posible iniciar sesion" });
  }
});

// Cerrar sesión revoca el token: aunque alguien se haya copiado la cookie, deja de servir.
sessionsRouter.post("/logout", async (req, res) => {
  try {
    if (req.user?.jti && req.user.exp) {
      await RevokedToken.updateOne(
        { jti: req.user.jti },
        { $setOnInsert: { jti: req.user.jti, expiresAt: new Date(req.user.exp * 1000) } },
        { upsert: true },
      );
    }
    res.clearCookie(COOKIE_NAME, { ...cookieOptions(), maxAge: undefined });
    return res.json({ status: "success", message: "Sesion cerrada" });
  } catch (error) {
    return res.status(500).json({ status: "error", message: "No fue posible cerrar la sesión" });
  }
});

sessionsRouter.get("/current", requireAuth, (req, res) => {
  return res.json({ status: "success", payload: req.user });
});

export default sessionsRouter;

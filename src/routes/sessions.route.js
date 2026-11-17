import express from "express";
import Cart from "../models/cart.model.js";
import User from "../models/user.model.js";
import RevokedToken from "../models/revokedToken.model.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { COOKIE_NAME, cookieOptions, createHash, isValidPassword, signToken } from "../utils/auth.js";
import { loginLimiter, registerLimiter, waitMessage } from "../utils/loginLimiter.js";
import { passwordProblem } from "../../public/js/passwordPolicy.js";

const sessionsRouter = express.Router();

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

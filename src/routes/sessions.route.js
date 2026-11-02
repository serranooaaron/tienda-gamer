import express from "express";
import Cart from "../models/cart.model.js";
import User from "../models/user.model.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { COOKIE_NAME, cookieOptions, createHash, isValidPassword, signToken } from "../utils/auth.js";

const sessionsRouter = express.Router();

const MIN_PASSWORD_LENGTH = 8;

sessionsRouter.post("/register", async (req, res) => {
  try {
    const { first_name, last_name, email, password } = req.body;

    if (!first_name || !last_name || !email || !password) {
      return res.status(400).json({ status: "error", message: "Completa todos los campos" });
    }
    if (String(password).length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({
        status: "error",
        message: `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`
      });
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

    const user = await User.findOne({ email: String(email).toLowerCase().trim() }).select("+password");
    // Mismo mensaje si el email no existe o la contraseña falla: no se revela que cuentas existen.
    if (!user || !(await isValidPassword(String(password), user.password))) {
      return res.status(401).json({ status: "error", message: "Email o contraseña incorrectos" });
    }

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

sessionsRouter.post("/logout", (_req, res) => {
  res.clearCookie(COOKIE_NAME, { ...cookieOptions(), maxAge: undefined });
  return res.json({ status: "success", message: "Sesion cerrada" });
});

sessionsRouter.get("/current", requireAuth, (req, res) => {
  return res.json({ status: "success", payload: req.user });
});

export default sessionsRouter;

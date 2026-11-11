import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

export const COOKIE_NAME = "tiendaToken";
const TOKEN_TTL_SECONDS = 60 * 60 * 24; // 24 horas

// Costo 12: cada intento de adivinar una contraseña filtrada lleva unas 4 veces más que con 10.
export const createHash = (password) => bcrypt.hash(password, 12);
export const isValidPassword = (password, hash) => bcrypt.compare(password, hash);

const getJwtSecret = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET no esta configurado");
  return secret;
};

// En el token solo viaja lo necesario para autorizar: nunca el hash ni datos sensibles.
export const signToken = (user) =>
  jwt.sign(
    {
      id: user._id.toString(),
      name: `${user.first_name} ${user.last_name}`,
      email: user.email,
      role: user.role,
      cart: user.cart?.toString()
    },
    getJwtSecret(),
    { expiresIn: TOKEN_TTL_SECONDS }
  );

export const verifyToken = (token) => jwt.verify(token, getJwtSecret());

// httpOnly: el JavaScript del navegador no puede leer la cookie (protege ante XSS).
// sameSite lax: no se envia en peticiones POST desde otros sitios (protege ante CSRF).
export const cookieOptions = () => ({
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  maxAge: TOKEN_TTL_SECONDS * 1000
});

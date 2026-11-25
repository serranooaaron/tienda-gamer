// Intereses de cada visitante: qué categorías y marcas mira, para recomendarle productos.
// Se guardan en una cookie propia del navegador, sin datos personales (ni email, ni nombre,
// ni IP): solo nombres de categorías y marcas del catálogo con la cantidad de visitas.
// El servidor la escribe, pero cualquiera puede modificarla: se valida entera al leerla.
import { CATEGORIES, CATEGORY_KEYS } from "../../public/js/catalogSchema.js";

export const INTERESTS_COOKIE = "tg_intereses";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_COOKIE_LENGTH = 600;
const MAX_CATEGORIES = 5;
const MAX_BRANDS = 10;
const MAX_COUNT = 99;
const ALL_BRANDS = new Set(Object.values(CATEGORIES).flatMap((category) => category.brands));

// Formato: "mouse~3|teclados~1/Razer~2|Cooler Master~1". Ningún nombre del catálogo usa
// "|", "~" ni "/", así que no hace falta escaparlos.
const parseList = (text, allowed) => {
  const counts = new Map();
  for (const entry of (text ?? "").split("|")) {
    const [name, raw] = entry.split("~");
    const count = Number(raw);
    if (!allowed.has(name) || !Number.isInteger(count) || count < 1 || counts.has(name)) continue;
    counts.set(name, Math.min(count, MAX_COUNT));
  }
  return counts;
};

const serializeList = (counts, max) =>
  [...counts]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([name, count]) => `${name}~${count}`)
    .join("|");

export const readInterests = (req) => {
  const raw = req.cookies?.[INTERESTS_COOKIE];
  if (typeof raw !== "string" || raw.length > MAX_COOKIE_LENGTH) return { categories: new Map(), brands: new Map() };
  const [categories, brands] = raw.split("/");
  return { categories: parseList(categories, new Set(CATEGORY_KEYS)), brands: parseList(brands, ALL_BRANDS) };
};

const cookieOptions = () => ({
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  maxAge: MAX_AGE_MS,
});

// Suma una visita a la categoría (y a la marca, si la hay). Los valores vienen del producto
// guardado o de una categoría ya validada, nunca directo de la URL.
export const recordInterest = (req, res, { category, brand }) => {
  const interests = readInterests(req);
  if (!CATEGORY_KEYS.includes(category)) return;
  interests.categories.set(category, Math.min((interests.categories.get(category) ?? 0) + 1, MAX_COUNT));
  if (brand && ALL_BRANDS.has(brand)) interests.brands.set(brand, Math.min((interests.brands.get(brand) ?? 0) + 1, MAX_COUNT));
  const value = `${serializeList(interests.categories, MAX_CATEGORIES)}/${serializeList(interests.brands, MAX_BRANDS)}`;
  res.cookie(INTERESTS_COOKIE, value, cookieOptions());
};

export const clearInterests = (res) => {
  const { maxAge, ...options } = cookieOptions();
  res.clearCookie(INTERESTS_COOKIE, options);
};

// La categoría más vista y, dentro de lo que se mira, qué marcas pesan más.
export const topInterest = ({ categories, brands }) => {
  const [first] = [...categories].sort((a, b) => b[1] - a[1]);
  return first ? { category: first[0], brands } : null;
};

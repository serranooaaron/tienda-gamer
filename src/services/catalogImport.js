// Importación de productos desde un archivo JSON (una lista de productos).
// Dos pasos: la vista previa dice qué se crearía, qué se actualizaría (por código) y qué filas
// tienen errores, sin guardar nada; la confirmación vuelve a calcular todo y guarda solo si
// ninguna fila tiene errores. Cada fila pasa por las mismas reglas que un alta desde el panel.
import mongoose from "mongoose";
import Product from "../models/product.model.js";
import { ProductInputError, applyCatalogRules, pickProductFields } from "../utils/productInput.js";

export const IMPORT_MAX_ROWS = 200;

// Campos que la importación puede cambiar. "featured" y "views" se manejan desde el panel.
const COMPARED_FIELDS = ["title", "description", "price", "stock", "status", "category", "subcategory", "brand", "model", "warrantyMonths", "specs", "thumbnail"];

// Mensajes de validación de Mongoose en castellano, nombrando el campo del archivo.
const validationMessage = (error) => {
  const [first] = Object.values(error.errors);
  const { kind, path, properties = {} } = first;
  if (kind === "required") return `Falta el campo ${path}`;
  if (kind === "minlength") return `${path}: mínimo ${properties.minlength} caracteres`;
  if (kind === "maxlength") return `${path}: máximo ${properties.maxlength} caracteres`;
  if (kind === "min") return `${path}: no puede ser menor que ${properties.min}`;
  if (kind === "max") return `${path}: no puede ser mayor que ${properties.max}`;
  if (kind === "enum") return `${path} inválido: ${first.value}`;
  return `${path}: valor inválido`;
};

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

// Lee una fila del archivo y la deja lista para guardar, o devuelve el motivo del error.
const readRow = (raw) => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new ProductInputError("Cada producto tiene que ser un objeto { ... }");
  const data = pickProductFields(raw);
  delete data.featured;
  if (!data.code) throw new ProductInputError("Falta el campo code");
  data.code = data.code.toUpperCase();
  return data;
};

export const planImport = async (rows) => {
  if (!Array.isArray(rows)) throw new ProductInputError("El archivo tiene que ser una lista de productos: [ { ... }, { ... } ]");
  if (!rows.length) throw new ProductInputError("El archivo no tiene productos");
  if (rows.length > IMPORT_MAX_ROWS) throw new ProductInputError(`Se pueden importar hasta ${IMPORT_MAX_ROWS} productos por archivo`);

  const parsed = rows.map((raw, index) => {
    try {
      return { row: index + 1, data: readRow(raw) };
    } catch (error) {
      if (!(error instanceof ProductInputError)) throw error;
      return { row: index + 1, code: typeof raw?.code === "string" ? raw.code : "", error: error.message };
    }
  });

  const valid = parsed.filter((item) => item.data);
  const codes = valid.map((item) => item.data.code);
  const titles = valid.map((item) => item.data.title).filter(Boolean);
  // Los $in son nuestros y los valores son textos ya validados: se marcan como confiables
  // para que sanitizeFilter no los convierta en una comparación literal.
  const [existing, sameTitle] = await Promise.all([
    Product.find({ code: mongoose.trusted({ $in: codes }) }).lean(),
    Product.find({ title: mongoose.trusted({ $in: titles }) }, { title: 1, code: 1 }).lean(),
  ]);
  const byCode = new Map(existing.map((product) => [product.code, product]));
  const titleOwner = new Map(sameTitle.map((product) => [product.title, product.code]));
  const seenCodes = new Map();
  const seenTitles = new Map();

  // De a una fila y en orden: "repetido en la fila N" depende de las anteriores.
  const items = [];
  for (const item of parsed) items.push(await planRow(item, { byCode, titleOwner, seenCodes, seenTitles }));

  const summary = { create: 0, update: 0, unchanged: 0, error: 0 };
  for (const item of items) summary[item.action] += 1;
  return { summary, items };
};

// Un producto nuevo necesita estos campos; uno que ya existe puede traer solo lo que cambia.
const REQUIRED_TO_CREATE = ["title", "description", "price", "stock", "category"];

const planRow = async (item, { byCode, titleOwner, seenCodes, seenTitles }) => {
  if (item.error) return { row: item.row, code: item.code, title: "", action: "error", error: item.error };
  const data = { ...item.data };
  const current = byCode.get(data.code);
  const base = { row: item.row, code: data.code, title: data.title ?? current?.title ?? "" };
  try {
    if (seenCodes.has(data.code)) throw new ProductInputError(`El código se repite en la fila ${seenCodes.get(data.code)}`);
    seenCodes.set(data.code, item.row);
    if (data.title) {
      if (seenTitles.has(data.title)) throw new ProductInputError(`El nombre se repite en la fila ${seenTitles.get(data.title)}`);
      seenTitles.set(data.title, item.row);
      const owner = titleOwner.get(data.title);
      if (owner && owner !== data.code) throw new ProductInputError(`Ya existe otro producto con este nombre (${owner})`);
    }

    if (!current) {
      const missing = REQUIRED_TO_CREATE.find((field) => data[field] === undefined || data[field] === "");
      if (missing) throw new ProductInputError(`Falta el campo ${missing}`);
    }
    applyCatalogRules(data, current ?? {});
    const merged = current ? { ...current, ...data } : data;
    try {
      await new Product(merged).validate();
    } catch (validation) {
      if (validation.name !== "ValidationError") throw validation;
      throw new ProductInputError(validationMessage(validation));
    }

    if (!current) return { ...base, action: "create", data };
    const changes = COMPARED_FIELDS.filter((field) => field in data && !same(data[field], current[field]));
    return { ...base, action: changes.length ? "update" : "unchanged", changes, data };
  } catch (error) {
    if (!(error instanceof ProductInputError)) throw error;
    return { ...base, action: "error", error: error.message };
  }
};

// Lo que se muestra en la vista previa: sin los datos completos de cada fila.
export const previewOf = ({ summary, items }) => ({
  summary,
  items: items.map(({ data, ...item }) => item),
});

export const applyImport = async (rows) => {
  const plan = await planImport(rows);
  if (plan.summary.error) {
    throw new ProductInputError(`Hay ${plan.summary.error} ${plan.summary.error === 1 ? "fila" : "filas"} con errores: corrige el archivo y vuelve a cargarlo`);
  }
  const operations = plan.items.flatMap((item) => {
    if (item.action === "create") return [{ insertOne: { document: item.data } }];
    if (item.action === "update") return [{ updateOne: { filter: { code: item.code }, update: { $set: item.data } } }];
    return [];
  });
  if (operations.length) await Product.bulkWrite(operations, { ordered: true });
  return plan.summary;
};

// Datos de un producto que llegan del panel: solo se aceptan los campos esperados, con su tipo.
// Así nadie puede colar _id, fechas u operadores de MongoDB ($set, $unset...) en un alta o una edición.
import { CatalogError, checkCategoryFields, cleanSpecs } from "../../public/js/catalogSchema.js";

const TEXT_FIELDS = ["title", "description", "code", "category", "model"];
const NUMBER_FIELDS = ["price", "stock"];
// Marca y subcategoría: texto o vacío (vacío = sin dato). Se validan contra la categoría después.
const OPTIONAL_LIST_FIELDS = ["brand", "subcategory"];

// Imagen: una ruta de la propia tienda (/image/...) o una dirección https. Nada de javascript: ni data:.
const isValidThumbnail = (value) => /^\/image\/[\w./-]+$/.test(value) || /^https:\/\/[^\s"'<>]+$/.test(value);

export class ProductInputError extends Error {}

export const pickProductFields = (body = {}) => {
  const data = {};
  for (const field of TEXT_FIELDS) {
    if (body[field] === undefined) continue;
    if (typeof body[field] !== "string") throw new ProductInputError(`El campo ${field} debe ser texto`);
    data[field] = body[field].trim();
  }
  for (const field of NUMBER_FIELDS) {
    if (body[field] === undefined) continue;
    const value = typeof body[field] === "string" && body[field].trim() !== "" ? Number(body[field]) : body[field];
    if (typeof value !== "number" || !Number.isFinite(value)) throw new ProductInputError(`El campo ${field} debe ser un número`);
    data[field] = value;
  }
  for (const field of ["status", "featured"]) {
    if (body[field] === undefined) continue;
    if (typeof body[field] !== "boolean") throw new ProductInputError(`El campo ${field} debe ser verdadero o falso`);
    data[field] = body[field];
  }
  for (const field of OPTIONAL_LIST_FIELDS) {
    if (body[field] === undefined) continue;
    if (body[field] !== null && typeof body[field] !== "string") throw new ProductInputError(`El campo ${field} debe ser texto`);
    data[field] = body[field]?.trim() || null;
  }
  if (body.warrantyMonths !== undefined) {
    const months = body.warrantyMonths === "" || body.warrantyMonths === null ? null : Number(body.warrantyMonths);
    if (months !== null && (!Number.isInteger(months) || months < 0 || months > 120)) {
      throw new ProductInputError("La garantía va de 0 a 120 meses");
    }
    data.warrantyMonths = months;
  }
  // La ficha se guarda tal cual llega acá y se valida con la categoría en applyCatalogRules.
  if (body.specs !== undefined) data.specs = body.specs;
  if (body.thumbnail !== undefined) {
    const thumbnail = typeof body.thumbnail === "string" ? body.thumbnail.trim() : "";
    if (!isValidThumbnail(thumbnail)) throw new ProductInputError("La imagen debe ser una ruta de la tienda o una dirección https");
    data.thumbnail = thumbnail;
  }
  return data;
};

// Reglas del catálogo: la subcategoría y la marca tienen que existir en la categoría,
// y la ficha solo puede tener los campos de esa categoría, con su tipo.
// En una edición se combinan los datos nuevos con los que ya tenía el producto: si cambia
// la categoría, lo que quedó guardado de la anterior también tiene que valer en la nueva.
export const applyCatalogRules = (data, current = {}) => {
  const category = data.category ?? current.category;
  const categoryChanged = data.category !== undefined && data.category !== current.category;
  try {
    checkCategoryFields({
      category,
      subcategory: data.subcategory !== undefined ? data.subcategory : current.subcategory,
      brand: data.brand !== undefined ? data.brand : current.brand,
    });
    if (data.specs !== undefined) data.specs = cleanSpecs(category, data.specs);
    else if (categoryChanged && current.specs && Object.keys(current.specs).length) cleanSpecs(category, current.specs);
  } catch (error) {
    if (error instanceof CatalogError) throw new ProductInputError(error.message);
    throw error;
  }
  return data;
};

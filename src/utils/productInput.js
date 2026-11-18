// Datos de un producto que llegan del panel: solo se aceptan los campos esperados, con su tipo.
// Así nadie puede colar _id, fechas u operadores de MongoDB ($set, $unset...) en un alta o una edición.
const TEXT_FIELDS = ["title", "description", "code", "category"];
const NUMBER_FIELDS = ["price", "stock"];

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
  if (body.thumbnail !== undefined) {
    const thumbnail = typeof body.thumbnail === "string" ? body.thumbnail.trim() : "";
    if (!isValidThumbnail(thumbnail)) throw new ProductInputError("La imagen debe ser una ruta de la tienda o una dirección https");
    data.thumbnail = thumbnail;
  }
  return data;
};

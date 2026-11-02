// Escapa caracteres especiales para usar texto del usuario dentro de un $regex de MongoDB.
// Sin esto, una busqueda como "(a+)+$" podria colgar la base (ReDoS) o alterar el filtro.
export const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

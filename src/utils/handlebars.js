// Helpers disponibles en todas las vistas de Handlebars.
const moneyFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  maximumFractionDigits: 0
});

const dateFormatter = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Argentina/Buenos_Aires"
});

export const CATEGORY_LABELS = {
  auriculares: "Auriculares",
  teclados: "Teclados",
  mouse: "Mouse",
  webcams: "Webcams",
  microfonos: "Micrófonos"
};

export default {
  eq: (a, b) => String(a) === String(b),
  gt: (a, b) => Number(a) > Number(b),
  lte: (a, b) => Number(a) <= Number(b),
  startsWith: (value, prefix) => typeof value === "string" && value.startsWith(prefix),
  money: (value) => moneyFormatter.format(Number(value) || 0),
  multiply: (a, b) => Number(a) * Number(b),
  dateTime: (value) => dateFormatter.format(new Date(value)),
  isoDate: (value) => new Date(value).toISOString(),
  categoryLabel: (value) => CATEGORY_LABELS[value] || value,
  initials: (name = "") =>
    name
      .split(/\s+/)
      .map((word) => word[0])
      .join("")
      .slice(0, 2)
      .toUpperCase(),
  json: (value) => JSON.stringify(value),
  encode: (value) => encodeURIComponent(value ?? "")
};

// Importar productos desde un JSON: plantilla, vista previa y confirmación.
// El navegador solo lee el archivo y muestra lo que responde el servidor; las reglas y los
// errores de cada fila los decide el servidor, con las mismas validaciones que un alta.
import { api } from "./app.js";
import { CATEGORIES } from "./catalogSchema.js";

const MAX_BYTES = 1024 * 1024;
const ACTIONS = {
  create: { label: "Se crea", className: "badge--ok" },
  update: { label: "Se actualiza", className: "badge--warn" },
  unchanged: { label: "Sin cambios", className: "" },
  error: { label: "Error", className: "badge--out" },
};

const dialog = document.getElementById("import-dialog");
const fileInput = dialog.querySelector("[data-import-file]");
const fileName = dialog.querySelector("[data-import-file-name]");
const preview = dialog.querySelector("[data-import-preview]");
const summaryList = dialog.querySelector("[data-import-summary]");
const rowsBody = dialog.querySelector("[data-import-rows]");
const errorEl = dialog.querySelector("[data-import-error]");
const confirmBtn = dialog.querySelector("[data-import-confirm]");
const FILE_HINT = fileName.textContent;
let products = null;

const reset = () => {
  products = null;
  fileInput.value = "";
  fileName.textContent = FILE_HINT;
  preview.hidden = true;
  errorEl.textContent = "";
  confirmBtn.disabled = true;
};

document.querySelector("[data-import-open]").addEventListener("click", () => {
  reset();
  dialog.showModal();
});
dialog.querySelectorAll("[data-import-close]").forEach((btn) => btn.addEventListener("click", () => dialog.close()));

// Plantilla: un producto de ejemplo con todos los campos de la categoría. "_ayuda" explica
// qué va en cada campo de la ficha; la importación ignora las claves que no conoce.
const exampleFor = (field) => {
  if (field.type === "select") return field.options[0];
  if (field.type === "boolean") return false;
  if (field.type === "number") return 0;
  return "";
};
const helpFor = (field) => {
  if (field.type === "select") return field.options;
  if (field.type === "boolean") return "true o false";
  if (field.type === "number") return field.unit ? `número (${field.unit})` : "número";
  return "texto, hasta 80 caracteres";
};

dialog.querySelector("[data-import-template]").addEventListener("click", () => {
  const category = dialog.querySelector("[data-import-template-category]").value;
  const definition = CATEGORIES[category];
  const fields = definition.sections.flatMap((section) => section.fields);
  const template = [
    {
      code: "CODIGO-UNICO",
      title: `Nombre del producto (${definition.label})`,
      description: "Descripción de al menos 10 caracteres.",
      category,
      subcategory: Object.keys(definition.subcategories)[0],
      brand: definition.brands[0],
      model: "",
      price: 0,
      stock: 0,
      status: false,
      warrantyMonths: 12,
      specs: Object.fromEntries(fields.map((field) => [field.key, exampleFor(field)])),
      _ayuda: {
        subcategory: Object.keys(definition.subcategories),
        brand: definition.brands,
        status: "false deja el producto pausado hasta revisarlo en el panel",
        specs: Object.fromEntries(fields.map((field) => [field.key, helpFor(field)])),
      },
    },
  ];
  const url = URL.createObjectURL(new Blob([JSON.stringify(template, null, 2)], { type: "application/json" }));
  const link = Object.assign(document.createElement("a"), { href: url, download: `plantilla-${category}.json` });
  link.click();
  URL.revokeObjectURL(url);
});

const cell = (text, className = "") => {
  const td = document.createElement("td");
  td.textContent = text;
  if (className) td.className = className;
  return td;
};

const showPreview = ({ summary, items }) => {
  summaryList.replaceChildren(
    ...Object.entries(ACTIONS).map(([action, { label, className }]) => {
      const li = document.createElement("li");
      li.className = `badge ${className}`;
      li.textContent = `${label}: ${summary[action]}`;
      return li;
    })
  );
  rowsBody.replaceChildren(
    ...items.map((item) => {
      const tr = document.createElement("tr");
      const result = cell("");
      const badge = document.createElement("span");
      badge.className = `badge ${ACTIONS[item.action].className}`;
      badge.textContent = ACTIONS[item.action].label;
      result.append(badge);
      const detail = item.error ?? (item.changes?.length ? `Cambia: ${item.changes.join(", ")}` : "");
      if (detail) result.append(Object.assign(document.createElement("small"), { textContent: ` ${detail}` }));
      tr.append(cell(String(item.row), "num"), cell(item.code || "—"), cell(item.title || "—"), result);
      return tr;
    })
  );
  preview.hidden = false;
  const pending = summary.create + summary.update;
  confirmBtn.disabled = summary.error > 0 || pending === 0;
  if (summary.error) errorEl.textContent = "Corrige las filas con error y vuelve a elegir el archivo: no se guarda nada mientras haya errores.";
  else if (!pending) errorEl.textContent = "El archivo no trae cambios.";
};

fileInput.addEventListener("change", async () => {
  const file = fileInput.files[0];
  products = null;
  preview.hidden = true;
  errorEl.textContent = "";
  confirmBtn.disabled = true;
  if (!file) return;
  fileName.textContent = file.name;
  if (file.size > MAX_BYTES) {
    errorEl.textContent = "El archivo no puede superar 1 MB";
    return;
  }

  try {
    products = JSON.parse(await file.text());
  } catch (error) {
    errorEl.textContent = `El archivo no es un JSON válido: ${error.message}`;
    return;
  }

  fileName.textContent = `${file.name} · revisando…`;
  try {
    const { payload } = await api("/api/products/import/preview", { method: "POST", body: { products } });
    fileName.textContent = file.name;
    showPreview(payload);
  } catch (error) {
    fileName.textContent = file.name;
    errorEl.textContent = error.message;
  }
});

confirmBtn.addEventListener("click", async () => {
  if (!products) return;
  confirmBtn.disabled = true;
  confirmBtn.textContent = "Importando…";
  try {
    const { payload } = await api("/api/products/import", { method: "POST", body: { products } });
    try {
      sessionStorage.setItem("admin-flash", `Importación lista: ${payload.create} creados y ${payload.update} actualizados`);
    } catch {}
    window.location.reload();
  } catch (error) {
    errorEl.textContent = error.message;
    confirmBtn.textContent = "Confirmar importación";
    confirmBtn.disabled = false;
  }
});

// Campos del formulario de producto que dependen de la categoría: tipo, marca y ficha técnica.
// Se arman con la misma definición del catálogo que usa el servidor, y antes de enviar se
// validan con las mismas funciones. El servidor igual vuelve a validar todo.
import { CATEGORIES, checkCategoryFields, cleanSpecs } from "./catalogSchema.js";

const EMPTY = "—";

const option = (value, label) => new Option(label, value);

const fillSelect = (select, entries, current) => {
  select.replaceChildren(option("", EMPTY), ...entries.map(([value, label]) => option(value, label)));
  select.value = entries.some(([value]) => value === current) ? current : "";
};

// Un control por campo de la ficha, con su etiqueta y la unidad a la vista.
const fieldControl = (field, value) => {
  const id = `spec-${field.key}`;
  const wrapper = document.createElement("div");
  wrapper.className = "field";
  const label = document.createElement("label");
  label.htmlFor = id;
  label.textContent = field.unit ? `${field.label} (${field.unit})` : field.label;

  let control;
  if (field.type === "select" || field.type === "boolean") {
    control = document.createElement("select");
    const entries = field.type === "boolean" ? [["true", "Sí"], ["false", "No"]] : field.options.map((o) => [o, o]);
    fillSelect(control, entries, value === undefined || value === null ? "" : String(value));
  } else {
    control = document.createElement("input");
    if (field.type === "number") {
      // Texto con teclado decimal: acepta coma ("60,5"), igual que el servidor.
      control.inputMode = "decimal";
      control.autocomplete = "off";
      control.value = value === undefined || value === null ? "" : String(value).replace(".", ",");
    } else {
      control.maxLength = 80;
      control.value = value ?? "";
    }
  }
  control.id = id;
  control.dataset.spec = field.key;
  control.dataset.specType = field.type;
  wrapper.append(label, control);
  return wrapper;
};

export const productCatalogFields = (form) => {
  const category = form.elements.category;
  const subcategory = form.querySelector("[data-subcategory]");
  const brand = form.querySelector("[data-brand]");
  const specsBox = form.querySelector("[data-spec-fields]");
  const specsCategory = form.querySelector("[data-spec-category]");

  // Valores de la ficha que se están editando. Al cambiar de categoría se conservan los
  // que existen en la nueva con un valor válido (por ejemplo "Conexión" o "RGB").
  const currentSpecs = () => {
    const values = {};
    for (const control of specsBox.querySelectorAll("[data-spec]")) {
      if (control.value === "") continue;
      values[control.dataset.spec] = control.dataset.specType === "boolean" ? control.value === "true" : control.value;
    }
    return values;
  };

  const render = (product = {}) => {
    const definition = CATEGORIES[category.value];
    if (!definition) return;
    fillSelect(subcategory, Object.entries(definition.subcategories), product.subcategory ?? subcategory.value);
    fillSelect(brand, definition.brands.map((b) => [b, b]), product.brand ?? brand.value);
    specsCategory.textContent = `de ${definition.label}`;

    const values = product.specs ?? {};
    specsBox.replaceChildren(
      ...definition.sections.map((section) => {
        const fieldset = document.createElement("fieldset");
        fieldset.className = "spec-form__section";
        const legend = document.createElement("legend");
        legend.textContent = section.title;
        const grid = document.createElement("div");
        grid.className = "spec-form__grid";
        grid.append(...section.fields.map((field) => fieldControl(field, values[field.key])));
        fieldset.append(legend, grid);
        return fieldset;
      })
    );
  };

  category.addEventListener("change", () => render({ specs: currentSpecs() }));

  return {
    // Llena los campos con un producto (o los deja vacíos para uno nuevo).
    load: (product) => render({ subcategory: product?.subcategory ?? "", brand: product?.brand ?? "", specs: product?.specs ?? {} }),
    // Datos del catálogo listos para enviar. Si algo no vale, lanza el mismo error que el servidor.
    read: () => {
      const data = {
        subcategory: subcategory.value || null,
        brand: brand.value || null,
        specs: currentSpecs(),
      };
      checkCategoryFields({ category: category.value, ...data });
      data.specs = cleanSpecs(category.value, data.specs);
      return data;
    },
    // Marca el campo de la ficha que nombra un mensaje de error ("Peso: debe ser un número").
    markInvalid: (message) => {
      for (const control of specsBox.querySelectorAll("[data-spec]")) {
        const label = control.labels[0].textContent.replace(/ \(.*\)$/, "");
        const invalid = message.startsWith(`${label}:`);
        if (invalid) {
          control.setAttribute("aria-invalid", "true");
          control.focus();
        } else {
          control.removeAttribute("aria-invalid");
        }
      }
    },
  };
};

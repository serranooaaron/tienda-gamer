// Definición del catálogo: categorías, subcategorías, marcas y ficha técnica de cada una.
// Es la única fuente de verdad: la usan el servidor (validar y mostrar), el navegador
// (formularios y filtros) y la importación. Sumar una marca o un campo es una línea acá.
//
// Cada campo de la ficha declara:
//   key     nombre interno (se guarda en product.specs[key])
//   label   etiqueta que ve el usuario
//   type    "text" | "number" | "boolean" | "select"
//   unit    unidad para mostrar ("g", "Hz", "mm"...), solo en números
//   options valores permitidos, solo en "select"

const CONNECTION = ["Cable USB", "Inalámbrico 2,4 GHz", "Bluetooth", "Multimodo (2,4 GHz + Bluetooth)"];

export const CATEGORIES = {
  teclados: {
    label: "Teclados",
    group: "perifericos",
    subcategories: { mecanicos: "Mecánicos", membrana: "Membrana" },
    brands: ["Logitech", "Redragon", "Corsair", "HyperX", "SteelSeries", "Razer", "Aula", "Asus", "Cooler Master", "Genius"],
    sections: [
      {
        title: "General",
        fields: [
          { key: "layout", label: "Formato", type: "select", options: ["Completo (100 %)", "TKL (80 %)", "75 %", "65 %", "60 %"] },
          { key: "connection", label: "Conexión", type: "select", options: CONNECTION },
          { key: "language", label: "Idioma", type: "select", options: ["Español (Latinoamérica)", "Español (España)", "Inglés (US)"] },
        ],
      },
      {
        title: "Teclas",
        fields: [
          { key: "switch", label: "Switch", type: "text" },
          { key: "switchType", label: "Tipo de switch", type: "select", options: ["Lineal", "Táctil", "Clicky", "Membrana"] },
          { key: "hotSwap", label: "Hot-swap", type: "boolean" },
          { key: "antiGhosting", label: "Anti-ghosting", type: "boolean" },
        ],
      },
      {
        title: "Diseño",
        fields: [
          { key: "lighting", label: "Iluminación", type: "select", options: ["RGB", "Un color", "Sin luz"] },
          { key: "wristRest", label: "Apoyamuñecas", type: "boolean" },
          { key: "weightG", label: "Peso", type: "number", unit: "g" },
        ],
      },
    ],
  },

  mouse: {
    label: "Mouse",
    group: "perifericos",
    subcategories: { "con-cable": "Con cable", inalambricos: "Inalámbricos" },
    brands: ["Logitech", "Razer", "Redragon", "Corsair", "HyperX", "SteelSeries", "Zowie", "Asus", "Aula", "Genius"],
    sections: [
      {
        title: "Sensor",
        fields: [
          { key: "sensor", label: "Sensor", type: "text" },
          { key: "dpi", label: "DPI máximo", type: "number" },
          { key: "pollingHz", label: "Tasa de sondeo", type: "number", unit: "Hz" },
        ],
      },
      {
        title: "Diseño",
        fields: [
          { key: "buttons", label: "Botones", type: "number" },
          { key: "weightG", label: "Peso", type: "number", unit: "g" },
          { key: "grip", label: "Mano", type: "select", options: ["Diestro", "Ambidiestro"] },
          { key: "rgb", label: "RGB", type: "boolean" },
        ],
      },
      {
        title: "Conexión",
        fields: [
          { key: "connection", label: "Conexión", type: "select", options: CONNECTION },
          { key: "batteryH", label: "Batería", type: "number", unit: "h" },
        ],
      },
    ],
  },

  auriculares: {
    label: "Auriculares",
    group: "perifericos",
    subcategories: { "con-cable": "Con cable", inalambricos: "Inalámbricos" },
    brands: ["HyperX", "Logitech", "Razer", "Redragon", "Corsair", "SteelSeries", "Asus"],
    sections: [
      {
        title: "Audio",
        fields: [
          { key: "driverMm", label: "Driver", type: "number", unit: "mm" },
          { key: "sound", label: "Sonido", type: "select", options: ["Estéreo", "Surround 7.1 virtual"] },
          { key: "frequencyResponse", label: "Respuesta de frecuencia", type: "text" },
        ],
      },
      {
        title: "Micrófono",
        fields: [
          { key: "microphone", label: "Micrófono", type: "select", options: ["Desmontable", "Fijo", "Retráctil", "Sin micrófono"] },
          { key: "noiseCancelling", label: "Cancelación de ruido", type: "boolean" },
        ],
      },
      {
        title: "Conexión y diseño",
        fields: [
          { key: "connection", label: "Conexión", type: "select", options: ["Jack 3,5 mm", "USB", "Jack 3,5 mm + USB", "Inalámbrico 2,4 GHz", "Bluetooth"] },
          { key: "batteryH", label: "Batería", type: "number", unit: "h" },
          { key: "weightG", label: "Peso", type: "number", unit: "g" },
          { key: "rgb", label: "RGB", type: "boolean" },
        ],
      },
    ],
  },

  microfonos: {
    label: "Micrófonos",
    group: "perifericos",
    subcategories: { usb: "USB", xlr: "XLR" },
    brands: ["HyperX", "Razer", "Redragon", "Logitech", "Elgato"],
    sections: [
      {
        title: "Audio",
        fields: [
          { key: "capsule", label: "Cápsula", type: "select", options: ["Condensador", "Dinámico"] },
          { key: "polarPattern", label: "Patrón polar", type: "select", options: ["Cardioide", "Omnidireccional", "Bidireccional", "Estéreo", "Varios patrones"] },
          { key: "sampleRateKhz", label: "Frecuencia de muestreo", type: "number", unit: "kHz" },
          { key: "bitDepth", label: "Profundidad", type: "number", unit: "bits" },
        ],
      },
      {
        title: "Conexión y extras",
        fields: [
          { key: "connection", label: "Conexión", type: "select", options: ["USB-C", "USB-A", "XLR", "USB + XLR"] },
          { key: "stand", label: "Soporte incluido", type: "boolean" },
          { key: "popFilter", label: "Filtro antipop", type: "boolean" },
          { key: "monitoring", label: "Salida de monitoreo", type: "boolean" },
          { key: "rgb", label: "RGB", type: "boolean" },
        ],
      },
    ],
  },

  webcams: {
    label: "Webcams",
    group: "perifericos",
    subcategories: { "full-hd": "Full HD", "2k-4k": "2K y 4K" },
    brands: ["Logitech", "Razer", "Redragon", "Genius", "Elgato"],
    sections: [
      {
        title: "Video",
        fields: [
          { key: "resolution", label: "Resolución", type: "select", options: ["720p", "1080p", "1440p", "4K"] },
          { key: "fps", label: "Cuadros por segundo", type: "number", unit: "fps" },
          { key: "fovDeg", label: "Campo de visión", type: "number", unit: "°" },
        ],
      },
      {
        title: "Audio y extras",
        fields: [
          { key: "microphone", label: "Micrófono", type: "select", options: ["Estéreo", "Mono", "Sin micrófono"] },
          { key: "autofocus", label: "Enfoque automático", type: "boolean" },
          { key: "privacyCover", label: "Tapa de privacidad", type: "boolean" },
        ],
      },
    ],
  },
};

export const CATEGORY_KEYS = Object.keys(CATEGORIES);

const TEXT_MAX = 80;
const NUMBER_MAX = 1_000_000;

export class CatalogError extends Error {}

// Valida y limpia la ficha de un producto según su categoría.
// Devuelve solo los campos conocidos, con su tipo correcto. Un campo vacío se omite.
export const cleanSpecs = (category, specs) => {
  const definition = CATEGORIES[category];
  if (!definition) throw new CatalogError("Categoría desconocida");
  if (specs === undefined || specs === null) return {};
  if (typeof specs !== "object" || Array.isArray(specs)) throw new CatalogError("La ficha técnica debe ser un objeto");

  const fields = new Map(definition.sections.flatMap((section) => section.fields).map((field) => [field.key, field]));
  const unknown = Object.keys(specs).filter((key) => !fields.has(key));
  if (unknown.length) throw new CatalogError(`La ficha de ${definition.label} no tiene estos campos: ${unknown.join(", ")}`);

  const clean = {};
  for (const [key, raw] of Object.entries(specs)) {
    if (raw === "" || raw === null || raw === undefined) continue;
    const field = fields.get(key);
    if (field.type === "number") {
      const value = typeof raw === "string" ? Number(raw.replace(",", ".")) : raw;
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > NUMBER_MAX) {
        throw new CatalogError(`${field.label}: debe ser un número`);
      }
      clean[key] = value;
    } else if (field.type === "boolean") {
      if (typeof raw !== "boolean") throw new CatalogError(`${field.label}: debe ser sí o no`);
      clean[key] = raw;
    } else if (field.type === "select") {
      if (!field.options.includes(raw)) throw new CatalogError(`${field.label}: debe ser una de estas opciones: ${field.options.join(", ")}`);
      clean[key] = raw;
    } else {
      if (typeof raw !== "string") throw new CatalogError(`${field.label}: debe ser texto`);
      const text = raw.trim();
      if (text.length > TEXT_MAX) throw new CatalogError(`${field.label}: puede tener hasta ${TEXT_MAX} caracteres`);
      if (text) clean[key] = text;
    }
  }
  return clean;
};

// Comprueba que subcategoría y marca existan en la categoría.
export const checkCategoryFields = ({ category, subcategory, brand }) => {
  const definition = CATEGORIES[category];
  if (!definition) throw new CatalogError("Categoría desconocida");
  // Object.hasOwn y no "in": "in" también acepta nombres heredados como "constructor".
  if (subcategory !== undefined && subcategory !== null && !Object.hasOwn(definition.subcategories, subcategory)) {
    throw new CatalogError(`Subcategoría inválida para ${definition.label}: puede ser ${Object.values(definition.subcategories).join(", ")}`);
  }
  if (brand !== undefined && brand !== null && !definition.brands.includes(brand)) {
    throw new CatalogError(`Marca inválida para ${definition.label}: puede ser ${definition.brands.join(", ")}`);
  }
};

// Ficha lista para mostrar: secciones con sus filas "etiqueta: valor", sin las vacías.
const formatValue = (field, value) => {
  if (field.type === "boolean") return value ? "Sí" : "No";
  if (field.type === "number") return `${new Intl.NumberFormat("es-AR").format(value)}${field.unit ? ` ${field.unit}` : ""}`;
  return String(value);
};

export const specSheet = (category, specs = {}) =>
  (CATEGORIES[category]?.sections ?? [])
    .map((section) => ({
      title: section.title,
      rows: section.fields
        .filter((field) => specs?.[field.key] !== undefined && specs?.[field.key] !== null && specs?.[field.key] !== "")
        .map((field) => ({ label: field.label, value: formatValue(field, specs[field.key]) })),
    }))
    .filter((section) => section.rows.length);

export const subcategoryLabel = (category, subcategory) => CATEGORIES[category]?.subcategories?.[subcategory] ?? "";

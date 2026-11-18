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
const SOCKETS = ["AM5", "AM4", "LGA1700", "LGA1851"];
const MEMORY_TYPES = ["DDR4", "DDR5", "DDR4 y DDR5"];

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

  procesadores: {
    label: "Procesadores",
    group: "componentes",
    subcategories: { "intel-core": "Intel Core", "amd-ryzen": "AMD Ryzen" },
    brands: ["Intel", "AMD"],
    sections: [
      {
        title: "Plataforma",
        fields: [
          { key: "socket", label: "Socket", type: "select", options: SOCKETS },
          { key: "memoryType", label: "Memoria compatible", type: "select", options: MEMORY_TYPES },
          { key: "tdpW", label: "Consumo (TDP)", type: "number", unit: "W" },
        ],
      },
      {
        title: "Rendimiento",
        fields: [
          { key: "cores", label: "Núcleos", type: "number" },
          { key: "threads", label: "Hilos", type: "number" },
          { key: "baseGhz", label: "Frecuencia base", type: "number", unit: "GHz" },
          { key: "boostGhz", label: "Frecuencia turbo", type: "number", unit: "GHz" },
          { key: "l3CacheMb", label: "Caché L3", type: "number", unit: "MB" },
        ],
      },
      {
        title: "Incluye",
        fields: [
          { key: "integratedGraphics", label: "Gráficos integrados", type: "boolean" },
          { key: "cooler", label: "Cooler en la caja", type: "boolean" },
        ],
      },
    ],
  },

  "placas-de-video": {
    label: "Placas de video",
    group: "componentes",
    subcategories: { "nvidia-geforce": "NVIDIA GeForce", "amd-radeon": "AMD Radeon", "intel-arc": "Intel Arc" },
    brands: ["Asus", "MSI", "Gigabyte Aorus", "Zotac", "PNY", "Palit", "INNO3D", "Sapphire", "PowerColor", "XFX", "Asrock"],
    sections: [
      {
        title: "Chip y memoria",
        fields: [
          { key: "chip", label: "Chip", type: "text" },
          { key: "interface", label: "Interfaz", type: "select", options: ["PCIe 4.0 x16", "PCIe 5.0 x16", "PCIe 4.0 x8"] },
          { key: "memoryGb", label: "Memoria", type: "number", unit: "GB" },
          { key: "memoryType", label: "Tipo de memoria", type: "select", options: ["GDDR6", "GDDR6X", "GDDR7"] },
          { key: "busBits", label: "Bus de memoria", type: "number", unit: "bits" },
          { key: "memoryMhz", label: "Velocidad de memoria", type: "number", unit: "MHz" },
        ],
      },
      {
        title: "Frecuencias",
        fields: [
          { key: "baseMhz", label: "Frecuencia base", type: "number", unit: "MHz" },
          { key: "boostMhz", label: "Frecuencia boost", type: "number", unit: "MHz" },
        ],
      },
      {
        title: "Salidas",
        fields: [
          { key: "hdmi", label: "HDMI", type: "number" },
          { key: "displayPort", label: "DisplayPort", type: "number" },
        ],
      },
      {
        title: "Energía y tamaño",
        fields: [
          { key: "powerW", label: "Consumo", type: "number", unit: "W" },
          { key: "psuW", label: "Fuente recomendada", type: "number", unit: "W" },
          { key: "powerConnectors", label: "Conectores de energía", type: "text" },
          { key: "lengthMm", label: "Largo", type: "number", unit: "mm" },
          { key: "slots", label: "Ranuras que ocupa", type: "number" },
          { key: "fans", label: "Ventiladores", type: "number" },
          { key: "backplate", label: "Backplate", type: "boolean" },
        ],
      },
    ],
  },

  "memorias-ram": {
    label: "Memorias RAM",
    group: "componentes",
    subcategories: { ddr4: "DDR4", ddr5: "DDR5" },
    brands: ["Kingston", "Corsair", "G.Skill", "Adata", "Crucial", "PNY"],
    sections: [
      {
        title: "Capacidad",
        fields: [
          { key: "formFactor", label: "Formato", type: "select", options: ["DIMM (PC)", "SO-DIMM (notebook)"] },
          { key: "capacityGb", label: "Capacidad total", type: "number", unit: "GB" },
          { key: "modules", label: "Módulos", type: "select", options: ["1 × módulo", "2 × módulos (kit)", "4 × módulos (kit)"] },
        ],
      },
      {
        title: "Rendimiento",
        fields: [
          { key: "speedMhz", label: "Velocidad", type: "number", unit: "MHz" },
          { key: "latencyCl", label: "Latencia (CL)", type: "number" },
          { key: "voltage", label: "Voltaje", type: "number", unit: "V" },
          { key: "profile", label: "Perfil de overclock", type: "select", options: ["XMP", "EXPO", "XMP y EXPO", "Ninguno"] },
        ],
      },
      {
        title: "Diseño",
        fields: [
          { key: "heatsink", label: "Disipador", type: "boolean" },
          { key: "rgb", label: "RGB", type: "boolean" },
        ],
      },
    ],
  },

  motherboards: {
    label: "Motherboards",
    group: "componentes",
    subcategories: { am5: "AMD AM5", am4: "AMD AM4", lga1700: "Intel LGA1700", lga1851: "Intel LGA1851" },
    brands: ["Asus", "MSI", "Gigabyte Aorus", "Asrock"],
    sections: [
      {
        title: "Plataforma",
        fields: [
          { key: "chipset", label: "Chipset", type: "text" },
          { key: "formFactor", label: "Formato", type: "select", options: ["ATX", "Micro-ATX", "Mini-ITX", "E-ATX"] },
        ],
      },
      {
        title: "Memoria",
        fields: [
          { key: "memoryType", label: "Tipo de memoria", type: "select", options: MEMORY_TYPES },
          { key: "memorySlots", label: "Ranuras de memoria", type: "number" },
          { key: "maxMemoryGb", label: "Memoria máxima", type: "number", unit: "GB" },
        ],
      },
      {
        title: "Almacenamiento y expansión",
        fields: [
          { key: "m2Slots", label: "Ranuras M.2", type: "number" },
          { key: "sataPorts", label: "Puertos SATA", type: "number" },
          { key: "pcieX16", label: "Ranuras PCIe x16", type: "number" },
        ],
      },
      {
        title: "Conectividad",
        fields: [
          { key: "wifi", label: "Wi-Fi", type: "select", options: ["Sin Wi-Fi", "Wi-Fi 6", "Wi-Fi 6E", "Wi-Fi 7"] },
          { key: "bluetooth", label: "Bluetooth", type: "boolean" },
          { key: "lanGbps", label: "Red cableada", type: "number", unit: "Gbps" },
          { key: "usbPorts", label: "Puertos USB traseros", type: "number" },
        ],
      },
    ],
  },

  gabinetes: {
    label: "Gabinetes",
    group: "componentes",
    subcategories: { atx: "ATX", "micro-atx": "Micro-ATX", "mini-itx": "Mini-ITX" },
    brands: ["Corsair", "NZXT", "Cooler Master", "Thermaltake", "Deepcool", "Antec", "AeroCool", "Gamemax", "Sentey", "Cougar", "Asus"],
    sections: [
      {
        title: "Formato",
        fields: [
          { key: "formFactor", label: "Tipo", type: "select", options: ["Mid Tower", "Full Tower", "Mini Tower", "Compacto"] },
          { key: "motherboards", label: "Motherboards compatibles", type: "text" },
          { key: "sidePanel", label: "Panel lateral", type: "select", options: ["Vidrio templado", "Acrílico", "Sólido"] },
        ],
      },
      {
        title: "Refrigeración",
        fields: [
          { key: "fansIncluded", label: "Ventiladores incluidos", type: "number" },
          { key: "radiatorMm", label: "Radiadores soportados", type: "text" },
          { key: "maxCoolerMm", label: "Altura máxima del cooler", type: "number", unit: "mm" },
          { key: "rgb", label: "RGB", type: "boolean" },
        ],
      },
      {
        title: "Espacio y conexiones",
        fields: [
          { key: "maxGpuMm", label: "Largo máximo de placa de video", type: "number", unit: "mm" },
          { key: "frontPorts", label: "Puertos frontales", type: "text" },
          { key: "psuIncludedW", label: "Fuente incluida", type: "number", unit: "W" },
        ],
      },
    ],
  },

  monitores: {
    label: "Monitores",
    group: "monitores",
    subcategories: { gaming: "Gaming", oficina: "Oficina" },
    brands: ["Samsung", "LG", "AOC", "Asus", "Gigabyte Aorus", "MSI", "ViewSonic", "BenQ", "Philips", "Acer", "Dell"],
    sections: [
      {
        title: "Pantalla",
        fields: [
          { key: "sizeIn", label: "Tamaño", type: "number", unit: "pulgadas" },
          {
            key: "resolution",
            label: "Resolución",
            type: "select",
            options: ["1366 × 768", "1440 × 900", "1920 × 1080 (Full HD)", "2560 × 1080", "2560 × 1440 (2K)", "3440 × 1440", "3840 × 2160 (4K)"],
          },
          { key: "panel", label: "Panel", type: "select", options: ["IPS", "VA", "TN", "OLED", "LED"] },
          { key: "curved", label: "Curvo", type: "boolean" },
          { key: "colors", label: "Colores", type: "text" },
          { key: "viewingAngle", label: "Ángulo de visión", type: "text" },
        ],
      },
      {
        title: "Imagen",
        fields: [
          { key: "refreshHz", label: "Frecuencia de actualización", type: "number", unit: "Hz" },
          { key: "responseMs", label: "Tiempo de respuesta", type: "number", unit: "ms" },
          { key: "brightnessNits", label: "Brillo", type: "number", unit: "cd/m²" },
          { key: "hdr", label: "HDR", type: "select", options: ["No", "HDR10", "HDR400", "HDR600", "HDR1000"] },
          { key: "sync", label: "Sincronización", type: "select", options: ["Sin sincronización", "FreeSync", "G-Sync compatible", "FreeSync y G-Sync"] },
        ],
      },
      {
        title: "Conexiones",
        fields: [
          { key: "hdmi", label: "HDMI", type: "number" },
          { key: "displayPort", label: "DisplayPort", type: "number" },
          { key: "vga", label: "VGA", type: "boolean" },
          { key: "usbC", label: "USB-C", type: "boolean" },
          { key: "speakers", label: "Parlantes", type: "boolean" },
        ],
      },
      {
        title: "Ergonomía",
        fields: [
          { key: "tilt", label: "Inclinación", type: "boolean" },
          { key: "swivel", label: "Giro lateral", type: "boolean" },
          { key: "pivot", label: "Pivote (vertical)", type: "boolean" },
          { key: "heightAdjust", label: "Altura regulable", type: "boolean" },
          { key: "vesa", label: "Montaje VESA", type: "boolean" },
        ],
      },
      {
        title: "Energía y caja",
        fields: [
          { key: "powerW", label: "Consumo", type: "number", unit: "W" },
          { key: "boxContents", label: "Contenido de la caja", type: "text" },
        ],
      },
    ],
  },
};

export const CATEGORY_KEYS = Object.keys(CATEGORIES);

// Grupos para ordenar el catálogo (periféricos, componentes, monitores).
export const GROUPS = { perifericos: "Periféricos", componentes: "Componentes", monitores: "Monitores" };

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

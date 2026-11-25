// Filtros del catálogo: marca, tipo (subcategoría) y algunos campos de la ficha técnica.
// Todo sale de la definición del catálogo: los nombres de los filtros, sus opciones y el
// campo de Mongo que consultan. Lo que llega por la URL y no está en esa lista se ignora.
import { CATEGORIES, filterFields } from "../../public/js/catalogSchema.js";

// Parámetros que ya usa /products. Ningún campo filtrable de la ficha puede llamarse igual.
export const RESERVED_PARAMS = ["q", "category", "sort", "available", "limit", "page", "brand", "sub"];

const ALL_BRANDS = [...new Set(Object.values(CATEGORIES).flatMap((category) => category.brands))];
const BOOLEAN_OPTIONS = [
  { value: "si", label: "Sí", stored: true },
  { value: "no", label: "No", stored: false },
];

// Cada filtro sabe qué parámetro lee, qué campo consulta y qué opciones tiene, en orden.
const dimensionsFor = (category) => {
  const definition = CATEGORIES[category];
  const dimensions = [
    {
      name: "brand",
      label: "Marca",
      path: "brand",
      options: (definition?.brands ?? ALL_BRANDS).map((brand) => ({ value: brand, label: brand, stored: brand })),
    },
  ];
  if (!definition) return dimensions;
  dimensions.push({
    name: "sub",
    label: "Tipo",
    path: "subcategory",
    options: Object.entries(definition.subcategories).map(([value, label]) => ({ value, label, stored: value })),
  });
  for (const field of filterFields(category)) {
    dimensions.push({
      name: field.key,
      label: field.label,
      path: `specs.${field.key}`,
      options: field.type === "boolean" ? BOOLEAN_OPTIONS : field.options.map((option) => ({ value: option, label: option, stored: option })),
    });
  }
  return dimensions;
};

// Lee los filtros de la URL. Devuelve solo los válidos para la categoría: un valor
// inventado, un array (?brand=a&brand=b) o un objeto ({"$ne": null}) no llega a la consulta.
export const readCatalogFilters = (query, category) => {
  const filters = {};
  for (const dimension of dimensionsFor(category)) {
    const raw = query[dimension.name];
    if (typeof raw !== "string") continue;
    if (dimension.options.some((option) => option.value === raw)) filters[dimension.name] = raw;
  }
  return filters;
};

// Convierte los filtros elegidos en condiciones de Mongo. Las claves salen de la
// definición del catálogo, nunca de la URL; los valores ya fueron validados.
export const filtersToMatch = (filters, category, except = null) => {
  const match = {};
  for (const dimension of dimensionsFor(category)) {
    if (dimension.name === except || !(dimension.name in filters)) continue;
    match[dimension.path] = dimension.options.find((option) => option.value === filters[dimension.name]).stored;
  }
  return match;
};

// Opciones de cada filtro con la cantidad de productos que quedarían al elegirla.
// Cada filtro cuenta con los demás filtros aplicados, pero no con el suyo: así se puede
// cambiar de marca sin tener que quitar la anterior. Una sola consulta con $facet.
export const catalogFacets = async (Product, base, filters, category) => {
  const dimensions = dimensionsFor(category);
  const facet = Object.fromEntries(
    dimensions.map((dimension) => [
      dimension.name,
      [{ $match: filtersToMatch(filters, category, dimension.name) }, { $group: { _id: `$${dimension.path}`, count: { $sum: 1 } } }],
    ])
  );
  const [counts] = await Product.aggregate([{ $match: base }, { $facet: facet }]);

  return dimensions
    .map((dimension) => {
      const byValue = new Map(counts[dimension.name].map((row) => [row._id, row.count]));
      const options = dimension.options
        .map((option) => ({
          value: option.value,
          label: option.label,
          count: byValue.get(option.stored) ?? 0,
          selected: filters[dimension.name] === option.value,
        }))
        .filter((option) => option.count > 0 || option.selected);
      return { name: dimension.name, label: dimension.label, options, selected: options.find((option) => option.selected) ?? null };
    })
    // Un filtro con una sola opción no ayuda a elegir: se muestra solo si ya está aplicado.
    .filter((facet) => facet.options.length > 1 || facet.selected);
};

// Los filtros de orden, cantidad, stock y de la ficha se aplican al cambiar, sin tocar "Buscar".
document.querySelectorAll("[data-autosubmit]").forEach((el) =>
  el.addEventListener("change", () => el.form.requestSubmit())
);

// Los campos vacíos ("Todas") no viajan en la URL: queda /products?category=mouse&brand=Razer
// en lugar de una lista de parámetros vacíos.
document.querySelector("[data-catalog-form]")?.addEventListener("formdata", (event) => {
  for (const [name, value] of [...event.formData]) if (value === "") event.formData.delete(name);
});

// En celular los filtros arrancan plegados para que se vean los productos, salvo que
// haya alguno aplicado. Sin JavaScript quedan abiertos.
const facets = document.querySelector("[data-facets]");
if (facets && !facets.hasAttribute("data-active") && matchMedia("(max-width: 640px)").matches) facets.open = false;

// Los filtros de orden, cantidad y stock se aplican al cambiar, sin tocar "Buscar".
document.querySelectorAll("[data-autosubmit]").forEach((el) =>
  el.addEventListener("change", () => el.form.requestSubmit())
);

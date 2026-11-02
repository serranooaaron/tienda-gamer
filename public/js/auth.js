import { api } from "./app.js";

// Formularios de login y registro: validan en el navegador, llaman a la API
// y, si todo sale bien, vuelven a la pagina desde donde se pidio el login.
document.querySelectorAll("[data-auth-form]").forEach((form) => {
  const errorEl = form.querySelector("[data-form-error]");
  const submit = form.querySelector('[type="submit"]');

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorEl.textContent = "";

    if (!form.checkValidity()) {
      const invalid = form.querySelector(":invalid");
      errorEl.textContent = invalid.validationMessage;
      invalid.focus();
      return;
    }

    submit.disabled = true;
    try {
      await api(form.dataset.authForm, { method: "POST", body: Object.fromEntries(new FormData(form)) });
      window.location.href = form.dataset.next || "/products";
    } catch (error) {
      errorEl.textContent = error.message;
      submit.disabled = false;
    }
  });
});

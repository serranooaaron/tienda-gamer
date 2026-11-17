import { api } from "./app.js";
import { passwordChecks } from "./passwordPolicy.js";

// Registro: marca cada requisito de la contraseña mientras se escribe.
const rulesList = document.querySelector("[data-password-rules]");
if (rulesList) {
  const form = rulesList.closest("form");
  const passwordInput = form.querySelector("[data-password]");
  const update = () => {
    const person = { email: form.elements.email.value, first_name: form.elements.first_name.value, last_name: form.elements.last_name.value };
    const checks = passwordChecks(passwordInput.value, person);
    for (const { id, ok } of checks) {
      const item = rulesList.querySelector(`[data-rule="${id}"]`);
      item.classList.toggle("is-ok", ok);
      item.querySelector("[data-rule-state]").textContent = ok ? ": cumplido" : ": falta";
    }
    const missing = checks.filter((check) => !check.ok);
    passwordInput.setCustomValidity(missing.length ? `La contraseña necesita: ${missing.map((check) => check.label.toLowerCase()).join(", ")}` : "");
  };
  form.addEventListener("input", update);
  update();
}

// Formularios de login y registro: validan en el navegador, llaman a la API
// y, si todo sale bien, vuelven a la pagina desde donde se pidio el login.
document.querySelectorAll("[data-auth-form]").forEach((form) => {
  const errorEl = form.querySelector("[data-form-error]");
  const submit = form.querySelector('[type="submit"]');

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorEl.textContent = "";
    form.querySelectorAll("[aria-invalid]").forEach((field) => field.removeAttribute("aria-invalid"));

    if (!form.checkValidity()) {
      const invalid = form.querySelector(":invalid");
      const fieldName = invalid.labels?.[0]?.textContent.trim();
      errorEl.textContent = `${fieldName ? `${fieldName}: ` : ""}${invalid.validationMessage}`;
      invalid.setAttribute("aria-invalid", "true");
      invalid.focus();
      return;
    }

    const label = submit.textContent;
    submit.disabled = true;
    submit.setAttribute("aria-busy", "true");
    submit.textContent = "Un momento…";
    try {
      await api(form.dataset.authForm, { method: "POST", body: Object.fromEntries(new FormData(form)) });
      window.location.href = form.dataset.next || "/products";
    } catch (error) {
      errorEl.textContent = error.message;
      submit.disabled = false;
      submit.removeAttribute("aria-busy");
      submit.textContent = label;
    }
  });
});

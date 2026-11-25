import { api } from "./app.js";
import { passwordChecks } from "./passwordPolicy.js";

// Formularios de "olvidé mi contraseña" y "crear contraseña nueva": validan en el navegador,
// envían con el botón deshabilitado y, al terminar, reemplazan el formulario por el aviso.
const wire = (form, { url, done }) => {
  if (!form) return;
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
      const data = await api(url, { method: "POST", body: Object.fromEntries(new FormData(form)) });
      form.hidden = true;
      const notice = form.parentElement.querySelector("[data-form-done]");
      notice.textContent = data.message;
      notice.hidden = false;
      notice.tabIndex = -1;
      notice.focus();
      done?.();
    } catch (error) {
      errorEl.textContent = error.message;
      submit.disabled = false;
      submit.removeAttribute("aria-busy");
      submit.textContent = label;
    }
  });
};

wire(document.querySelector("[data-forgot-form]"), { url: "/api/sessions/forgot" });

const resetForm = document.querySelector("[data-reset-form]");
if (resetForm) {
  // Misma lista de requisitos que el registro, marcada mientras se escribe.
  const input = resetForm.querySelector("[data-password]");
  const rulesList = resetForm.querySelector("[data-password-rules]");
  const person = { email: resetForm.dataset.email, first_name: resetForm.dataset.firstName, last_name: resetForm.dataset.lastName };
  const update = () => {
    const checks = passwordChecks(input.value, person);
    for (const { id, ok } of checks) {
      const item = rulesList.querySelector(`[data-rule="${id}"]`);
      item.classList.toggle("is-ok", ok);
      item.querySelector("[data-rule-state]").textContent = ok ? ": cumplido" : ": falta";
    }
    const missing = checks.filter((check) => !check.ok);
    input.setCustomValidity(missing.length ? `La contraseña necesita: ${missing.map((check) => check.label.toLowerCase()).join(", ")}` : "");
  };
  input.addEventListener("input", update);
  update();
  wire(resetForm, {
    url: "/api/sessions/reset",
    done: () => { document.querySelector("[data-login-link]").hidden = false; },
  });
}

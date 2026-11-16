// Selector de cantidad: no deja bajar de 1 ni pasar el stock disponible.
const stepper = document.querySelector("[data-stepper]");
if (stepper) {
  const input = stepper.querySelector("input");
  const max = Number(stepper.dataset.max);
  const clamp = (value) => Math.min(max, Math.max(1, Number(value) || 1));
  stepper.addEventListener("click", (event) => {
    const button = event.target.closest("[data-step]");
    if (button) input.value = clamp(Number(input.value) + Number(button.dataset.step));
  });
  input.addEventListener("change", () => (input.value = clamp(input.value)));
}

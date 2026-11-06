import { api, toast } from "./app.js";

const button = document.querySelector("[data-confirm-order]");

button?.addEventListener("click", async () => {
  // Deshabilitado durante el pedido: un doble clic no manda dos compras.
  button.disabled = true;
  button.textContent = "Confirmando…";
  try {
    const { payload } = await api("/api/orders", { method: "POST" });
    window.location.assign(`/orders/${payload._id}?nueva=1`);
  } catch (error) {
    toast(error.message, { type: "error" });
    button.disabled = false;
    button.textContent = "Confirmar compra";
  }
});

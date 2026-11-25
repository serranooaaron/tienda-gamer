import { api, toast } from "./app.js";

// Pide al servidor la dirección de pago de una orden y lleva al comprador a Mercado Pago.
const goToPayment = async (orderId) => {
  const { payload } = await api(`/api/orders/${orderId}/pay`, { method: "POST" });
  window.location.assign(payload.url);
};

// Revisar la compra → crea la orden (reserva el stock) → paga en Mercado Pago.
const confirmButton = document.querySelector("[data-confirm-order]");
confirmButton?.addEventListener("click", async () => {
  // Deshabilitado durante el pedido: un doble clic no manda dos compras.
  confirmButton.disabled = true;
  confirmButton.textContent = "Preparando el pago…";
  let order;
  try {
    ({ payload: order } = await api("/api/orders", { method: "POST" }));
  } catch (error) {
    toast(error.message, { type: "error" });
    confirmButton.disabled = false;
    confirmButton.textContent = "Pagar con Mercado Pago";
    return;
  }
  try {
    await goToPayment(order._id);
  } catch {
    // La orden ya existe y el stock está reservado: desde su detalle se puede reintentar el pago.
    window.location.assign(`/orders/${order._id}?nueva=1`);
  }
});

// Detalle de una compra pendiente: "Pagar con Mercado Pago".
const payButton = document.querySelector("[data-pay-order]");
payButton?.addEventListener("click", async () => {
  payButton.disabled = true;
  payButton.textContent = "Abriendo Mercado Pago…";
  try {
    await goToPayment(payButton.dataset.payOrder);
  } catch (error) {
    toast(error.message, { type: "error" });
    payButton.disabled = false;
    payButton.textContent = "Pagar con Mercado Pago";
  }
});

import { api, countItems, formatMoney, setCartCount, toast } from "./app.js";

const cartEl = document.querySelector("[data-cart]");
const cid = cartEl?.dataset.cart;

// Recalcula subtotales, totales y estado vacio a partir de la respuesta de la API.
const render = (items) => {
  const byId = new Map(items.map((item) => [item.product._id, item]));

  cartEl.querySelectorAll("[data-item]").forEach((row) => {
    const item = byId.get(row.dataset.item);
    if (!item) return row.remove();
    row.querySelector("[data-qty-value]").textContent = item.quantity;
    row.querySelector("[data-subtotal]").textContent = formatMoney(item.product.price * item.quantity);
    row.querySelector('[data-qty="1"]').disabled = item.quantity >= item.product.stock;
    row.querySelector('[data-qty="-1"]').disabled = item.quantity <= 1;
  });

  const totalItems = countItems(items);
  const totalAmount = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  cartEl.querySelector("[data-total-items]").textContent = totalItems;
  cartEl.querySelector("[data-total-amount]").textContent = formatMoney(totalAmount);
  cartEl.querySelector("[data-empty]").hidden = items.length > 0;
  cartEl.querySelector("[data-summary]").hidden = items.length === 0;
  setCartCount(totalItems);
};

const withBusy = async (element, action) => {
  element.setAttribute("aria-busy", "true");
  try {
    await action();
  } catch (error) {
    toast(error.message, { type: "error" });
  } finally {
    element.removeAttribute("aria-busy");
  }
};

cartEl?.addEventListener("click", (event) => {
  const row = event.target.closest("[data-item]");
  const pid = row?.dataset.item;

  const qtyButton = event.target.closest("[data-qty]");
  if (qtyButton && row) {
    const current = Number(row.querySelector("[data-qty-value]").textContent);
    const quantity = current + Number(qtyButton.dataset.qty);
    if (quantity < 1) return;
    return withBusy(row, async () => {
      const { payload } = await api(`/api/carts/${cid}/products/${pid}`, { method: "PUT", body: { quantity } });
      render(payload);
    });
  }

  if (event.target.closest("[data-remove]") && row) {
    return withBusy(row, async () => {
      const { payload } = await api(`/api/carts/${cid}/products/${pid}`, { method: "DELETE" });
      render(payload);
      toast("Producto quitado del carrito");
    });
  }

  const emptyButton = event.target.closest("[data-empty-cart]");
  if (emptyButton) {
    if (!confirm("¿Vaciar todo el carrito?")) return;
    return withBusy(emptyButton, async () => {
      const { payload } = await api(`/api/carts/${cid}`, { method: "DELETE" });
      render(payload);
      toast("Carrito vaciado");
    });
  }
});

// Estado inicial de los botones (+ deshabilitado si ya se alcanzo el stock).
cartEl?.querySelectorAll("[data-item]").forEach((row) => {
  const qty = Number(row.querySelector("[data-qty-value]").textContent);
  row.querySelector('[data-qty="1"]').disabled = qty >= Number(row.dataset.stock);
  row.querySelector('[data-qty="-1"]').disabled = qty <= 1;
});

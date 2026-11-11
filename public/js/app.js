// Utilidades compartidas por todas las paginas: avisos, llamadas a la API,
// contador del carrito, menu movil y cierre de sesion.

export const toast = (message, { type = "ok", action } = {}) => {
  const container = document.getElementById("toasts");
  if (!container) return;
  const el = document.createElement("div");
  el.className = `toast${type === "error" ? " toast--error" : ""}`;
  el.textContent = message;
  if (action) {
    const link = document.createElement("a");
    link.href = action.href;
    link.textContent = action.label;
    el.append(link);
  }
  container.append(el);
  setTimeout(() => el.remove(), 3500);
};

// fetch a la API con JSON o FormData (archivos); lanza un Error con el mensaje del servidor si falla.
export const api = async (url, { method = "GET", body } = {}) => {
  const isForm = body instanceof FormData;
  const res = await fetch(url, {
    method,
    headers: body && !isForm ? { "Content-Type": "application/json" } : undefined,
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
    credentials: "same-origin"
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.message || "Ocurrió un error, intenta de nuevo");
    error.status = res.status;
    throw error;
  }
  return data;
};

export const setCartCount = (count) => {
  const badge = document.getElementById("cart-badge");
  if (!badge) return;
  badge.textContent = count;
  badge.dataset.count = count;
};

export const countItems = (items) => items.reduce((sum, item) => sum + item.quantity, 0);

export const formatMoney = (value) =>
  new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(value);

// Agrega un producto al carrito del usuario logueado. Si no hay sesion, lleva al login.
export const addToCart = async (pid, quantity = 1) => {
  try {
    const { payload: cart } = await api("/api/carts", { method: "POST" });
    const { payload: items } = await api(`/api/carts/${cart._id}/products/${pid}`, {
      method: "POST",
      body: { quantity }
    });
    setCartCount(countItems(items));
    toast("Producto agregado al carrito", { action: { href: "/cart", label: "Ver carrito" } });
    return true;
  } catch (error) {
    if (error.status === 401) {
      window.location.href = `/login?next=${encodeURIComponent(location.pathname + location.search)}`;
      return false;
    }
    toast(error.message, { type: "error" });
    return false;
  }
};

// Botones "Agregar" de cualquier pagina: <button data-add-to-cart="ID">
document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-add-to-cart]");
  if (!button) return;
  event.preventDefault();
  const qtyInput = button.dataset.qtyInput ? document.querySelector(button.dataset.qtyInput) : null;
  const quantity = qtyInput ? Number(qtyInput.value) || 1 : 1;
  button.disabled = true;
  await addToCart(button.dataset.addToCart, quantity);
  button.disabled = false;
});

document.querySelector("[data-logout]")?.addEventListener("click", async () => {
  await api("/api/sessions/logout", { method: "POST" }).catch(() => {});
  window.location.href = "/";
});

const navToggle = document.querySelector("[data-nav-toggle]");
navToggle?.addEventListener("click", () => {
  const nav = document.getElementById("main-nav");
  const open = nav.classList.toggle("is-open");
  navToggle.setAttribute("aria-expanded", String(open));
});

// Cierra el menu de usuario al hacer clic afuera.
document.addEventListener("click", (event) => {
  const menu = document.querySelector(".user-menu[open]");
  if (menu && !menu.contains(event.target)) menu.removeAttribute("open");
});

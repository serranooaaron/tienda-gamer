const CART_STORAGE_KEY = "cart-id-my-ecommerce";

const createNewCart = async () => {
  const response = await fetch("/api/carts", { method: "POST" });
  if (!response.ok) {
    throw new Error("No se pudo crear el carrito");
  }

  const data = await response.json();
  return data.payload._id;
};

const cartExists = async (cid) => {
  const response = await fetch(`/api/carts/${cid}`);
  return response.ok;
};

const openCart = async () => {
  try {
    let cid = localStorage.getItem(CART_STORAGE_KEY);

    if (cid && !(await cartExists(cid))) {
      localStorage.removeItem(CART_STORAGE_KEY);
      cid = null;
    }

    if (!cid) {
      cid = await createNewCart();
      localStorage.setItem(CART_STORAGE_KEY, cid);
    }

    window.location.href = `/carts/${cid}`;
  } catch (error) {
    console.error(error);
    alert("No fue posible abrir tu carrito");
    window.location.href = "/products";
  }
};

openCart();

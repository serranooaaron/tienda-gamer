import { api, toast } from "./app.js";

const dialog = document.getElementById("product-dialog");
const form = document.getElementById("product-form");
const errorEl = form.querySelector("[data-form-error]");
const preview = document.getElementById("f-thumbnail-preview");
const thumbSelect = form.elements.thumbnail;
let editingId = null;

// Muestra un aviso despues de recargar la pagina (si el navegador permite sessionStorage).
const FLASH_KEY = "admin-flash";
const reloadWith = (message) => {
  try { sessionStorage.setItem(FLASH_KEY, message); } catch {}
  window.location.reload();
};
try {
  const flash = sessionStorage.getItem(FLASH_KEY);
  if (flash) {
    sessionStorage.removeItem(FLASH_KEY);
    toast(flash);
  }
} catch {}

const updatePreview = () => (preview.src = thumbSelect.value || "");
thumbSelect.addEventListener("change", updatePreview);

// "Subir imagen nueva": la sube apenas se elige, la agrega al selector y la deja elegida.
const fileInput = form.querySelector("[data-image-upload]");
const uploadLabel = form.querySelector("[data-image-upload-label]");
const uploadStatus = form.querySelector("[data-image-upload-status]");
const UPLOAD_HINT = uploadStatus.textContent;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

fileInput.addEventListener("change", async () => {
  const file = fileInput.files[0];
  if (!file) return;
  errorEl.textContent = "";
  if (file.size > MAX_IMAGE_BYTES) {
    errorEl.textContent = "La imagen no puede superar 2 MB";
    fileInput.value = "";
    return;
  }

  const body = new FormData();
  body.append("image", file);
  fileInput.disabled = true;
  uploadLabel.classList.add("is-busy");
  uploadStatus.textContent = "Subiendo imagen…";
  try {
    const { payload } = await api("/api/products/images", { method: "POST", body });
    thumbSelect.prepend(new Option(payload.url, payload.url));
    thumbSelect.value = payload.url;
    updatePreview();
    uploadStatus.textContent = "Imagen subida y elegida. Guarda el producto para usarla.";
  } catch (error) {
    errorEl.textContent = error.message;
    uploadStatus.textContent = UPLOAD_HINT;
  } finally {
    fileInput.disabled = false;
    fileInput.value = "";
    uploadLabel.classList.remove("is-busy");
  }
});

const openForm = (product) => {
  editingId = product?._id ?? null;
  form.reset();
  errorEl.textContent = "";
  document.getElementById("product-dialog-title").textContent = editingId ? "Editar producto" : "Nuevo producto";
  if (product) {
    for (const name of ["title", "code", "category", "price", "stock", "description", "thumbnail"]) {
      if (form.elements[name]) form.elements[name].value = product[name] ?? "";
    }
    form.elements.status.checked = product.status;
  }
  updatePreview();
  dialog.showModal();
  form.elements.title.focus();
};

const rowProduct = (el) => JSON.parse(el.closest("[data-product]").dataset.product);

document.querySelector("[data-new-product]").addEventListener("click", () => openForm(null));
dialog.querySelectorAll("[data-close]").forEach((btn) => btn.addEventListener("click", () => dialog.close()));

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  errorEl.textContent = "";
  if (!form.checkValidity()) {
    const invalid = form.querySelector(":invalid");
    errorEl.textContent = `${invalid.labels?.[0]?.textContent ?? "Campo"}: ${invalid.validationMessage}`;
    invalid.focus();
    return;
  }

  const data = Object.fromEntries(new FormData(form));
  const body = {
    ...data,
    price: Number(data.price),
    stock: Number(data.stock),
    status: form.elements.status.checked,
  };

  const submit = form.querySelector('[type="submit"]');
  submit.disabled = true;
  try {
    await api(editingId ? `/api/products/${editingId}` : "/api/products", {
      method: editingId ? "PUT" : "POST",
      body,
    });
    reloadWith(editingId ? "Producto actualizado" : "Producto creado");
  } catch (error) {
    errorEl.textContent = error.message;
    submit.disabled = false;
  }
});

document.querySelector(".table").addEventListener("click", async (event) => {
  const target = event.target;

  if (target.closest("[data-edit]")) return openForm(rowProduct(target));

  if (target.closest("[data-delete]")) {
    const product = rowProduct(target);
    if (!confirm(`¿Borrar "${product.title}"? Esta acción no se puede deshacer.`)) return;
    try {
      await api(`/api/products/${product._id}`, { method: "DELETE" });
      reloadWith("Producto borrado");
    } catch (error) {
      toast(error.message, { type: "error" });
    }
    return;
  }

  const toggle = target.closest("[data-toggle-status]");
  if (toggle) {
    const product = rowProduct(toggle);
    toggle.disabled = true;
    try {
      await api(`/api/products/${product._id}`, { method: "PUT", body: { status: !product.status } });
      reloadWith(product.status ? "Producto pausado" : "Producto publicado");
    } catch (error) {
      toast(error.message, { type: "error" });
      toggle.disabled = false;
    }
  }
});

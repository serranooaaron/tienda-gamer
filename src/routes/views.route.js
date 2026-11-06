import express from "express";
import mongoose from "mongoose";
import Product from "../models/product.model.js";
import Cart from "../models/cart.model.js";
import Order from "../models/order.model.js";
import { ORDERS_LIMIT } from "./orders.route.js";
import { escapeRegex } from "../utils/regex.js";
import { readdir } from "node:fs/promises";
import path from "node:path";
import __dirname from "../../dirname.js";
import { requireAdmin, requireAuth } from "../middlewares/auth.middleware.js";
import { CATEGORY_LABELS } from "../utils/handlebars.js";

const categoryLabel = (value) => CATEGORY_LABELS[value] || value;

const viewsRouter = express.Router();

// Datos comunes a todas las vistas: ruta actual (para marcar el menu) y unidades en el carrito.
viewsRouter.use(async (req, res, next) => {
  res.locals.currentPath = req.path;
  res.locals.cartCount = 0;
  if (req.user?.cart) {
    try {
      const cart = await Cart.findById(req.user.cart).lean();
      res.locals.cartCount = cart ? cart.products.reduce((sum, item) => sum + item.quantity, 0) : 0;
    } catch {
      // Si falla el conteo, la pagina se muestra igual con el carrito en 0.
    }
  }
  next();
});

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) return fallback;
  return parsed;
};

const CATEGORY_ICONS = {
  auriculares: "🎧",
  teclados: "⌨️",
  mouse: "🖱️",
  webcams: "📷",
  microfonos: "🎙️",
};
const CATEGORIES = Product.schema.path("category").enumValues;

const renderError = (res, code, message) =>
  res.status(code).render("error", { title: "Error", code, message });

// Categorias con la cantidad de productos de cada una (para chips y tarjetas).
const getCategoriesWithCount = async () => {
  const counts = await Product.aggregate([
    { $match: { status: true } },
    { $group: { _id: "$category", count: { $sum: 1 } } },
  ]);
  const byCategory = Object.fromEntries(counts.map((c) => [c._id, c.count]));
  return CATEGORIES.map((value) => ({
    value,
    icon: CATEGORY_ICONS[value],
    count: byCategory[value] || 0,
  }));
};

viewsRouter.get("/", async (_req, res) => {
  try {
    const [featured, categories] = await Promise.all([
      Product.find({ status: true, stock: { $gt: 0 } })
        .sort({ price: -1 })
        .limit(4)
        .lean(),
      getCategoriesWithCount(),
    ]);
    return res.render("index", { featured, categories });
  } catch (error) {
    return renderError(res, 500, "No es posible mostrar la página de inicio");
  }
});

const PAGE_SIZE_OPTIONS = [8, 12, 24];

viewsRouter.get("/products", async (req, res) => {
  try {
    const q = req.query.q ? String(req.query.q).trim().slice(0, 60) : "";
    const category = CATEGORIES.includes(req.query.category) ? req.query.category : "";
    const sort = ["asc", "desc"].includes(req.query.sort) ? req.query.sort : "";
    const available = req.query.available === "1";
    const limit = PAGE_SIZE_OPTIONS.includes(Number(req.query.limit)) ? Number(req.query.limit) : 12;
    const page = parsePositiveInt(req.query.page, 1);

    const filter = { status: true };
    if (category) filter.category = category;
    if (available) filter.stock = { $gt: 0 };
    if (q) {
      const pattern = { $regex: escapeRegex(q), $options: "i" };
      filter.$or = [{ title: pattern }, { description: pattern }];
    }

    const options = { limit, page, lean: true };
    if (sort) options.sort = { price: sort === "asc" ? 1 : -1 };

    const [data, categories] = await Promise.all([
      Product.paginate(filter, options),
      getCategoriesWithCount(),
    ]);

    // Arma los links conservando los filtros actuales y cambiando solo lo indicado.
    const buildLink = (overrides) => {
      const params = new URLSearchParams();
      const values = { q, category, sort, available: available ? "1" : "", limit: limit === 12 ? "" : limit, page: "", ...overrides };
      for (const [key, value] of Object.entries(values)) if (value) params.set(key, value);
      const query = params.toString();
      return `/products${query ? `?${query}` : ""}`;
    };

    const pages = Array.from({ length: data.totalPages }, (_, i) => ({
      number: i + 1,
      link: buildLink({ page: i + 1 }),
      active: i + 1 === data.page,
    }));

    return res.render("home", {
      title: category ? categoryLabel(category) : "Productos",
      products: data.docs,
      totalDocs: data.totalDocs,
      pages,
      showPagination: data.totalPages > 1,
      prevLink: data.hasPrevPage ? buildLink({ page: data.prevPage }) : null,
      nextLink: data.hasNextPage ? buildLink({ page: data.nextPage }) : null,
      categoryChips: [
        { label: "Todos", link: buildLink({ category: "" }), active: !category },
        ...categories.map((c) => ({
          label: categoryLabel(c.value),
          icon: c.icon,
          count: c.count,
          link: buildLink({ category: c.value }),
          active: c.value === category,
        })),
      ],
      q,
      category,
      sort,
      available,
      limit,
      pageSizes: PAGE_SIZE_OPTIONS.map((value) => ({ value, selected: value === limit })),
      hasFilters: Boolean(q || category || sort || available),
    });
  } catch (error) {
    return renderError(res, 500, "No es posible mostrar los productos");
  }
});
viewsRouter.get("/products/:pid", async (req, res) => {
  try {
    const pid = req.params.pid;
    if (!mongoose.Types.ObjectId.isValid(pid)) {
      return renderError(res, 404, "Ese producto no existe");
    }

    const product = await Product.findOne({ _id: pid, status: true }).lean();
    if (!product) return renderError(res, 404, "Ese producto no existe o ya no está a la venta");

    const related = await Product.find({ category: product.category, status: true, _id: { $ne: product._id } })
      .limit(4)
      .lean();

    return res.render("productDetail", { title: product.title, product, related });
  } catch (error) {
    return renderError(res, 500, "No es posible mostrar este producto");
  }
});

viewsRouter.get("/detail/:pid", (req, res) => res.redirect(301, `/products/${req.params.pid}`));

// El carrito que se muestra es siempre el del usuario logueado.
viewsRouter.get("/cart", requireAuth, async (req, res) => {
  try {
    const cart = req.user.cart
      ? await Cart.findById(req.user.cart).populate("products.product", "-__v -createdAt -updatedAt").lean()
      : null;

    // Si un producto se borro del catalogo, se descarta de la vista.
    const items = (cart?.products || [])
      .filter((item) => item.product)
      .map((item) => ({ ...item, subtotal: item.product.price * item.quantity }));

    return res.render("cart", {
      title: "Mi carrito",
      cartId: cart?._id.toString(),
      items,
      totalAmount: items.reduce((acc, item) => acc + item.subtotal, 0),
      totalItems: items.reduce((acc, item) => acc + item.quantity, 0),
    });
  } catch (error) {
    return renderError(res, 500, "No es posible mostrar el carrito");
  }
});

// Por qué un producto del carrito no se puede comprar, o null si está todo bien.
const purchaseProblem = ({ product, quantity }) => {
  if (!product.status) return "Ya no está a la venta";
  if (product.stock === 0) return "Sin stock";
  if (quantity > product.stock) return `Solo quedan ${product.stock}`;
  return null;
};

// Revisión antes de confirmar: los datos salen del carrito guardado, no del navegador.
viewsRouter.get("/checkout", requireAuth, async (req, res) => {
  try {
    const cart = req.user.cart
      ? await Cart.findById(req.user.cart).populate("products.product", "-__v -createdAt -updatedAt").lean()
      : null;
    const products = cart?.products || [];
    const items = products
      .filter((item) => item.product)
      .map((item) => ({ ...item, subtotal: item.product.price * item.quantity, problem: purchaseProblem(item) }));

    if (items.length === 0) return res.redirect("/cart");

    return res.render("checkout", {
      title: "Revisa tu compra",
      items,
      totalAmount: items.reduce((acc, item) => acc + item.subtotal, 0),
      totalItems: items.reduce((acc, item) => acc + item.quantity, 0),
      canConfirm: items.length === products.length && items.every((item) => !item.problem),
    });
  } catch (error) {
    return renderError(res, 500, "No es posible mostrar tu compra");
  }
});

viewsRouter.get("/orders", requireAuth, async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user.id }).sort({ createdAt: -1 }).limit(ORDERS_LIMIT).lean();
    return res.render("orders", {
      title: "Mis compras",
      orders: orders.map((order) => ({
        ...order,
        units: order.items.reduce((acc, item) => acc + item.quantity, 0),
      })),
    });
  } catch (error) {
    return renderError(res, 500, "No es posible mostrar tus compras");
  }
});

viewsRouter.get("/orders/:oid", requireAuth, async (req, res) => {
  try {
    const { oid } = req.params;
    const order = mongoose.Types.ObjectId.isValid(oid) ? await Order.findById(oid).lean() : null;
    const canSee = order && (req.user.role === "admin" || order.user.toString() === req.user.id);
    if (!canSee) return renderError(res, 404, "Esa compra no existe");

    return res.render("orderDetail", {
      title: `Compra ${order.code}`,
      order,
      items: order.items.map((item) => ({ ...item, subtotal: item.price * item.quantity })),
      justPlaced: req.query.nueva === "1",
    });
  } catch (error) {
    return renderError(res, 500, "No es posible mostrar esta compra");
  }
});

// Solo se aceptan rutas internas como destino tras el login (evita redirecciones abiertas a otros sitios).
const safeNext = (value) =>
  typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : "/products";

const authPage = (view, title) => (req, res) => {
  const next = safeNext(req.query.next);
  if (req.user) return res.redirect(next);
  return res.render(view, { title, next });
};

viewsRouter.get("/login", authPage("login", "Ingresar"));
viewsRouter.get("/register", authPage("register", "Crear cuenta"));

// Panel de administracion: lista todos los productos (incluso pausados) para gestionarlos.
viewsRouter.get("/admin", requireAdmin, async (req, res) => {
  try {
    const q = req.query.q ? String(req.query.q).trim().slice(0, 60) : "";
    const filter = q
      ? { $or: [{ title: { $regex: escapeRegex(q), $options: "i" } }, { code: { $regex: escapeRegex(q), $options: "i" } }] }
      : {};

    const [products, images, stats] = await Promise.all([
      Product.find(filter).sort({ title: 1 }).lean(),
      readdir(path.join(__dirname, "public", "image")).catch(() => []),
      Product.aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            paused: { $sum: { $cond: ["$status", 0, 1] } },
            outOfStock: { $sum: { $cond: [{ $eq: ["$stock", 0] }, 1, 0] } },
            units: { $sum: "$stock" },
          },
        },
      ]),
    ]);

    return res.render("admin", {
      title: "Administrar productos",
      products,
      q,
      stats: stats[0] || { total: 0, paused: 0, outOfStock: 0, units: 0 },
      categories: CATEGORIES,
      images: images.filter((file) => /\.(png|jpe?g|webp|gif)$/i.test(file)).map((file) => `/image/${file}`),
    });
  } catch (error) {
    return renderError(res, 500, "No es posible mostrar el panel");
  }
});

// Compatibilidad con los links viejos por id de carrito: siempre lleva al carrito propio.
viewsRouter.get("/carts/:cid", (_req, res) => res.redirect("/cart"));

export default viewsRouter;

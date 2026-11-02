import express from "express";
import mongoose from "mongoose";
import Product from "../models/product.model.js";
import Cart from "../models/cart.model.js";
import { escapeRegex } from "../utils/regex.js";
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
viewsRouter.get("/cart", async (_req, res) => {
  return res.render("cartEntry");
});

viewsRouter.get("/products/:pid", async (req, res) => {
  try {
    const pid = req.params.pid;

    if (!mongoose.Types.ObjectId.isValid(pid)) {
      return res
        .status(400)
        .json({ status: "error", message: "Id de producto invalido" });
    }

    const product = await Product.findById(pid).lean();
    if (!product) {
      return res
        .status(404)
        .json({ status: "error", message: "Producto no encontrado" });
    }

    res.render("productDetail", { product });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "No es posible mostrar este producto",
    });
  }
});

viewsRouter.get("/detail/:pid", async (req, res) => {
  return res.redirect(`/products/${req.params.pid}`);
});

viewsRouter.get("/carts/:cid", async (req, res) => {
  try {
    const { cid } = req.params;

    if (!mongoose.Types.ObjectId.isValid(cid)) {
      return res
        .status(400)
        .json({ status: "error", message: "Id de carrito invalido" });
    }

    const cart = await Cart.findById(cid)
      .populate("products.product", "-__v -createdAt -updatedAt")
      .lean();

    if (!cart) {
      return res
        .status(404)
        .json({ status: "error", message: "Carrito no encontrado" });
    }

    const enrichedProducts = cart.products.map((item) => {
      const price = item.product?.price || 0;
      const subtotal = price * item.quantity;

      return {
        ...item,
        subtotal,
      };
    });

    const totalAmount = enrichedProducts.reduce(
      (acc, item) => acc + item.subtotal,
      0,
    );
    // Se separa total de items y total monetario para renderizar resumen de carrito.
    const totalItems = enrichedProducts.reduce(
      (acc, item) => acc + item.quantity,
      0,
    );

    return res.render("cart", {
      cartId: cart._id.toString(),
      products: enrichedProducts,
      totalAmount,
      totalItems,
    });
  } catch (error) {
    return res
      .status(500)
      .json({ status: "error", message: "No es posible mostrar el carrito" });
  }
});

export default viewsRouter;

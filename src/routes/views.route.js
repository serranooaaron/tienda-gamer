import express from "express";
import mongoose from "mongoose";
import Product from "../models/product.model.js";
import Cart from "../models/cart.model.js";

const viewsRouter = express.Router();

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) return fallback;
  return parsed;
};

const buildProductsFilter = (queryValue) => {
  if (!queryValue) return {};

  const normalized = String(queryValue).trim().toLowerCase();

  if (normalized === "true" || normalized === "false") {
    return { status: normalized === "true" };
  }

  return {
    $or: [
      { category: normalized },
      { title: { $regex: normalized, $options: "i" } },
      { description: { $regex: normalized, $options: "i" } },
    ],
  };
};

const getProductsViewHandler = async (req, res) => {
  try {
    const limit = parsePositiveInt(req.query.limit, 10);
    const page = parsePositiveInt(req.query.page, 1);
    const sortParam = req.query.sort
      ? String(req.query.sort).toLowerCase()
      : null;
    const queryParam = req.query.query ? String(req.query.query).trim() : "";

    const filter = buildProductsFilter(queryParam);
    const options = { limit, page, lean: true };

    // Repite la misma semantica de API: ordenar por precio solo cuando llega sort.
    if (sortParam === "asc" || sortParam === "desc") {
      options.sort = { price: sortParam === "asc" ? 1 : -1 };
    }

    const data = await Product.paginate(filter, options);

    const links = [];
    for (let i = 1; i <= data.totalPages; i++) {
      // Reconstruye links de paginacion preservando filtros y orden actuales.
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      params.set("page", String(i));
      if (queryParam) params.set("query", queryParam);
      if (sortParam === "asc" || sortParam === "desc")
        params.set("sort", sortParam);

      links.push({
        number: i,
        link: `/products?${params.toString()}`,
        active: i === data.page,
      });
    }

    return res.render("home", {
      products: data.docs,
      links,
      page: data.page,
      totalPages: data.totalPages,
      hasPrevPage: data.hasPrevPage,
      hasNextPage: data.hasNextPage,
      prevPage: data.prevPage,
      nextPage: data.nextPage,
      queryValue: queryParam,
      sortValue: sortParam || "",
      isSortAsc: sortParam === "asc",
      isSortDesc: sortParam === "desc",
      limitValue: limit,
    });
  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: "No es posible mostrar los productos",
    });
  }
};

viewsRouter.get("/", async (_req, res) => {
  return res.render("index");
});

viewsRouter.get("/products", getProductsViewHandler);
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

import express from "express";
import mongoose from "mongoose";
import Product from "../models/product.model.js";
import { requireAdmin } from "../middlewares/auth.middleware.js";

const productsRouter = express.Router();

// Traduce errores de Mongoose a respuestas claras en lugar de un 500 generico.
const productErrorResponse = (res, error, fallbackMessage) => {
  if (error.name === "ValidationError" || error.name === "CastError") {
    return res.status(400).json({ status: "error", message: "Datos del producto invalidos" });
  }
  if (error.code === 11000) {
    return res.status(409).json({ status: "error", message: "Ya existe un producto con ese titulo o codigo" });
  }
  return res.status(500).json({ status: "error", message: fallbackMessage });
};

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) return fallback;
  return parsed;
};

const buildProductsFilter = (queryValue) => {
  if (!queryValue) return {};

  const normalized = String(queryValue).trim().toLowerCase();

  // Permite usar query=true/false para filtrar por disponibilidad.
  if (normalized === "true" || normalized === "false") {
    return { status: normalized === "true" };
  }

  // Fallback flexible: categoria exacta o coincidencia parcial en texto.
  return {
    $or: [
      { category: normalized },
      { title: { $regex: normalized, $options: "i" } },
      { description: { $regex: normalized, $options: "i" } },
    ],
  };
};

const buildPageLink = (baseUrl, currentQuery, page) => {
  if (!page) return null;

  // Reutiliza los filtros actuales y solo reemplaza la pagina destino.
  const params = new URLSearchParams(currentQuery);
  params.set("page", String(page));
  return `${baseUrl}?${params.toString()}`;
};

productsRouter.post("/", requireAdmin, async (req, res) => {
  try {
    const newProduct = req.body;

    const product = await Product.create(newProduct);
    res.status(201).json({ status: "success", payload: product });
  } catch (error) {
    productErrorResponse(res, error, "Error al agregar un producto");
  }
});

productsRouter.get("/", async (req, res) => {
  try {
    const limit = parsePositiveInt(req.query.limit, 10);
    const page = parsePositiveInt(req.query.page, 1);
    const sortParam = req.query.sort
      ? String(req.query.sort).toLowerCase()
      : null;
    const queryParam = req.query.query;

    const filter = buildProductsFilter(queryParam);
    const options = {
      limit,
      page,
      select: "-__v -createdAt -updatedAt",
    };

    // El ordenamiento es opcional; si no llega sort se conserva el orden natural.
    if (sortParam === "asc" || sortParam === "desc") {
      options.sort = { price: sortParam === "asc" ? 1 : -1 };
    }

    const data = await Product.paginate(filter, options);

    // Se adapta la respuesta del plugin paginate al contrato pedido por la entrega.
    const payload = data.docs;
    const response = {
      status: "success",
      payload,
      totalPages: data.totalPages,
      prevPage: data.prevPage,
      nextPage: data.nextPage,
      page: data.page,
      hasPrevPage: data.hasPrevPage,
      hasNextPage: data.hasNextPage,
      prevLink: data.hasPrevPage
        ? buildPageLink(
            req.baseUrl || "/api/products",
            req.query,
            data.prevPage,
          )
        : null,
      nextLink: data.hasNextPage
        ? buildPageLink(
            req.baseUrl || "/api/products",
            req.query,
            data.nextPage,
          )
        : null,
    };

    res.status(200).json(response);
  } catch (error) {
    res
      .status(500)
      .json({ status: "error", message: "Error al listar los productos" });
  }
});

productsRouter.get("/:pid", async (req, res) => {
  try {
    const pid = req.params.pid;
    if (!mongoose.Types.ObjectId.isValid(pid)) {
      return res
        .status(400)
        .json({ status: "error", message: "Id de producto invalido" });
    }

    const product = await Product.findById(pid);
    if (!product)
      return res
        .status(404)
        .json({ status: "error", message: "Producto no encontrado" });

    res.status(200).json({ status: "success", payload: product });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Error al traer un producto por su id",
    });
  }
});

productsRouter.put("/:pid", requireAdmin, async (req, res) => {
  try {
    const pid = req.params.pid;
    const updateData = req.body;

    if (!mongoose.Types.ObjectId.isValid(pid)) {
      return res
        .status(400)
        .json({ status: "error", message: "Id de producto invalido" });
    }

    const updatedProduct = await Product.findByIdAndUpdate(pid, updateData, {
      new: true,
      runValidators: true,
    });
    if (!updatedProduct)
      return res
        .status(404)
        .json({ status: "error", message: "Producto no encontrado" });

    res.status(200).json({ status: "success", payload: updatedProduct });
  } catch (error) {
    productErrorResponse(res, error, "Error al actualizar el producto");
  }
});

productsRouter.delete("/:pid", requireAdmin, async (req, res) => {
  try {
    const pid = req.params.pid;

    if (!mongoose.Types.ObjectId.isValid(pid)) {
      return res
        .status(400)
        .json({ status: "error", message: "Id de producto invalido" });
    }

    const deletedProduct = await Product.findByIdAndDelete(pid);
    if (!deletedProduct)
      return res
        .status(404)
        .json({ status: "error", message: "Producto no encontrado" });

    res.status(204).send({});
  } catch (error) {
    res
      .status(500)
      .json({ status: "error", message: "Error al borrar el producto" });
  }
});

export default productsRouter;

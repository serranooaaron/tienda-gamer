import express from "express";
import mongoose from "mongoose";
import Cart from "../models/cart.model.js";
import Product from "../models/product.model.js";
import User from "../models/user.model.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { COOKIE_NAME, cookieOptions, signToken } from "../utils/auth.js";

const cartRouter = express.Router();

// Todo el carrito requiere sesion, y cada usuario solo puede operar sobre su propio carrito.
cartRouter.use(requireAuth);
cartRouter.param("cid", (req, res, next, cid) => {
  if (req.user.role === "admin" || req.user.cart === cid) return next();
  return res.status(403).json({ status: "error", message: "Este carrito no te pertenece" });
});

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

const parseQuantity = (value) => {
  // Normaliza number/string para aceptar payloads comunes de Postman o frontend.
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
};

const getCartWithPopulate = async (cid) => {
  return Cart.findById(cid).populate(
    "products.product",
    "-__v -createdAt -updatedAt",
  );
};

const addProductToCartHandler = async (req, res) => {
  try {
    const { cid, pid } = req.params;
    const { quantity } = req.body;
    const parsedQuantity = parseQuantity(quantity);

    if (!isValidObjectId(cid) || !isValidObjectId(pid)) {
      return res.status(400).json({
        status: "error",
        message: "Id de carrito o producto invalido",
      });
    }

    if (parsedQuantity === null) {
      return res.status(400).json({
        status: "error",
        message: "La cantidad debe ser un numero entero mayor a 0",
      });
    }

    const product = await Product.findById(pid).lean();
    if (!product || !product.status)
      return res
        .status(404)
        .json({ status: "error", message: "Producto no encontrado" });

    const cart = await Cart.findById(cid);
    if (!cart)
      return res
        .status(404)
        .json({ status: "error", message: "Carrito no encontrado" });

    const productIndex = cart.products.findIndex(
      (dataProduct) => dataProduct.product.toString() === pid,
    );

    // No se puede pedir mas de lo que hay en stock, contando lo que ya estaba en el carrito.
    const alreadyInCart = productIndex !== -1 ? cart.products[productIndex].quantity : 0;
    if (alreadyInCart + parsedQuantity > product.stock) {
      return res.status(409).json({
        status: "error",
        message: product.stock === 0
          ? "Producto sin stock"
          : `Solo hay ${product.stock} unidades disponibles${alreadyInCart ? ` y ya tienes ${alreadyInCart} en el carrito` : ""}`,
      });
    }

    // Si el producto ya estaba en el carrito, acumula cantidad en lugar de duplicarlo.
    if (productIndex !== -1) {
      cart.products[productIndex].quantity += parsedQuantity;
    } else {
      cart.products.push({ product: pid, quantity: parsedQuantity });
    }

    await cart.save();
    const updatedCart = await getCartWithPopulate(cid);
    return res
      .status(200)
      .json({ status: "success", payload: updatedCart.products });
  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: "Error al agregar un producto al carrito",
    });
  }
};

const updateCartProductQuantityHandler = async (req, res) => {
  try {
    const { cid, pid } = req.params;
    const { quantity } = req.body;
    const parsedQuantity = parseQuantity(quantity);

    if (!isValidObjectId(cid) || !isValidObjectId(pid)) {
      return res.status(400).json({
        status: "error",
        message: "Id de carrito o producto invalido",
      });
    }

    if (parsedQuantity === null) {
      return res.status(400).json({
        status: "error",
        message: "La cantidad debe ser un numero entero mayor a 0",
      });
    }

    const cart = await Cart.findById(cid);
    if (!cart)
      return res
        .status(404)
        .json({ status: "error", message: "Carrito no encontrado" });

    const productIndex = cart.products.findIndex(
      (dataProduct) => dataProduct.product.toString() === pid,
    );
    if (productIndex === -1)
      return res.status(404).json({
        status: "error",
        message: "Producto no encontrado en el carrito",
      });

    const product = await Product.findById(pid).select("stock").lean();
    if (product && parsedQuantity > product.stock) {
      return res.status(409).json({
        status: "error",
        message: `Solo hay ${product.stock} unidades disponibles`,
      });
    }

    cart.products[productIndex].quantity = parsedQuantity;
    await cart.save();

    const updatedCart = await getCartWithPopulate(cid);
    return res
      .status(200)
      .json({ status: "success", payload: updatedCart.products });
  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: "Error al actualizar la cantidad del producto en el carrito",
    });
  }
};

const deleteCartProductHandler = async (req, res) => {
  try {
    const { cid, pid } = req.params;

    if (!isValidObjectId(cid) || !isValidObjectId(pid)) {
      return res.status(400).json({
        status: "error",
        message: "Id de carrito o producto invalido",
      });
    }

    const cart = await Cart.findById(cid);
    if (!cart)
      return res
        .status(404)
        .json({ status: "error", message: "Carrito no encontrado" });

    const existingProduct = cart.products.some(
      (dataProduct) => dataProduct.product.toString() === pid,
    );
    if (!existingProduct)
      return res.status(404).json({
        status: "error",
        message: "Producto no encontrado en el carrito",
      });

    await Cart.findByIdAndUpdate(cid, { $pull: { products: { product: pid } } });
    const updatedCart = await getCartWithPopulate(cid);

    return res
      .status(200)
      .json({ status: "success", payload: updatedCart.products });
  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: "Error al borrar un producto de el carrito",
    });
  }
};

const replaceCartProductsHandler = async (req, res) => {
  try {
    const { cid } = req.params;
    const products = Array.isArray(req.body) ? req.body : req.body.products;

    if (!isValidObjectId(cid)) {
      return res
        .status(400)
        .json({ status: "error", message: "Id de carrito invalido" });
    }

    if (!Array.isArray(products)) {
      return res.status(400).json({
        status: "error",
        message: "Debes enviar un arreglo de productos",
      });
    }

    const normalizedProducts = products.map((item) => ({
      product: item?.product,
      quantity: parseQuantity(item?.quantity),
    }));

    // Corta rapido si hay ids o cantidades invalidas para no tocar el carrito.
    const hasInvalidData = normalizedProducts.some(
      (item) => !isValidObjectId(item.product) || item.quantity === null,
    );
    if (hasInvalidData) {
      return res.status(400).json({
        status: "error",
        message:
          "Cada item debe incluir product valido y quantity entero mayor a 0",
      });
    }

    const productIds = normalizedProducts.map((item) => item.product);
    const availableProducts = await Product.find({
      _id: { $in: productIds },
      status: true,
    })
      .select("stock title")
      .lean();
    // Evita referencias colgantes: todos los productos del arreglo deben existir y estar a la venta.
    if (availableProducts.length !== productIds.length) {
      return res
        .status(404)
        .json({ status: "error", message: "Uno o mas productos no existen" });
    }

    // Mismo limite que al agregar de a uno: no se puede pedir mas de lo que hay en stock.
    const stockById = new Map(availableProducts.map((p) => [p._id.toString(), p]));
    const overStock = normalizedProducts
      .map((item) => ({ ...item, found: stockById.get(String(item.product)) }))
      .find((item) => item.quantity > item.found.stock);
    if (overStock) {
      return res.status(409).json({
        status: "error",
        message: `Solo hay ${overStock.found.stock} unidades disponibles de ${overStock.found.title}`,
      });
    }

    const updatedCart = await Cart.findByIdAndUpdate(
      cid,
      { $set: { products: normalizedProducts } },
      { returnDocument: "after", runValidators: true },
    );

    if (!updatedCart)
      return res
        .status(404)
        .json({ status: "error", message: "Carrito no encontrado" });

    const populatedCart = await getCartWithPopulate(cid);
    return res
      .status(200)
      .json({ status: "success", payload: populatedCart.products });
  } catch (error) {
    return res.status(500).json({
      status: "error",
      message: "Error al actualizar los productos del carrito",
    });
  }
};

// Devuelve el carrito del usuario logueado (lo crea si todavia no tiene uno).
cartRouter.post("/", async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(401).json({ status: "error", message: "Debes iniciar sesion" });

    let cart = user.cart ? await Cart.findById(user.cart) : null;
    if (!cart) {
      cart = await Cart.create({});
      user.cart = cart._id;
      await user.save();
      // El token lleva el id del carrito: se reemite para que apunte al nuevo.
      res.cookie(COOKIE_NAME, signToken(user), cookieOptions());
    }

    res.status(200).json({ status: "success", payload: cart });
  } catch (error) {
    res
      .status(500)
      .json({ status: "error", message: "Error al crear el carrito" });
  }
});

cartRouter.post("/:cid/product/:pid", addProductToCartHandler);
cartRouter.post("/:cid/products/:pid", addProductToCartHandler);

cartRouter.get("/:cid", async (req, res) => {
  try {
    const cid = req.params.cid;
    if (!isValidObjectId(cid)) {
      return res
        .status(400)
        .json({ status: "error", message: "Id de carrito invalido" });
    }

    const cart = await getCartWithPopulate(cid);
    if (!cart)
      return res
        .status(404)
        .json({ status: "error", message: "Carrito no encontrado" });

    res.status(200).json({ status: "success", payload: cart.products });
  } catch (error) {
    res
      .status(500)
      .json({ status: "error", message: "Error al traer el carrito" });
  }
});

//cambiar la cantidad de un producto en el carrito
cartRouter.put("/:cid/product/:pid", updateCartProductQuantityHandler);
cartRouter.put("/:cid/products/:pid", updateCartProductQuantityHandler);

//reemplazar todos los productos del carrito
cartRouter.put("/:cid", replaceCartProductsHandler);

//borrar un producto de un carrito
cartRouter.delete("/:cid/product/:pid", deleteCartProductHandler);
cartRouter.delete("/:cid/products/:pid", deleteCartProductHandler);

//vaciar carrito completamente
cartRouter.delete("/:cid", async (req, res) => {
  try {
    const cid = req.params.cid;

    if (!isValidObjectId(cid)) {
      return res
        .status(400)
        .json({ status: "error", message: "Id de carrito invalido" });
    }

    const updatedCart = await Cart.findByIdAndUpdate(
      cid,
      { $set: { products: [] } },
      { returnDocument: "after" },
    );
    if (!updatedCart)
      return res
        .status(404)
        .json({ status: "error", message: "Carrito no encontrado" });

    res.status(200).json({ status: "success", payload: updatedCart.products });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Error al borrar los productos de el carrito",
    });
  }
});

export default cartRouter;

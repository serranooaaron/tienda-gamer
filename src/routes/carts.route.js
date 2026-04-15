import express from "express";
import mongoose from "mongoose";
import Cart from "../models/cart.model.js";
import Product from "../models/product.model.js";

const cartRouter = express.Router();

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
    if (!product)
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

    await Cart.findByIdAndUpdate(
      cid,
      { $pull: { products: { product: pid } } },
      { new: true },
    );
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
    const existingProductsCount = await Product.countDocuments({
      _id: { $in: productIds },
    });
    // Evita referencias colgantes: todos los productos del arreglo deben existir.
    if (existingProductsCount !== productIds.length) {
      return res
        .status(404)
        .json({ status: "error", message: "Uno o mas productos no existen" });
    }

    const updatedCart = await Cart.findByIdAndUpdate(
      cid,
      { $set: { products: normalizedProducts } },
      { new: true, runValidators: true },
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

cartRouter.post("/", async (req, res) => {
  try {
    const cart = await Cart.create({});

    res.status(201).json({ status: "success", payload: cart });
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
      { new: true },
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

import crypto from "node:crypto";
import Cart from "../models/cart.model.js";
import Order from "../models/order.model.js";
import Product from "../models/product.model.js";

export class CheckoutError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const newOrderCode = () => `TG-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;

const releaseStock = (reserved) =>
  Promise.all(reserved.map(({ product, quantity }) => Product.updateOne({ _id: product }, { $inc: { stock: quantity } })));

const restoreCart = (cartId, products) =>
  Cart.updateOne({ _id: cartId }, { $push: { products: { $each: products } } });

// Convierte el carrito en una orden. Sin transacciones: cada paso es atómico y, si algo
// falla, se deshace lo hecho. Precio y total salen siempre de la base, nunca del cliente.
export const createOrderFromCart = async ({ userId, cartId }) => {
  // Tomar el carrito vaciándolo en una sola operación: de dos pedidos simultáneos, gana uno.
  const claimed = cartId
    ? await Cart.findOneAndUpdate(
        { _id: cartId, "products.0": { $exists: true } },
        { $set: { products: [] } },
        { returnDocument: "before" },
      ).lean()
    : null;
  if (!claimed) throw new CheckoutError(400, "Tu carrito está vacío");

  const reserved = [];
  try {
    const products = await Product.find({ _id: { $in: claimed.products.map((item) => item.product) } }).lean();
    const byId = new Map(products.map((product) => [product._id.toString(), product]));
    const items = [];

    for (const { product: id, quantity } of claimed.products) {
      const product = byId.get(id.toString());
      if (!product?.status) {
        throw new CheckoutError(409, product ? `${product.title} ya no está a la venta` : "Un producto de tu carrito ya no está a la venta");
      }

      // La condición va en la misma operación que el descuento: el stock nunca queda negativo,
      // aunque dos personas compren la última unidad al mismo tiempo.
      const { modifiedCount } = await Product.updateOne(
        { _id: id, status: true, stock: { $gte: quantity } },
        { $inc: { stock: -quantity } },
      );
      if (!modifiedCount) throw new CheckoutError(409, `No hay stock suficiente de ${product.title}`);

      reserved.push({ product: id, quantity });
      items.push({ product: id, title: product.title, thumbnail: product.thumbnail, price: product.price, quantity });
    }

    return await Order.create({
      code: newOrderCode(),
      user: userId,
      items,
      total: items.reduce((sum, item) => sum + item.price * item.quantity, 0),
    });
  } catch (error) {
    await Promise.all([releaseStock(reserved), restoreCart(cartId, claimed.products)]);
    throw error;
  }
};

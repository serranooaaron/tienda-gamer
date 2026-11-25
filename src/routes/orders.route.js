import express from "express";
import mongoose from "mongoose";
import Order from "../models/order.model.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { CheckoutError, createOrderFromCart } from "../services/orders.service.js";
import { startPayment } from "../services/payments.service.js";
import { PaymentError } from "../services/mercadoPago.js";

// Tope de órdenes por consulta: el listado no crece sin límite.
export const ORDERS_LIMIT = 50;

const ordersRouter = express.Router();

ordersRouter.use(requireAuth);

// Compra el carrito del usuario logueado. No lee nada del body: el carrito sale de la
// sesión y los precios de la base.
ordersRouter.post("/", async (req, res) => {
  try {
    const order = await createOrderFromCart({ userId: req.user.id, cartId: req.user.cart });
    return res.status(201).json({ status: "success", payload: order });
  } catch (error) {
    if (error instanceof CheckoutError) {
      return res.status(error.status).json({ status: "error", message: error.message });
    }
    return res.status(500).json({ status: "error", message: "No se pudo completar la compra" });
  }
});

// Inicia el pago de una orden propia pendiente: devuelve la dirección de Checkout Pro.
// Detrás del proxy de Render, req.protocol es https gracias a TRUST_PROXY.
ordersRouter.post("/:oid/pay", async (req, res) => {
  try {
    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const payload = await startPayment({ orderId: req.params.oid, userId: req.user.id, baseUrl });
    return res.status(201).json({ status: "success", payload });
  } catch (error) {
    if (error instanceof PaymentError) return res.status(error.status).json({ status: "error", message: error.message });
    return res.status(500).json({ status: "error", message: "No se pudo iniciar el pago" });
  }
});

ordersRouter.get("/", async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user.id }).sort({ createdAt: -1 }).limit(ORDERS_LIMIT).lean();
    return res.status(200).json({ status: "success", payload: orders });
  } catch (error) {
    return res.status(500).json({ status: "error", message: "Error al traer las compras" });
  }
});

// Una orden ajena responde igual que una inexistente: no revela que el id existe.
ordersRouter.get("/:oid", async (req, res) => {
  try {
    const { oid } = req.params;
    const order = mongoose.Types.ObjectId.isValid(oid) ? await Order.findById(oid).lean() : null;
    const canSee = order && (req.user.role === "admin" || order.user.toString() === req.user.id);
    if (!canSee) return res.status(404).json({ status: "error", message: "Compra no encontrada" });
    return res.status(200).json({ status: "success", payload: order });
  } catch (error) {
    return res.status(500).json({ status: "error", message: "Error al traer la compra" });
  }
});

export default ordersRouter;

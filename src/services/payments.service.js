// Pago de una orden con Mercado Pago Checkout Pro.
// 1. startPayment: arma la preferencia con los productos y precios de la orden guardada
//    (nunca con datos del navegador) y devuelve la dirección de pago de Mercado Pago.
// 2. confirmPayment: con el id de pago que trae la vuelta, consulta el pago real a la API y
//    solo entonces cambia el estado de la orden. Lo que dice la URL de vuelta no se usa.
import mongoose from "mongoose";
import Order from "../models/order.model.js";
import { PaymentError, mercadoPago } from "./mercadoPago.js";

const PAYABLE = "pendiente";

const findOwnOrder = async (orderId, userId) => {
  const order = mongoose.Types.ObjectId.isValid(orderId) ? await Order.findById(orderId).lean() : null;
  if (!order || order.user.toString() !== userId) throw new PaymentError(404, "Compra no encontrada");
  return order;
};

export const startPayment = async ({ orderId, userId, baseUrl }) => {
  const order = await findOwnOrder(orderId, userId);
  if (order.status !== PAYABLE) throw new PaymentError(409, "Esta compra no está pendiente de pago");

  const returnUrl = `${baseUrl}/orders/${order._id}/pago`;
  const preference = await mercadoPago.createPreference({
    items: order.items.map((item) => ({
      id: item.product.toString(),
      title: item.title,
      quantity: item.quantity,
      unit_price: item.price,
      currency_id: "ARS",
    })),
    external_reference: order._id.toString(),
    statement_descriptor: "TIENDA GAMER",
    back_urls: { success: returnUrl, pending: returnUrl, failure: returnUrl },
    // Mercado Pago solo vuelve solo al sitio con https; en desarrollo se usa el botón "Volver".
    ...(baseUrl.startsWith("https://") ? { auto_return: "approved" } : {}),
  });

  await Order.updateOne({ _id: order._id }, { $set: { "payment.preferenceId": preference.id } });
  return { url: preference.init_point };
};

// Estados de Mercado Pago que cierran la orden. Los demás (pending, in_process,
// rejected...) la dejan pendiente: con un rechazo se puede volver a intentar.
const FINAL_STATUS = { approved: "pagada" };

export const confirmPayment = async ({ orderId, userId, paymentId }) => {
  const order = await findOwnOrder(orderId, userId);
  if (!/^\d{1,20}$/.test(String(paymentId ?? ""))) return order;

  const payment = await mercadoPago.getPayment(paymentId);
  // El pago tiene que ser de esta orden y por el total de la orden.
  if (payment.external_reference !== order._id.toString()) throw new PaymentError(400, "Ese pago no corresponde a esta compra");
  if (payment.status === "approved" && Number(payment.transaction_amount) !== order.total) {
    console.error(`Pago ${payment.id} aprobado por ${payment.transaction_amount} para la orden ${order.code} de ${order.total}`);
    throw new PaymentError(409, "El monto del pago no coincide con la compra");
  }

  const paymentInfo = {
    "payment.id": String(payment.id),
    "payment.status": payment.status,
    "payment.statusDetail": payment.status_detail ?? null,
    "payment.method": payment.payment_method_id ?? null,
    "payment.updatedAt": new Date(),
  };
  const nextStatus = FINAL_STATUS[payment.status];
  // Transición condicional: si la orden ya no está pendiente (otro aviso llegó antes),
  // no se toca. Así recargar la página de vuelta no cambia nada dos veces.
  await Order.updateOne({ _id: order._id, status: PAYABLE }, { $set: { ...paymentInfo, ...(nextStatus ? { status: nextStatus } : {}) } });
  return Order.findById(order._id).lean();
};

import mongoose from "mongoose";

// Cada línea guarda una copia del producto: si después cambia el precio o se borra del
// catálogo, la compra se sigue viendo como se hizo.
const orderItemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
  title: { type: String, required: true },
  thumbnail: { type: String, default: "product.jpg" },
  price: { type: Number, required: true, min: 0 },
  quantity: { type: Number, required: true, min: 1 }
}, { _id: false });

const orderSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  items: {
    type: [orderItemSchema],
    validate: (items) => items.length > 0
  },
  total: { type: Number, required: true, min: 0 },
  // "pendiente" hasta que Mercado Pago confirma el pago. Las órdenes creadas antes de los
  // pagos no tienen este campo: se muestran como compras de demostración.
  status: { type: String, enum: ["pendiente", "pagada", "cancelada"], default: "pendiente" },
  // Datos del pago tal como los informa la API de Mercado Pago (nunca los de la URL).
  payment: {
    preferenceId: { type: String, default: null },
    id: { type: String, default: null },
    status: { type: String, default: null },
    statusDetail: { type: String, default: null },
    method: { type: String, default: null },
    updatedAt: { type: Date, default: null }
  }
}, { timestamps: true });

// "Mis compras": las órdenes de un usuario, de la más nueva a la más vieja.
orderSchema.index({ user: 1, createdAt: -1 });

const Order = mongoose.model("Order", orderSchema);

export default Order;

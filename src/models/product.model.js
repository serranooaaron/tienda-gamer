import mongoose from "mongoose";
import paginate from "mongoose-paginate-v2"

const productSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    minLength: 5,
    maxLength: 100
  },
  description: {
    type: String,
    required: true,
    minLength: 10,
    maxLength: 500
  },
  code: {
    type: String,
    required: true,
    trim: true,
    uppercase: true
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  stock: {
    type: Number,
    required: true,
    min: 0
  },
  status: {
    type: Boolean,
    default: true
  },
  category: {
    type: String,
    required: true,
    enum: ["auriculares", "teclados", "mouse", "webcams", "microfonos"]
  },
  thumbnail: {
    type: String,
    trim: true,
    default: "product.jpg"
  },
  // Lo elige el administrador para la imagen grande del inicio (uno a la vez).
  featured: {
    type: Boolean,
    default: false
  },
  // Visitas a la página del producto: una por visitante cada 24 horas, sin contar administradores.
  views: {
    type: Number,
    default: 0,
    min: 0
  }
}, { timestamps: true });

//INDEXACION
productSchema.index({ category: 1 });
productSchema.index({ title: 1 }, { unique: true });
productSchema.index({ description: "text" });
productSchema.index({ code: 1 }, { unique: true });
productSchema.index({ price: 1 });
// El inicio busca el destacado y los más vistos en cada visita.
productSchema.index({ featured: 1, status: 1 });
productSchema.index({ status: 1, views: -1 });

//indice compuesto
//productSchema.index({ category: 1, title: 1 });

//plugins
productSchema.plugin(paginate);

const Product = mongoose.model("Product", productSchema);

export default Product;
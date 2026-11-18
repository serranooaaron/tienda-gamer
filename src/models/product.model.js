import mongoose from "mongoose";
import paginate from "mongoose-paginate-v2"
import { CATEGORY_KEYS } from "../../public/js/catalogSchema.js";

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
    // Las categorías y sus fichas se definen en public/js/catalogSchema.js.
    enum: CATEGORY_KEYS
  },
  // Subcategoría y marca: valores de la lista de su categoría (se validan al guardar).
  // Opcionales para no romper los productos cargados antes de que existieran.
  subcategory: { type: String, trim: true, default: null },
  brand: { type: String, trim: true, default: null },
  model: { type: String, trim: true, maxLength: 80, default: "" },
  warrantyMonths: { type: Number, min: 0, max: 120, default: null },
  // Ficha técnica: un objeto con los campos de la categoría, ya validado y con su tipo.
  specs: { type: mongoose.Schema.Types.Mixed, default: () => ({}) },
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
// Filtros del catálogo por marca y subcategoría dentro de una categoría.
productSchema.index({ category: 1, brand: 1 });
productSchema.index({ category: 1, subcategory: 1 });
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
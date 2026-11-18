import Product from "../models/product.model.js";
import User from "../models/user.model.js";
import Cart from "../models/cart.model.js";
import products from "./products.js";
import { createHash } from "../utils/auth.js";

// Datos del catálogo que el seed mantiene al día; el resto (precio, stock, estado...) solo se
// carga al crear el producto, para no pisar lo que el administrador cambió en el panel.
const CATALOG_FIELDS = ["brand", "subcategory", "model", "warrantyMonths", "specs"];

// Carga los productos por código (no duplica si se corre varias veces). En los que ya existen
// solo completa marca, subcategoría, modelo, garantía y ficha técnica.
export const seedProducts = () =>
  Product.bulkWrite(
    products.map((product) => {
      const catalog = Object.fromEntries(CATALOG_FIELDS.filter((key) => key in product).map((key) => [key, product[key]]));
      const commercial = Object.fromEntries(Object.entries(product).filter(([key]) => !CATALOG_FIELDS.includes(key)));
      return {
        updateOne: {
          filter: { code: product.code },
          update: { $set: catalog, $setOnInsert: commercial },
          upsert: true
        }
      };
    })
  );

// Crea un usuario con su carrito si todavia no existe ese email.
export const seedUser = async ({ email, password, role = "user", first_name, last_name }) => {
  if (!email || !password) return null;
  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) return existing;
  const cart = await Cart.create({});
  return User.create({
    first_name,
    last_name,
    email,
    password: await createHash(password),
    role,
    cart: cart._id
  });
};

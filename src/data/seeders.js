import Product from "../models/product.model.js";
import User from "../models/user.model.js";
import Cart from "../models/cart.model.js";
import products from "./products.js";
import { createHash } from "../utils/auth.js";

// Carga o actualiza los productos por codigo (no duplica si se corre varias veces).
export const seedProducts = () =>
  Product.bulkWrite(
    products.map((product) => ({
      updateOne: {
        filter: { code: product.code },
        update: { $set: product },
        upsert: true
      }
    }))
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

// Se carga antes que los tests (ver .mocharc.json): levanta MongoDB en memoria,
// así nunca se toca la base real, y deja cada test con la base vacía.
import crypto from "node:crypto";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import Cart from "../src/models/cart.model.js";
import Order from "../src/models/order.model.js";
import Product from "../src/models/product.model.js";
import User from "../src/models/user.model.js";

process.env.JWT_SECRET = crypto.randomBytes(32).toString("hex");

let mongod;

export const mochaHooks = {
  async beforeAll() {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri("tienda-test"));
    // Espera los índices únicos: sin esto, los tests de duplicados podrían pasar de largo.
    await Promise.all([Product.init(), User.init(), Cart.init(), Order.init()]);
  },
  async afterEach() {
    await Promise.all([Product.deleteMany({}), User.deleteMany({}), Cart.deleteMany({}), Order.deleteMany({})]);
  },
  async afterAll() {
    await mongoose.disconnect();
    await mongod.stop();
  },
};

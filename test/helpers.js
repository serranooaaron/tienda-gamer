import crypto from "node:crypto";
import supertest from "supertest";
import app from "../src/app.js";
import Product from "../src/models/product.model.js";
import { seedUser } from "../src/data/seeders.js";

export const request = supertest(app);

// Contraseñas generadas en cada corrida: en el código no queda ninguna fija.
export const randomPassword = () => crypto.randomBytes(12).toString("hex");

let counter = 0;

export const productData = (overrides = {}) => {
  counter += 1;
  return {
    title: `Producto de prueba ${counter}`,
    description: "Descripción del producto de prueba",
    code: `TEST-${counter}`,
    price: 100,
    stock: 5,
    category: "mouse",
    ...overrides,
  };
};

export const createProduct = (overrides) => Product.create(productData(overrides));

export const userData = (overrides = {}) => {
  counter += 1;
  return {
    first_name: "Ana",
    last_name: "Prueba",
    email: `usuario${counter}@example.com`,
    password: randomPassword(),
    ...overrides,
  };
};

// Devuelve un cliente con la sesión iniciada: guarda la cookie entre requests.
export const loginAs = async (role = "user") => {
  const data = userData({ role });
  const user = await seedUser(data);
  const agent = supertest.agent(app);
  await agent.post("/api/sessions/login").send({ email: data.email, password: data.password }).expect(200);
  return { agent, user, cartId: user.cart.toString(), ...data };
};

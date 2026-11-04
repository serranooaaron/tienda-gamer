import { expect } from "chai";
import mongoose from "mongoose";
import Product from "../src/models/product.model.js";
import { createProduct, loginAs, productData, request } from "./helpers.js";

const missingId = () => new mongoose.Types.ObjectId().toString();

describe("Productos", () => {
  describe("GET /api/products", () => {
    it("es público y devuelve la paginación", async () => {
      await createProduct();
      await createProduct();
      await createProduct();

      const res = await request.get("/api/products").query({ limit: 2, page: 1 });

      expect(res.status).to.equal(200);
      expect(res.body.payload).to.have.length(2);
      expect(res.body).to.include({ totalPages: 2, page: 1, hasNextPage: true, hasPrevPage: false });
      expect(res.body.nextLink).to.include("page=2");
      expect(res.body.prevLink).to.equal(null);
    });

    it("filtra por categoría o por texto", async () => {
      await createProduct({ title: "Teclado mecánico", category: "teclados" });
      await createProduct({ title: "Mouse inalámbrico", category: "mouse" });

      const byCategory = await request.get("/api/products").query({ query: "teclados" });
      const byText = await request.get("/api/products").query({ query: "inalámbrico" });

      expect(byCategory.body.payload.map((p) => p.title)).to.deep.equal(["Teclado mecánico"]);
      expect(byText.body.payload.map((p) => p.title)).to.deep.equal(["Mouse inalámbrico"]);
    });

    it("ordena por precio", async () => {
      await createProduct({ price: 300 });
      await createProduct({ price: 100 });
      await createProduct({ price: 200 });

      const res = await request.get("/api/products").query({ sort: "asc" });

      expect(res.body.payload.map((p) => p.price)).to.deep.equal([100, 200, 300]);
    });

    it("trata la búsqueda como texto, no como expresión regular", async () => {
      await createProduct();
      const res = await request.get("/api/products").query({ query: "(a+)+$" });
      expect(res.status).to.equal(200);
      expect(res.body.payload).to.have.length(0);
    });
  });

  describe("GET /api/products/:pid", () => {
    it("devuelve el producto", async () => {
      const product = await createProduct();
      const res = await request.get(`/api/products/${product._id}`);
      expect(res.status).to.equal(200);
      expect(res.body.payload.title).to.equal(product.title);
    });

    it("responde 400 con un id inválido y 404 si no existe", async () => {
      await request.get("/api/products/no-es-un-id").expect(400);
      await request.get(`/api/products/${missingId()}`).expect(404);
    });
  });

  describe("POST /api/products", () => {
    it("solo permite crear a administradores", async () => {
      const { agent } = await loginAs("user");
      await request.post("/api/products").send(productData()).expect(401);
      await agent.post("/api/products").send(productData()).expect(403);
      expect(await Product.countDocuments()).to.equal(0);
    });

    it("crea el producto como administrador", async () => {
      const { agent } = await loginAs("admin");
      const data = productData();
      const res = await agent.post("/api/products").send(data);
      expect(res.status).to.equal(201);
      expect(res.body.payload.code).to.equal(data.code);
    });

    it("responde 400 con datos inválidos", async () => {
      const { agent } = await loginAs("admin");
      await agent.post("/api/products").send(productData({ price: -1 })).expect(400);
      await agent.post("/api/products").send(productData({ category: "sillas" })).expect(400);
      await agent.post("/api/products").send({ title: "Corto" }).expect(400);
    });

    it("responde 409 si el código o el título ya existen", async () => {
      const { agent } = await loginAs("admin");
      const existing = await createProduct();
      await agent.post("/api/products").send(productData({ code: existing.code })).expect(409);
      await agent.post("/api/products").send(productData({ title: existing.title })).expect(409);
    });
  });

  describe("PUT /api/products/:pid", () => {
    it("solo permite editar a administradores", async () => {
      const product = await createProduct();
      const { agent } = await loginAs("user");
      await request.put(`/api/products/${product._id}`).send({ price: 1 }).expect(401);
      await agent.put(`/api/products/${product._id}`).send({ price: 1 }).expect(403);
      expect((await Product.findById(product._id)).price).to.equal(product.price);
    });

    it("actualiza el producto", async () => {
      const product = await createProduct();
      const { agent } = await loginAs("admin");
      const res = await agent.put(`/api/products/${product._id}`).send({ price: 999, status: false });
      expect(res.status).to.equal(200);
      expect(res.body.payload).to.include({ price: 999, status: false });
    });

    it("valida los datos nuevos", async () => {
      const product = await createProduct();
      const { agent } = await loginAs("admin");
      await agent.put(`/api/products/${product._id}`).send({ stock: -5 }).expect(400);
    });

    it("responde 404 si no existe", async () => {
      const { agent } = await loginAs("admin");
      await agent.put(`/api/products/${missingId()}`).send({ price: 1 }).expect(404);
    });
  });

  describe("DELETE /api/products/:pid", () => {
    it("solo permite borrar a administradores", async () => {
      const product = await createProduct();
      const { agent } = await loginAs("user");
      await request.delete(`/api/products/${product._id}`).expect(401);
      await agent.delete(`/api/products/${product._id}`).expect(403);
      expect(await Product.countDocuments()).to.equal(1);
    });

    it("borra el producto", async () => {
      const product = await createProduct();
      const { agent } = await loginAs("admin");
      await agent.delete(`/api/products/${product._id}`).expect(204);
      await agent.delete(`/api/products/${product._id}`).expect(404);
    });
  });
});

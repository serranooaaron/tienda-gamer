import { expect } from "chai";
import Cart from "../src/models/cart.model.js";
import Order from "../src/models/order.model.js";
import Product from "../src/models/product.model.js";
import { createProduct, loginAs, request } from "./helpers.js";

const add = (agent, cartId, productId, quantity = 1) =>
  agent.post(`/api/carts/${cartId}/products/${productId}`).send({ quantity }).expect(200);

const stockOf = async (product) => (await Product.findById(product._id).lean()).stock;
const cartSize = async (cartId) => (await Cart.findById(cartId).lean()).products.length;

describe("Compras", () => {
  describe("confirmar una compra", () => {
    it("exige sesión", async () => {
      await request.post("/api/orders").expect(401);
      await request.get("/api/orders").expect(401);
    });

    it("crea la orden, descuenta el stock y vacía el carrito", async () => {
      const { agent, cartId, user } = await loginAs();
      const mouse = await createProduct({ price: 100, stock: 5 });
      const teclado = await createProduct({ price: 250, stock: 3 });
      await add(agent, cartId, mouse._id, 2);
      await add(agent, cartId, teclado._id, 1);

      const res = await agent.post("/api/orders");

      expect(res.status).to.equal(201);
      expect(res.body.payload.total).to.equal(450);
      expect(res.body.payload.code).to.match(/^TG-[0-9A-F]{8}$/);
      expect(res.body.payload.user).to.equal(user._id.toString());
      expect(res.body.payload.items).to.have.length(2);
      expect(await stockOf(mouse)).to.equal(3);
      expect(await stockOf(teclado)).to.equal(2);
      expect(await cartSize(cartId)).to.equal(0);
    });

    it("ignora precio y total enviados por el cliente", async () => {
      const { agent, cartId } = await loginAs();
      const product = await createProduct({ price: 100 });
      await add(agent, cartId, product._id, 2);

      const res = await agent.post("/api/orders").send({ total: 1, items: [{ price: 1, quantity: 1 }], user: "otro" });

      expect(res.status).to.equal(201);
      expect(res.body.payload.total).to.equal(200);
      expect(res.body.payload.items[0].price).to.equal(100);
    });

    it("conserva el precio de la compra aunque el producto cambie después", async () => {
      const { agent, cartId } = await loginAs();
      const product = await createProduct({ price: 100, title: "Mouse original" });
      await add(agent, cartId, product._id);
      const { body } = await agent.post("/api/orders").expect(201);

      await Product.updateOne({ _id: product._id }, { price: 999, title: "Mouse renombrado" });
      const res = await agent.get(`/api/orders/${body.payload._id}`).expect(200);

      expect(res.body.payload.items[0]).to.include({ price: 100, title: "Mouse original" });
    });

    it("rechaza un carrito vacío", async () => {
      const { agent } = await loginAs();
      const res = await agent.post("/api/orders");
      expect(res.status).to.equal(400);
      expect(await Order.countDocuments()).to.equal(0);
    });
  });

  describe("cuando algo falla no queda nada a medias", () => {
    it("si falta stock de un producto, devuelve el de los otros y conserva el carrito", async () => {
      const { agent, cartId } = await loginAs();
      const disponible = await createProduct({ stock: 5 });
      const escaso = await createProduct({ stock: 5, title: "Producto escaso" });
      await add(agent, cartId, disponible._id, 2);
      await add(agent, cartId, escaso._id, 3);
      await Product.updateOne({ _id: escaso._id }, { stock: 1 });

      const res = await agent.post("/api/orders");

      expect(res.status).to.equal(409);
      expect(res.body.message).to.include("Producto escaso");
      expect(await stockOf(disponible)).to.equal(5);
      expect(await stockOf(escaso)).to.equal(1);
      expect(await cartSize(cartId)).to.equal(2);
      expect(await Order.countDocuments()).to.equal(0);
    });

    it("rechaza productos pausados", async () => {
      const { agent, cartId } = await loginAs();
      const product = await createProduct({ stock: 5 });
      await add(agent, cartId, product._id, 2);
      await Product.updateOne({ _id: product._id }, { status: false });

      await agent.post("/api/orders").expect(409);

      expect(await stockOf(product)).to.equal(5);
      expect(await cartSize(cartId)).to.equal(1);
    });

    it("rechaza productos borrados del catálogo", async () => {
      const { agent, cartId } = await loginAs();
      const product = await createProduct();
      await add(agent, cartId, product._id);
      await Product.deleteOne({ _id: product._id });

      await agent.post("/api/orders").expect(409);

      expect(await cartSize(cartId)).to.equal(1);
    });
  });

  describe("compras simultáneas", () => {
    it("un doble clic genera una sola orden", async () => {
      const { agent, cartId } = await loginAs();
      const product = await createProduct({ stock: 5 });
      await add(agent, cartId, product._id, 2);

      const results = await Promise.all([agent.post("/api/orders"), agent.post("/api/orders")]);

      expect(results.map((res) => res.status).sort()).to.deep.equal([201, 400]);
      expect(await Order.countDocuments()).to.equal(1);
      expect(await stockOf(product)).to.equal(3);
    });

    it("la última unidad se vende una sola vez", async () => {
      const product = await createProduct({ stock: 1 });
      const buyers = await Promise.all([loginAs(), loginAs(), loginAs()]);
      for (const { agent, cartId } of buyers) await add(agent, cartId, product._id);

      const results = await Promise.all(buyers.map(({ agent }) => agent.post("/api/orders")));

      expect(results.map((res) => res.status).sort()).to.deep.equal([201, 409, 409]);
      expect(await stockOf(product)).to.equal(0);
      expect(await Order.countDocuments()).to.equal(1);
    });
  });

  describe("consultar compras", () => {
    const buy = async (buyer, overrides) => {
      const product = await createProduct(overrides);
      await add(buyer.agent, buyer.cartId, product._id);
      return (await buyer.agent.post("/api/orders").expect(201)).body.payload;
    };

    it("lista solo las compras propias, de la más nueva a la más vieja", async () => {
      const buyer = await loginAs();
      const other = await loginAs();
      const first = await buy(buyer);
      const second = await buy(buyer);
      await buy(other);

      const res = await buyer.agent.get("/api/orders").expect(200);

      expect(res.body.payload.map((order) => order._id)).to.deep.equal([second._id, first._id]);
    });

    it("no deja ver la compra de otro usuario", async () => {
      const buyer = await loginAs();
      const other = await loginAs();
      const order = await buy(buyer);

      await other.agent.get(`/api/orders/${order._id}`).expect(404);
      await other.agent.get(`/orders/${order._id}`).expect(404);
    });

    it("permite a un administrador ver cualquier compra", async () => {
      const buyer = await loginAs();
      const admin = await loginAs("admin");
      const order = await buy(buyer);
      await admin.agent.get(`/api/orders/${order._id}`).expect(200);
    });

    it("responde 404 con un id inválido", async () => {
      const { agent } = await loginAs();
      await agent.get("/api/orders/no-es-un-id").expect(404);
      await agent.get("/orders/no-es-un-id").expect(404);
    });
  });

  describe("páginas", () => {
    it("Mis compras y el checkout piden iniciar sesión", async () => {
      const orders = await request.get("/orders").expect(302);
      const checkout = await request.get("/checkout").expect(302);
      expect(orders.headers.location).to.include("/login");
      expect(checkout.headers.location).to.include("/login");
    });

    it("el checkout con el carrito vacío vuelve al carrito", async () => {
      const { agent } = await loginAs();
      const res = await agent.get("/checkout").expect(302);
      expect(res.headers.location).to.equal("/cart");
    });

    it("el checkout muestra el total y permite confirmar", async () => {
      const { agent, cartId } = await loginAs();
      const product = await createProduct({ price: 100, title: "Mouse de prueba" });
      await add(agent, cartId, product._id, 2);

      const res = await agent.get("/checkout").expect(200);

      expect(res.text).to.include("Mouse de prueba");
      expect(res.text).to.include("data-confirm-order");
    });

    it("el checkout no deja confirmar si falta stock", async () => {
      const { agent, cartId } = await loginAs();
      const product = await createProduct({ stock: 5 });
      await add(agent, cartId, product._id, 3);
      await Product.updateOne({ _id: product._id }, { stock: 1 });

      const res = await agent.get("/checkout").expect(200);

      expect(res.text).to.not.include("data-confirm-order");
      expect(res.text).to.include("Solo quedan 1");
    });

    it("Mis compras invita a comprar cuando no hay ninguna", async () => {
      const { agent } = await loginAs();
      const res = await agent.get("/orders").expect(200);
      expect(res.text).to.include("Todavía no hiciste compras");
    });

    it("muestra la compra en el listado y en su detalle", async () => {
      const { agent, cartId } = await loginAs();
      const product = await createProduct({ title: "Mouse comprado" });
      await add(agent, cartId, product._id);
      const { body } = await agent.post("/api/orders").expect(201);

      const list = await agent.get("/orders").expect(200);
      const detail = await agent.get(`/orders/${body.payload._id}?nueva=1`).expect(200);

      expect(list.text).to.include(body.payload.code);
      expect(detail.text).to.include("Mouse comprado");
      expect(detail.text).to.include("¡Compra confirmada!");
    });
  });
});

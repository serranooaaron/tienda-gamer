import { expect } from "chai";
import Cart from "../src/models/cart.model.js";
import { createProduct, loginAs, request } from "./helpers.js";

const add = (agent, cartId, productId, quantity = 1) =>
  agent.post(`/api/carts/${cartId}/products/${productId}`).send({ quantity });

describe("Carritos", () => {
  describe("acceso", () => {
    it("exige sesión", async () => {
      await request.post("/api/carts").expect(401);
    });

    it("POST /api/carts devuelve el carrito propio, sin crear otro", async () => {
      const { agent, cartId } = await loginAs();
      const res = await agent.post("/api/carts");
      expect(res.status).to.equal(200);
      expect(res.body.payload._id).to.equal(cartId);
      expect(await Cart.countDocuments()).to.equal(1);
    });

    it("no deja leer ni modificar el carrito de otro usuario", async () => {
      const owner = await loginAs();
      const other = await loginAs();
      const product = await createProduct();

      await other.agent.get(`/api/carts/${owner.cartId}`).expect(403);
      await add(other.agent, owner.cartId, product._id).expect(403);
      await other.agent.put(`/api/carts/${owner.cartId}`).send([]).expect(403);
      await other.agent.delete(`/api/carts/${owner.cartId}`).expect(403);
    });

    it("permite a un administrador ver cualquier carrito", async () => {
      const owner = await loginAs();
      const admin = await loginAs("admin");
      await admin.agent.get(`/api/carts/${owner.cartId}`).expect(200);
    });
  });

  describe("agregar productos", () => {
    it("agrega el producto y devuelve sus datos", async () => {
      const { agent, cartId } = await loginAs();
      const product = await createProduct();

      const res = await add(agent, cartId, product._id, 2);

      expect(res.status).to.equal(200);
      expect(res.body.payload[0].quantity).to.equal(2);
      expect(res.body.payload[0].product.title).to.equal(product.title);
    });

    it("acumula la cantidad si el producto ya estaba", async () => {
      const { agent, cartId } = await loginAs();
      const product = await createProduct();

      await add(agent, cartId, product._id, 1);
      const res = await add(agent, cartId, product._id, 2);

      expect(res.body.payload).to.have.length(1);
      expect(res.body.payload[0].quantity).to.equal(3);
    });

    it("no deja pasar el stock, contando lo que ya hay en el carrito", async () => {
      const { agent, cartId } = await loginAs();
      const product = await createProduct({ stock: 3 });

      await add(agent, cartId, product._id, 4).expect(409);
      await add(agent, cartId, product._id, 2).expect(200);
      await add(agent, cartId, product._id, 2).expect(409);
      await add(agent, cartId, product._id, 1).expect(200);
    });

    it("rechaza un producto sin stock", async () => {
      const { agent, cartId } = await loginAs();
      const product = await createProduct({ stock: 0 });
      await add(agent, cartId, product._id).expect(409);
    });

    it("rechaza un producto pausado", async () => {
      const { agent, cartId } = await loginAs();
      const product = await createProduct({ status: false });
      await add(agent, cartId, product._id).expect(404);
    });

    it("rechaza cantidades inválidas", async () => {
      const { agent, cartId } = await loginAs();
      const product = await createProduct();
      for (const quantity of [0, -1, 1.5, "muchos"]) {
        await add(agent, cartId, product._id, quantity).expect(400);
      }
    });
  });

  describe("cambiar cantidades", () => {
    it("actualiza la cantidad de un producto", async () => {
      const { agent, cartId } = await loginAs();
      const product = await createProduct();
      await add(agent, cartId, product._id, 1);

      const res = await agent.put(`/api/carts/${cartId}/products/${product._id}`).send({ quantity: 4 });

      expect(res.status).to.equal(200);
      expect(res.body.payload[0].quantity).to.equal(4);
    });

    it("no deja pasar el stock", async () => {
      const { agent, cartId } = await loginAs();
      const product = await createProduct({ stock: 2 });
      await add(agent, cartId, product._id, 1);
      await agent.put(`/api/carts/${cartId}/products/${product._id}`).send({ quantity: 3 }).expect(409);
    });

    it("responde 404 si el producto no está en el carrito", async () => {
      const { agent, cartId } = await loginAs();
      const product = await createProduct();
      await agent.put(`/api/carts/${cartId}/products/${product._id}`).send({ quantity: 1 }).expect(404);
    });
  });

  describe("reemplazar el carrito", () => {
    it("reemplaza todos los productos", async () => {
      const { agent, cartId } = await loginAs();
      const before = await createProduct();
      const after = await createProduct();
      await add(agent, cartId, before._id);

      const res = await agent.put(`/api/carts/${cartId}`).send([{ product: after._id, quantity: 2 }]);

      expect(res.status).to.equal(200);
      expect(res.body.payload.map((item) => item.product._id)).to.deep.equal([after._id.toString()]);
    });

    it("no deja pasar el stock", async () => {
      const { agent, cartId } = await loginAs();
      const product = await createProduct({ stock: 2 });
      await agent.put(`/api/carts/${cartId}`).send([{ product: product._id, quantity: 3 }]).expect(409);
    });

    it("no acepta productos pausados", async () => {
      const { agent, cartId } = await loginAs();
      const product = await createProduct({ status: false });
      await agent.put(`/api/carts/${cartId}`).send([{ product: product._id, quantity: 1 }]).expect(404);
    });

    it("rechaza datos inválidos", async () => {
      const { agent, cartId } = await loginAs();
      await agent.put(`/api/carts/${cartId}`).send({ products: "no es un arreglo" }).expect(400);
      await agent.put(`/api/carts/${cartId}`).send([{ product: "no-es-un-id", quantity: 1 }]).expect(400);
    });
  });

  describe("quitar productos", () => {
    it("quita un producto", async () => {
      const { agent, cartId } = await loginAs();
      const keep = await createProduct();
      const remove = await createProduct();
      await add(agent, cartId, keep._id);
      await add(agent, cartId, remove._id);

      const res = await agent.delete(`/api/carts/${cartId}/products/${remove._id}`);

      expect(res.status).to.equal(200);
      expect(res.body.payload).to.have.length(1);
      expect(res.body.payload[0].product._id).to.equal(keep._id.toString());
    });

    it("vacía el carrito", async () => {
      const { agent, cartId } = await loginAs();
      const product = await createProduct();
      await add(agent, cartId, product._id);

      const res = await agent.delete(`/api/carts/${cartId}`);

      expect(res.status).to.equal(200);
      expect(res.body.payload).to.have.length(0);
    });
  });
});

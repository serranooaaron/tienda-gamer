import { expect } from "chai";
import { createProduct, loginAs, request } from "./helpers.js";

describe("Vistas", () => {
  describe("catálogo", () => {
    it("muestra el inicio y los productos", async () => {
      const product = await createProduct();
      await request.get("/").expect(200);
      const res = await request.get("/products").expect(200);
      expect(res.text).to.include(product.title);
    });

    it("no muestra productos pausados", async () => {
      const paused = await createProduct({ status: false });
      const list = await request.get("/products");
      expect(list.text).to.not.include(paused.title);
      await request.get(`/products/${paused._id}`).expect(404);
    });

    it("muestra el detalle y responde 404 con un id inválido", async () => {
      const product = await createProduct();
      const res = await request.get(`/products/${product._id}`).expect(200);
      expect(res.text).to.include(product.description);
      await request.get("/products/no-es-un-id").expect(404);
    });

    it("escapa el texto buscado", async () => {
      const res = await request.get("/products").query({ q: "<script>alert(1)</script>" });
      expect(res.status).to.equal(200);
      expect(res.text).to.not.include("<script>alert(1)</script>");
    });
  });

  describe("páginas protegidas", () => {
    it("manda al login a quien no tiene sesión", async () => {
      const cart = await request.get("/cart").expect(302);
      const admin = await request.get("/admin").expect(302);
      expect(cart.headers.location).to.equal("/login?next=%2Fcart");
      expect(admin.headers.location).to.equal("/login?next=%2Fadmin");
    });

    it("muestra el carrito con su total", async () => {
      const { agent, cartId } = await loginAs();
      const product = await createProduct({ price: 250 });
      await agent.post(`/api/carts/${cartId}/products/${product._id}`).send({ quantity: 2 }).expect(200);

      const res = await agent.get("/cart").expect(200);

      expect(res.text).to.include(product.title);
      expect(res.text).to.match(/\$\s*500/);
    });

    it("solo deja entrar al panel a administradores", async () => {
      const client = await loginAs("user");
      const admin = await loginAs("admin");
      await client.agent.get("/admin").expect(403);
      await admin.agent.get("/admin").expect(200);
    });

    it("el panel escapa los datos de los productos", async () => {
      const admin = await loginAs("admin");
      await createProduct({ title: `Mouse '"><img src=x onerror=alert(1)>` });
      const res = await admin.agent.get("/admin").expect(200);
      expect(res.text).to.not.include("<img src=x");
    });
  });

  describe("ingreso", () => {
    it("solo acepta rutas internas como destino", async () => {
      const internal = await request.get("/login").query({ next: "/cart" });
      const external = await request.get("/login").query({ next: "https://example.com" });
      const protocolRelative = await request.get("/login").query({ next: "//example.com" });

      expect(internal.text).to.include('data-next="/cart"');
      expect(external.text).to.include('data-next="/products"');
      expect(protocolRelative.text).to.include('data-next="/products"');
    });

    it("redirige a quien ya inició sesión", async () => {
      const { agent } = await loginAs();
      const res = await agent.get("/login").expect(302);
      expect(res.headers.location).to.equal("/products");
    });
  });

  describe("rutas inexistentes", () => {
    it("responde una página en las vistas y JSON en la API", async () => {
      const page = await request.get("/no-existe").expect(404);
      const api = await request.get("/api/no-existe").expect(404);
      expect(page.text).to.include("<html");
      expect(api.body.status).to.equal("error");
    });
  });
});

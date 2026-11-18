import { expect } from "chai";
import supertest from "supertest";
import app from "../src/app.js";
import Product from "../src/models/product.model.js";
import { createProduct, loginAs, productData, request } from "./helpers.js";

const viewsOf = async (product) => (await Product.findById(product._id).lean()).views;
// La imagen grande del inicio enlaza al producto elegido.
const heroId = (html) => html.match(/class="hero__showcase" href="\/products\/([a-f0-9]{24})"/)?.[1];

describe("Destacado y vistas", () => {
  describe("elegir el destacado desde el panel", () => {
    it("un administrador lo marca al crear o editar, y queda uno solo a la vez", async () => {
      const { agent } = await loginAs("admin");
      const first = await agent.post("/api/products").send({ ...productData(), featured: true }).expect(201);
      const second = await createProduct();

      await agent.put(`/api/products/${second._id}`).send({ featured: true }).expect(200);

      expect((await Product.findById(first.body.payload._id).lean()).featured).to.equal(false);
      expect((await Product.findById(second._id).lean()).featured).to.equal(true);
      expect(await Product.countDocuments({ featured: true })).to.equal(1);
    });

    it("solo los administradores pueden destacar y el valor tiene que ser verdadero o falso", async () => {
      const { agent: buyer } = await loginAs();
      const { agent: admin } = await loginAs("admin");
      const product = await createProduct();

      await buyer.put(`/api/products/${product._id}`).send({ featured: true }).expect(403);
      await admin.put(`/api/products/${product._id}`).send({ featured: "si" }).expect(400);
    });

    it("el panel muestra la casilla, la etiqueta del destacado y las vistas", async () => {
      const { agent } = await loginAs("admin");
      await createProduct({ title: "Teclado mecánico destacado", featured: true, views: 7 });

      const page = await agent.get("/admin").expect(200);

      expect(page.text).to.include('name="featured"');
      expect(page.text).to.include("Destacado en el inicio");
      expect(page.text).to.match(/<td class="num">7<\/td>/);
      expect(page.text).to.match(/Vistas totales<\/span><strong>7</);
    });
  });

  describe("imagen grande del inicio", () => {
    it("muestra el producto que eligió el administrador", async () => {
      await createProduct({ price: 900 });
      const chosen = await createProduct({ price: 100, featured: true });

      const home = await request.get("/").expect(200);

      expect(heroId(home.text)).to.equal(String(chosen._id));
    });

    it("si no hay destacado, muestra el más visto", async () => {
      await createProduct({ price: 900 });
      const popular = await createProduct({ price: 100, views: 12 });
      await createProduct({ price: 200, views: 3 });

      expect(heroId((await request.get("/")).text)).to.equal(String(popular._id));
    });

    it("si nadie vio nada todavía, muestra el más caro", async () => {
      await createProduct({ price: 100 });
      const priciest = await createProduct({ price: 900 });

      expect(heroId((await request.get("/")).text)).to.equal(String(priciest._id));
    });

    it("no muestra un destacado pausado o sin stock", async () => {
      await createProduct({ price: 900, featured: true, stock: 0 });
      const visible = await createProduct({ price: 100 });

      expect(heroId((await request.get("/")).text)).to.equal(String(visible._id));
    });
  });

  describe("contador de vistas", () => {
    it("cuenta una vista por visitante aunque recargue la página", async () => {
      const product = await createProduct();
      const visitor = supertest.agent(app);

      await visitor.get(`/products/${product._id}`).expect(200);
      await visitor.get(`/products/${product._id}`).expect(200);
      await supertest.agent(app).get(`/products/${product._id}`).expect(200);

      expect(await viewsOf(product)).to.equal(2);
    });

    it("no cuenta las visitas de administradores ni de bots", async () => {
      const product = await createProduct();
      const { agent: admin } = await loginAs("admin");

      await admin.get(`/products/${product._id}`).expect(200);
      await request.get(`/products/${product._id}`).set("User-Agent", "Googlebot/2.1").expect(200);
      await request.get(`/products/${product._id}`).set("User-Agent", "WhatsApp/2.23 A").expect(200);

      expect(await viewsOf(product)).to.equal(0);
    });

    it("ignora una cookie de vistos alterada", async () => {
      const product = await createProduct();
      await request.get(`/products/${product._id}`).set("Cookie", "tg_vistos=<script>.$where.xx").expect(200);
      expect(await viewsOf(product)).to.equal(1);
    });

    it("los productos cargados antes de este cambio cuentan desde 0", async () => {
      // Como los que ya están en Atlas: sin los campos views ni featured.
      const { insertedId } = await Product.collection.insertOne({ ...productData({ title: "Producto viejo sin vistas" }), status: true });
      const { agent } = await loginAs("admin");

      const page = await agent.get("/admin").expect(200);
      const row = page.text.slice(page.text.indexOf("Producto viejo sin vistas"));
      expect(row).to.match(/<td class="num">0<\/td>/);

      await request.get(`/products/${insertedId}`).expect(200);
      expect((await Product.findById(insertedId).lean()).views).to.equal(1);
    });

    it("la API pública no expone las vistas", async () => {
      const product = await createProduct({ views: 40 });
      const list = await request.get("/api/products").expect(200);
      const detail = await request.get(`/api/products/${product._id}`).expect(200);

      expect(list.body.payload[0]).to.not.have.property("views");
      expect(detail.body.payload).to.not.have.property("views");
    });
  });
});

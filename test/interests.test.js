import { expect } from "chai";
import supertest from "supertest";
import app from "../src/app.js";
import { INTERESTS_COOKIE, readInterests } from "../src/utils/interests.js";
import { createProduct, loginAs, request } from "./helpers.js";

const interestsCookie = (res) => (res.headers["set-cookie"] ?? []).find((cookie) => cookie.startsWith(`${INTERESTS_COOKIE}=`));
const fromCookie = (value) => readInterests({ cookies: { [INTERESTS_COOKIE]: value } });
const titles = (html) => [...html.matchAll(/class="product-card__title"[^>]*>(?:<a[^>]*>)?([^<]+)</g)].map((m) => m[1].trim());
const recommendedSection = (html) => html.match(/<section[^>]*id="recomendados"[\s\S]*?<\/section>/)?.[0] ?? "";

describe("Recomendaciones por intereses", () => {
  describe("cookie de intereses", () => {
    it("solo acepta categorías y marcas del catálogo, con cantidades enteras y un tope", () => {
      const { categories, brands } = fromCookie("teclados~3|heladeras~9|mouse~500|__proto__~1|mouse~1|auriculares~-2|webcams~x/Razer~2|<script>~1|Cooler Master~4");
      expect([...categories]).to.deep.equal([["teclados", 3], ["mouse", 99]]);
      expect([...brands]).to.deep.equal([["Razer", 2], ["Cooler Master", 4]]);
    });

    it("ignora una cookie demasiado larga o que no es texto", () => {
      expect(fromCookie(`teclados~1/${"Razer~1|".repeat(200)}`).categories.size).to.equal(0);
      expect(fromCookie({ teclados: 1 }).categories.size).to.equal(0);
    });

    it("ver un producto guarda su categoría y su marca, por 30 días y sin acceso desde JavaScript", async () => {
      const product = await createProduct({ category: "teclados", brand: "Razer", subcategory: "mecanicos" });
      const res = await request.get(`/products/${product._id}`).set("User-Agent", "Mozilla/5.0").expect(200);
      const cookie = interestsCookie(res);

      expect(cookie).to.include(`${INTERESTS_COOKIE}=teclados~1%2FRazer~1`);
      expect(cookie).to.match(/Max-Age=2592000/);
      expect(cookie).to.include("HttpOnly");
      expect(cookie).to.include("SameSite=Lax");
      // Nada personal: ni el id del producto ni datos de la cuenta.
      expect(cookie).to.not.include(String(product._id));
    });

    it("entrar a una categoría también cuenta, pero no a una inventada", async () => {
      const visit = await request.get("/products?category=monitores").set("User-Agent", "Mozilla/5.0").expect(200);
      expect(interestsCookie(visit)).to.include("monitores~1");
      const invented = await request.get("/products?category=heladeras").set("User-Agent", "Mozilla/5.0").expect(200);
      expect(interestsCookie(invented)).to.equal(undefined);
    });

    it("no guarda nada del administrador ni de los bots", async () => {
      const product = await createProduct({ category: "mouse", brand: "Razer" });
      const { agent } = await loginAs("admin");
      const admin = await agent.get(`/products/${product._id}`).expect(200);
      const bot = await request.get(`/products/${product._id}`).set("User-Agent", "Googlebot/2.1").expect(200);
      expect(interestsCookie(admin)).to.equal(undefined);
      expect(interestsCookie(bot)).to.equal(undefined);
    });
  });

  describe("inicio", () => {
    it("sin intereses no muestra recomendaciones", async () => {
      await createProduct({ category: "teclados" });
      const home = await request.get("/").expect(200);
      expect(home.text).to.not.include("Porque viste");
    });

    it("muestra 'Porque viste' con la categoría más vista y primero las marcas que más mira", async () => {
      // El de la imagen grande no se repite en las recomendaciones: acá es de otra categoría.
      await createProduct({ title: "Webcam destacada", category: "webcams", featured: true });
      await createProduct({ title: "Teclado Corsair muy visto", category: "teclados", brand: "Corsair", views: 50 });
      await createProduct({ title: "Teclado Razer elegido", category: "teclados", brand: "Razer", views: 1 });
      await createProduct({ title: "Teclado sin stock", category: "teclados", brand: "Razer", stock: 0 });
      await createProduct({ title: "Mouse Razer", category: "mouse", brand: "Razer" });

      const home = await request.get("/").set("Cookie", `${INTERESTS_COOKIE}=${encodeURIComponent("teclados~5|mouse~2/Razer~3")}`).expect(200);
      const section = recommendedSection(home.text);

      expect(section).to.include("Porque viste Teclados");
      expect(titles(section)).to.deep.equal(["Teclado Razer elegido", "Teclado Corsair muy visto"]);
      expect(section).to.include("sin datos personales");
      expect(section).to.match(/<form[^>]*method="POST"[^>]*action="\/intereses\/olvidar"/);
    });

    it("no repite el producto de la imagen grande", async () => {
      await createProduct({ title: "Teclado destacado", category: "teclados", featured: true });
      await createProduct({ title: "Otro teclado", category: "teclados" });
      const home = await request.get("/").set("Cookie", `${INTERESTS_COOKIE}=teclados~1`).expect(200);
      expect(titles(recommendedSection(home.text))).to.deep.equal(["Otro teclado"]);
    });

    it("'Olvidar lo que miré' borra la cookie y confirma sin recomendar", async () => {
      await createProduct({ category: "webcams", featured: true });
      await createProduct({ category: "teclados" });
      const agent = supertest.agent(app);
      await agent.get("/products?category=teclados").set("User-Agent", "Mozilla/5.0").expect(200);
      expect(recommendedSection((await agent.get("/").expect(200)).text)).to.include("Porque viste Teclados");

      const forget = await agent.post("/intereses/olvidar").expect(303);
      expect(forget.headers.location).to.equal("/?olvidado=1");
      expect(interestsCookie(forget)).to.match(/Expires=Thu, 01 Jan 1970/);

      const home = await agent.get("/?olvidado=1").expect(200);
      expect(home.text).to.include("Listo: borramos lo que miraste");
      expect(home.text).to.not.include("Porque viste");
      expect((await agent.get("/").expect(200)).text).to.not.include("Porque viste");
    });

    it("olvidar solo acepta POST: un link de otro sitio no lo dispara", async () => {
      await request.get("/intereses/olvidar").expect(404);
    });
  });

  describe("panel", () => {
    it("muestra los productos, categorías y marcas más vistos, solo al administrador", async () => {
      await createProduct({ title: "Mouse Razer popular", category: "mouse", brand: "Razer", views: 12 });
      await createProduct({ title: "Teclado Razer", category: "teclados", brand: "Razer", views: 3 });
      await createProduct({ title: "Sin vistas", category: "webcams", views: 0 });

      const { agent } = await loginAs("admin");
      const panel = (await agent.get("/admin").expect(200)).text;
      expect(panel).to.include("Productos más vistos");
      expect(panel).to.match(/Mouse Razer popular <span>· 12 vistas/);
      expect(panel).to.match(/Mouse <span>· 12 vistas/);
      expect(panel).to.match(/Razer <span>· 15 vistas/);
      expect(panel).to.not.match(/Webcams <span>/);

      const client = await loginAs("user");
      await client.agent.get("/admin").expect(403);
    });
  });
});

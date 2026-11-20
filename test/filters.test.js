import { expect } from "chai";
import Product from "../src/models/product.model.js";
import { CATEGORIES, filterFields } from "../public/js/catalogSchema.js";
import { RESERVED_PARAMS, readCatalogFilters } from "../src/utils/catalogFilters.js";
import { createProduct, productData, request } from "./helpers.js";

// Lo que se ve en la lista de productos (sin los chips ni los filtros).
const titles = (html) => [...html.matchAll(/class="product-card__title"[^>]*>(?:<a[^>]*>)?([^<]+)</g)].map((m) => m[1].trim());
const select = (html, name) => html.match(new RegExp(`<select id="f-${name}"[\\s\\S]*?</select>`))?.[0] ?? "";

const mice = () =>
  Promise.all([
    createProduct({ title: "Razer cable", brand: "Razer", subcategory: "con-cable", specs: { connection: "Cable USB", rgb: true } }),
    createProduct({ title: "Razer inalambrico", brand: "Razer", subcategory: "inalambricos", specs: { connection: "Bluetooth", rgb: false } }),
    createProduct({ title: "Logitech cable", brand: "Logitech", subcategory: "con-cable", specs: { connection: "Cable USB", rgb: true } }),
    createProduct({ title: "Mouse sin marca", category: "mouse" }),
    createProduct({ title: "Teclado Razer", category: "teclados", brand: "Razer", subcategory: "mecanicos" }),
  ]);

describe("Filtros del catálogo", () => {
  describe("lectura de la URL", () => {
    it("solo acepta valores de la lista de cada filtro y los demás los ignora", () => {
      expect(readCatalogFilters({ brand: "Razer", sub: "inalambricos", connection: "Bluetooth", rgb: "si" }, "mouse"))
        .to.deep.equal({ brand: "Razer", sub: "inalambricos", connection: "Bluetooth", rgb: "si" });

      const ignored = [
        { brand: "Intel" }, // marca de otra categoría
        { brand: ["Razer", "Logitech"] }, // parámetro repetido
        { brand: { $ne: null } }, // operador de Mongo
        { sub: "constructor" }, // nombre heredado de Object
        { dpi: "26000" }, // campo de la ficha que no es filtro
        { rgb: "true" }, // los sí/no se escriben "si" y "no"
        { connection: "x".repeat(10_000) },
      ];
      for (const query of ignored) expect(readCatalogFilters(query, "mouse"), JSON.stringify(query).slice(0, 60)).to.deep.equal({});
    });

    it("sin categoría solo se filtra por marca", () => {
      expect(readCatalogFilters({ brand: "Intel", sub: "mecanicos", connection: "Bluetooth" }, "")).to.deep.equal({ brand: "Intel" });
    });

    it("ningún campo filtrable se llama como un parámetro que ya usa el catálogo", () => {
      for (const category of Object.keys(CATEGORIES)) {
        for (const field of filterFields(category)) {
          expect(RESERVED_PARAMS, `${category}.${field.key}`).to.not.include(field.key);
          expect(["select", "boolean"], `${category}.${field.key}`).to.include(field.type);
        }
      }
    });
  });

  describe("página del catálogo", () => {
    it("filtra por marca, tipo y campos de la ficha", async () => {
      await mice();

      const byBrand = await request.get("/products?category=mouse&brand=Razer").expect(200);
      expect(titles(byBrand.text)).to.have.members(["Razer cable", "Razer inalambrico"]);

      const bySub = await request.get("/products?category=mouse&sub=con-cable").expect(200);
      expect(titles(bySub.text)).to.have.members(["Razer cable", "Logitech cable"]);

      const bySpecs = await request.get("/products?category=mouse&connection=Cable+USB&rgb=si&brand=Logitech").expect(200);
      expect(titles(bySpecs.text)).to.deep.equal(["Logitech cable"]);

      const noRgb = await request.get("/products?category=mouse&rgb=no").expect(200);
      expect(titles(noRgb.text)).to.deep.equal(["Razer inalambrico"]);
    });

    it("cada opción muestra cuántos productos quedarían, sin contar su propio filtro", async () => {
      await mice();
      const page = await request.get("/products?category=mouse&brand=Razer").expect(200);

      // Con Razer elegida, la marca sigue ofreciendo Logitech para cambiar de una a otra.
      expect(select(page.text, "brand")).to.include("Razer (2)").and.include("Logitech (1)");
      // Los demás filtros cuentan solo dentro de Razer.
      expect(select(page.text, "sub")).to.include("Con cable (1)").and.include("Inalámbricos (1)");
      // Las opciones sin productos no aparecen.
      expect(select(page.text, "connection")).to.not.include("Multimodo");
    });

    it("muestra los filtros aplicados con un link para quitar cada uno", async () => {
      await mice();
      const page = await request.get("/products?category=mouse&brand=Razer&sub=con-cable").expect(200);

      expect(page.text).to.include('aria-label="Filtros aplicados"');
      expect(page.text).to.include("Marca: Razer");
      expect(page.text).to.include("Tipo: Con cable");
      // Quitar la marca conserva el tipo (Handlebars escapa el "=" del link).
      expect(page.text).to.match(/href="\/products\?category&#x3D;mouse&amp;sub&#x3D;con-cable"[^>]*>Marca: Razer/);
    });

    it("cambiar de categoría quita los filtros de la anterior", async () => {
      await mice();
      const page = await request.get("/products?category=mouse&brand=Razer&connection=Bluetooth").expect(200);
      const chips = page.text.match(/<nav class="chips"[\s\S]*?<\/nav>/)[0];
      expect(chips).to.include("category&#x3D;teclados");
      expect(chips).to.not.include("brand&#x3D;");
      expect(chips).to.not.include("connection&#x3D;");
    });

    it("la paginación conserva los filtros", async () => {
      await Product.insertMany(Array.from({ length: 10 }, () => ({ ...productData({ brand: "Razer" }), status: true })));
      const page = await request.get("/products?category=mouse&brand=Razer&limit=8").expect(200);
      expect(page.text).to.match(/class="pagination__link"[^>]*href="[^"]*brand&#x3D;Razer[^"]*page&#x3D;2|href="[^"]*brand&#x3D;Razer[^"]*page&#x3D;2"/);
    });

    it("ignora filtros inválidos o maliciosos sin romper la página", async () => {
      await mice();
      const queries = [
        "/products?category=mouse&brand[$ne]=x",
        "/products?category=mouse&brand=Razer&brand=Logitech",
        "/products?category=mouse&connection=%3Cscript%3E",
        "/products?category=mouse&specs.dpi=1",
        "/products?category=inventada&brand=Razer",
      ];
      for (const url of queries) {
        const res = await request.get(url);
        expect(res.status, url).to.equal(200);
        expect(res.text, url).to.not.include("<script>");
      }
      // Sin un filtro válido se ven todos los mouse.
      const all = await request.get("/products?category=mouse&brand[$ne]=x").expect(200);
      expect(titles(all.text)).to.have.length(4);
    });

    it("los productos cargados antes de las fichas se siguen listando", async () => {
      await mice();
      const page = await request.get("/products?category=mouse").expect(200);
      expect(titles(page.text)).to.include("Mouse sin marca");
      expect(select(page.text, "brand")).to.not.include("null");
    });

    it("sin categoría ofrece solo el filtro de marca", async () => {
      await mice();
      const page = await request.get("/products").expect(200);
      expect(select(page.text, "brand")).to.include("Razer (3)");
      expect(page.text).to.not.include('id="f-sub"');
      expect(page.text).to.not.include('id="f-connection"');
    });
  });
});

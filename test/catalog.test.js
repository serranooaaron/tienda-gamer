import { expect } from "chai";
import Product from "../src/models/product.model.js";
import { seedProducts } from "../src/data/seeders.js";
import sampleProducts from "../src/data/products.js";
import { CATEGORIES, CatalogError, GROUPS, checkCategoryFields, cleanSpecs, specSheet } from "../public/js/catalogSchema.js";
import { createProduct, loginAs, productData, request } from "./helpers.js";

describe("Catálogo técnico", () => {
  describe("definición de categorías", () => {
    it("cada categoría tiene subcategorías, marcas y campos sin claves repetidas", () => {
      for (const [key, category] of Object.entries(CATEGORIES)) {
        expect(Object.keys(category.subcategories), key).to.not.be.empty;
        expect(category.brands, key).to.not.be.empty;
        const keys = category.sections.flatMap((section) => section.fields.map((field) => field.key));
        expect(new Set(keys).size, key).to.equal(keys.length);
        for (const field of category.sections.flatMap((section) => section.fields)) {
          expect(["text", "number", "boolean", "select"], `${key}.${field.key}`).to.include(field.type);
          if (field.type === "select") expect(field.options, `${key}.${field.key}`).to.not.be.empty;
        }
      }
    });

    it("los productos de ejemplo cumplen la ficha de su categoría", () => {
      for (const product of sampleProducts) {
        expect(() => checkCategoryFields(product), product.code).to.not.throw();
        expect(cleanSpecs(product.category, product.specs), product.code).to.deep.equal(product.specs);
      }
    });
  });

  describe("validación de la ficha", () => {
    it("convierte números escritos como texto y omite los campos vacíos", () => {
      expect(cleanSpecs("mouse", { dpi: "26000", weightG: "60,5", sensor: "  PAW3395 ", batteryH: "" }))
        .to.deep.equal({ dpi: 26000, weightG: 60.5, sensor: "PAW3395" });
    });

    it("rechaza campos de otra categoría, tipos incorrectos y opciones que no existen", () => {
      const cases = [
        [{ hotSwap: true }, "no tiene estos campos: hotSwap"],
        [{ dpi: "mucho" }, "DPI máximo: debe ser un número"],
        [{ dpi: -1 }, "debe ser un número"],
        [{ rgb: "si" }, "RGB: debe ser sí o no"],
        [{ grip: "Zurdo" }, "Mano: debe ser una de estas opciones"],
        [{ sensor: "x".repeat(81) }, "hasta 80 caracteres"],
        [["dpi"], "debe ser un objeto"],
      ];
      for (const [specs, message] of cases) {
        expect(() => cleanSpecs("mouse", specs), JSON.stringify(specs)).to.throw(CatalogError, message);
      }
    });

    it("solo acepta subcategorías y marcas de la categoría, sin nombres heredados", () => {
      expect(() => checkCategoryFields({ category: "teclados", subcategory: "mecanicos", brand: "Razer" })).to.not.throw();
      expect(() => checkCategoryFields({ category: "teclados", subcategory: "inalambricos" })).to.throw(CatalogError, "Subcategoría inválida");
      expect(() => checkCategoryFields({ category: "teclados", subcategory: "constructor" })).to.throw(CatalogError);
      expect(() => checkCategoryFields({ category: "teclados", brand: "Logitec" })).to.throw(CatalogError, "Marca inválida");
      expect(() => checkCategoryFields({ category: "teclados", brand: "Intel" })).to.throw(CatalogError);
    });

    it("valida las fichas de componentes y monitores", () => {
      expect(cleanSpecs("placas-de-video", { chip: "GeForce RTX 4060", memoryGb: "8", memoryType: "GDDR6", hdmi: 1, displayPort: 3, backplate: true }))
        .to.deep.equal({ chip: "GeForce RTX 4060", memoryGb: 8, memoryType: "GDDR6", hdmi: 1, displayPort: 3, backplate: true });
      expect(cleanSpecs("procesadores", { socket: "AM5", cores: 8, boostGhz: "5,4" })).to.deep.equal({ socket: "AM5", cores: 8, boostGhz: 5.4 });
      expect(() => cleanSpecs("procesadores", { socket: "LGA1151" })).to.throw(CatalogError, "Socket: debe ser una de estas opciones");
      expect(() => cleanSpecs("monitores", { memoryGb: 8 })).to.throw(CatalogError, "no tiene estos campos: memoryGb");
      expect(() => checkCategoryFields({ category: "procesadores", subcategory: "amd-ryzen", brand: "Logitech" })).to.throw(CatalogError, "Marca inválida");
      expect(() => checkCategoryFields({ category: "motherboards", subcategory: "am5", brand: "Asrock" })).to.not.throw();
    });

    it("cada categoría pertenece a un grupo conocido", () => {
      for (const [key, category] of Object.entries(CATEGORIES)) expect(GROUPS, key).to.have.property(category.group);
      expect(Object.keys(CATEGORIES)).to.include.members(["procesadores", "placas-de-video", "memorias-ram", "motherboards", "gabinetes", "monitores"]);
    });

    it("muestra la ficha de un monitor con sus unidades", () => {
      const sheet = specSheet("monitores", { sizeIn: 27, refreshHz: 165, brightnessNits: 350, pivot: true });
      expect(sheet[0].rows).to.deep.include({ label: "Tamaño", value: "27 pulgadas" });
      expect(sheet[1].rows).to.deep.include({ label: "Brillo", value: "350 cd/m²" });
      expect(sheet.find((section) => section.title === "Ergonomía").rows).to.deep.equal([{ label: "Pivote (vertical)", value: "Sí" }]);
    });

    it("arma la ficha para mostrar con unidades, formato local y sin secciones vacías", () => {
      const sheet = specSheet("mouse", { dpi: 26000, weightG: 60, rgb: false });
      expect(sheet.map((section) => section.title)).to.deep.equal(["Sensor", "Diseño"]);
      expect(sheet[0].rows).to.deep.equal([{ label: "DPI máximo", value: "26.000" }]);
      expect(sheet[1].rows).to.deep.include({ label: "Peso", value: "60 g" });
      expect(sheet[1].rows).to.deep.include({ label: "RGB", value: "No" });
    });
  });

  describe("API de productos con marca y ficha", () => {
    const keyboard = () => ({
      ...productData({ category: "teclados" }),
      subcategory: "mecanicos",
      brand: "Redragon",
      model: "K552 Kumara",
      warrantyMonths: 12,
      specs: { layout: "TKL (80 %)", switchType: "Táctil", hotSwap: false, weightG: "900" },
    });

    it("un administrador crea un producto con marca, subcategoría y ficha validadas", async () => {
      const { agent } = await loginAs("admin");
      const res = await agent.post("/api/products").send(keyboard()).expect(201);

      expect(res.body.payload).to.include({ brand: "Redragon", subcategory: "mecanicos", model: "K552 Kumara", warrantyMonths: 12 });
      expect(res.body.payload.specs).to.deep.equal({ layout: "TKL (80 %)", switchType: "Táctil", hotSwap: false, weightG: 900 });
    });

    it("rechaza marcas, subcategorías o campos de la ficha que no corresponden y dice por qué", async () => {
      const { agent } = await loginAs("admin");
      const cases = [
        [{ brand: "Intel" }, "Marca inválida para Teclados"],
        [{ subcategory: "inalambricos" }, "Subcategoría inválida para Teclados"],
        [{ specs: { dpi: 16000 } }, "no tiene estos campos: dpi"],
        [{ warrantyMonths: 500 }, "La garantía va de 0 a 120 meses"],
      ];
      for (const [override, message] of cases) {
        const res = await agent.post("/api/products").send({ ...keyboard(), ...override });
        expect(res.status, message).to.equal(400);
        expect(res.body.message).to.include(message);
      }
    });

    it("acepta lo que envía el formulario del panel: números como texto con coma, sí/no y campos vacíos", async () => {
      const { agent } = await loginAs("admin");
      const res = await agent
        .post("/api/products")
        .send({
          ...productData({ category: "mouse" }),
          subcategory: null,
          brand: "Logitech",
          model: "",
          warrantyMonths: "",
          specs: { dpi: "25600", weightG: "60,5", rgb: false, grip: "Diestro" },
        })
        .expect(201);

      expect(res.body.payload).to.include({ brand: "Logitech", subcategory: null, warrantyMonths: null });
      expect(res.body.payload.specs).to.deep.equal({ dpi: 25600, weightG: 60.5, rgb: false, grip: "Diestro" });
    });

    it("al editar valida contra la categoría guardada y no deja cambiarla si la ficha anterior no encaja", async () => {
      const { agent } = await loginAs("admin");
      const created = (await agent.post("/api/products").send(keyboard()).expect(201)).body.payload;

      await agent.put(`/api/products/${created._id}`).send({ specs: { layout: "60 %" } }).expect(200);
      const badSpecs = await agent.put(`/api/products/${created._id}`).send({ specs: { dpi: 800 } });
      const badMove = await agent.put(`/api/products/${created._id}`).send({ category: "mouse" });
      const goodMove = await agent
        .put(`/api/products/${created._id}`)
        .send({ category: "mouse", subcategory: "inalambricos", brand: "Razer", specs: { dpi: 30000 } });

      expect(badSpecs.status).to.equal(400);
      expect(badMove.status).to.equal(400);
      expect(goodMove.status).to.equal(200);
      expect(goodMove.body.payload.specs).to.deep.equal({ dpi: 30000 });
    });
  });

  describe("página del producto", () => {
    it("muestra marca, modelo, garantía y la ficha técnica en secciones", async () => {
      const product = await createProduct({
        title: "Mouse inalámbrico de prueba",
        brand: "Logitech",
        subcategory: "inalambricos",
        model: "G Pro X Superlight",
        warrantyMonths: 24,
        specs: { sensor: "HERO 25K", dpi: 25600, weightG: 63, connection: "Inalámbrico 2,4 GHz", batteryH: 70 },
      });

      const page = await request.get(`/products/${product._id}`).expect(200);

      expect(page.text).to.include("Logitech · Mouse");
      expect(page.text).to.include("Modelo G Pro X Superlight");
      expect(page.text).to.include("Garantía de 24 meses");
      expect(page.text).to.include(">Inalámbricos</span>");
      expect(page.text).to.include('id="specs-title">Especificaciones');
      for (const text of [">Sensor</h3>", "<dt>DPI máximo</dt><dd>25.600</dd>", "<dt>Peso</dt><dd>63 g</dd>", "<dt>Batería</dt><dd>70 h</dd>"]) {
        expect(page.text).to.include(text);
      }
    });

    it("un producto cargado antes de las fichas se sigue viendo, sin la sección", async () => {
      const { insertedId } = await Product.collection.insertOne({ ...productData({ title: "Producto viejo sin ficha" }), status: true });
      const page = await request.get(`/products/${insertedId}`).expect(200);
      expect(page.text).to.include("Producto viejo sin ficha");
      expect(page.text).to.not.include("Especificaciones");
    });

    it("escapa los datos de la ficha", async () => {
      const product = await createProduct({ specs: { sensor: "<img src=x onerror=alert(1)>" } });
      const page = await request.get(`/products/${product._id}`).expect(200);
      expect(page.text).to.not.include("<img src=x");
      expect(page.text).to.include("&lt;img src&#x3D;x");
    });
  });

  describe("categorías vacías", () => {
    it("el inicio y los chips solo muestran categorías con productos, salvo la elegida", async () => {
      await createProduct({ category: "teclados" });

      const home = await request.get("/").expect(200);
      expect(home.text).to.include('href="/products?category=teclados"');
      expect(home.text).to.not.include('href="/products?category=monitores"');

      // En los chips Handlebars escapa el "=" del link: se buscan por el nombre de la categoría.
      const chips = (text) => text.match(/<nav class="chips"[\s\S]*?<\/nav>/)[0];
      const list = await request.get("/products").expect(200);
      expect(chips(list.text)).to.include("Teclados");
      expect(chips(list.text)).to.not.include("Gabinetes");

      const empty = await request.get("/products?category=gabinetes").expect(200);
      expect(empty.text).to.match(/chip--active[^>]*>[\s\S]*?Gabinetes/);
    });
  });

  describe("seed", () => {
    it("completa marca y ficha de los productos existentes sin pisar precio ni stock", async () => {
      const [first] = sampleProducts;
      await Product.collection.insertOne({ ...first, brand: undefined, specs: undefined, subcategory: undefined, price: 999, stock: 1 });

      await seedProducts();
      const stored = await Product.findOne({ code: first.code }).lean();

      expect(stored).to.include({ price: 999, stock: 1, brand: first.brand, subcategory: first.subcategory });
      expect(stored.specs).to.deep.equal(first.specs);
      expect(await Product.countDocuments()).to.equal(sampleProducts.length);
    });
  });
});

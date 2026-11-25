import { readFile } from "node:fs/promises";
import { expect } from "chai";
import Product from "../src/models/product.model.js";
import { IMPORT_MAX_ROWS } from "../src/services/catalogImport.js";
import { createProduct, loginAs, productData, request } from "./helpers.js";

const row = (overrides = {}) => {
  const { title, description, code, price, stock, category } = productData({ category: "mouse" });
  return { title, description, code, price, stock, category, brand: "Logitech", subcategory: "inalambricos", specs: { dpi: 25600 }, ...overrides };
};

describe("Importar catálogo desde JSON", () => {
  it("solo los administradores pueden revisar o importar", async () => {
    const products = [row()];
    await request.post("/api/products/import/preview").send({ products }).expect(401);
    const { agent } = await loginAs("user");
    await agent.post("/api/products/import/preview").send({ products }).expect(403);
    await agent.post("/api/products/import").send({ products }).expect(403);
    expect(await Product.countDocuments()).to.equal(0);
  });

  it("la vista previa dice qué se crea, qué se actualiza y qué no cambia, sin guardar nada", async () => {
    const existing = await createProduct({ category: "mouse", brand: "Logitech", price: 100 });
    const same = await createProduct({ category: "mouse" });
    const { agent } = await loginAs("admin");

    const res = await agent
      .post("/api/products/import/preview")
      .send({ products: [row({ title: "Mouse nuevo importado" }), { code: existing.code.toLowerCase(), price: 150, stock: 9 }, { code: same.code, price: same.price }] })
      .expect(200);

    expect(res.body.payload.summary).to.deep.equal({ create: 1, update: 1, unchanged: 1, error: 0 });
    const [created, updated, unchanged] = res.body.payload.items;
    expect(created).to.include({ row: 1, action: "create", title: "Mouse nuevo importado" });
    expect(updated).to.include({ row: 2, action: "update", code: existing.code });
    expect(updated.changes).to.have.members(["price", "stock"]);
    expect(unchanged.action).to.equal("unchanged");
    expect(created).to.not.have.property("data");
    // Nada se guardó.
    expect(await Product.countDocuments()).to.equal(2);
    expect((await Product.findById(existing._id)).price).to.equal(100);
  });

  it("marca cada fila con error y dice por qué", async () => {
    await createProduct({ title: "Nombre ya usado por otro", code: "OTRO-1" });
    const { agent } = await loginAs("admin");
    const products = [
      row({ code: "A-1" }),
      row({ code: "a-1", title: "Otro nombre para el mismo código" }), // código repetido (mayúsculas no cuentan)
      row({ brand: "Intel" }),
      row({ specs: { dpi: "mucho" } }),
      row({ title: "Nombre ya usado por otro" }),
      row({ price: -5 }),
      { title: "Sin código", description: "Descripción larga", price: 1, stock: 1, category: "mouse" },
      "no es un objeto",
      row({ category: "heladeras" }),
      { code: "NUEVO-SIN-DATOS", price: 10 },
    ];
    const res = await agent.post("/api/products/import/preview").send({ products }).expect(200);
    const errors = res.body.payload.items.map((item) => item.error ?? "ok");

    expect(errors[0]).to.equal("ok");
    expect(errors[1]).to.equal("El código se repite en la fila 1");
    expect(errors[2]).to.include("Marca inválida para Mouse");
    expect(errors[3]).to.equal("DPI máximo: debe ser un número");
    expect(errors[4]).to.include("Ya existe otro producto con este nombre (OTRO-1)");
    expect(errors[5]).to.equal("price: no puede ser menor que 0");
    expect(errors[6]).to.equal("Falta el campo code");
    expect(errors[7]).to.include("tiene que ser un objeto");
    expect(errors[8]).to.include("Categoría desconocida");
    expect(errors[9]).to.equal("Falta el campo title");
    expect(res.body.payload.summary).to.deep.equal({ create: 1, update: 0, unchanged: 0, error: 9 });
  });

  it("rechaza archivos que no son una lista, vacíos o demasiado grandes", async () => {
    const { agent } = await loginAs("admin");
    for (const [products, message] of [
      [{ title: "x" }, "tiene que ser una lista"],
      [[], "no tiene productos"],
      [Array.from({ length: IMPORT_MAX_ROWS + 1 }, (_, i) => row({ code: `X-${i}` })), `hasta ${IMPORT_MAX_ROWS}`],
    ]) {
      const res = await agent.post("/api/products/import/preview").send({ products });
      expect(res.status).to.equal(400);
      expect(res.body.message).to.include(message);
    }
  });

  it("no acepta operadores de Mongo ni campos que la importación no maneja", async () => {
    const existing = await createProduct({ category: "mouse", views: 7 });
    const { agent } = await loginAs("admin");
    await agent
      .post("/api/products/import")
      .send({ products: [{ code: existing.code, price: 300, views: 0, featured: true, _id: "000000000000000000000000", $set: { stock: 0 } }] })
      .expect(201);
    const stored = await Product.findById(existing._id).lean();
    expect(stored).to.include({ price: 300, views: 7, featured: false, stock: existing.stock });
  });

  it("al confirmar crea y actualiza en una sola vez", async () => {
    const existing = await createProduct({ category: "mouse", price: 100 });
    const { agent } = await loginAs("admin");
    const res = await agent
      .post("/api/products/import")
      .send({ products: [row({ code: "NUEVO-1", title: "Mouse importado al confirmar" }), { code: existing.code, price: 120, specs: { weightG: 70 } }] })
      .expect(201);

    expect(res.body.payload).to.deep.equal({ create: 1, update: 1, unchanged: 0, error: 0 });
    const created = await Product.findOne({ code: "NUEVO-1" }).lean();
    expect(created).to.include({ brand: "Logitech", subcategory: "inalambricos", status: true, views: 0, featured: false });
    expect(created.specs).to.deep.equal({ dpi: 25600 });
    expect(await Product.findById(existing._id).lean()).to.deep.include({ price: 120, specs: { weightG: 70 } });
  });

  it("si una fila tiene errores no guarda ninguna", async () => {
    const { agent } = await loginAs("admin");
    const res = await agent.post("/api/products/import").send({ products: [row({ code: "BIEN-1" }), row({ brand: "Intel" })] });
    expect(res.status).to.equal(400);
    expect(res.body.message).to.include("Hay 1 fila con errores");
    expect(await Product.countDocuments()).to.equal(0);
  });

  it("el catálogo de ejemplo del repositorio se puede importar sin errores y queda pausado", async () => {
    const products = JSON.parse(await readFile(new URL("../docs/catalogo-ejemplo.json", import.meta.url), "utf8"));
    const { agent } = await loginAs("admin");
    const preview = await agent.post("/api/products/import/preview").send({ products }).expect(200);
    const errors = preview.body.payload.items.filter((item) => item.action === "error");
    expect(errors, JSON.stringify(errors)).to.be.empty;

    await agent.post("/api/products/import").send({ products }).expect(201);
    expect(await Product.countDocuments({ status: true })).to.equal(0);
    expect(await Product.countDocuments()).to.equal(products.length);
  });
});

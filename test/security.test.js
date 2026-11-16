import { expect } from "chai";
import mongoose from "mongoose";
import User from "../src/models/user.model.js";
import { createProduct, loginAs, request } from "./helpers.js";

describe("Cabeceras de seguridad y salud", () => {
  it("todas las respuestas llevan la política de contenido y las cabeceras de protección", async () => {
    const page = await request.get("/");
    const api = await request.get("/api/products");
    const asset = await request.get("/css/styles.css");

    for (const res of [page, api, asset]) {
      expect(res.headers["content-security-policy"]).to.include("script-src 'self'").and.to.include("frame-ancestors 'none'");
      expect(res.headers["x-content-type-options"]).to.equal("nosniff");
      expect(res.headers["x-frame-options"]).to.equal("DENY");
      expect(res.headers["referrer-policy"]).to.equal("strict-origin-when-cross-origin");
      expect(res.headers).to.not.have.property("x-powered-by");
    }
  });

  it("HSTS solo se envía en producción", async () => {
    expect((await request.get("/")).headers).to.not.have.property("strict-transport-security");
    process.env.NODE_ENV = "production";
    try {
      expect((await request.get("/")).headers["strict-transport-security"]).to.equal("max-age=63072000; includeSubDomains");
    } finally {
      delete process.env.NODE_ENV;
    }
  });

  it("las páginas no llevan scripts escritos dentro del HTML", async () => {
    const product = await createProduct();
    const { agent } = await loginAs("admin");
    for (const url of ["/", "/products", `/products/${product._id}`, "/login", "/register", "/admin", "/cart"]) {
      const res = await agent.get(url).redirects(1);
      expect(res.text, url).to.not.match(/<script(?![^>]*\ssrc=)[^>]*>/);
      expect(res.text, url).to.not.match(/\son[a-z]+="/);
    }
  });

  it("GET /api/health responde ok sin exponer datos internos", async () => {
    const res = await request.get("/api/health");
    expect(res.status).to.equal(200);
    expect(res.body).to.deep.equal({ status: "ok" });
  });

  it("un operador de MongoDB dentro de un filtro se toma como valor literal", async () => {
    await loginAs();
    const result = await User.findOne({ email: { $ne: null } }).then((user) => (user ? "devolvió un usuario" : null), (error) => error.name);
    expect(result).to.be.oneOf([null, "CastError"]);
    expect(mongoose.get("sanitizeFilter")).to.equal(true);
  });
});

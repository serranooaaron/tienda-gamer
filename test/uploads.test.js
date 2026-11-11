import { readdir } from "node:fs/promises";
import { expect } from "chai";
import { loginAs, request } from "./helpers.js";

// Primeros bytes reales de cada formato, seguidos de relleno: alcanza para validar la firma.
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64)]);
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), Buffer.alloc(64)]);

const uploadedFiles = () => readdir(process.env.UPLOAD_DIR);

describe("Subida de imágenes de productos", () => {
  const upload = (agent, buffer, filename, contentType) =>
    agent.post("/api/products/images").attach("image", buffer, { filename, contentType });

  it("un administrador sube PNG, JPG y WebP y recibe la dirección pública", async () => {
    const { agent } = await loginAs("admin");

    for (const [buffer, filename, type, ext] of [
      [PNG, "mouse.png", "image/png", "png"],
      [JPG, "teclado.jpg", "image/jpeg", "jpg"],
      [WEBP, "auris.webp", "image/webp", "webp"],
    ]) {
      const res = await upload(agent, buffer, filename, type);
      expect(res.status).to.equal(201);
      expect(res.body.payload.url).to.match(new RegExp(`^/image/uploads/\\d+-[0-9a-f]{12}\\.${ext}$`));
    }
  });

  it("guarda el archivo con un nombre propio, nunca el que manda el navegador", async () => {
    const { agent } = await loginAs("admin");
    const res = await upload(agent, PNG, "../../index.js.png", "image/png");

    expect(res.status).to.equal(201);
    expect(res.body.payload.url).to.not.include("index");
    expect(await uploadedFiles()).to.include(res.body.payload.url.split("/").pop());
  });

  it("solo los administradores pueden subir imágenes", async () => {
    const { agent } = await loginAs("user");
    await upload(agent, PNG, "mouse.png", "image/png").expect(403);
    await request.post("/api/products/images").attach("image", PNG, { filename: "mouse.png", contentType: "image/png" }).expect(401);
  });

  it("rechaza formatos que no son imágenes", async () => {
    const { agent } = await loginAs("admin");
    const res = await upload(agent, Buffer.from("<svg onload=alert(1)>"), "logo.svg", "image/svg+xml");
    expect(res.status).to.equal(400);
    expect(res.body.message).to.equal("Solo se aceptan imágenes PNG, JPG o WebP");
  });

  it("rechaza un archivo disfrazado de imagen y no lo deja guardado", async () => {
    const { agent } = await loginAs("admin");
    const before = await uploadedFiles();

    const res = await upload(agent, Buffer.from("<script>alert(1)</script>".padEnd(64)), "foto.png", "image/png");

    expect(res.status).to.equal(400);
    expect(res.body.message).to.equal("El archivo no es una imagen válida");
    expect(await uploadedFiles()).to.have.length(before.length);
  });

  it("rechaza imágenes de más de 2 MB", async () => {
    const { agent } = await loginAs("admin");
    const big = Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024)]);
    const res = await upload(agent, big, "grande.png", "image/png");
    expect(res.status).to.equal(400);
    expect(res.body.message).to.equal("La imagen no puede superar 2 MB");
  });

  it("pide un archivo", async () => {
    const { agent } = await loginAs("admin");
    const res = await agent.post("/api/products/images").field("nada", "x");
    expect(res.status).to.equal(400);
  });

  it("el panel ofrece las imágenes subidas en el selector", async () => {
    const { agent } = await loginAs("admin");
    const { body } = await upload(agent, PNG, "mouse.png", "image/png");

    const page = await agent.get("/admin");

    expect(page.text).to.include(`<option value="${body.payload.url}"`);
    expect(page.text).to.include("Subir imagen nueva");
  });
});

import { expect } from "chai";
import supertest from "supertest";
import app from "../src/app.js";
import Cart from "../src/models/cart.model.js";
import User from "../src/models/user.model.js";
import { loginAs, randomPassword, request, userData } from "./helpers.js";
import { createLoginLimiter } from "../src/utils/loginLimiter.js";

describe("Sesiones", () => {
  describe("POST /api/sessions/register", () => {
    it("crea la cuenta con su carrito e inicia la sesión", async () => {
      const data = userData();
      const res = await request.post("/api/sessions/register").send(data);

      expect(res.status).to.equal(201);
      const user = await User.findOne({ email: data.email });
      expect(user.role).to.equal("user");
      expect(await Cart.exists({ _id: user.cart })).to.not.equal(null);
      expect(res.headers["set-cookie"][0]).to.include("tiendaToken=");
    });

    it("usa una cookie httpOnly y SameSite=Lax", async () => {
      const res = await request.post("/api/sessions/register").send(userData());
      expect(res.headers["set-cookie"][0]).to.match(/HttpOnly/i).and.to.match(/SameSite=Lax/i);
    });

    it("guarda la contraseña hasheada", async () => {
      const data = userData();
      await request.post("/api/sessions/register").send(data);
      const user = await User.findOne({ email: data.email }).select("+password");
      expect(user.password).to.not.equal(data.password);
      expect(user.password).to.match(/^\$2[aby]\$/);
    });

    it("ignora un rol enviado por el cliente", async () => {
      const data = userData({ role: "admin" });
      await request.post("/api/sessions/register").send(data).expect(201);
      const user = await User.findOne({ email: data.email });
      expect(user.role).to.equal("user");
    });

    it("rechaza datos incompletos", async () => {
      const { password, ...incomplete } = userData();
      await request.post("/api/sessions/register").send(incomplete).expect(400);
    });

    it("rechaza contraseñas de menos de 8 caracteres", async () => {
      await request.post("/api/sessions/register").send(userData({ password: "a".repeat(7) })).expect(400);
    });

    it("rechaza un email inválido", async () => {
      await request.post("/api/sessions/register").send(userData({ email: "no-es-un-email" })).expect(400);
    });

    it("rechaza un email ya registrado, sin importar mayúsculas", async () => {
      const data = userData();
      await request.post("/api/sessions/register").send(data).expect(201);
      await request
        .post("/api/sessions/register")
        .send({ ...data, email: data.email.toUpperCase() })
        .expect(409);
    });
  });

  describe("POST /api/sessions/login", () => {
    it("inicia sesión con email y contraseña correctos", async () => {
      const { email, password } = await loginAs();
      const res = await request.post("/api/sessions/login").send({ email, password });
      expect(res.status).to.equal(200);
      expect(res.body.payload.role).to.equal("user");
    });

    it("responde igual con email inexistente o contraseña incorrecta", async () => {
      const { email } = await loginAs();
      const wrongPassword = await request.post("/api/sessions/login").send({ email, password: randomPassword() });
      const unknownEmail = await request
        .post("/api/sessions/login")
        .send({ email: "nadie@example.com", password: randomPassword() });

      expect(wrongPassword.status).to.equal(401);
      expect(unknownEmail.status).to.equal(401);
      expect(wrongPassword.body.message).to.equal(unknownEmail.body.message);
    });

    it("no se deja engañar con operadores de MongoDB en el email", async () => {
      await loginAs();
      const res = await request
        .post("/api/sessions/login")
        .send({ email: { $gt: "" }, password: { $gt: "" } });
      expect(res.status).to.equal(401);
    });

    it("pide email y contraseña", async () => {
      await request.post("/api/sessions/login").send({}).expect(400);
    });
  });

  describe("Límite de intentos de login", () => {
    const tryLogin = (email, password) => request.post("/api/sessions/login").send({ email, password });

    it("después de 5 contraseñas incorrectas bloquea la cuenta aunque la sexta sea la correcta", async () => {
      const { email, password } = await loginAs();
      for (let i = 0; i < 5; i++) expect((await tryLogin(email, "incorrecta")).status).to.equal(401);

      const blocked = await tryLogin(email, password);

      expect(blocked.status).to.equal(429);
      expect(Number(blocked.headers["retry-after"])).to.be.within(1, 15 * 60);
      expect(blocked.body.message).to.match(/Prueba de nuevo en 15 minutos/);
    });

    it("un login correcto reinicia el contador de la cuenta", async () => {
      const { email, password } = await loginAs();
      for (let i = 0; i < 4; i++) await tryLogin(email, "incorrecta");
      expect((await tryLogin(email, password)).status).to.equal(200);
      for (let i = 0; i < 4; i++) await tryLogin(email, "incorrecta");
      expect((await tryLogin(email, password)).status).to.equal(200);
    });

    it("el bloqueo de una cuenta no afecta a otra", async () => {
      const victim = await loginAs();
      const other = await loginAs();
      for (let i = 0; i < 5; i++) await tryLogin(victim.email, "incorrecta");

      expect((await tryLogin(other.email, other.password)).status).to.equal(200);
    });

    it("frena a una IP que prueba muchas cuentas distintas", async () => {
      for (let i = 0; i < 30; i++) expect((await tryLogin(`nadie${i}@example.com`, "incorrecta")).status).to.equal(401);
      expect((await tryLogin("una-mas@example.com", "incorrecta")).status).to.equal(429);
    });

    it("el bloqueo termina al pasar la ventana de tiempo", () => {
      let clock = 0;
      const limiter = createLoginLimiter({ windowMs: 1000, maxPerAccount: 2, now: () => clock });
      const req = { ip: "1.2.3.4", body: { email: "Ana@Example.com " } };

      limiter.fail(req);
      limiter.fail(req);
      expect(limiter.retryAfter(req)).to.equal(1);
      expect(limiter.retryAfter({ ip: "1.2.3.4", body: { email: "ana@example.com" } })).to.equal(1);

      clock = 1000;
      expect(limiter.retryAfter(req)).to.equal(0);
    });
  });

  describe("GET /api/sessions/current", () => {
    it("devuelve el usuario de la sesión sin datos sensibles", async () => {
      const { agent, email } = await loginAs();
      const res = await agent.get("/api/sessions/current");
      expect(res.status).to.equal(200);
      expect(res.body.payload.email).to.equal(email);
      expect(JSON.stringify(res.body)).to.not.include("password");
    });

    it("responde 401 sin sesión", async () => {
      await request.get("/api/sessions/current").expect(401);
    });

    it("rechaza un token alterado", async () => {
      await request.get("/api/sessions/current").set("Cookie", "tiendaToken=token.alterado.falso").expect(401);
    });
  });

  describe("POST /api/sessions/logout", () => {
    it("cierra la sesión", async () => {
      const { agent } = await loginAs();
      await agent.post("/api/sessions/logout").expect(200);
      await agent.get("/api/sessions/current").expect(401);
    });

    it("no falla si no había sesión", async () => {
      await supertest(app).post("/api/sessions/logout").expect(200);
    });
  });
});

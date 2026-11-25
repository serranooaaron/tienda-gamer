import { expect } from "chai";
import supertest from "supertest";
import app from "../src/app.js";
import User from "../src/models/user.model.js";
import PasswordReset from "../src/models/passwordReset.model.js";
import { forgotLimiter } from "../src/routes/sessions.route.js";
import { mailer } from "../src/utils/mailer.js";
import { loginAs, randomPassword, request } from "./helpers.js";

// Los tests nunca llaman a Brevo: se reemplaza el envío y se guardan los emails.
const originalSend = mailer.send;
let sent;
const waitForEmails = async (count) => {
  for (let i = 0; i < 50 && sent.length < count; i += 1) await new Promise((resolve) => setTimeout(resolve, 20));
};
const tokenFrom = (email) => email.text.match(/restablecer\?token=([A-Za-z0-9_-]+)/)[1];
const ask = (email) => request.post("/api/sessions/forgot").send({ email });

describe("Recuperar contraseña", () => {
  beforeEach(() => {
    sent = [];
    mailer.send = async (email) => { sent.push(email); };
    forgotLimiter.clear();
    process.env.APP_URL = "https://tienda.example";
  });
  afterEach(async () => {
    mailer.send = originalSend;
    delete process.env.APP_URL;
    await PasswordReset.deleteMany({});
  });

  it("responde lo mismo exista o no la cuenta, y solo envía email a la que existe", async () => {
    const { email } = await loginAs("user");
    const existing = await ask(email.toUpperCase()).expect(200);
    const missing = await ask("nadie@example.com").expect(200);
    await waitForEmails(1);

    expect(existing.body).to.deep.equal(missing.body);
    expect(sent).to.have.length(1);
    expect(sent[0].to).to.equal(email);
    expect(sent[0].text).to.include("https://tienda.example/restablecer?token=");
    const stored = await PasswordReset.findOne({}).lean();
    expect(stored.tokenHash).to.have.length(64);
    expect(stored.tokenHash).to.not.equal(tokenFrom(sent[0]));
  });

  it("un Host falso no cambia el link del email", async () => {
    const { email } = await loginAs("user");
    await request.post("/api/sessions/forgot").set("Host", "atacante.example").set("X-Forwarded-Host", "atacante.example").send({ email }).expect(200);
    await waitForEmails(1);
    expect(sent[0].text).to.not.include("atacante");
  });

  it("valida el email y limita los pedidos", async () => {
    await ask("no-es-un-email").expect(400);
    await request.post("/api/sessions/forgot").send({ email: { $ne: null } }).expect(400);
    for (let i = 0; i < 3; i += 1) await ask("alguien@example.com").expect(200);
    await ask("alguien@example.com").expect(429);
  });

  it("con el link se crea la contraseña nueva, se cierran todas las sesiones y el link no sirve dos veces", async () => {
    const { agent, email, password } = await loginAs("user");
    const otherDevice = supertest.agent(app);
    await otherDevice.post("/api/sessions/login").send({ email, password }).expect(200);
    await ask(email);
    await waitForEmails(1);
    const token = tokenFrom(sent[0]);

    const page = await request.get(`/restablecer?token=${token}`).expect(200);
    expect(page.text).to.include("data-reset-form");
    expect(page.headers["referrer-policy"]).to.equal("no-referrer");

    const newPassword = randomPassword();
    await request.post("/api/sessions/reset").send({ token, newPassword }).expect(200);

    await agent.get("/api/sessions/current").expect(401);
    await otherDevice.get("/api/sessions/current").expect(401);
    await request.post("/api/sessions/login").send({ email, password }).expect(401);
    await request.post("/api/sessions/login").send({ email, password: newPassword }).expect(200);

    const again = await request.post("/api/sessions/reset").send({ token, newPassword: randomPassword() });
    expect(again.status).to.equal(400);
    expect(again.body.message).to.include("venció o ya se usó");
    expect((await request.get(`/restablecer?token=${token}`)).text).to.include("Pedir un link nuevo");
  });

  it("pedir otro link anula el anterior y un link vencido no sirve", async () => {
    const { email, user } = await loginAs("user");
    await ask(email);
    await waitForEmails(1);
    await ask(email);
    await waitForEmails(2);
    await request.post("/api/sessions/reset").send({ token: tokenFrom(sent[0]), newPassword: randomPassword() }).expect(400);

    await PasswordReset.updateOne({ user: user._id }, { expiresAt: new Date(Date.now() - 1000) });
    await request.post("/api/sessions/reset").send({ token: tokenFrom(sent[1]), newPassword: randomPassword() }).expect(400);
  });

  it("aplica la regla de contraseñas sin gastar el link", async () => {
    const { email } = await loginAs("user");
    await ask(email);
    await waitForEmails(1);
    const token = tokenFrom(sent[0]);
    await request.post("/api/sessions/reset").send({ token, newPassword: "corta" }).expect(400);
    await request.post("/api/sessions/reset").send({ token, newPassword: randomPassword() }).expect(200);
  });

  it("rechaza tokens inventados u operadores, y de dos usos simultáneos del link gana uno", async () => {
    const { email, user } = await loginAs("user");
    for (const token of ["x", { $ne: null }, "a".repeat(43)]) {
      await request.post("/api/sessions/reset").send({ token, newPassword: randomPassword() }).expect(400);
    }
    await ask(email);
    await waitForEmails(1);
    const token = tokenFrom(sent[0]);
    const results = await Promise.all([
      request.post("/api/sessions/reset").send({ token, newPassword: randomPassword() }),
      request.post("/api/sessions/reset").send({ token, newPassword: randomPassword() }),
    ]);
    expect(results.map((res) => res.status).sort()).to.deep.equal([200, 400]);
    expect((await User.findById(user._id).lean()).sessionVersion).to.equal(1);
  });

  it("el email escapa el nombre de la cuenta", async () => {
    const { email, user } = await loginAs("user");
    await User.updateOne({ _id: user._id }, { first_name: "<b>Ana</b>" });
    await ask(email);
    await waitForEmails(1);
    expect(sent[0].html).to.include("&lt;b&gt;Ana&lt;/b&gt;");
  });

  it("el rol sale de la base: quitarle el rol de administrador corta su acceso al instante", async () => {
    const { agent, user } = await loginAs("admin");
    await agent.get("/admin").expect(200);
    await User.updateOne({ _id: user._id }, { role: "user" });
    await agent.get("/admin").expect(403);
  });

  it("el login ofrece recuperar la contraseña", async () => {
    const login = await request.get("/login").expect(200);
    expect(login.text).to.include('href="/recuperar"');
    await request.get("/recuperar").expect(200);
  });
});

import express from "express";
import mongoose from "mongoose";
import cookieParser from "cookie-parser";
import productsRouter from "./routes/products.route.js";
import cartRouter from "./routes/carts.route.js";
import ordersRouter from "./routes/orders.route.js";
import sessionsRouter from "./routes/sessions.route.js";
import { engine } from "express-handlebars";
import viewsRouter from "./routes/views.route.js";
import { attachUser } from "./middlewares/auth.middleware.js";
import helpers from "./utils/handlebars.js";
import securityHeaders from "./middlewares/securityHeaders.js";
import __dirname from "../dirname.js";

// La app solo arma las rutas: conectar la base y abrir el puerto queda en server.js,
// así los tests pueden importarla sin levantar nada.
// Un objeto con operadores ($ne, $gt...) que llegue desde el cliente dentro de un filtro se toma como valor literal.
// Los operadores que pone el servidor a propósito van marcados con mongoose.trusted().
mongoose.set("sanitizeFilter", true);

const app = express();

app.disable("x-powered-by");
app.use(securityHeaders);
// Detrás del proxy de la plataforma (Render), req.ip sería siempre la IP del proxy:
// TRUST_PROXY indica cuántos saltos de proxy creer para leer la IP real del visitante.
if (process.env.TRUST_PROXY) app.set("trust proxy", Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);
app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());
app.use(express.static(__dirname + "/public"));
app.use(attachUser);

//handlebars config
app.engine("handlebars", engine({ helpers }));
app.set("view engine", "handlebars");
app.set("views", __dirname + "/src/views");

//endpoints
// Chequeo de salud para la plataforma de deploy: liviano y sin datos internos.
app.get("/api/health", (_req, res) => {
  const ready = mongoose.connection.readyState === 1;
  res.status(ready ? 200 : 503).json({ status: ready ? "ok" : "unavailable" });
});
app.use("/api/sessions", sessionsRouter);
app.use("/api/products", productsRouter);
app.use("/api/carts", cartRouter);
app.use("/api/orders", ordersRouter);
app.use("/", viewsRouter);

app.use((req, res) => {
  if (req.originalUrl.startsWith("/api/")) {
    return res.status(404).json({ status: "error", message: "Ruta no encontrada" });
  }
  return res.status(404).render("error", { title: "No encontrado", code: 404, message: "La página que buscas no existe." });
});

export default app;

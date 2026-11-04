import express from "express";
import cookieParser from "cookie-parser";
import productsRouter from "./routes/products.route.js";
import cartRouter from "./routes/carts.route.js";
import sessionsRouter from "./routes/sessions.route.js";
import { engine } from "express-handlebars";
import viewsRouter from "./routes/views.route.js";
import { attachUser } from "./middlewares/auth.middleware.js";
import helpers from "./utils/handlebars.js";
import __dirname from "../dirname.js";

// La app solo arma las rutas: conectar la base y abrir el puerto queda en server.js,
// así los tests pueden importarla sin levantar nada.
const app = express();

app.disable("x-powered-by");
app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());
app.use(express.static(__dirname + "/public"));
app.use(attachUser);

//handlebars config
app.engine("handlebars", engine({ helpers }));
app.set("view engine", "handlebars");
app.set("views", __dirname + "/src/views");

//endpoints
app.use("/api/sessions", sessionsRouter);
app.use("/api/products", productsRouter);
app.use("/api/carts", cartRouter);
app.use("/", viewsRouter);

app.use((req, res) => {
  if (req.originalUrl.startsWith("/api/")) {
    return res.status(404).json({ status: "error", message: "Ruta no encontrada" });
  }
  return res.status(404).render("error", { title: "No encontrado", code: 404, message: "La página que buscas no existe." });
});

export default app;

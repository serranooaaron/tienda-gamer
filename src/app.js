import express from "express";
import cookieParser from "cookie-parser";
import productsRouter from "./routes/products.route.js";
import connectMongoDB from "./config/db.js";
import dotenv from "dotenv";
import cartRouter from "./routes/carts.route.js";
import sessionsRouter from "./routes/sessions.route.js";
import { engine } from "express-handlebars";
import viewsRouter from "./routes/views.route.js";
import { attachUser } from "./middlewares/auth.middleware.js";
import __dirname from "../dirname.js";

//inicializamos las variables de entorno
dotenv.config({ path: __dirname + "/.env", quiet: true });

if (!process.env.JWT_SECRET) {
  console.error("Falta JWT_SECRET en las variables de entorno");
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 8081;

app.disable("x-powered-by");
app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());
app.use(express.static(__dirname + "/public"));
app.use(attachUser);

//handlebars config
app.engine("handlebars", engine());
app.set("view engine", "handlebars");
app.set("views", __dirname + "/src/views");

//endpoints
app.use("/api/sessions", sessionsRouter);
app.use("/api/products", productsRouter);
app.use("/api/carts", cartRouter);
app.use("/", viewsRouter);

await connectMongoDB();

app.listen(PORT, () => {
  console.log(`🚀 Servidor iniciado en http://localhost:${PORT}`);
});

import express from "express";
import productsRouter from "./routes/products.route.js";
import connectMongoDB from "./config/db.js";
import dotenv from "dotenv";
import cartRouter from "./routes/carts.route.js";
import { engine } from "express-handlebars";
import viewsRouter from "./routes/views.route.js";
import __dirname from "../dirname.js";

//inicializamos las variables de entorno
dotenv.config({ path: __dirname + "/.env" });

const app = express();
const PORT = process.env.PORT || 8081;

app.use(express.json());
app.use(express.static(__dirname + "/public"));

connectMongoDB();

//handlebars config
app.engine("handlebars", engine());
app.set("view engine", "handlebars");
app.set("views", __dirname + "/src/views");

//endpoints
app.use("/api/products", productsRouter);
app.use("/api/carts", cartRouter);
app.use("/", viewsRouter);

app.listen(PORT, () => {
  console.log("🚀 Servidor iniciado correctamente!");
});
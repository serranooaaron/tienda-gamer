import dotenv from "dotenv";
import app from "./app.js";
import connectMongoDB from "./config/db.js";
import __dirname from "../dirname.js";

//inicializamos las variables de entorno
dotenv.config({ path: __dirname + "/.env", quiet: true });

if (!process.env.JWT_SECRET) {
  console.error("Falta JWT_SECRET en las variables de entorno");
  process.exit(1);
}

const PORT = process.env.PORT || 8081;

await connectMongoDB();

app.listen(PORT, () => {
  console.log(`🚀 Servidor iniciado en http://localhost:${PORT}`);
});

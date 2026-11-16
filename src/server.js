import mongoose from "mongoose";
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

const server = app.listen(PORT, () => {
  console.log(`🚀 Servidor iniciado en http://localhost:${PORT}`);
});

// Apagado ordenado: en cada redeploy la plataforma manda SIGTERM. Se dejan terminar los pedidos
// en curso y se cierra la conexión a la base antes de salir.
const shutdown = () => {
  server.close(async () => {
    await mongoose.disconnect();
    process.exit(0);
  });
  server.closeIdleConnections();
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

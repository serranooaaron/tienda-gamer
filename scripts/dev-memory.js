// Levanta la tienda con una base MongoDB en memoria: sirve para desarrollar y probar
// sin tocar la base real de Atlas. Los datos se borran al cerrar el proceso.
import crypto from "node:crypto";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { seedProducts, seedUser } from "../src/data/seeders.js";

// Cuentas de prueba: existen solo en la base en memoria, nunca en Atlas.
// La contraseña se genera en cada arranque y se muestra por consola.
const randomPassword = () => crypto.randomBytes(9).toString("base64url");

const DEV_ACCOUNTS = [
  { email: "admin@tienda.test", password: randomPassword(), role: "admin", first_name: "Admin", last_name: "Demo" },
  { email: "cliente@tienda.test", password: randomPassword(), role: "user", first_name: "Cliente", last_name: "Demo" }
];

const mongod = await MongoMemoryServer.create();
process.env.URI_MONGODB = mongod.getUri("tienda");
process.env.JWT_SECRET ||= crypto.randomBytes(32).toString("hex");

await mongoose.connect(process.env.URI_MONGODB);
await seedProducts();
for (const account of DEV_ACCOUNTS) await seedUser(account);
await mongoose.disconnect();

console.log("🧪 MongoDB en memoria listo. Cuentas de prueba:");
for (const { email, password, role } of DEV_ACCOUNTS) console.log(`   ${role.padEnd(5)}  ${email} / ${password}`);

await import("../src/server.js");

const shutdown = async () => {
  await mongoose.disconnect();
  await mongod.stop();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

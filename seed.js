import { existsSync } from "node:fs";
import dotenv from "dotenv";
import mongoose from "mongoose";
import __dirname from "./dirname.js";
import { seedProducts, seedUser } from "./src/data/seeders.js";
import { dbOptions } from "./src/config/dbOptions.js";

const envPath = `${__dirname}/.env`;
dotenv.config({ path: envPath, quiet: true });

if (!process.env.URI_MONGODB) {
  console.error(
    existsSync(envPath)
      ? `Falta URI_MONGODB en ${envPath}: agrega la línea URI_MONGODB=mongodb+srv://... con la cadena de Atlas.`
      : `No se encontró ${envPath}. Copia .env.example como .env (sin .txt al final) y completa URI_MONGODB.`
  );
  process.exit(1);
}

const seed = async () => {
  try {
    await mongoose.connect(process.env.URI_MONGODB, dbOptions());
    console.log(`Conectado a MongoDB (base ${mongoose.connection.name})`);

    const result = await seedProducts();
    console.log("Seed de productos ejecutado correctamente");
    console.log(`Insertados: ${result.upsertedCount}`);
    console.log(`Actualizados: ${result.modifiedCount}`);

    // El administrador solo se crea si se definen ADMIN_EMAIL y ADMIN_PASSWORD en el .env.
    const admin = await seedUser({
      email: process.env.ADMIN_EMAIL,
      password: process.env.ADMIN_PASSWORD,
      role: "admin",
      first_name: "Admin",
      last_name: "Tienda"
    });
    console.log(admin ? `Administrador listo: ${admin.email}` : "Sin ADMIN_EMAIL/ADMIN_PASSWORD: no se creo administrador");
  } catch (error) {
    console.error("Error al ejecutar el seed:", error.message);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close();
    console.log("Conexion cerrada");
  }
};

seed();

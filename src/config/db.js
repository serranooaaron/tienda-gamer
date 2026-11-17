import mongoose from "mongoose";
import { dbOptions } from "./dbOptions.js";

const connectMongoDB = async() => {
  try {
    await mongoose.connect(process.env.URI_MONGODB, dbOptions());
    console.log(`🟢 Conectado con MongoDB (base ${mongoose.connection.name})`);
  } catch (error) {
    console.log("Error al conectar con MongoDB", error.message);
    process.exit(1);
  }
};

export default connectMongoDB;
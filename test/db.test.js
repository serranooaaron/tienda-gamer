import { expect } from "chai";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { DEFAULT_DB_NAME, dbOptions } from "../src/config/dbOptions.js";

describe("Nombre de la base de datos", () => {
  let mongod;
  before(async () => { mongod = await MongoMemoryServer.create(); });
  after(async () => { await mongod.stop(); });
  afterEach(() => { delete process.env.DB_NAME; });

  // Así copia Atlas la cadena: sin nombre de base después del host.
  const connectWith = (uri) => mongoose.createConnection(uri, dbOptions()).asPromise();

  it("con una cadena sin nombre de base usa la de la app y no \"test\"", async () => {
    const connection = await connectWith(mongod.getUri());
    expect(connection.name).to.equal(DEFAULT_DB_NAME).and.to.equal("tienda-gamer");
    await connection.close();
  });

  it("DB_NAME permite elegir otra base", async () => {
    process.env.DB_NAME = "tienda-staging";
    const connection = await connectWith(mongod.getUri());
    expect(connection.name).to.equal("tienda-staging");
    await connection.close();
  });
});

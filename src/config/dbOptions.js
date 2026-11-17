// Nombre de la base de esta app. Atlas copia la cadena de conexión sin nombre de base y,
// en ese caso, MongoDB usa "test": dos apps en el mismo clúster terminarían compartiendo base.
// Con dbName fijo cada app usa siempre la suya, venga como venga la cadena.
export const DEFAULT_DB_NAME = "tienda-gamer";

export const dbOptions = () => ({ dbName: process.env.DB_NAME || DEFAULT_DB_NAME });

import mongoose from "mongoose";

// Tokens de sesiones cerradas. Un JWT sigue siendo válido hasta que vence aunque se borre
// la cookie; guardar su identificador (jti) al cerrar sesión hace que deje de servir enseguida.
const revokedTokenSchema = new mongoose.Schema({
  jti: { type: String, required: true, unique: true },
  // MongoDB borra el registro solo cuando el token ya habría vencido: la colección no crece.
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
});

const RevokedToken = mongoose.model("RevokedToken", revokedTokenSchema);

export default RevokedToken;

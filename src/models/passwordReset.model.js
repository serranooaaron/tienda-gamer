import mongoose from "mongoose";

// Pedidos de "olvidé mi contraseña". Se guarda el hash del token, nunca el token: aunque
// alguien leyera la base, no podría usar un link pendiente. MongoDB borra solo los vencidos.
const passwordResetSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  tokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true, expires: 0 }
}, { timestamps: true });

const PasswordReset = mongoose.model("PasswordReset", passwordResetSchema);

export default PasswordReset;

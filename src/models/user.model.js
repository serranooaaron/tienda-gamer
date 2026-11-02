import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  first_name: { type: String, required: true, trim: true, maxLength: 50 },
  last_name: { type: String, required: true, trim: true, maxLength: 50 },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  },
  // select: false evita que el hash viaje en cualquier consulta que no lo pida explicitamente.
  password: { type: String, required: true, select: false },
  role: { type: String, enum: ["user", "admin"], default: "user" },
  cart: { type: mongoose.Schema.Types.ObjectId, ref: "Cart" }
}, { timestamps: true });

const User = mongoose.model("User", userSchema);

export default User;

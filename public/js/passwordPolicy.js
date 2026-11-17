// Regla de contraseñas: la usan el servidor (al registrar) y el formulario (lista en vivo).
// Un solo archivo para que las dos validaciones no puedan quedar distintas.

export const PASSWORD_MIN_LENGTH = 10;
// bcrypt solo usa los primeros 72 bytes: lo que sigue se ignoraría sin avisar.
export const PASSWORD_MAX_BYTES = 72;

// Palabras que vuelven débil una contraseña aunque lleven números o símbolos ("P@ssw0rd2024!").
const WEAK_WORDS = [
  "password", "contrasena", "qwerty", "asdfgh", "zxcvbn", "letmein", "welcome", "bienvenido",
  "iloveyou", "teamo", "monkey", "dragon", "football", "futbol", "princess", "sunshine",
  "superman", "batman", "abcdef", "admin", "tienda", "gamer",
];
const SEQUENCES = ["012345", "123456", "234567", "345678", "456789", "987654", "876543", "765432", "654321", "543210"];

// Minúsculas, sin tildes y con los reemplazos típicos deshechos (0→o, 4→a, $→s...), solo letras.
const normalize = (text) =>
  String(text)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[0@4]/g, (c) => (c === "0" ? "o" : "a"))
    .replace(/[1!|]/g, "i")
    .replace(/3/g, "e")
    .replace(/[5$]/g, "s")
    .replace(/7/g, "t")
    .replace(/[^a-z]/g, "");

// Partes del nombre y del email (de 3 letras o más) que no deberían aparecer en la contraseña.
const personalParts = ({ email = "", first_name = "", last_name = "" } = {}) =>
  [String(email).split("@")[0], first_name, last_name]
    .flatMap((value) => String(value).split(/[^\p{L}\p{N}]+/u))
    .map(normalize)
    .filter((part) => part.length >= 3);

const byteLength = (text) => new TextEncoder().encode(text).length;

const isGuessable = (password, person) => {
  const plain = normalize(password);
  const lower = String(password).toLowerCase();
  return (
    WEAK_WORDS.some((word) => plain.includes(word)) ||
    SEQUENCES.some((sequence) => lower.includes(sequence)) ||
    /(.)\1{3,}/u.test(password) ||
    personalParts(person).some((part) => plain.includes(part))
  );
};

// Lista de requisitos con su estado. `person` (email y nombre) sirve para no aceptar
// contraseñas que los contengan.
export const passwordChecks = (password = "", person = {}) => {
  const value = String(password);
  return [
    { id: "length", label: `Al menos ${PASSWORD_MIN_LENGTH} caracteres`, ok: [...value].length >= PASSWORD_MIN_LENGTH },
    { id: "lower", label: "Una letra minúscula", ok: /\p{Ll}/u.test(value) },
    { id: "upper", label: "Una letra mayúscula", ok: /\p{Lu}/u.test(value) },
    { id: "digit", label: "Un número", ok: /\p{Nd}/u.test(value) },
    { id: "symbol", label: "Un símbolo (por ejemplo ! ? # $ % -)", ok: /[^\p{L}\p{N}\s]/u.test(value) },
    { id: "guess", label: "Que no sea común ni contenga tu nombre o email", ok: value.length > 0 && !isGuessable(value, person) },
  ];
};

// Mensaje para el usuario con lo que falta, o null si la contraseña cumple todo.
export const passwordProblem = (password, person) => {
  if (byteLength(String(password ?? "")) > PASSWORD_MAX_BYTES) {
    return `La contraseña puede tener hasta ${PASSWORD_MAX_BYTES} bytes (unos 70 caracteres sin tildes)`;
  }
  const missing = passwordChecks(password, person).filter((check) => !check.ok);
  if (!missing.length) return null;
  return `La contraseña necesita: ${missing.map((check) => check.label.charAt(0).toLowerCase() + check.label.slice(1)).join(", ")}`;
};

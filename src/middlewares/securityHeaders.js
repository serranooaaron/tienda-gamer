// Cabeceras de seguridad para todas las respuestas (equivalente a lo que haría Helmet, sin sumar una dependencia).
// La política de contenido solo permite lo que la app usa: sus propios scripts y estilos, y las fuentes de Google.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  // 'unsafe-inline' solo para estilos: las vistas usan atributos style con valores calculados.
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: https:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = (req, res, next) => {
  res.set({
    "Content-Security-Policy": CSP,
    // Los navegadores no adivinan el tipo de un archivo: una imagen subida nunca se ejecuta como script.
    "X-Content-Type-Options": "nosniff",
    // Para navegadores viejos que no entienden frame-ancestors (evita clickjacking).
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
    "Cross-Origin-Opener-Policy": "same-origin",
  });
  // HSTS solo en producción (HTTPS real). Sin preload: entrar a esa lista es casi irreversible.
  if (process.env.NODE_ENV === "production") {
    res.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
  }
  next();
};

export default securityHeaders;

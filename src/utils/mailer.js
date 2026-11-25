// Envío de emails con la API de Brevo (https://api.brevo.com/v3/smtp/email), con el fetch de
// Node y sin SDK. Necesita BREVO_API_KEY y MAIL_FROM (un remitente verificado en Brevo).
// Sin clave: en desarrollo el email se muestra en la consola; en producción no se envía nada
// y queda registrado el error. La clave nunca se escribe en los logs.
const API = "https://api.brevo.com/v3/smtp/email";
const TIMEOUT_MS = 10_000;

// Dirección pública del sitio para armar links. Sale de APP_URL y nunca del encabezado Host
// del pedido: si no, cualquiera podría hacer que el email apunte a otro sitio.
export const appUrl = () => {
  const configured = process.env.APP_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") return null;
  return `http://localhost:${process.env.PORT || 8081}`;
};

export const mailConfigured = () => Boolean(process.env.BREVO_API_KEY && process.env.MAIL_FROM);

const send = async ({ to, name, subject, text, html }) => {
  if (!mailConfigured()) {
    if (process.env.NODE_ENV === "production") throw new Error("Email no configurado (faltan BREVO_API_KEY o MAIL_FROM)");
    console.log(`\n[email de desarrollo] Para: ${to}\nAsunto: ${subject}\n${text}\n`);
    return { dev: true };
  }
  const response = await fetch(API, {
    method: "POST",
    headers: { "api-key": process.env.BREVO_API_KEY, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      sender: { email: process.env.MAIL_FROM, name: process.env.MAIL_FROM_NAME || "Tienda Gamer" },
      to: [{ email: to, ...(name ? { name } : {}) }],
      subject,
      textContent: text,
      htmlContent: html,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error(`Brevo respondió ${response.status}: ${detail.code ?? ""} ${detail.message ?? ""}`.trim());
  }
  return response.json().catch(() => ({}));
};

// En un objeto para que los tests puedan reemplazar el envío sin llamar a Brevo.
export const mailer = { send };

export const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

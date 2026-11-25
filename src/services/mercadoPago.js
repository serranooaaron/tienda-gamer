// Cliente mínimo de la API de Mercado Pago, con el fetch que ya trae Node (sin SDK).
// Solo lo que usa la tienda: crear la preferencia de Checkout Pro y consultar un pago.
// El Access Token sale de MP_ACCESS_TOKEN; nunca se escribe en el código ni en los logs.
import crypto from "node:crypto";

const API = "https://api.mercadopago.com";
const TIMEOUT_MS = 10_000;

export class PaymentError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const paymentsConfigured = () => Boolean(process.env.MP_ACCESS_TOKEN);

const call = async (path, { method = "GET", body } = {}) => {
  if (!paymentsConfigured()) throw new PaymentError(503, "Los pagos no están configurados en este momento");
  let response;
  try {
    response = await fetch(`${API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
        // Si un reintento repite el mismo pedido, Mercado Pago no lo procesa dos veces.
        ...(method === "POST" ? { "X-Idempotency-Key": crypto.randomUUID() } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new PaymentError(502, "No pudimos comunicarnos con Mercado Pago. Intenta de nuevo en unos minutos");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    // El detalle queda en el servidor; al cliente le llega un mensaje genérico.
    console.error(`Mercado Pago ${method} ${path.split("?")[0]} respondió ${response.status}: ${data.message ?? ""}`);
    throw new PaymentError(response.status === 404 ? 404 : 502, "Mercado Pago no pudo procesar el pedido");
  }
  return data;
};

// Las funciones van en un objeto para que los tests puedan reemplazarlas sin llamar a la API.
export const mercadoPago = {
  createPreference: (preference) => call("/checkout/preferences", { method: "POST", body: preference }),
  getPayment: (paymentId) => call(`/v1/payments/${encodeURIComponent(paymentId)}`),
};

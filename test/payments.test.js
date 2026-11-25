import { expect } from "chai";
import Order from "../src/models/order.model.js";
import { mercadoPago } from "../src/services/mercadoPago.js";
import { createProduct, loginAs, request } from "./helpers.js";

// Los tests nunca llaman a Mercado Pago: se reemplazan las dos funciones del cliente
// y se guarda qué recibieron.
const original = { ...mercadoPago };
let sentPreferences;
let payments;

const buyOne = async (agent, cartId, overrides = {}) => {
  const product = await createProduct({ price: 1500, stock: 3, ...overrides });
  await agent.post(`/api/carts/${cartId}/products/${product._id}`).send({ quantity: 2 }).expect(200);
  const { body } = await agent.post("/api/orders").expect(201);
  return { order: body.payload, product };
};

const approved = (order, overrides = {}) => ({
  id: 123456789,
  status: "approved",
  status_detail: "accredited",
  payment_method_id: "visa",
  external_reference: order._id,
  transaction_amount: order.total,
  ...overrides,
});

describe("Pago con Mercado Pago", () => {
  beforeEach(() => {
    process.env.MP_ACCESS_TOKEN = "token-de-tests";
    sentPreferences = [];
    payments = new Map();
    mercadoPago.createPreference = async (preference) => {
      sentPreferences.push(preference);
      return { id: "pref-1", init_point: "https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=pref-1" };
    };
    mercadoPago.getPayment = async (id) => {
      if (!payments.has(String(id))) throw Object.assign(new Error("no existe"), { status: 404 });
      return payments.get(String(id));
    };
  });

  afterEach(() => {
    Object.assign(mercadoPago, original);
    delete process.env.MP_ACCESS_TOKEN;
  });

  it("una compra nueva queda pendiente de pago", async () => {
    const { agent, cartId } = await loginAs();
    const { order } = await buyOne(agent, cartId);
    expect(order.status).to.equal("pendiente");
  });

  it("arma el pago con los productos y precios de la orden guardada", async () => {
    const { agent, cartId } = await loginAs();
    const { order, product } = await buyOne(agent, cartId);
    // Aunque el precio cambie después, se cobra lo que quedó en la orden.
    await product.updateOne({ price: 1 });

    const res = await agent.post(`/api/orders/${order._id}/pay`).send({ price: 1, total: 1 }).expect(201);

    expect(res.body.payload.url).to.match(/^https:\/\/www\.mercadopago\.com\.ar\//);
    const [preference] = sentPreferences;
    expect(preference.items).to.deep.equal([{ id: String(product._id), title: product.title, quantity: 2, unit_price: 1500, currency_id: "ARS" }]);
    expect(preference.external_reference).to.equal(order._id);
    expect(preference.back_urls.success).to.match(new RegExp(`/orders/${order._id}/pago$`));
    // En http (desarrollo) Mercado Pago no permite volver solo al sitio.
    expect(preference).to.not.have.property("auto_return");
    expect((await Order.findById(order._id).lean()).payment.preferenceId).to.equal("pref-1");
  });

  it("solo el dueño puede pagar su orden, y solo si está pendiente", async () => {
    const buyer = await loginAs();
    const other = await loginAs();
    const { order } = await buyOne(buyer.agent, buyer.cartId);

    await request.post(`/api/orders/${order._id}/pay`).expect(401);
    await other.agent.post(`/api/orders/${order._id}/pay`).expect(404);
    await buyer.agent.post("/api/orders/no-es-un-id/pay").expect(404);

    await Order.updateOne({ _id: order._id }, { status: "pagada" });
    const paid = await buyer.agent.post(`/api/orders/${order._id}/pay`).expect(409);
    expect(paid.body.message).to.include("no está pendiente");
    expect(sentPreferences).to.have.length(0);
  });

  it("sin credenciales de Mercado Pago avisa que los pagos no están disponibles", async () => {
    delete process.env.MP_ACCESS_TOKEN;
    Object.assign(mercadoPago, original);
    const { agent, cartId } = await loginAs();
    const { order } = await buyOne(agent, cartId);
    const res = await agent.post(`/api/orders/${order._id}/pay`).expect(503);
    expect(res.body.message).to.include("no están configurados");
    expect((await agent.get(`/orders/${order._id}`).expect(200)).text).to.not.include("data-pay-order");
  });

  it("al volver consulta el pago real: aprobado marca la orden como pagada", async () => {
    const { agent, cartId } = await loginAs();
    const { order } = await buyOne(agent, cartId);
    payments.set("123456789", approved(order));

    // La URL dice "rejected", pero manda lo que responde la API.
    const back = await agent.get(`/orders/${order._id}/pago?payment_id=123456789&status=rejected`).expect(303);
    expect(back.headers.location).to.equal(`/orders/${order._id}?pago=1`);

    const stored = await Order.findById(order._id).lean();
    expect(stored.status).to.equal("pagada");
    expect(stored.payment).to.include({ id: "123456789", status: "approved", statusDetail: "accredited", method: "visa" });

    const detail = await agent.get(back.headers.location).expect(200);
    expect(detail.text).to.include("Mercado Pago aprobó el pago");
    expect(detail.text).to.not.include("data-pay-order");
  });

  it("no acepta como pago lo que solo dice la URL", async () => {
    const { agent, cartId } = await loginAs();
    const { order } = await buyOne(agent, cartId);
    await agent.get(`/orders/${order._id}/pago?status=approved&external_reference=${order._id}`).expect(303);
    await agent.get(`/orders/${order._id}/pago?payment_id=abc&status=approved`).expect(303);
    expect((await Order.findById(order._id).lean()).status).to.equal("pendiente");
  });

  it("rechaza un pago de otra orden o por otro monto", async () => {
    const { agent, cartId } = await loginAs();
    const { order } = await buyOne(agent, cartId);
    payments.set("1", approved(order, { id: 1, external_reference: "000000000000000000000000" }));
    payments.set("2", approved(order, { id: 2, transaction_amount: 1 }));

    const otherOrder = await agent.get(`/orders/${order._id}/pago?payment_id=1`).expect(400);
    const otherAmount = await agent.get(`/orders/${order._id}/pago?payment_id=2`).expect(409);
    expect(otherOrder.text).to.include("no corresponde a esta compra");
    expect(otherAmount.text).to.include("no coincide");
    expect((await Order.findById(order._id).lean()).status).to.equal("pendiente");
  });

  it("un pago rechazado deja la orden pendiente para reintentar, y uno en proceso también", async () => {
    const { agent, cartId } = await loginAs();
    const { order } = await buyOne(agent, cartId);
    payments.set("7", approved(order, { id: 7, status: "rejected", status_detail: "cc_rejected_insufficient_amount" }));
    payments.set("8", approved(order, { id: 8, status: "in_process", status_detail: "pending_contingency" }));

    await agent.get(`/orders/${order._id}/pago?payment_id=7`).expect(303);
    const rejected = await agent.get(`/orders/${order._id}?pago=1`).expect(200);
    expect(rejected.text).to.include("Pago rechazado");
    expect(rejected.text).to.include("data-pay-order");

    await agent.get(`/orders/${order._id}/pago?payment_id=8`).expect(303);
    const inProcess = await agent.get(`/orders/${order._id}`).expect(200);
    expect(inProcess.text).to.include("Pago en proceso");
    expect((await Order.findById(order._id).lean()).status).to.equal("pendiente");
  });

  it("volver dos veces con el mismo pago no cambia nada la segunda vez", async () => {
    const { agent, cartId } = await loginAs();
    const { order } = await buyOne(agent, cartId);
    payments.set("123456789", approved(order));

    await Promise.all([
      agent.get(`/orders/${order._id}/pago?payment_id=123456789`).expect(303),
      agent.get(`/orders/${order._id}/pago?payment_id=123456789`).expect(303),
    ]);
    // Un aviso posterior de "rechazado" no puede deshacer una orden ya pagada.
    payments.set("123456789", approved(order, { status: "rejected" }));
    await agent.get(`/orders/${order._id}/pago?payment_id=123456789`).expect(303);

    const stored = await Order.findById(order._id).lean();
    expect(stored.status).to.equal("pagada");
    expect(stored.payment.status).to.equal("approved");
  });

  it("nadie puede confirmar el pago de una orden ajena", async () => {
    const buyer = await loginAs();
    const other = await loginAs();
    const { order } = await buyOne(buyer.agent, buyer.cartId);
    payments.set("123456789", approved(order));
    await other.agent.get(`/orders/${order._id}/pago?payment_id=123456789`).expect(404);
    await request.get(`/orders/${order._id}/pago?payment_id=123456789`).expect(302);
    expect((await Order.findById(order._id).lean()).status).to.equal("pendiente");
  });

  it("las compras hechas antes de los pagos se ven como demostración y no se pueden pagar", async () => {
    const { agent, user } = await loginAs();
    const product = await createProduct();
    const { insertedId } = await Order.collection.insertOne({
      code: "TG-VIEJA01",
      user: user._id,
      items: [{ product: product._id, title: product.title, price: 100, quantity: 1 }],
      total: 100,
      createdAt: new Date(),
    });
    const detail = await agent.get(`/orders/${insertedId}`).expect(200);
    expect(detail.text).to.include("Demostración");
    expect(detail.text).to.not.include("data-pay-order");
    await agent.post(`/api/orders/${insertedId}/pay`).expect(409);
  });
});

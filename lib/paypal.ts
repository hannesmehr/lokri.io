import {
  CheckoutPaymentIntent,
  Client,
  Environment,
  LogLevel,
  OrdersController,
} from "@paypal/paypal-server-sdk";

/**
 * PayPal client singleton + plan-upgrade helpers.
 *
 * We do one-time captures (no subscriptions) keyed to a `(plan_id, period)`
 * pair. The `customId` of each order embeds `orderId|accountId|userId|period|planId`
 * so the capture route can verify authenticity and reconstruct the full
 * business context without a separate state lookup.
 */

let cached: Client | null = null;

function getClient(): Client {
  if (!cached) {
    const clientId = process.env.PAYPAL_CLIENT_ID;
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error(
        "PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET are required for PayPal calls.",
      );
    }
    cached = new Client({
      clientCredentialsAuthCredentials: {
        oAuthClientId: clientId,
        oAuthClientSecret: clientSecret,
      },
      environment:
        process.env.PAYPAL_MODE === "live"
          ? Environment.Production
          : Environment.Sandbox,
      logging: {
        logLevel: LogLevel.Warn,
        logRequest: { logBody: false },
        logResponse: { logBody: false },
      },
    });
  }
  return cached;
}

export interface CreateOrderInput {
  /** Our internal order UUID — persisted with status "created". */
  orderId: string;
  ownerAccountId: string;
  userId: string;
  planId: string;
  planName: string;
  period: "monthly" | "yearly";
  amountCents: number;
  returnUrl: string;
  cancelUrl: string;
}

export interface CreateOrderResult {
  paypalOrderId: string;
  status: string | undefined;
  approveUrl: string | null;
}

export async function createPayPalOrder(
  input: CreateOrderInput,
): Promise<CreateOrderResult> {
  const client = getClient();
  const controller = new OrdersController(client);

  const amount = (input.amountCents / 100).toFixed(2);
  const description = `lokri.io ${input.planName} — ${input.period === "yearly" ? "Jahresabo" : "Monatsabo"}`;
  // The customId is a pipe-delimited compact context. We verify accountId +
  // userId on capture; planId + period drive the plan upgrade.
  const customId = [
    input.orderId,
    input.ownerAccountId,
    input.userId,
    input.period,
    input.planId,
  ].join("|");

  const body = {
    intent: CheckoutPaymentIntent.Capture,
    purchaseUnits: [
      {
        amount: { currencyCode: "EUR", value: amount },
        description,
        customId,
      },
    ],
  };
  // applicationContext is accepted by the PayPal API even though it's not
  // in the SDK's TypeDef — we cast via `as Record<string, unknown>` to
  // append it without loosening the rest of the body.
  (body as unknown as Record<string, unknown>).applicationContext = {
    returnUrl: input.returnUrl,
    cancelUrl: input.cancelUrl,
    brandName: "lokri.io",
    userAction: "PAY_NOW",
    shippingPreference: "NO_SHIPPING",
  };

  const response = await controller.createOrder({ body });
  const approve = response.result.links?.find(
    (l: { rel?: string; href?: string }) =>
      l.rel === "payer-action" || l.rel === "approve",
  );

  return {
    paypalOrderId: response.result.id ?? "",
    status: response.result.status,
    approveUrl: approve?.href ?? null,
  };
}

export interface CapturedOrder {
  status: string | undefined;
  /** Fields reconstructed from customId — `null` if missing (partial PayPal response). */
  orderId: string | null;
  ownerAccountId: string | null;
  userId: string | null;
  period: "monthly" | "yearly" | null;
  planId: string | null;
  amountCents: number;
  /** PayPal Capture ID — our idempotency key + payment reference. */
  paymentId: string;
  payerEmail: string | null;
}

export async function capturePayPalOrder(
  paypalOrderId: string,
): Promise<CapturedOrder> {
  const client = getClient();
  const controller = new OrdersController(client);
  const response = await controller.captureOrder({ id: paypalOrderId });

  const result = response.result;
  const unit = result.purchaseUnits?.[0];
  const cap = unit?.payments?.captures?.[0];
  const raw = unit?.customId ?? "";
  const [orderId, ownerAccountId, userId, periodStr, planId] = raw.split("|");
  const period =
    periodStr === "monthly" || periodStr === "yearly" ? periodStr : null;

  const amount = Number(cap?.amount?.value ?? 0);
  return {
    status: result.status,
    orderId: orderId || null,
    ownerAccountId: ownerAccountId || null,
    userId: userId || null,
    period,
    planId: planId || null,
    amountCents: Math.round(amount * 100),
    paymentId: cap?.id ?? paypalOrderId,
    payerEmail: result.payer?.emailAddress ?? null,
  };
}

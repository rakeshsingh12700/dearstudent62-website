const PAYPAL_API_BASE = String(process.env.PAYPAL_API_BASE || "").trim();
const PAYPAL_CLIENT_ID = String(
  process.env.PAYPAL_CLIENT_ID || process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID || ""
).trim();
const PAYPAL_CLIENT_SECRET = String(process.env.PAYPAL_CLIENT_SECRET || "").trim();

export function getPayPalBaseUrl() {
  if (PAYPAL_API_BASE) return PAYPAL_API_BASE;
  const mode = String(process.env.PAYPAL_ENV || "").trim().toLowerCase();
  return mode === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}

export function getPayPalClientId() {
  return PAYPAL_CLIENT_ID;
}

export function assertPayPalConfig() {
  if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
    throw new Error(
      "PayPal credentials are missing. Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET."
    );
  }
}

function formatPayPalApiError(payload, fallbackMessage) {
  const detail = Array.isArray(payload?.details) && payload.details.length > 0
    ? payload.details[0]
    : null;
  const description = String(detail?.description || "").trim();
  const issue = String(detail?.issue || "").trim();
  const debugId = String(payload?.debug_id || "").trim();
  const base = String(
    description
    || payload?.message
    || payload?.error_description
    || payload?.error
    || fallbackMessage
  ).trim();
  const issueSuffix = issue ? ` (issue: ${issue})` : "";
  const debugSuffix = debugId ? ` [debug_id: ${debugId}]` : "";
  return `${base}${issueSuffix}${debugSuffix}`;
}

async function getAccessToken() {
  assertPayPalConfig();
  const basicAuth = Buffer.from(`${PAYPAL_CLIENT_ID}:${PAYPAL_CLIENT_SECRET}`).toString("base64");
  const response = await fetch(`${getPayPalBaseUrl()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.access_token) {
    throw new Error(formatPayPalApiError(payload, "Failed to get PayPal access token"));
  }
  return String(payload.access_token);
}

export async function createPayPalOrder({ amount, currency, returnUrl, cancelUrl }) {
  const value = Number(amount || 0);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("Invalid amount for PayPal order.");
  }

  const accessToken = await getAccessToken();
  const response = await fetch(`${getPayPalBaseUrl()}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          amount: {
            currency_code: String(currency || "USD").trim().toUpperCase(),
            value: value.toFixed(2),
          },
        },
      ],
      application_context: {
        shipping_preference: "NO_SHIPPING",
        user_action: "PAY_NOW",
        return_url: returnUrl,
        cancel_url: cancelUrl,
      },
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.id) {
    throw new Error(formatPayPalApiError(payload, "Failed to create PayPal order"));
  }

  const approvalLink = Array.isArray(payload?.links)
    ? payload.links.find((item) => item?.rel === "approve")?.href
    : "";

  return {
    id: String(payload.id),
    approvalUrl: String(approvalLink || ""),
  };
}

export async function capturePayPalOrder(orderId) {
  const normalizedOrderId = String(orderId || "").trim();
  if (!normalizedOrderId) {
    throw new Error("PayPal orderId is required.");
  }

  const accessToken = await getAccessToken();
  const response = await fetch(
    `${getPayPalBaseUrl()}/v2/checkout/orders/${encodeURIComponent(normalizedOrderId)}/capture`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
    }
  );

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(formatPayPalApiError(payload, "Failed to capture PayPal order"));
  }

  const status = String(payload?.status || "").toUpperCase();
  if (status !== "COMPLETED") {
    throw new Error(`PayPal capture not completed (status: ${status || "unknown"})`);
  }

  const captureId = String(
    payload?.purchase_units?.[0]?.payments?.captures?.[0]?.id
    || payload?.id
    || normalizedOrderId
  ).trim();

  return {
    orderId: normalizedOrderId,
    captureId,
    status,
  };
}

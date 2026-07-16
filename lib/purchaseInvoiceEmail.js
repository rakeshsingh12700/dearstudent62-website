const INTERNAL_INVOICE_EMAIL = "dearstudent62.payments@gmail.com";

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatAmount(value, currency) {
  const amount = Number(value || 0);
  const code = String(currency || "INR").trim().toUpperCase() || "INR";
  if (!Number.isFinite(amount)) return `${code} 0`;

  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: code,
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${code} ${amount}`;
  }
}

function formatDateTime(value) {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return "N/A";

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(date);
}

function getBaseUrl() {
  const configured = String(process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "").trim();
  if (configured) return configured.replace(/\/+$/, "");
  return "https://dearstudent.in";
}

function getSenderEmail() {
  return (
    String(process.env.INVOICE_EMAIL_FROM || process.env.RESEND_FROM_EMAIL || "").trim() ||
    "Dear Student <onboarding@resend.dev>"
  );
}

function normalizeInvoiceItems(items = []) {
  return (Array.isArray(items) ? items : [])
    .map((item) => {
      const quantity = Math.max(1, Number(item?.quantity || 1));
      const price = Number(item?.price || 0);
      return {
        productId: String(item?.productId || "").trim(),
        title: String(item?.title || item?.productId || "Worksheet").trim(),
        quantity,
        price: Number.isFinite(price) ? price : 0,
      };
    })
    .filter((item) => item.productId || item.title);
}

export async function sendPurchaseInvoiceEmail({
  email,
  paymentId,
  orderId,
  orderAmount,
  orderCurrency,
  purchasedAt,
  items,
}) {
  const apiKey = String(process.env.RESEND_API_KEY || "").trim();
  if (!apiKey) {
    return { ok: false, skipped: true, reason: "RESEND_API_KEY is not configured" };
  }

  const buyerEmail = String(email || "").trim().toLowerCase();
  if (!buyerEmail) {
    return { ok: false, skipped: true, reason: "Buyer email is missing" };
  }

  const currency = String(orderCurrency || "INR").trim().toUpperCase() || "INR";
  const invoiceItems = normalizeInvoiceItems(items);
  const subtotal = invoiceItems.reduce(
    (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 1),
    0
  );
  const trustedTotal = Number(orderAmount || 0);
  const total = Number.isFinite(trustedTotal) && trustedTotal >= 0 ? trustedTotal : subtotal;
  const baseUrl = getBaseUrl();
  const invoiceUrl = `${baseUrl}/api/invoice?paymentId=${encodeURIComponent(paymentId)}&email=${encodeURIComponent(buyerEmail)}`;
  const purchasesUrl = `${baseUrl}/my-purchases`;
  const invoiceNumber = `INV-${String(paymentId || orderId || "").slice(-8).toUpperCase()}`;
  const itemRows = invoiceItems
    .map(
      (item, index) => `
        <tr>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${index + 1}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;">${escapeHtml(item.title)}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:center;">${item.quantity}</td>
          <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right;">${escapeHtml(formatAmount(item.price * item.quantity, currency))}</td>
        </tr>`
    )
    .join("");
  const textItems = invoiceItems
    .map((item, index) => `${index + 1}. ${item.title} x${item.quantity} - ${formatAmount(item.price * item.quantity, currency)}`)
    .join("\n");

  const subject = `Dear Student invoice ${invoiceNumber}`;
  const html = `
    <div style="font-family:Arial,sans-serif;color:#111827;line-height:1.5;">
      <h2 style="margin:0 0 12px;">Your Dear Student worksheets are ready</h2>
      <p>Thank you for your purchase. Your itemized invoice and worksheet access details are below.</p>
      <p>
        <strong>Invoice:</strong> ${escapeHtml(invoiceNumber)}<br />
        <strong>Payment ID:</strong> ${escapeHtml(paymentId)}<br />
        <strong>Order ID:</strong> ${escapeHtml(orderId)}<br />
        <strong>Purchased on:</strong> ${escapeHtml(formatDateTime(purchasedAt))}
      </p>
      <table style="border-collapse:collapse;width:100%;max-width:720px;margin:16px 0;">
        <thead>
          <tr>
            <th style="padding:8px;border-bottom:2px solid #d1d5db;text-align:left;">#</th>
            <th style="padding:8px;border-bottom:2px solid #d1d5db;text-align:left;">Item</th>
            <th style="padding:8px;border-bottom:2px solid #d1d5db;text-align:center;">Qty</th>
            <th style="padding:8px;border-bottom:2px solid #d1d5db;text-align:right;">Amount</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>
      <p><strong>Total paid:</strong> ${escapeHtml(formatAmount(total, currency))}</p>
      <p>
        <a href="${escapeHtml(purchasesUrl)}" style="display:inline-block;background:#7c2d12;color:#fff;text-decoration:none;padding:10px 14px;border-radius:6px;">Open My Purchases</a>
        <a href="${escapeHtml(invoiceUrl)}" style="display:inline-block;margin-left:8px;color:#7c2d12;">Download invoice PDF</a>
      </p>
      <p style="color:#6b7280;font-size:13px;">If you checked out as a guest, sign up or log in with this same email to see these downloads in My Purchases.</p>
    </div>`;
  const text = [
    "Your Dear Student worksheets are ready.",
    "",
    `Invoice: ${invoiceNumber}`,
    `Payment ID: ${paymentId}`,
    `Order ID: ${orderId}`,
    `Purchased on: ${formatDateTime(purchasedAt)}`,
    "",
    "Items:",
    textItems,
    "",
    `Total paid: ${formatAmount(total, currency)}`,
    `My Purchases: ${purchasesUrl}`,
    `Invoice PDF: ${invoiceUrl}`,
  ].join("\n");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: getSenderEmail(),
      to: [buyerEmail],
      bcc: [INTERNAL_INVOICE_EMAIL],
      subject,
      html,
      text,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      ok: false,
      error: String(payload?.message || payload?.error || "Invoice email failed"),
    };
  }

  return { ok: true, id: String(payload?.id || "") };
}

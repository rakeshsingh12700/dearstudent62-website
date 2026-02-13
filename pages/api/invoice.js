import { collection, getDocs, query, where } from "firebase/firestore";

import { db } from "../../firebase/config";
import products from "../../data/products";

function formatDateTime(value) {
  if (!value) return "N/A";
  const date =
    typeof value?.toDate === "function" ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";

  const datePart = date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const timePart = date.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  return `${datePart}, ${timePart}`;
}

function escapePdfText(text) {
  return String(text || "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function buildPdfBuffer(lines) {
  const contentStream = [
    "BT",
    "/F1 11 Tf",
    "50 790 Td",
    ...lines.map((line, index) =>
      index === 0 ? `(${escapePdfText(line)}) Tj` : `0 -16 Td (${escapePdfText(line)}) Tj`
    ),
    "ET",
  ].join("\n");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(contentStream, "utf8")} >>\nstream\n${contentStream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, "utf8"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefStart = Buffer.byteLength(pdf, "utf8");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return Buffer.from(pdf, "utf8");
}

export default async function handler(req, res) {
  const paymentId = String(req.query.paymentId || "").trim();
  const email = String(req.query.email || "").trim().toLowerCase();

  if (!paymentId) {
    return res.status(400).json({ error: "Payment ID required" });
  }

  if (!email) {
    return res.status(400).json({ error: "Email required" });
  }

  const orderQuery = query(
    collection(db, "purchases"),
    where("paymentId", "==", paymentId)
  );
  const orderSnapshot = await getDocs(orderQuery);

  if (orderSnapshot.empty) {
    return res.status(404).json({ error: "Order not found" });
  }

  const orderItems = orderSnapshot.docs.map((document) => ({
    id: document.id,
    ...document.data(),
  }));
  const hasDetailedRows = orderItems.some(
    (item) => item.paymentId && item.id !== item.paymentId
  );
  const normalizedOrderItems = hasDetailedRows
    ? orderItems.filter((item) => !item.paymentId || item.id !== item.paymentId)
    : orderItems;
  const ownsOrder = orderItems.some(
    (item) => String(item.email || "").trim().toLowerCase() === email
  );

  if (!ownsOrder) {
    return res.status(403).json({ error: "Unauthorized invoice request" });
  }

  const mergedByProduct = new Map();
  normalizedOrderItems.forEach((item) => {
    const productId = String(item.productId || "").trim();
    const quantity =
      Number.isFinite(Number(item.quantity)) && Number(item.quantity) > 0
        ? Number(item.quantity)
        : 1;
    const existing = mergedByProduct.get(productId) || 0;
    mergedByProduct.set(productId, existing + quantity);
  });

  const lineItems = Array.from(mergedByProduct.entries()).map(
    ([productId, quantity]) => {
      const product = products.find((item) => item.id === productId);
      const amount = Number(product?.price || 0);
      return {
        productId,
        title: product?.title || productId || "Worksheet",
        quantity,
        amount,
        lineTotal: amount * quantity,
      };
    }
  );

  const subtotal = lineItems.reduce((sum, item) => sum + item.lineTotal, 0);
  const tax = 0;
  const total = subtotal + tax;
  const invoiceNumber = `INV-${paymentId.slice(-8).toUpperCase()}`;
  const firstItem = normalizedOrderItems[0];
  const invoiceDate = firstItem?.purchasedAt;
  const invoiceLines = [
    "Dear Student Learning Hub - Invoice",
    "",
    `Invoice Number: ${invoiceNumber}`,
    `Order ID: ${paymentId}`,
    `Order Date & Time: ${formatDateTime(invoiceDate)}`,
    "",
    `Bill To: ${email}`,
    "",
    "Items:",
    ...lineItems.map(
      (item, index) =>
        `${index + 1}. ${item.title} (x${item.quantity}) - INR ${item.lineTotal}`
    ),
    "",
    `Subtotal: INR ${subtotal}`,
    `Tax: INR ${tax}`,
    `Total: INR ${total}`,
    "",
    "Payment Status: Paid",
    `Payment Reference: ${paymentId}`,
  ];
  const invoicePdf = buildPdfBuffer(invoiceLines);

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="invoice-${paymentId}.pdf"`
  );
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Length", String(invoicePdf.length));
  return res.status(200).send(invoicePdf);
}

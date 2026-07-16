import { collection, doc, getDoc, getDocs, limit, query, where } from "firebase/firestore";

import { db } from "../../firebase/config";
import { getAdminDb } from "../../lib/firebaseAdmin";
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

function normalizeOrderItems(orderItems = []) {
  const hasDetailedRows = orderItems.some(
    (item) => item.paymentId && item.id !== item.paymentId
  );
  return hasDetailedRows
    ? orderItems.filter((item) => !item.paymentId || item.id !== item.paymentId)
    : orderItems;
}

async function getOrderItems(paymentId) {
  const adminDb = getAdminDb();
  if (adminDb) {
    const snapshot = await adminDb
      .collection("purchases")
      .where("paymentId", "==", paymentId)
      .limit(100)
      .get();
    return snapshot.docs.map((document) => ({
      id: document.id,
      ...document.data(),
    }));
  }

  const orderQuery = query(
    collection(db, "purchases"),
    where("paymentId", "==", paymentId),
    limit(100)
  );
  const orderSnapshot = await getDocs(orderQuery);
  return orderSnapshot.docs.map((document) => ({
    id: document.id,
    ...document.data(),
  }));
}

async function getRuntimeProducts(productIds = []) {
  const normalizedIds = Array.from(
    new Set(
      (Array.isArray(productIds) ? productIds : [])
        .map((id) => String(id || "").trim())
        .filter(Boolean)
    )
  );
  if (normalizedIds.length === 0) return [];

  const adminDb = getAdminDb();
  if (adminDb) {
    const docs = await Promise.all(
      normalizedIds.map(async (productId) => {
        try {
          const snapshot = await adminDb.collection("products").doc(productId).get();
          return snapshot.exists ? { id: snapshot.id, ...snapshot.data() } : null;
        } catch {
          return null;
        }
      })
    );
    return docs.filter(Boolean);
  }

  const docs = await Promise.all(
    normalizedIds.map(async (productId) => {
      try {
        const snapshot = await getDoc(doc(db, "products", productId));
        return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
      } catch {
        return null;
      }
    })
  );
  return docs.filter(Boolean);
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const paymentId = String(req.query.paymentId || "").trim();
  const email = String(req.query.email || "").trim().toLowerCase();

  if (!paymentId) {
    return res.status(400).json({ error: "Payment ID required" });
  }

  if (!email) {
    return res.status(400).json({ error: "Email required" });
  }

  try {
    const orderItems = await getOrderItems(paymentId);

    if (orderItems.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }

    const normalizedOrderItems = normalizeOrderItems(orderItems);
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

    const productIds = Array.from(mergedByProduct.keys()).filter(Boolean);
    const runtimeProducts = await getRuntimeProducts(productIds);
    const runtimeById = new Map(
      runtimeProducts.filter(Boolean).map((item) => [String(item.id || "").trim(), item])
    );

    const lineItems = Array.from(mergedByProduct.entries()).map(
      ([productId, quantity]) => {
        const runtimeProduct = runtimeById.get(productId);
        const staticProduct = products.find((item) => item.id === productId);
        const product = runtimeProduct
          ? {
              ...staticProduct,
              ...runtimeProduct,
            }
          : staticProduct;
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

    const invoiceNumber = `INV-${paymentId.slice(-8).toUpperCase()}`;
    const firstItem = normalizedOrderItems[0];
    const invoiceDate = firstItem?.purchasedAt;
    const subtotal = lineItems.reduce((sum, item) => sum + item.lineTotal, 0);
    const tax = 0;
    const storedOrderAmount = Number(firstItem?.orderAmount);
    const total =
      Number.isFinite(storedOrderAmount) && storedOrderAmount >= 0
        ? storedOrderAmount
        : subtotal + tax;
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
  } catch (error) {
    console.error("Invoice generation failed:", error);
    return res.status(500).json({ error: "Failed to generate invoice" });
  }
}

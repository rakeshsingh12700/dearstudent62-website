import { collection, doc, getDoc, getDocs, limit, query, where } from "firebase/firestore";

import { db } from "../../firebase/config";
import { getAdminDb } from "../../lib/firebaseAdmin";
import products from "../../data/products";

function normalizeOrderItems(orderItems = []) {
  const hasDetailedRows = orderItems.some(
    (item) => item.paymentId && item.id !== item.paymentId
  );
  return hasDetailedRows
    ? orderItems.filter((item) => !item.paymentId || item.id !== item.paymentId)
    : orderItems;
}

async function getRuntimeProducts(productIds = []) {
  const normalizedIds = Array.from(
    new Set((Array.isArray(productIds) ? productIds : []).map((id) => String(id || "").trim()).filter(Boolean))
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
    const adminDb = getAdminDb();
    let orderItems = [];

    if (adminDb) {
      const snapshot = await adminDb
        .collection("purchases")
        .where("paymentId", "==", paymentId)
        .limit(50)
        .get();
      orderItems = snapshot.docs.map((document) => ({
        id: document.id,
        ...document.data(),
      }));
    } else {
      const orderQuery = query(
        collection(db, "purchases"),
        where("paymentId", "==", paymentId),
        limit(50)
      );
      const snapshot = await getDocs(orderQuery);
      orderItems = snapshot.docs.map((document) => ({
        id: document.id,
        ...document.data(),
      }));
    }

    if (orderItems.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }

    const ownsOrder = orderItems.some(
      (item) => String(item.email || "").trim().toLowerCase() === email
    );
    if (!ownsOrder) {
      return res.status(403).json({ error: "Unauthorized order request" });
    }

    const normalizedOrderItems = normalizeOrderItems(orderItems);
    const productIds = Array.from(
      new Set(normalizedOrderItems.map((item) => String(item.productId || "").trim()).filter(Boolean))
    );
    const runtimeProducts = await getRuntimeProducts(productIds);
    const runtimeById = new Map(runtimeProducts.map((item) => [String(item.id || "").trim(), item]));

    const items = normalizedOrderItems
      .map((item) => {
        const productId = String(item.productId || "").trim();
        const product = runtimeById.get(productId) || products.find((entry) => entry.id === productId);
        if (!product) return null;
        return {
          id: productId,
          title: String(product.title || "Worksheet"),
          subject: String(product.subject || "").trim(),
          pages: Number(product.pages || 0),
          storageKey: String(product.storageKey || "").trim(),
        };
      })
      .filter(Boolean);

    return res.status(200).json({ items });
  } catch (error) {
    console.error("Order summary lookup failed:", error);
    return res.status(500).json({ error: "Failed to load order summary" });
  }
}

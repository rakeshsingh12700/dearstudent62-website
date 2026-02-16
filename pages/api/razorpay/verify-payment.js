import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../../../firebase/config";
import { saveToken } from "../../../lib/tokenStore";
import { DEFAULT_PRODUCT_ID, PRODUCT_CATALOG } from "../../../lib/productCatalog";

async function getProductById(productId) {
  const normalized = String(productId || "").trim();
  if (!normalized) return null;

  try {
    const productRef = doc(db, "products", normalized);
    const snapshot = await getDoc(productRef);
    if (snapshot.exists()) {
      const data = snapshot.data() || {};
      return {
        id: snapshot.id,
        storageKey: String(data.storageKey || "").trim(),
        file: String(data.storageKey || "").trim(),
      };
    }
  } catch {
    // Continue with static fallback.
  }

  return PRODUCT_CATALOG[normalized] || null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).end();
  }

  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    email,
    userId,
    items,
  } = req.body;

  const normalizedEmail = String(email || "").trim().toLowerCase();

  if (!normalizedEmail) {
    return res.status(400).json({ success: false, error: "Email is required" });
  }

  const expectedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");

  if (expectedSignature === razorpay_signature) {
    const token = uuidv4();
    const now = new Date();
    const normalizedUserId =
      typeof userId === "string" && userId ? userId : null;

    const requestedItems = (Array.isArray(items) ? items : [])
      .map((item) => ({
        productId: String(item?.productId || "").trim(),
        quantity: Number(item?.quantity || 0),
      }))
      .filter(
        (item) =>
          item.productId &&
          Number.isFinite(item.quantity) &&
          item.quantity > 0
      );

    const productEntries = await Promise.all(
      requestedItems.map(async (item) => {
        const product = await getProductById(item.productId);
        return product ? { ...item, product } : null;
      })
    );

    const normalizedItems = productEntries.filter(Boolean);

    const aggregatedItems = normalizedItems.reduce((acc, item) => {
      const existing = acc[item.productId] || 0;
      acc[item.productId] = existing + item.quantity;
      return acc;
    }, {});

    const productIds = Object.keys(aggregatedItems);
    const purchaseProductIds =
      productIds.length > 0 ? productIds : [DEFAULT_PRODUCT_ID];
    const primaryProductId = purchaseProductIds[0];
    const primaryProduct =
      normalizedItems.find((item) => item.productId === primaryProductId)?.product ||
      PRODUCT_CATALOG[primaryProductId];
    const purchasedStorageKeys = purchaseProductIds
      .map((productId) => {
        const runtime = normalizedItems.find((item) => item.productId === productId)?.product;
        return String(runtime?.storageKey || PRODUCT_CATALOG[productId]?.storageKey || "");
      })
      .filter(Boolean);

    const tokenFiles =
      purchasedStorageKeys.length > 0
        ? purchasedStorageKeys
        : [String(primaryProduct?.file || primaryProduct?.storageKey || "").trim()].filter(Boolean);
    if (tokenFiles.length === 0) {
      return res.status(400).json({ success: false, error: "No downloadable files found for items" });
    }

    saveToken(token, tokenFiles);

    await Promise.all(
      purchaseProductIds.map((productId) =>
        setDoc(doc(db, "purchases", `${razorpay_payment_id}_${productId}`), {
          email: normalizedEmail,
          userId: normalizedUserId,
          productId,
          quantity: aggregatedItems[productId] || 1,
          paymentId: razorpay_payment_id,
          purchasedAt: now,
        })
      )
    );

    return res.status(200).json({
      success: true,
      token,
      paymentId: razorpay_payment_id,
      primaryProductId,
      productIds: purchaseProductIds,
    });
  } else {
    return res.status(400).json({ success: false });
  }
}

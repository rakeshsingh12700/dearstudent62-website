import { v4 as uuidv4 } from "uuid";
import { FieldValue } from "firebase-admin/firestore";
import { doc, getDoc, increment, setDoc, updateDoc } from "firebase/firestore";
import { db } from "../firebase/config";
import { getAdminDb } from "./firebaseAdmin";
import { saveToken } from "./tokenStore";
import { DEFAULT_PRODUCT_ID, PRODUCT_CATALOG } from "./productCatalog";
import { consumeCouponUsage } from "./coupons/server";
import { normalizeCheckoutItems } from "./checkoutPricing";
import { sendPurchaseInvoiceEmail } from "./purchaseInvoiceEmail";

async function getProductById(productId) {
  const normalized = String(productId || "").trim();
  if (!normalized) return null;

  const adminDb = getAdminDb();
  if (adminDb) {
    try {
      const snapshot = await adminDb.collection("products").doc(normalized).get();
      if (snapshot.exists) {
        const data = snapshot.data() || {};
        return {
          id: snapshot.id,
          title: String(data.title || "").trim(),
          price: Number(data.price || 0),
          storageKey: String(data.storageKey || "").trim(),
          file: String(data.storageKey || "").trim(),
        };
      }
    } catch {
      // Continue with client SDK fallback.
    }
  }

  try {
    const productRef = doc(db, "products", normalized);
    const snapshot = await getDoc(productRef);
    if (snapshot.exists()) {
      const data = snapshot.data() || {};
      return {
        id: snapshot.id,
        title: String(data.title || "").trim(),
        price: Number(data.price || 0),
        storageKey: String(data.storageKey || "").trim(),
        file: String(data.storageKey || "").trim(),
      };
    }
  } catch {
    // Continue with static fallback.
  }

  return PRODUCT_CATALOG[normalized] || null;
}

async function sendInvoiceEmailOnce({
  email,
  paymentId,
  orderId,
  orderAmount,
  orderCurrency,
  purchasedAt,
  items,
}) {
  const adminDb = getAdminDb();
  const normalizedPaymentId = String(paymentId || "").trim();
  if (!adminDb || !normalizedPaymentId) {
    return sendPurchaseInvoiceEmail({
      email,
      paymentId,
      orderId,
      orderAmount,
      orderCurrency,
      purchasedAt,
      items,
    });
  }

  const logRef = adminDb.collection("purchase_invoice_emails").doc(normalizedPaymentId);
  try {
    await logRef.create({
      paymentId: normalizedPaymentId,
      orderId: String(orderId || normalizedPaymentId).trim(),
      email: String(email || "").trim().toLowerCase(),
      status: "sending",
      createdAt: new Date().toISOString(),
    });
  } catch {
    return { ok: false, skipped: true, reason: "Invoice email already attempted" };
  }

  const result = await sendPurchaseInvoiceEmail({
    email,
    paymentId: normalizedPaymentId,
    orderId,
    orderAmount,
    orderCurrency,
    purchasedAt,
    items,
  });

  await logRef.set(
    {
      status: result.ok ? "sent" : result.skipped ? "skipped" : "failed",
      providerId: result.id || null,
      error: result.error || result.reason || null,
      updatedAt: new Date().toISOString(),
    },
    { merge: true }
  );

  return result;
}

export async function fulfillPurchaseOrder({
  email,
  userId,
  items,
  orderCurrency,
  orderAmount,
  appliedCoupon,
  paymentId,
  orderId,
  paymentMethod = "razorpay",
}) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) {
    return { ok: false, error: "Email is required" };
  }

  const normalizedPaymentId = String(paymentId || "").trim();
  if (!normalizedPaymentId) {
    return { ok: false, error: "paymentId is required" };
  }

  const normalizedOrderId = String(orderId || normalizedPaymentId).trim() || normalizedPaymentId;
  const normalizedUserId = typeof userId === "string" && userId ? userId : null;
  const requestedItems = normalizeCheckoutItems(items);

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
  const purchaseProductIds = productIds.length > 0 ? productIds : [DEFAULT_PRODUCT_ID];
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
    return { ok: false, error: "No downloadable files found for items" };
  }

  const token = uuidv4();
  await saveToken(token, tokenFiles);

  const now = new Date();
  const purchaseDocs = purchaseProductIds.map((productId) => ({
    id: `${normalizedPaymentId}_${productId}`,
    data: {
      email: normalizedEmail,
      userId: normalizedUserId,
      productId,
      quantity: aggregatedItems[productId] || 1,
      paymentId: normalizedPaymentId,
      orderId: normalizedOrderId,
      paymentMethod: String(paymentMethod || "razorpay").trim().toLowerCase() || "razorpay",
      orderCurrency: String(orderCurrency || "INR").trim().toUpperCase(),
      orderAmount: Number(orderAmount || 0),
      couponCode: String(appliedCoupon?.code || "").trim().toUpperCase() || null,
      couponId: String(appliedCoupon?.id || "").trim() || null,
      couponDiscountAmount: Number(appliedCoupon?.discountAmount || 0),
      purchasedAt: now,
    },
  }));

  const adminDb = getAdminDb();
  if (adminDb) {
    const batch = adminDb.batch();
    purchaseDocs.forEach((entry) => {
      batch.set(adminDb.collection("purchases").doc(entry.id), entry.data);
    });
    Object.entries(aggregatedItems).forEach(([productId, quantity]) => {
      const incrementBy = Math.max(1, Number(quantity || 1));
      batch.set(
        adminDb.collection("products").doc(productId),
        {
          purchaseCount: FieldValue.increment(incrementBy),
          soldCount: FieldValue.increment(incrementBy),
          updatedAt: now.toISOString(),
        },
        { merge: true }
      );
    });
    await batch.commit();
  } else {
    await Promise.all(
      purchaseDocs.map((entry) =>
        setDoc(doc(db, "purchases", entry.id), entry.data)
      )
    );
    await Promise.all(
      Object.entries(aggregatedItems).map(([productId, quantity]) => {
        const incrementBy = Math.max(1, Number(quantity || 1));
        return updateDoc(doc(db, "products", productId), {
          purchaseCount: increment(incrementBy),
          soldCount: increment(incrementBy),
          updatedAt: now.toISOString(),
        }).catch(() => null);
      })
    );
  }

  let couponUsageResult = null;
  if (appliedCoupon?.id && appliedCoupon?.code) {
    couponUsageResult = await consumeCouponUsage({
      couponId: appliedCoupon.id,
      code: appliedCoupon.code,
      email: normalizedEmail,
      userId: normalizedUserId,
      paymentId: normalizedPaymentId,
      orderId: normalizedOrderId,
      orderAmount: Number(orderAmount || 0),
      discountAmount: Number(appliedCoupon?.discountAmount || 0),
      itemQuantityUsed: 1,
      currency: String(orderCurrency || "INR").trim().toUpperCase(),
    });

    if (!couponUsageResult?.ok && !couponUsageResult?.skipped) {
      console.warn("Coupon usage tracking failed:", couponUsageResult);
    }
  }

  const invoiceItems = purchaseProductIds.map((productId) => {
    const product =
      normalizedItems.find((item) => item.productId === productId)?.product ||
      PRODUCT_CATALOG[productId] ||
      {};
    return {
      productId,
      title: String(product.title || productId).trim(),
      quantity: aggregatedItems[productId] || 1,
      price: Number(product.price || 0),
    };
  });

  let invoiceEmailResult = null;
  try {
    invoiceEmailResult = await sendInvoiceEmailOnce({
      email: normalizedEmail,
      paymentId: normalizedPaymentId,
      orderId: normalizedOrderId,
      orderAmount: Number(orderAmount || 0),
      orderCurrency: String(orderCurrency || "INR").trim().toUpperCase(),
      purchasedAt: now,
      items: invoiceItems,
    });
  } catch (error) {
    invoiceEmailResult = { ok: false, error: String(error?.message || error) };
    console.warn("Invoice email failed:", error);
  }

  return {
    ok: true,
    token,
    paymentId: normalizedPaymentId,
    primaryProductId,
    productIds: purchaseProductIds,
    couponUsageTracked: Boolean(couponUsageResult?.ok),
    invoiceEmailSent: Boolean(invoiceEmailResult?.ok),
  };
}

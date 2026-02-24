import { v4 as uuidv4 } from "uuid";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase/config";
import { saveToken } from "./tokenStore";
import { DEFAULT_PRODUCT_ID, PRODUCT_CATALOG } from "./productCatalog";
import { consumeCouponUsage } from "./coupons/server";
import { normalizeCheckoutItems } from "./checkoutPricing";

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
  saveToken(token, tokenFiles);

  const now = new Date();
  await Promise.all(
    purchaseProductIds.map((productId) =>
      setDoc(doc(db, "purchases", `${normalizedPaymentId}_${productId}`), {
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
      })
    )
  );

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

  return {
    ok: true,
    token,
    paymentId: normalizedPaymentId,
    primaryProductId,
    productIds: purchaseProductIds,
    couponUsageTracked: Boolean(couponUsageResult?.ok),
  };
}

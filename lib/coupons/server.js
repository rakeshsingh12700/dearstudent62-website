import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  runTransaction,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../../firebase/config";
import { getDiscountedUnitPrice } from "../pricing/launchOffer";
import {
  computeCouponDiscount,
  generateCouponCode,
  getCouponRuntimeStatus,
  isValidCouponCode,
  normalizeCouponCode,
  normalizeCouponEmail,
  normalizeDiscountType,
  parseDateInput,
  parseOptionalLimit,
} from "./common";

function normalizeBoolean(value, defaultValue = false) {
  if (value === undefined || value === null) return defaultValue;
  if (typeof value === "boolean") return value;
  const lowered = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(lowered)) return true;
  if (["false", "0", "no", "off"].includes(lowered)) return false;
  return defaultValue;
}

function normalizeDiscountValue(type, value) {
  if (type === "free_item") return 0;
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  if (type === "percentage") {
    return Math.min(100, Number(numeric.toFixed(2)));
  }
  return Number(numeric.toFixed(2));
}

function getSingleItemAmountFromPricing(pricingContext, pick = "highest") {
  const items = Array.isArray(pricingContext?.validItems) ? pricingContext.validItems : [];
  if (items.length === 0) return 0;

  const totalItemQuantity =
    Number(pricingContext?.totalItemQuantity || 0) ||
    items.reduce((sum, item) => sum + Number(item?.quantity || 0), 0);
  const orderCurrency = String(pricingContext?.orderCurrency || "INR").trim().toUpperCase() || "INR";

  let candidate = pick === "lowest" ? Infinity : 0;
  items.forEach((item) => {
    const quantity = Number(item?.quantity || 0);
    const unitAmount = Number(item?.unitAmount || 0);
    if (quantity <= 0 || unitAmount <= 0) return;
    const discountedUnit = getDiscountedUnitPrice(unitAmount, orderCurrency, totalItemQuantity);
    if (discountedUnit <= 0) return;
    if (pick === "lowest") {
      if (discountedUnit < candidate) candidate = discountedUnit;
      return;
    }
    if (discountedUnit > candidate) candidate = discountedUnit;
  });

  return Number.isFinite(candidate) ? candidate : 0;
}

function normalizeMinOrderAmount(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Number(numeric.toFixed(2));
}

function normalizeVisibilityScope(value, fallback = "hidden") {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "public" || normalized === "user_specific" || normalized === "hidden") {
    return normalized;
  }
  return fallback;
}

function toIsoDate(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value?.toDate === "function") {
    const date = value.toDate();
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

export function normalizeCouponDocument(raw, id) {
  const coupon = raw || {};
  const userEmail = normalizeCouponEmail(coupon.userEmail);
  const legacyScopeFallback = userEmail ? "user_specific" : "public";
  const visibilityScope = normalizeVisibilityScope(coupon.visibilityScope, legacyScopeFallback);
  const inferredPerUserMode =
    String(coupon.perUserMode || "").trim().toLowerCase() ||
    (parseOptionalLimit(coupon.perUserLimit) === null ? "unlimited" : "multiple");
  return {
    id: String(id || "").trim(),
    code: normalizeCouponCode(coupon.code || coupon.codeUpper || ""),
    description: String(coupon.description || "").trim(),
    discountType: normalizeDiscountType(coupon.discountType),
    discountValue: Number(coupon.discountValue || 0),
    isActive: Boolean(coupon.isActive),
    totalUsageLimit: parseOptionalLimit(coupon.totalUsageLimit),
    perUserLimit: parseOptionalLimit(coupon.perUserLimit),
    perUserMode: inferredPerUserMode,
    minOrderAmount: normalizeMinOrderAmount(coupon.minOrderAmount),
    firstPurchaseOnly: normalizeBoolean(coupon.firstPurchaseOnly, false),
    usedCount: Math.max(0, Number(coupon.usedCount || 0)),
    visibilityScope,
    userEmail: visibilityScope === "user_specific" ? userEmail : null,
    startDate: toIsoDate(coupon.startDate),
    expiryDate: toIsoDate(coupon.expiryDate),
    createdAt: toIsoDate(coupon.createdAt),
    updatedAt: toIsoDate(coupon.updatedAt),
    createdBy: String(coupon.createdBy || "").trim().toLowerCase() || null,
    disabledAt: toIsoDate(coupon.disabledAt),
    disabledBy: String(coupon.disabledBy || "").trim().toLowerCase() || null,
    usageResetAt: toIsoDate(coupon.usageResetAt),
    usageResetBy: String(coupon.usageResetBy || "").trim().toLowerCase() || null,
    usageResetReason: String(coupon.usageResetReason || "").trim() || null,
  };
}

function sanitizeCouponPayload(input) {
  const requestedCode = normalizeCouponCode(input?.code || "");
  const autoGenerate = normalizeBoolean(input?.autoGenerate, false);
  const code = requestedCode || (autoGenerate ? generateCouponCode(input?.prefix || "DS") : "");
  const discountType = normalizeDiscountType(input?.discountType);
  const discountValue = normalizeDiscountValue(discountType, input?.discountValue);

  const perUserMode = String(input?.perUserMode || "").trim().toLowerCase();
  let perUserLimit = parseOptionalLimit(input?.perUserLimit);
  if (perUserMode === "one_item") perUserLimit = 1;
  if (perUserMode === "one_order") perUserLimit = 1;
  if (perUserMode === "unlimited") perUserLimit = null;

  const totalUsageMode = String(input?.totalUsageMode || "").trim().toLowerCase();
  let totalUsageLimit = parseOptionalLimit(input?.totalUsageLimit);
  if (totalUsageMode === "one") totalUsageLimit = 1;
  if (totalUsageMode === "unlimited") totalUsageLimit = null;

  const startDate = parseDateInput(input?.startDate);
  const expiryDate = parseDateInput(input?.expiryDate);
  const visibilityScope = normalizeVisibilityScope(input?.visibilityScope, "hidden");
  const userEmail = visibilityScope === "user_specific"
    ? normalizeCouponEmail(input?.userEmail)
    : null;
  const minOrderAmount = normalizeMinOrderAmount(input?.minOrderAmount);
  const firstPurchaseOnly = normalizeBoolean(input?.firstPurchaseOnly, false);

  return {
    code,
    description: String(input?.description || "").trim().slice(0, 240),
    discountType,
    discountValue,
    isActive: normalizeBoolean(input?.isActive, true),
    totalUsageLimit,
    perUserLimit,
    perUserMode:
      perUserMode === "one_item" ||
      perUserMode === "one_order" ||
      perUserMode === "multiple" ||
      perUserMode === "unlimited"
        ? perUserMode
        : perUserLimit === null
          ? "unlimited"
          : "multiple",
    minOrderAmount,
    firstPurchaseOnly,
    visibilityScope,
    userEmail,
    startDate,
    expiryDate,
  };
}

async function hasPriorPurchases({ email, userId }) {
  const normalizedEmail = normalizeCouponEmail(email);
  const normalizedUserId = String(userId || "").trim();

  const checks = [];
  if (normalizedEmail) {
    checks.push(
      getDocs(query(collection(db, "purchases"), where("email", "==", normalizedEmail), limit(1)))
    );
  }
  if (normalizedUserId) {
    checks.push(
      getDocs(query(collection(db, "purchases"), where("userId", "==", normalizedUserId), limit(1)))
    );
  }

  if (checks.length === 0) return false;
  const snapshots = await Promise.all(checks);
  return snapshots.some((snapshot) => !snapshot.empty);
}

export async function getCouponByCode(code) {
  const normalizedCode = normalizeCouponCode(code);
  if (!normalizedCode) return null;

  const snapshot = await getDocs(
    query(collection(db, "coupons"), where("codeUpper", "==", normalizedCode), limit(1))
  );

  if (snapshot.empty) return null;
  const row = snapshot.docs[0];
  return normalizeCouponDocument(row.data(), row.id);
}

export async function getCouponById(couponId) {
  const normalizedId = String(couponId || "").trim();
  if (!normalizedId) return null;

  const snapshot = await getDoc(doc(db, "coupons", normalizedId));
  if (!snapshot.exists()) return null;

  return normalizeCouponDocument(snapshot.data(), snapshot.id);
}

export async function getCouponUserUsageCount(couponId, email) {
  const normalizedCouponId = String(couponId || "").trim();
  const normalizedEmail = normalizeCouponEmail(email);
  if (!normalizedCouponId || !normalizedEmail) return 0;

  const coupon = await getCouponById(normalizedCouponId);
  const resetMs = coupon?.usageResetAt ? new Date(coupon.usageResetAt).getTime() : 0;
  const snapshot = await getDocs(
    query(collection(db, "coupon_usages"), where("couponId", "==", normalizedCouponId), limit(500))
  );

  return snapshot.docs.reduce((count, docItem) => {
    const data = docItem.data() || {};
    const usageEmail = normalizeCouponEmail(data.email);
    const status = String(data.status || "applied").trim().toLowerCase();
    const usedAtMs = new Date(data.usedAt || 0).getTime();
    if (usageEmail !== normalizedEmail) return count;
    if (status !== "applied") return count;
    if (resetMs > 0 && (!Number.isFinite(usedAtMs) || usedAtMs < resetMs)) return count;
    return count + 1;
  }, 0);
}

export async function getCouponUserUsageStats(couponId, email) {
  const normalizedCouponId = String(couponId || "").trim();
  const normalizedEmail = normalizeCouponEmail(email);
  if (!normalizedCouponId || !normalizedEmail) {
    return { usageCount: 0, orderCount: 0, itemCount: 0 };
  }

  const coupon = await getCouponById(normalizedCouponId);
  const resetMs = coupon?.usageResetAt ? new Date(coupon.usageResetAt).getTime() : 0;
  const snapshot = await getDocs(
    query(collection(db, "coupon_usages"), where("couponId", "==", normalizedCouponId), limit(700))
  );

  let usageCount = 0;
  let itemCount = 0;
  const orderKeys = new Set();

  snapshot.docs.forEach((docItem) => {
    const data = docItem.data() || {};
    const usageEmail = normalizeCouponEmail(data.email);
    const status = String(data.status || "applied").trim().toLowerCase();
    const usedAtMs = new Date(data.usedAt || 0).getTime();
    if (usageEmail !== normalizedEmail || status !== "applied") return;
    if (resetMs > 0 && (!Number.isFinite(usedAtMs) || usedAtMs < resetMs)) return;

    usageCount += 1;
    itemCount += Math.max(0, Number(data.itemQuantityUsed || 1));
    const orderKey = String(data.orderId || data.paymentId || "").trim();
    if (orderKey) orderKeys.add(orderKey);
  });

  return {
    usageCount,
    orderCount: orderKeys.size,
    itemCount,
  };
}

export async function validateCouponForCheckout({
  code,
  email,
  userId,
  orderAmount,
  currency,
  pricingContext,
  allowZeroFinal = false,
}) {
  const coupon = await getCouponByCode(code);
  if (!coupon) {
    return { ok: false, status: 404, error: "Coupon not found" };
  }

  const now = new Date();
  const status = getCouponRuntimeStatus(coupon, now);
  if (status !== "active") {
    const messageByStatus = {
      disabled: "This coupon is disabled",
      expired: "This coupon has expired",
      scheduled: "This coupon is not active yet",
    };
    return { ok: false, status: 400, error: messageByStatus[status] || "Coupon is not active" };
  }

  const normalizedEmail = normalizeCouponEmail(email);
  if (coupon.visibilityScope === "user_specific" && coupon.userEmail && normalizedEmail !== coupon.userEmail) {
    return { ok: false, status: 403, error: "This coupon is restricted to another email" };
  }

  if (coupon.totalUsageLimit !== null && coupon.usedCount >= coupon.totalUsageLimit) {
    return { ok: false, status: 400, error: "Coupon usage limit reached" };
  }

  if (coupon.minOrderAmount !== null && Number(orderAmount || 0) < coupon.minOrderAmount) {
    return {
      ok: false,
      status: 400,
      error: `Minimum order amount for this coupon is ${coupon.minOrderAmount}`,
    };
  }

  if (coupon.perUserLimit !== null) {
    if (!normalizedEmail) {
      return { ok: false, status: 400, error: "Email required for this coupon" };
    }
    const userUsage = await getCouponUserUsageStats(coupon.id, normalizedEmail);
    const perUserMode = String(coupon.perUserMode || "multiple").trim().toLowerCase();
    if (perUserMode === "one_item" && userUsage.itemCount >= coupon.perUserLimit) {
      return { ok: false, status: 400, error: "Per-user item limit reached for this coupon" };
    }
    if (perUserMode === "one_order" && userUsage.orderCount >= coupon.perUserLimit) {
      return { ok: false, status: 400, error: "Per-user order limit reached for this coupon" };
    }
    if (perUserMode === "multiple" && userUsage.orderCount >= coupon.perUserLimit) {
      return { ok: false, status: 400, error: "Per-user order limit reached for this coupon" };
    }
    if (
      perUserMode !== "one_item" &&
      perUserMode !== "one_order" &&
      perUserMode !== "multiple" &&
      userUsage.usageCount >= coupon.perUserLimit
    ) {
      return { ok: false, status: 400, error: "Per-user usage limit reached for this coupon" };
    }
  }

  if (coupon.firstPurchaseOnly) {
    if (!normalizedEmail && !String(userId || "").trim()) {
      return { ok: false, status: 400, error: "Login or email is required for first-purchase coupon" };
    }
    const priorPurchase = await hasPriorPurchases({ email: normalizedEmail, userId });
    if (priorPurchase) {
      return { ok: false, status: 400, error: "This coupon is valid only for first purchase" };
    }
  }

  const freeItemAmount = coupon.discountType === "free_item"
    ? getSingleItemAmountFromPricing(pricingContext, "highest")
    : 0;
  const applySingleItemScope = String(coupon.perUserMode || "").trim().toLowerCase() === "one_item";
  const discountBaseAmount = applySingleItemScope
    ? getSingleItemAmountFromPricing(pricingContext, "highest")
    : null;
  const pricing = computeCouponDiscount({
    coupon,
    orderAmount,
    currency,
    freeItemAmount,
    discountBaseAmount,
  });
  if (!Number.isFinite(pricing.discountAmount) || pricing.discountAmount <= 0) {
    return { ok: false, status: 400, error: "Coupon discount is not applicable" };
  }
  if (!allowZeroFinal && (!Number.isFinite(pricing.finalAmount) || pricing.finalAmount <= 0)) {
    return {
      ok: false,
      status: 400,
      error: "This coupon makes the order fully free. Free checkout is not enabled yet.",
    };
  }

  return {
    ok: true,
    coupon,
    couponSummary: {
      id: coupon.id,
      code: coupon.code,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      freeItemAmount,
      discountAmount: pricing.discountAmount,
      finalAmount: pricing.finalAmount,
      orderAmount: Number(orderAmount || 0),
      minOrderAmount: coupon.minOrderAmount,
      firstPurchaseOnly: coupon.firstPurchaseOnly,
      perUserMode: coupon.perUserMode || null,
      discountScope: applySingleItemScope ? "single_highest_item" : "order_total",
      currency: String(currency || "INR").trim().toUpperCase() || "INR",
    },
  };
}

export async function listCheckoutVisibleCoupons({
  email,
  userId,
  orderAmount,
  currency,
  pricingContext,
}) {
  const normalizedEmail = normalizeCouponEmail(email);
  const snapshot = await getDocs(query(collection(db, "coupons"), limit(300)));

  const now = new Date();
  const coupons = snapshot.docs
    .map((item) => normalizeCouponDocument(item.data(), item.id))
    .filter((coupon) => getCouponRuntimeStatus(coupon, now) === "active")
    .filter((coupon) => {
      if (coupon.visibilityScope === "hidden") return false;
      if (coupon.visibilityScope === "user_specific") {
        return Boolean(normalizedEmail) && coupon.userEmail === normalizedEmail;
      }
      return true;
    })
    .slice(0, 120);

  const results = [];
  let priorPurchaseCache = null;
  for (const coupon of coupons) {
    if (coupon.totalUsageLimit !== null && coupon.usedCount >= coupon.totalUsageLimit) {
      continue;
    }

    if (coupon.minOrderAmount !== null && Number(orderAmount || 0) < coupon.minOrderAmount) {
      continue;
    }

    if (coupon.perUserLimit !== null) {
      if (!normalizedEmail) continue;
      const usageStats = await getCouponUserUsageStats(coupon.id, normalizedEmail);
      const perUserMode = String(coupon.perUserMode || "multiple").trim().toLowerCase();
      if (perUserMode === "one_item" && usageStats.itemCount >= coupon.perUserLimit) continue;
      if (perUserMode === "one_order" && usageStats.orderCount >= coupon.perUserLimit) continue;
      if (perUserMode === "multiple" && usageStats.orderCount >= coupon.perUserLimit) continue;
      if (
        perUserMode !== "one_item" &&
        perUserMode !== "one_order" &&
        perUserMode !== "multiple" &&
        usageStats.usageCount >= coupon.perUserLimit
      ) continue;
    }

    if (coupon.firstPurchaseOnly) {
      if (!normalizedEmail && !String(userId || "").trim()) continue;
      if (priorPurchaseCache === null) {
        priorPurchaseCache = await hasPriorPurchases({ email: normalizedEmail, userId });
      }
      if (priorPurchaseCache) continue;
    }

    const applySingleItemScope = String(coupon.perUserMode || "").trim().toLowerCase() === "one_item";
    const freeItemAmount = coupon.discountType === "free_item"
      ? getSingleItemAmountFromPricing(pricingContext, "highest")
      : 0;
    const discountBaseAmount = applySingleItemScope
      ? getSingleItemAmountFromPricing(pricingContext, "highest")
      : null;
    const pricing = computeCouponDiscount({
      coupon,
      orderAmount,
      currency,
      freeItemAmount,
      discountBaseAmount,
    });
    if (!Number.isFinite(pricing.discountAmount) || pricing.discountAmount <= 0) {
      continue;
    }

    results.push({
      id: coupon.id,
      code: coupon.code,
      description: coupon.description,
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      freeItemAmount,
      discountAmount: pricing.discountAmount,
      finalAmount: pricing.finalAmount,
      currency,
      expiresAt: coupon.expiryDate,
      perUserLimit: coupon.perUserLimit,
      totalUsageLimit: coupon.totalUsageLimit,
      usedCount: coupon.usedCount,
      perUserMode: coupon.perUserMode || null,
      minOrderAmount: coupon.minOrderAmount,
      firstPurchaseOnly: coupon.firstPurchaseOnly,
      visibilityScope: coupon.visibilityScope || "public",
      userEmail: coupon.userEmail,
      discountScope: applySingleItemScope ? "single_highest_item" : "order_total",
    });
  }

  return results
    .sort((a, b) => b.discountAmount - a.discountAmount)
    .slice(0, 20);
}

export async function createCouponFromAdminPayload(payload, adminEmail) {
  const normalized = sanitizeCouponPayload(payload);

  if (!isValidCouponCode(normalized.code)) {
    return { ok: false, status: 400, error: "Coupon code must be 4-24 chars (A-Z, 0-9, -)" };
  }
  if (normalized.discountType !== "free_item" && (!normalized.discountValue || normalized.discountValue <= 0)) {
    return { ok: false, status: 400, error: "Discount value must be greater than zero" };
  }
  if (normalized.visibilityScope === "user_specific" && !normalized.userEmail) {
    return { ok: false, status: 400, error: "User email is required for user-specific coupon" };
  }
  if (normalized.startDate && normalized.expiryDate) {
    const start = new Date(normalized.startDate);
    const end = new Date(normalized.expiryDate);
    if (start.getTime() > end.getTime()) {
      return { ok: false, status: 400, error: "Start date must be before expiry date" };
    }
  }

  const duplicateSnapshot = await getDocs(
    query(collection(db, "coupons"), where("codeUpper", "==", normalized.code), limit(10))
  );

  const now = new Date().toISOString();
  if (!duplicateSnapshot.empty) {
    const duplicateRows = duplicateSnapshot.docs.map((row) => ({
      id: row.id,
      ...normalizeCouponDocument(row.data(), row.id),
    }));
    const hasActiveCode = duplicateRows.some((row) => row.isActive);
    if (hasActiveCode) {
      return {
        ok: false,
        status: 409,
        error: "Coupon code already exists and is active. Disable it first to recreate.",
      };
    }

    const recreateTarget =
      duplicateRows
        .slice()
        .sort((first, second) => {
          const firstDate = new Date(first.updatedAt || first.createdAt || 0).getTime();
          const secondDate = new Date(second.updatedAt || second.createdAt || 0).getTime();
          return secondDate - firstDate;
        })[0] || null;

    if (recreateTarget?.id) {
      await updateDoc(doc(db, "coupons", recreateTarget.id), {
        code: normalized.code,
        codeUpper: normalized.code,
        description: normalized.description,
        discountType: normalized.discountType,
        discountValue: normalized.discountValue,
        isActive: normalized.isActive,
        totalUsageLimit: normalized.totalUsageLimit,
        perUserLimit: normalized.perUserLimit,
        perUserMode: normalized.perUserMode,
        minOrderAmount: normalized.minOrderAmount,
        firstPurchaseOnly: normalized.firstPurchaseOnly,
        visibilityScope: normalized.visibilityScope,
        usedCount: 0,
        userEmail: normalized.userEmail,
        usageResetAt: null,
        usageResetBy: null,
        usageResetReason: null,
        startDate: normalized.startDate,
        expiryDate: normalized.expiryDate,
        createdAt: now,
        updatedAt: now,
        createdBy: String(adminEmail || "").trim().toLowerCase() || null,
        disabledAt: null,
        disabledBy: null,
      });

      const recreated = await getCouponById(recreateTarget.id);
      return { ok: true, coupon: recreated, recreated: true };
    }
  }

  const created = await addDoc(collection(db, "coupons"), {
    code: normalized.code,
    codeUpper: normalized.code,
    description: normalized.description,
    discountType: normalized.discountType,
    discountValue: normalized.discountValue,
    isActive: normalized.isActive,
    totalUsageLimit: normalized.totalUsageLimit,
    perUserLimit: normalized.perUserLimit,
    perUserMode: normalized.perUserMode,
    minOrderAmount: normalized.minOrderAmount,
    firstPurchaseOnly: normalized.firstPurchaseOnly,
    visibilityScope: normalized.visibilityScope,
    usedCount: 0,
    userEmail: normalized.userEmail,
    usageResetAt: null,
    usageResetBy: null,
    usageResetReason: null,
    startDate: normalized.startDate,
    expiryDate: normalized.expiryDate,
    createdAt: now,
    updatedAt: now,
    createdBy: String(adminEmail || "").trim().toLowerCase() || null,
    disabledAt: null,
    disabledBy: null,
  });

  const fresh = await getCouponById(created.id);
  return { ok: true, coupon: fresh, recreated: false };
}

export async function consumeCouponUsage({
  couponId,
  code,
  email,
  userId,
  paymentId,
  orderId,
  orderAmount,
  discountAmount,
  currency,
  itemQuantityUsed = 1,
}) {
  const normalizedCouponId = String(couponId || "").trim();
  const normalizedCode = normalizeCouponCode(code);
  if (!normalizedCouponId || !normalizedCode || !paymentId) {
    return { ok: false, skipped: true, reason: "missing_fields" };
  }

  const usageDocId = `${String(paymentId).trim()}_${normalizedCouponId}`;
  const usageRef = doc(db, "coupon_usages", usageDocId);
  const couponRef = doc(db, "coupons", normalizedCouponId);
  const normalizedEmail = normalizeCouponEmail(email);

  try {
    const result = await runTransaction(db, async (transaction) => {
      const existingUsageSnapshot = await transaction.get(usageRef);
      if (existingUsageSnapshot.exists()) {
        return { ok: true, alreadyApplied: true };
      }

      const couponSnapshot = await transaction.get(couponRef);
      if (!couponSnapshot.exists()) {
        return { ok: false, reason: "coupon_not_found" };
      }

      const coupon = normalizeCouponDocument(couponSnapshot.data(), couponSnapshot.id);
      if (coupon.code !== normalizedCode) {
        return { ok: false, reason: "coupon_code_mismatch" };
      }

      const status = getCouponRuntimeStatus(coupon, new Date());
      if (status !== "active") {
        return { ok: false, reason: `coupon_${status}` };
      }

      if (coupon.visibilityScope === "user_specific" && coupon.userEmail && coupon.userEmail !== normalizedEmail) {
        return { ok: false, reason: "email_mismatch" };
      }

      if (coupon.totalUsageLimit !== null && coupon.usedCount >= coupon.totalUsageLimit) {
        return { ok: false, reason: "total_limit_reached" };
      }

      const nextUsedCount = Number(coupon.usedCount || 0) + 1;
      const now = new Date().toISOString();

      transaction.update(couponRef, {
        usedCount: nextUsedCount,
        updatedAt: now,
      });

      transaction.set(usageRef, {
        couponId: coupon.id,
        code: coupon.code,
        email: normalizedEmail,
        userId: String(userId || "").trim() || null,
        paymentId: String(paymentId || "").trim(),
        orderId: String(orderId || "").trim() || null,
        orderAmount: Number(orderAmount || 0),
        discountAmount: Number(discountAmount || 0),
        itemQuantityUsed: Math.max(1, Number(itemQuantityUsed || 1)),
        currency: String(currency || "INR").trim().toUpperCase() || "INR",
        status: "applied",
        usedAt: now,
      });

      return { ok: true, alreadyApplied: false };
    });

    return result;
  } catch (error) {
    return { ok: false, reason: "transaction_failed", error: String(error?.message || error) };
  }
}

export async function listCouponUsages(couponId, fetchLimit = 300) {
  const normalizedCouponId = String(couponId || "").trim();
  if (!normalizedCouponId) return [];

  const parsedLimit = Number.parseInt(String(fetchLimit || "300"), 10);
  const boundedLimit = Number.isFinite(parsedLimit)
    ? Math.min(Math.max(parsedLimit, 20), 1200)
    : 300;

  const snapshot = await getDocs(
    query(collection(db, "coupon_usages"), where("couponId", "==", normalizedCouponId), limit(boundedLimit))
  );

  return snapshot.docs
    .map((docItem) => {
      const data = docItem.data() || {};
      return {
        id: docItem.id,
        couponId: String(data.couponId || "").trim(),
        code: normalizeCouponCode(data.code || ""),
        email: normalizeCouponEmail(data.email),
        userId: String(data.userId || "").trim() || null,
        paymentId: String(data.paymentId || "").trim() || null,
        orderId: String(data.orderId || "").trim() || null,
        orderAmount: Number(data.orderAmount || 0),
        discountAmount: Number(data.discountAmount || 0),
        currency: String(data.currency || "INR").trim().toUpperCase() || "INR",
        status: String(data.status || "applied").trim().toLowerCase(),
        usedAt: toIsoDate(data.usedAt),
      };
    })
    .sort((first, second) => {
      const firstDate = new Date(first.usedAt || 0).getTime();
      const secondDate = new Date(second.usedAt || 0).getTime();
      return secondDate - firstDate;
    });
}

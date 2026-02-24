const COUPON_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const DEFAULT_PREFIXES = ["STUDENT", "WELCOME", "CLASS", "LEARN", "SAVE", "DEAR"];

export function normalizeCouponCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[^A-Z0-9-]/g, "");
}

export function isValidCouponCode(value) {
  const code = normalizeCouponCode(value);
  return /^[A-Z0-9-]{4,24}$/.test(code);
}

function randomChars(length) {
  let output = "";
  for (let index = 0; index < length; index += 1) {
    const randomIndex = Math.floor(Math.random() * COUPON_ALPHABET.length);
    output += COUPON_ALPHABET[randomIndex];
  }
  return output;
}

export function generateCouponCode(prefix = "", totalLength = 10) {
  const cleanPrefix = normalizeCouponCode(prefix).replace(/-/g, "") || DEFAULT_PREFIXES[Math.floor(Math.random() * DEFAULT_PREFIXES.length)];
  const boundedLength = Math.min(Math.max(Number(totalLength || 10), 6), 18);
  const randomLength = Math.max(3, boundedLength - cleanPrefix.length);

  if (cleanPrefix.length >= boundedLength - 1) {
    return normalizeCouponCode(`${cleanPrefix.slice(0, boundedLength - 4)}-${randomChars(4)}`);
  }

  return normalizeCouponCode(`${cleanPrefix}-${randomChars(randomLength)}`);
}

export function normalizeDiscountType(value) {
  const type = String(value || "").trim().toLowerCase();
  if (type === "free_item") return "free_item";
  return type === "flat" ? "flat" : "percentage";
}

export function normalizeCouponEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  return email || null;
}

export function parseDateInput(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

export function parseOptionalLimit(value) {
  if (value === null || value === undefined || value === "") return null;
  if (String(value).trim().toLowerCase() === "unlimited") return null;

  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

export function roundCurrencyAmount(amount, currency) {
  const numeric = Number(amount || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  if (String(currency || "INR").trim().toUpperCase() === "INR") {
    return Math.round(numeric);
  }
  return Number(numeric.toFixed(2));
}

export function computeCouponDiscount({
  coupon,
  orderAmount,
  currency,
  freeItemAmount = 0,
  discountBaseAmount = null,
}) {
  const safeAmount = Number(orderAmount || 0);
  if (!Number.isFinite(safeAmount) || safeAmount <= 0) {
    return { discountAmount: 0, finalAmount: 0 };
  }

  const type = normalizeDiscountType(coupon?.discountType);
  const rawValue = Number(coupon?.discountValue || 0);
  const scopedBaseAmount = Number(discountBaseAmount);
  const effectiveBaseAmount =
    Number.isFinite(scopedBaseAmount) && scopedBaseAmount > 0
      ? Math.min(safeAmount, scopedBaseAmount)
      : safeAmount;
  let computed = 0;

  if (type === "free_item") {
    computed = Number(freeItemAmount || 0);
  } else {
    if (!Number.isFinite(rawValue) || rawValue <= 0) {
      return { discountAmount: 0, finalAmount: safeAmount };
    }
    computed =
      type === "percentage"
        ? effectiveBaseAmount * Math.min(100, Math.max(0, rawValue)) / 100
        : rawValue;
  }

  const capped = Math.min(effectiveBaseAmount, computed);
  const discountAmount = roundCurrencyAmount(capped, currency);
  const finalAmount = roundCurrencyAmount(Math.max(0, safeAmount - discountAmount), currency);
  return { discountAmount, finalAmount };
}

export function getCouponRuntimeStatus(coupon, now = new Date()) {
  if (!coupon?.isActive) return "disabled";

  const startDate = coupon?.startDate ? new Date(coupon.startDate) : null;
  const expiryDate = coupon?.expiryDate ? new Date(coupon.expiryDate) : null;

  if (startDate && !Number.isNaN(startDate.getTime()) && startDate.getTime() > now.getTime()) {
    return "scheduled";
  }

  if (expiryDate && !Number.isNaN(expiryDate.getTime()) && expiryDate.getTime() < now.getTime()) {
    return "expired";
  }

  return "active";
}

import { doc, getDoc } from "firebase/firestore";
import products from "../data/products";
import { db } from "../firebase/config";
import {
  calculatePrice,
  detectCountryFromRequest,
  getCurrencyOverrideFromRequest,
} from "./pricing";
import { getDiscountedUnitPrice, getLaunchDiscountRate } from "./pricing/launchOffer";

const STATIC_PRODUCTS_BY_ID = products.reduce((acc, product) => {
  if (product?.id) {
    acc[product.id] = product;
  }
  return acc;
}, {});

async function getProductBasePrice(productId) {
  const normalizedId = String(productId || "").trim();
  if (!normalizedId) return null;

  try {
    const snapshot = await getDoc(doc(db, "products", normalizedId));
    if (snapshot.exists()) {
      return Number(snapshot.data()?.price || 0);
    }
  } catch {
    // Fall back to static data.
  }

  return Number(STATIC_PRODUCTS_BY_ID[normalizedId]?.price || 0);
}

export function normalizeCheckoutItems(rawItems) {
  return (Array.isArray(rawItems) ? rawItems : [])
    .map((item) => ({
      productId: String(item?.productId || "").trim(),
      quantity: Number(item?.quantity || 0),
    }))
    .filter(
      (item) =>
        item.productId &&
        Number.isFinite(item.quantity) &&
        item.quantity > 0 &&
        item.quantity <= 20
    )
    .slice(0, 25);
}

export async function computeCheckoutPricing({ req, items, currencyOverride: incomingCurrencyOverride }) {
  const requestedItems = normalizeCheckoutItems(items);

  if (requestedItems.length === 0) {
    return { ok: false, status: 400, error: "No valid items provided for checkout." };
  }

  const countryCode = detectCountryFromRequest(req);
  const currencyOverrideFromRequest = getCurrencyOverrideFromRequest(req);
  const currencyOverrideFromBody = String(incomingCurrencyOverride || "").trim().toUpperCase();
  const currencyOverride = currencyOverrideFromBody || currencyOverrideFromRequest;

  const pricedItems = await Promise.all(
    requestedItems.map(async (item) => {
      const basePriceINR = await getProductBasePrice(item.productId);
      if (!Number.isFinite(basePriceINR) || basePriceINR <= 0) return null;

      const pricing = calculatePrice({
        basePriceINR,
        countryCode,
        currencyOverride,
      });

      return {
        ...item,
        unitAmount: Number(pricing.amount || 0),
        currency: pricing.currency,
      };
    })
  );

  const validItems = pricedItems.filter(Boolean);
  if (validItems.length === 0) {
    return { ok: false, status: 400, error: "Could not compute prices for checkout items." };
  }

  const orderCurrency = validItems[0].currency;
  const hasMixedCurrencies = validItems.some((item) => item.currency !== orderCurrency);
  if (hasMixedCurrencies) {
    return { ok: false, status: 400, error: "Mixed checkout currencies detected. Refresh and try again." };
  }

  const totalItemQuantity = validItems.reduce(
    (sum, item) => sum + Number(item.quantity || 0),
    0
  );

  const launchDiscountRate = getLaunchDiscountRate(totalItemQuantity);
  const subtotalAmount = validItems.reduce(
    (sum, item) => sum + Number(item.unitAmount || 0) * Number(item.quantity || 0),
    0
  );

  const computedAmount = validItems.reduce((sum, item) => {
    const discountedUnitAmount = getDiscountedUnitPrice(
      Number(item.unitAmount || 0),
      orderCurrency,
      totalItemQuantity
    );
    return sum + discountedUnitAmount * Number(item.quantity || 0);
  }, 0);

  if (!Number.isFinite(computedAmount) || computedAmount <= 0) {
    return { ok: false, status: 400, error: "Invalid checkout total." };
  }

  return {
    ok: true,
    pricing: {
      countryCode,
      orderCurrency,
      launchDiscountRate,
      totalItemQuantity,
      subtotalAmount,
      totalAmount: computedAmount,
      validItems,
    },
  };
}

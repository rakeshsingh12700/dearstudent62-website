import Razorpay from "razorpay";
import { doc, getDoc } from "firebase/firestore";
import products from "../../../data/products";
import { db } from "../../../firebase/config";
import {
  calculatePrice,
  detectCountryFromRequest,
  getCurrencyOverrideFromRequest,
} from "../../../lib/pricing";

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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const keyId =
      process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    const host = String(req.headers?.host || "").trim().toLowerCase();
    const isLiveDomain = host === "dearstudent.in" || host === "www.dearstudent.in";

    if (!keyId || !keySecret) {
      return res.status(500).json({
        error:
          "Razorpay server keys are missing. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in Vercel.",
      });
    }

    if (isLiveDomain && String(keyId).startsWith("rzp_test_")) {
      return res.status(503).json({
        error: "Checkout blocked on live domain because test Razorpay key is configured.",
      });
    }

    const requestedItems = (Array.isArray(req.body?.items) ? req.body.items : [])
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

    if (requestedItems.length === 0) {
      return res.status(400).json({ error: "No valid items provided for checkout." });
    }

    const countryCode = detectCountryFromRequest(req);
    const currencyOverrideFromRequest = getCurrencyOverrideFromRequest(req);
    const currencyOverrideFromBody = String(req.body?.currencyOverride || "").trim().toUpperCase();
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
      return res.status(400).json({ error: "Could not compute prices for checkout items." });
    }

    const orderCurrency = validItems[0].currency;
    const hasMixedCurrencies = validItems.some((item) => item.currency !== orderCurrency);
    if (hasMixedCurrencies) {
      return res.status(400).json({
        error: "Mixed checkout currencies detected. Refresh and try again.",
      });
    }

    const computedAmount = validItems.reduce(
      (sum, item) => sum + Number(item.unitAmount || 0) * Number(item.quantity || 0),
      0
    );

    if (!Number.isFinite(computedAmount) || computedAmount <= 0) {
      return res.status(400).json({ error: "Invalid checkout total." });
    }

    const razorpay = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });

    const order = await razorpay.orders.create({
      amount: Math.round(computedAmount * 100),
      currency: orderCurrency,
      receipt: `receipt_${Date.now()}`,
      notes: {
        countryCode,
        pricingTier: countryCode === "IN" ? "india" : "international",
      },
    });

    return res.status(200).json({
      ...order,
      displayAmount: computedAmount,
      currency: orderCurrency,
    });
  } catch (error) {
    console.error("Razorpay order creation error:", error);
    return res.status(500).json({ error: "Order creation failed" });
  }
}

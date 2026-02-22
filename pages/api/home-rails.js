import { collection, getDocs, limit, query } from "firebase/firestore";
import { db } from "../../firebase/config";
import {
  calculatePrice,
  detectCountryFromRequest,
  getCurrencyOverrideFromRequest,
} from "../../lib/pricing";

function toSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toDateMs(rawValue) {
  if (!rawValue) return 0;
  if (typeof rawValue?.toDate === "function") {
    const converted = rawValue.toDate();
    return converted instanceof Date ? converted.getTime() : 0;
  }
  if (
    typeof rawValue === "object" &&
    rawValue !== null &&
    Number.isFinite(Number(rawValue.seconds))
  ) {
    return Number(rawValue.seconds) * 1000;
  }
  if (rawValue instanceof Date) return rawValue.getTime();
  if (typeof rawValue === "number") return Number.isFinite(rawValue) ? rawValue : 0;
  if (typeof rawValue === "string") {
    const parsed = Date.parse(rawValue);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function normalizeProduct(raw, fallbackId = "", pricingContext = {}) {
  const basePriceINR = Number(raw?.price || 0);
  const pricing = calculatePrice({
    basePriceINR,
    countryCode: pricingContext.countryCode,
    currencyOverride: pricingContext.currencyOverride,
  });

  return {
    id: String(raw?.id || fallbackId || "").trim(),
    title: String(raw?.title || "").trim() || "Worksheet",
    class: toSlug(raw?.class) || "all",
    type: toSlug(raw?.type) || "worksheet",
    storageKey: String(raw?.storageKey || "").trim(),
    imageUrl: String(raw?.imageUrl || "").trim(),
    price: pricing.amount,
    displayCurrency: pricing.currency,
    displaySymbol: pricing.symbol,
    createdAtMs: Math.max(toDateMs(raw?.createdAt), toDateMs(raw?.updatedAt)),
  };
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const countryCode = detectCountryFromRequest(req);
    const currencyOverride = getCurrencyOverrideFromRequest(req);
    const pricingContext = { countryCode, currencyOverride };

    const [productsSnapshot, purchasesSnapshot] = await Promise.all([
      getDocs(query(collection(db, "products"), limit(1000))),
      getDocs(query(collection(db, "purchases"), limit(5000))),
    ]);

    const purchaseCountByProductId = new Map();
    purchasesSnapshot.docs.forEach((docSnapshot) => {
      const raw = docSnapshot.data() || {};
      const productId = String(raw?.productId || "").trim();
      if (!productId) return;
      const quantity = Number.isFinite(Number(raw?.quantity)) && Number(raw?.quantity) > 0
        ? Number(raw.quantity)
        : 1;
      purchaseCountByProductId.set(
        productId,
        Number(purchaseCountByProductId.get(productId) || 0) + quantity
      );
    });

    const products = productsSnapshot.docs
      .map((item) => normalizeProduct(item.data(), item.id, pricingContext))
      .filter((item) => item.id);

    const popular = [...products]
      .sort((first, second) => {
        const firstCount = Number(purchaseCountByProductId.get(first.id) || 0);
        const secondCount = Number(purchaseCountByProductId.get(second.id) || 0);
        if (secondCount !== firstCount) return secondCount - firstCount;
        return String(first.title).localeCompare(String(second.title));
      })
      .slice(0, 12)
      .map((item) => ({
        ...item,
        purchaseCount: Number(purchaseCountByProductId.get(item.id) || 0),
      }));

    const recent = [...products]
      .sort((first, second) => {
        if (second.createdAtMs !== first.createdAtMs) return second.createdAtMs - first.createdAtMs;
        return String(first.title).localeCompare(String(second.title));
      })
      .slice(0, 12)
      .map((item) => ({
        ...item,
        purchaseCount: Number(purchaseCountByProductId.get(item.id) || 0),
      }));

    return res.status(200).json({ popular, recent });
  } catch (error) {
    console.error("Home rails API failed:", error);
    return res.status(500).json({ error: "Failed to load home rails" });
  }
}

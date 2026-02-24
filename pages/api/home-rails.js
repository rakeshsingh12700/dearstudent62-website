import { collection, doc, getDoc, getDocs, limit, query, setDoc } from "firebase/firestore";
import { db } from "../../firebase/config";
import {
  calculatePrice,
  detectCountryFromRequest,
  getCurrencyOverrideFromRequest,
} from "../../lib/pricing";

const CACHE_COLLECTION = "site_cache";
const CACHE_DOC_ID = "home-rails-v1";
const RAIL_SIZE = 12;
const CACHE_SIZE = 24;

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

function appendVersion(urlValue, version) {
  const raw = String(urlValue || "").trim();
  if (!raw) return "";
  const v = Number(version || 0);
  if (!Number.isFinite(v) || v <= 0) return raw;
  const [path, query = ""] = raw.split("?");
  const params = new URLSearchParams(query);
  params.set("v", String(Math.floor(v)));
  const nextQuery = params.toString();
  return nextQuery ? `${path}?${nextQuery}` : path;
}

function normalizeProduct(raw, fallbackId = "") {
  return {
    id: String(raw?.id || fallbackId || "").trim(),
    title: String(raw?.title || "").trim() || "Worksheet",
    class: toSlug(raw?.class) || "all",
    type: toSlug(raw?.type) || "worksheet",
    storageKey: String(raw?.storageKey || "").trim(),
    imageUrl: String(raw?.imageUrl || "").trim(),
    previewImageUrl: String(raw?.previewImageUrl || "").trim(),
    priceINR: Number(raw?.price || 0),
    createdAtMs: Math.max(toDateMs(raw?.createdAt), toDateMs(raw?.updatedAt)),
  };
}

function normalizeCachedItem(raw) {
  return {
    id: String(raw?.id || "").trim(),
    title: String(raw?.title || "").trim() || "Worksheet",
    class: toSlug(raw?.class) || "all",
    type: toSlug(raw?.type) || "worksheet",
    storageKey: String(raw?.storageKey || "").trim(),
    imageUrl: String(raw?.imageUrl || "").trim(),
    previewImageUrl: String(raw?.previewImageUrl || "").trim(),
    priceINR: Number(raw?.priceINR || 0),
    purchaseCount: Number(raw?.purchaseCount || 0),
    createdAtMs: Number(raw?.createdAtMs || 0),
  };
}

function applyPricing(items, pricingContext = {}) {
  return (Array.isArray(items) ? items : []).map((item) => {
    const pricing = calculatePrice({
      basePriceINR: Number(item?.priceINR || 0),
      countryCode: pricingContext.countryCode,
      currencyOverride: pricingContext.currencyOverride,
    });
    const imageVersion = Number(item?.createdAtMs || 0);
    return {
      id: item.id,
      title: item.title,
      class: item.class,
      type: item.type,
      storageKey: item.storageKey,
      imageUrl: appendVersion(item.imageUrl, imageVersion),
      previewImageUrl: appendVersion(item.previewImageUrl, imageVersion),
      price: pricing.amount,
      displayCurrency: pricing.currency,
      displaySymbol: pricing.symbol,
      purchaseCount: Number(item.purchaseCount || 0),
      createdAtMs: Number(item.createdAtMs || 0),
    };
  });
}

function buildRails(products = [], purchaseCountByProductId = new Map()) {
  const popular = [...products]
    .sort((first, second) => {
      const firstCount = Number(purchaseCountByProductId.get(first.id) || 0);
      const secondCount = Number(purchaseCountByProductId.get(second.id) || 0);
      if (secondCount !== firstCount) return secondCount - firstCount;
      return String(first.title).localeCompare(String(second.title));
    })
    .slice(0, CACHE_SIZE)
    .map((item) => ({
      ...item,
      purchaseCount: Number(purchaseCountByProductId.get(item.id) || 0),
    }));

  const recent = [...products]
    .sort((first, second) => {
      if (second.createdAtMs !== first.createdAtMs) return second.createdAtMs - first.createdAtMs;
      return String(first.title).localeCompare(String(second.title));
    })
    .slice(0, CACHE_SIZE)
    .map((item) => ({
      ...item,
      purchaseCount: Number(purchaseCountByProductId.get(item.id) || 0),
    }));

  return { popular, recent };
}

async function computeRailsFromFirestore() {
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
    .map((item) => normalizeProduct(item.data(), item.id))
    .filter((item) => item.id);

  return buildRails(products, purchaseCountByProductId);
}

async function readCachedRails() {
  const snapshot = await getDoc(doc(db, CACHE_COLLECTION, CACHE_DOC_ID));
  if (!snapshot.exists()) return null;
  const raw = snapshot.data() || {};
  const popular = Array.isArray(raw?.popular) ? raw.popular.map(normalizeCachedItem).filter((item) => item.id) : [];
  const recent = Array.isArray(raw?.recent) ? raw.recent.map(normalizeCachedItem).filter((item) => item.id) : [];
  if (popular.length === 0 && recent.length === 0) return null;
  return { popular, recent };
}

async function writeCachedRails(rails) {
  await setDoc(
    doc(db, CACHE_COLLECTION, CACHE_DOC_ID),
    {
      version: 1,
      generatedAt: new Date().toISOString(),
      generatedAtMs: Date.now(),
      popular: rails.popular,
      recent: rails.recent,
    },
    { merge: true }
  );
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    res.setHeader("Cache-Control", "public, max-age=0, s-maxage=120, stale-while-revalidate=600, must-revalidate");
    const countryCode = detectCountryFromRequest(req);
    const currencyOverride = getCurrencyOverrideFromRequest(req);
    const pricingContext = { countryCode, currencyOverride };

    let rails = await readCachedRails();
    if (!rails) {
      rails = await computeRailsFromFirestore();
      await writeCachedRails(rails).catch(() => {});
    }

    const popular = applyPricing(rails.popular, pricingContext).slice(0, RAIL_SIZE);
    const recent = applyPricing(rails.recent, pricingContext).slice(0, RAIL_SIZE);
    return res.status(200).json({ popular, recent });
  } catch (error) {
    console.error("Home rails API failed:", error);
    return res.status(500).json({ error: "Failed to load home rails" });
  }
}

import { collection, doc, getDoc, getDocs, limit, query, setDoc } from "firebase/firestore";
import { db } from "../../firebase/config";
import { getAdminDb } from "../../lib/firebaseAdmin";
import {
  calculatePrice,
  detectCountryFromRequest,
  getCurrencyOverrideFromRequest,
} from "../../lib/pricing";

const CACHE_COLLECTION = "site_cache";
const CACHE_DOC_ID = "home-rails-v1";
const CACHE_TTL_MS = 30 * 60 * 1000;
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

function resolveAssetBaseUrl() {
  const raw = String(process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL || "").trim();
  if (raw) return raw.replace(/\/+$/, "");
  return "https://cdn.dearstudent.in";
}

function toCdnAssetUrl(urlValue) {
  const raw = String(urlValue || "").trim();
  if (!raw) return "";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("/api/thumbnail")) {
    const query = raw.includes("?") ? raw.slice(raw.indexOf("?") + 1) : "";
    const params = new URLSearchParams(query);
    const key = String(params.get("key") || params.get("file") || "").trim();
    if (key) {
      return `${resolveAssetBaseUrl()}/${encodeURIComponent(key).replace(/%2F/gi, "/")}`;
    }
  }
  if (raw.startsWith("/")) return `${resolveAssetBaseUrl()}${raw}`;
  return `${resolveAssetBaseUrl()}/${raw}`;
}

function normalizeProduct(raw, fallbackId = "") {
  const purchaseCount = Number(
    raw?.purchaseCount ?? raw?.purchases ?? raw?.soldCount ?? raw?.totalSales ?? 0
  );
  return {
    id: String(raw?.id || fallbackId || "").trim(),
    title: String(raw?.title || "").trim() || "Worksheet",
    class: toSlug(raw?.class) || "all",
    subject: toSlug(raw?.subject) || "",
    type: toSlug(raw?.type) || "worksheet",
    storageKey: String(raw?.storageKey || "").trim(),
    imageUrl: toCdnAssetUrl(raw?.imageUrl),
    previewImageUrl: toCdnAssetUrl(raw?.previewImageUrl),
    priceINR: Number(raw?.price || 0),
    purchaseCount: Number.isFinite(purchaseCount) && purchaseCount > 0 ? purchaseCount : 0,
    createdAtMs: Math.max(toDateMs(raw?.createdAt), toDateMs(raw?.updatedAt)),
  };
}

function normalizeCachedItem(raw) {
  const purchaseCount = Number(
    raw?.purchaseCount ?? raw?.purchases ?? raw?.soldCount ?? raw?.totalSales ?? 0
  );
  return {
    id: String(raw?.id || "").trim(),
    title: String(raw?.title || "").trim() || "Worksheet",
    class: toSlug(raw?.class) || "all",
    subject: toSlug(raw?.subject) || "",
    type: toSlug(raw?.type) || "worksheet",
    storageKey: String(raw?.storageKey || "").trim(),
    imageUrl: toCdnAssetUrl(raw?.imageUrl),
    previewImageUrl: toCdnAssetUrl(raw?.previewImageUrl),
    priceINR: Number(raw?.priceINR || 0),
    purchaseCount: Number.isFinite(purchaseCount) && purchaseCount > 0 ? purchaseCount : 0,
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
      subject: item.subject,
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

function buildRails(products = []) {
  const popular = [...products]
    .sort((first, second) => {
      const firstCount = Number(first.purchaseCount || 0);
      const secondCount = Number(second.purchaseCount || 0);
      if (secondCount !== firstCount) return secondCount - firstCount;
      return String(first.title).localeCompare(String(second.title));
    })
    .slice(0, CACHE_SIZE);

  const recent = [...products]
    .sort((first, second) => {
      if (second.createdAtMs !== first.createdAtMs) return second.createdAtMs - first.createdAtMs;
      return String(first.title).localeCompare(String(second.title));
    })
    .slice(0, CACHE_SIZE);

  return { popular, recent };
}

async function computeRailsFromFirestore() {
  const adminDb = getAdminDb();
  if (adminDb) {
    const productsSnapshot = await adminDb.collection("products").limit(1000).get();
    const products = productsSnapshot.docs
      .map((item) => normalizeProduct(item.data(), item.id))
      .filter((item) => item.id);

    return buildRails(products);
  }

  const productsSnapshot = await getDocs(query(collection(db, "products"), limit(1000)));
  const products = productsSnapshot.docs
    .map((item) => normalizeProduct(item.data(), item.id))
    .filter((item) => item.id);

  return buildRails(products);
}

async function readCachedRails() {
  const adminDb = getAdminDb();
  if (adminDb) {
    try {
      const snapshot = await adminDb.collection(CACHE_COLLECTION).doc(CACHE_DOC_ID).get();
      if (!snapshot.exists) return null;
      const raw = snapshot.data() || {};
      const popular = Array.isArray(raw?.popular) ? raw.popular.map(normalizeCachedItem).filter((item) => item.id) : [];
      const recent = Array.isArray(raw?.recent) ? raw.recent.map(normalizeCachedItem).filter((item) => item.id) : [];
      if (popular.length === 0 && recent.length === 0) return null;
      return {
        popular,
        recent,
        generatedAtMs: Number(raw?.generatedAtMs || 0),
      };
    } catch {
      return null;
    }
  }

  try {
    const snapshot = await getDoc(doc(db, CACHE_COLLECTION, CACHE_DOC_ID));
    if (!snapshot.exists()) return null;
    const raw = snapshot.data() || {};
    const popular = Array.isArray(raw?.popular) ? raw.popular.map(normalizeCachedItem).filter((item) => item.id) : [];
    const recent = Array.isArray(raw?.recent) ? raw.recent.map(normalizeCachedItem).filter((item) => item.id) : [];
    if (popular.length === 0 && recent.length === 0) return null;
    return {
      popular,
      recent,
      generatedAtMs: Number(raw?.generatedAtMs || 0),
    };
  } catch {
    return null;
  }
}

async function writeCachedRails(rails) {
  const adminDb = getAdminDb();
  if (adminDb) {
    await adminDb.collection(CACHE_COLLECTION).doc(CACHE_DOC_ID).set(
      {
        version: 1,
        generatedAt: new Date().toISOString(),
        generatedAtMs: Date.now(),
        popular: rails.popular,
        recent: rails.recent,
      },
      { merge: true }
    );
    return;
  }

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
    res.setHeader("Cache-Control", "public, max-age=0, s-maxage=900, stale-while-revalidate=3600, must-revalidate");
    const countryCode = detectCountryFromRequest(req);
    const currencyOverride = getCurrencyOverrideFromRequest(req);
    const pricingContext = { countryCode, currencyOverride };

    const cachedRails = await readCachedRails();
    let rails = cachedRails
      ? { popular: cachedRails.popular, recent: cachedRails.recent }
      : null;

    const cacheAgeMs = Number.isFinite(Number(cachedRails?.generatedAtMs))
      ? Math.max(0, Date.now() - Number(cachedRails.generatedAtMs || 0))
      : Number.POSITIVE_INFINITY;
    const shouldRefresh = !rails || cacheAgeMs > CACHE_TTL_MS;

    if (shouldRefresh) {
      try {
        const freshRails = await computeRailsFromFirestore();
        rails = freshRails;
        await writeCachedRails(freshRails).catch(() => {});
      } catch (error) {
        if (!rails) throw error;
      }
    }

    const popular = applyPricing(rails.popular, pricingContext).slice(0, RAIL_SIZE);
    const recent = applyPricing(rails.recent, pricingContext).slice(0, RAIL_SIZE);
    return res.status(200).json({ popular, recent });
  } catch (error) {
    console.error("Home rails API failed:", error);
    return res.status(500).json({ error: "Failed to load home rails" });
  }
}

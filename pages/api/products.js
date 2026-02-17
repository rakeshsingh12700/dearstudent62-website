import { collection, doc, getDoc, getDocs, limit, query } from "firebase/firestore";
import { db } from "../../firebase/config";
import { normalizeRatingStats } from "../../lib/productRatings";
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

function mergeRatingStats(rawProduct, rawStats) {
  const fromStats = normalizeRatingStats(rawStats || {});
  if (fromStats.ratingCount > 0) return fromStats;
  return normalizeRatingStats(rawProduct || {});
}

function normalizeProduct(raw, fallbackId = "", rawStats = null, pricingContext = {}) {
  const id = String(raw?.id || fallbackId || "").trim();
  const storageKey = String(raw?.storageKey || "").trim();
  const imageUrl = String(raw?.imageUrl || "").trim();
  const previewImageUrl = String(raw?.previewImageUrl || "").trim();
  const ratingStats = mergeRatingStats(raw, rawStats);
  const basePriceINR = Number(raw?.price || 0);
  const pricing = calculatePrice({
    basePriceINR,
    countryCode: pricingContext.countryCode,
    currencyOverride: pricingContext.currencyOverride,
  });

  return {
    id,
    class: toSlug(raw?.class) || "all",
    type: toSlug(raw?.type) || "worksheet",
    subject: toSlug(raw?.subject) || "",
    topic: toSlug(raw?.topic) || "",
    subtopic: toSlug(raw?.subtopic) || "",
    title: String(raw?.title || "").trim() || "Worksheet",
    category: String(raw?.category || "").trim() || "Worksheet",
    subcategory: String(raw?.subcategory || "").trim() || String(raw?.title || "").trim(),
    price: pricing.amount,
    displayPrice: pricing.amount,
    displayCurrency: pricing.currency,
    displaySymbol: pricing.symbol,
    basePriceINR: pricing.basePriceINR,
    tieredPriceINR: pricing.tieredPriceINR,
    pricingTier: pricing.tier,
    countryCode: pricing.countryCode,
    ageLabel: String(raw?.ageLabel || "").trim(),
    hideAgeLabel: Boolean(raw?.hideAgeLabel),
    storageKey,
    imageUrl,
    previewImageUrl,
    showPreviewPage: Boolean(raw?.showPreviewPage && previewImageUrl),
    pages: Number.isFinite(Number(raw?.pages)) ? Number(raw.pages) : 1,
    averageRating: ratingStats.averageRating,
    ratingCount: ratingStats.ratingCount,
  };
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=86400");
    res.setHeader("Vary", "CF-IPCountry, X-Vercel-IP-Country, Cookie");
    const countryCode = detectCountryFromRequest(req);
    const currencyOverride = getCurrencyOverrideFromRequest(req);
    const pricingContext = { countryCode, currencyOverride };
    const id = String(req.query.id || "").trim();
    const idsRaw = String(req.query.ids || "").trim();

    if (id) {
      const [snapshot, ratingSnapshot] = await Promise.all([
        getDoc(doc(db, "products", id)),
        getDoc(doc(db, "product_rating_stats", id)),
      ]);
      if (!snapshot.exists()) {
        return res.status(404).json({ error: "Product not found" });
      }
      return res.status(200).json({
        product: normalizeProduct(
          snapshot.data(),
          snapshot.id,
          ratingSnapshot.exists() ? ratingSnapshot.data() : null,
          pricingContext
        ),
      });
    }

    if (idsRaw) {
      const ids = idsRaw
        .split(",")
        .map((item) => String(item || "").trim())
        .filter(Boolean)
        .slice(0, 10);

      if (ids.length === 0) {
        return res.status(200).json({ products: [] });
      }

      const snapshots = await Promise.all(
        ids.map(async (productId) => {
          const [snap, ratingSnap] = await Promise.all([
            getDoc(doc(db, "products", productId)),
            getDoc(doc(db, "product_rating_stats", productId)),
          ]);
          return snap.exists()
            ? normalizeProduct(
                snap.data(),
                snap.id,
                ratingSnap.exists() ? ratingSnap.data() : null,
                pricingContext
              )
            : null;
        })
      );

      return res.status(200).json({ products: snapshots.filter(Boolean) });
    }

    const [snapshot, ratingsSnapshot] = await Promise.all([
      getDocs(query(collection(db, "products"), limit(1000))),
      getDocs(query(collection(db, "product_rating_stats"), limit(2000))),
    ]);
    const ratingStatsByProductId = new Map(
      ratingsSnapshot.docs.map((ratingDoc) => [ratingDoc.id, ratingDoc.data()])
    );
    const products = snapshot.docs
      .map((item) =>
        normalizeProduct(item.data(), item.id, ratingStatsByProductId.get(item.id), pricingContext)
      )
      .filter((item) => item.id && item.storageKey);

    return res.status(200).json({ products });
  } catch (error) {
    console.error("Products API failed:", error);
    return res.status(500).json({ error: "Failed to load products" });
  }
}

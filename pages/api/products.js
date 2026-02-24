import { HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { collection, deleteDoc, doc, getDoc, getDocs, limit, query } from "firebase/firestore";
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

function toDateMs(rawValue) {
  if (!rawValue) return 0;
  if (typeof rawValue?.toDate === "function") {
    const converted = rawValue.toDate();
    return converted instanceof Date ? converted.getTime() : 0;
  }
  if (
    typeof rawValue === "object"
    && rawValue !== null
    && Number.isFinite(Number(rawValue.seconds))
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

function mergeRatingStats(rawProduct, rawStats) {
  const fromStats = normalizeRatingStats(rawStats || {});
  if (fromStats.ratingCount > 0) return fromStats;
  return normalizeRatingStats(rawProduct || {});
}

function normalizeProduct(raw, fallbackId = "", rawStats = null, pricingContext = {}) {
  const id = String(raw?.id || fallbackId || "").trim();
  const storageKey = String(raw?.storageKey || "").trim();
  const imageUrl = String(raw?.imageUrl || "").trim();
  const imageOriginalUrl = String(raw?.imageOriginalUrl || "").trim();
  const previewImageUrl = String(raw?.previewImageUrl || "").trim();
  const previewImageOriginalUrl = String(raw?.previewImageOriginalUrl || "").trim();
  const imageVersion = Math.max(toDateMs(raw?.updatedAt), toDateMs(raw?.createdAt), 0);
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
    imageUrl: appendVersion(imageUrl, imageVersion),
    imageOriginalUrl: appendVersion(imageOriginalUrl, imageVersion),
    previewImageUrl: appendVersion(previewImageUrl, imageVersion),
    previewImageOriginalUrl: appendVersion(previewImageOriginalUrl, imageVersion),
    showPreviewPage: Boolean(raw?.showPreviewPage),
    pages: Number.isFinite(Number(raw?.pages)) ? Number(raw.pages) : 1,
    averageRating: ratingStats.averageRating,
    ratingCount: ratingStats.ratingCount,
  };
}

function getR2Client() {
  const accountId = String(process.env.R2_ACCOUNT_ID || "").trim();
  const accessKeyId = String(process.env.R2_ACCESS_KEY_ID || "").trim();
  const secretAccessKey = String(process.env.R2_SECRET_ACCESS_KEY || "").trim();

  if (!accountId || !accessKeyId || !secretAccessKey) return null;

  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

async function r2ObjectExists(r2Client, bucket, key) {
  if (!r2Client || !bucket || !key) return true;
  try {
    await r2Client.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    );
    return true;
  } catch (error) {
    const code = String(error?.name || error?.Code || "");
    if (code === "NotFound" || code === "NoSuchKey") return false;
    throw error;
  }
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    res.setHeader("Cache-Control", "public, max-age=0, s-maxage=300, stale-while-revalidate=1800, must-revalidate");
    res.setHeader("Vary", "CF-IPCountry, X-Vercel-IP-Country, Cookie");
    const countryCode = detectCountryFromRequest(req);
    const currencyOverride = getCurrencyOverrideFromRequest(req);
    const pricingContext = { countryCode, currencyOverride };
    const r2Client = getR2Client();
    const bucket = String(process.env.R2_BUCKET_NAME || "").trim();
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
      const raw = snapshot.data();
      const exists = await r2ObjectExists(r2Client, bucket, String(raw?.storageKey || "").trim());
      if (!exists) {
        await deleteDoc(doc(db, "products", snapshot.id)).catch(() => {});
        return res.status(404).json({ error: "Product not found" });
      }
      return res.status(200).json({
        product: normalizeProduct(
          raw,
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
          if (!snap.exists()) return null;
          const raw = snap.data();
          const exists = await r2ObjectExists(r2Client, bucket, String(raw?.storageKey || "").trim());
          if (!exists) {
            await deleteDoc(doc(db, "products", snap.id)).catch(() => {});
            return null;
          }
          return normalizeProduct(
            raw,
            snap.id,
            ratingSnap.exists() ? ratingSnap.data() : null,
            pricingContext
          );
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
    const checkedProducts = await Promise.all(
      snapshot.docs.map(async (item) => {
        const raw = item.data();
        const storageKey = String(raw?.storageKey || "").trim();
        const exists = await r2ObjectExists(r2Client, bucket, storageKey);
        if (!exists) {
          await deleteDoc(doc(db, "products", item.id)).catch(() => {});
          return null;
        }
        return normalizeProduct(raw, item.id, ratingStatsByProductId.get(item.id), pricingContext);
      })
    );
    const products = checkedProducts.filter((item) => item && item.id && item.storageKey);

    return res.status(200).json({ products });
  } catch (error) {
    console.error("Products API failed:", error);
    return res.status(500).json({ error: "Failed to load products" });
  }
}

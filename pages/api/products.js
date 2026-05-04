import { HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { collection, deleteDoc, doc, getDoc, getDocs, limit, query, where } from "firebase/firestore";
import staticProducts from "../../data/products";
import { db } from "../../firebase/config";
import { getAdminDb } from "../../lib/firebaseAdmin";
import { normalizeRatingStats } from "../../lib/productRatings";
import { resolveAssetUrl } from "../../lib/publicAssetUrls";
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
  const fromProduct = normalizeRatingStats(rawProduct || {});

  if (fromStats.ratingCount <= 0) return fromProduct;
  if (fromProduct.ratingCount <= 0) return fromStats;

  const totalCount = fromProduct.ratingCount + fromStats.ratingCount;
  const weightedAverage = totalCount > 0
    ? Number(
        (
          (fromProduct.averageRating * fromProduct.ratingCount
            + fromStats.averageRating * fromStats.ratingCount)
          / totalCount
        ).toFixed(2)
      )
    : 0;

  return normalizeRatingStats({
    averageRating: weightedAverage,
    ratingCount: totalCount,
  });
}

function parsePositiveQuantity(rawValue, fallback = 1) {
  const parsed = Number(rawValue);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return fallback;
}

function incrementPurchaseCount(map, productId, quantity = 1) {
  const normalizedProductId = String(productId || "").trim();
  if (!normalizedProductId) return;
  map.set(
    normalizedProductId,
    Number(map.get(normalizedProductId) || 0) + parsePositiveQuantity(quantity, 1)
  );
}

function accumulatePurchaseCounts(rawPurchase = {}, purchaseCountByProductId = new Map()) {
  const primaryProductId = String(rawPurchase?.productId || rawPurchase?.id || "").trim();
  if (primaryProductId) {
    incrementPurchaseCount(purchaseCountByProductId, primaryProductId, rawPurchase?.quantity);
  }

  const orderItems = Array.isArray(rawPurchase?.items)
    ? rawPurchase.items
    : Array.isArray(rawPurchase?.products)
      ? rawPurchase.products
      : [];

  orderItems.forEach((item) => {
    incrementPurchaseCount(
      purchaseCountByProductId,
      item?.productId || item?.id,
      item?.quantity
    );
  });
}

function computeRatingStatsFromFeedbackDocs(docs = []) {
  const ratings = docs
    .map((item) => Number(item.data()?.rating || 0))
    .filter((value) => Number.isFinite(value) && value >= 1 && value <= 5);
  const ratingCount = ratings.length;
  if (ratingCount === 0) return normalizeRatingStats({});
  const averageRating = Number(
    (ratings.reduce((sum, value) => sum + value, 0) / ratingCount).toFixed(2)
  );
  return normalizeRatingStats({ averageRating, ratingCount });
}

async function getFeedbackRatingStats(productId) {
  const normalizedProductId = String(productId || "").trim();
  if (!normalizedProductId) return normalizeRatingStats({});

  const feedbackSnapshot = await getDocs(
    query(collection(db, "product_feedback"), where("productId", "==", normalizedProductId), limit(500))
  );
  return computeRatingStatsFromFeedbackDocs(feedbackSnapshot.docs);
}

async function getFeedbackRatingStatsMap() {
  const feedbackSnapshot = await getDocs(query(collection(db, "product_feedback"), limit(5000)));
  const docsByProductId = new Map();
  feedbackSnapshot.docs.forEach((feedbackDoc) => {
    const productId = String(feedbackDoc.data()?.productId || "").trim();
    if (!productId) return;
    const docs = docsByProductId.get(productId) || [];
    docs.push(feedbackDoc);
    docsByProductId.set(productId, docs);
  });

  return new Map(
    Array.from(docsByProductId.entries()).map(([productId, docs]) => [
      productId,
      computeRatingStatsFromFeedbackDocs(docs),
    ])
  );
}

function normalizeProduct(
  raw,
  fallbackId = "",
  rawStats = null,
  pricingContext = {},
  purchaseCountByProductId = new Map()
) {
  const id = String(raw?.id || fallbackId || "").trim();
  const normalizedType = toSlug(raw?.type) || "worksheet";
  const normalizedSubject = toSlug(raw?.subject) || "";
  const storageKey = String(raw?.storageKey || "").trim();
  const imageVersion = Math.max(toDateMs(raw?.updatedAt), toDateMs(raw?.createdAt), 0);
  const imageUrl = resolveAssetUrl(raw?.imageUrl, { version: imageVersion });
  const imageOriginalUrl = resolveAssetUrl(raw?.imageOriginalUrl, { version: imageVersion });
  const previewImageUrl = resolveAssetUrl(raw?.previewImageUrl, { version: imageVersion });
  const previewImageOriginalUrl = resolveAssetUrl(raw?.previewImageOriginalUrl, { version: imageVersion });
  const ratingStats = mergeRatingStats(raw, rawStats);
  const purchaseCount = Number(
    purchaseCountByProductId.get(id)
    ?? raw?.purchaseCount
    ?? raw?.purchases
    ?? raw?.soldCount
    ?? raw?.totalSales
    ?? 0
  );
  const basePriceINR = Number(raw?.price || 0);
  const pricing = calculatePrice({
    basePriceINR,
    countryCode: pricingContext.countryCode,
    currencyOverride: pricingContext.currencyOverride,
  });

  return {
    id,
    class: toSlug(raw?.class) || "all",
    type: normalizedType,
    subject: normalizedSubject,
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
    createdAt: toDateMs(raw?.createdAt),
    updatedAt: toDateMs(raw?.updatedAt),
    averageRating: ratingStats.averageRating,
    ratingCount: ratingStats.ratingCount,
    purchaseCount: Number.isFinite(purchaseCount) && purchaseCount > 0 ? purchaseCount : 0,
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
    forcePathStyle: true,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

function isFirestorePermissionError(error) {
  const code = String(error?.code || error?.name || "").toLowerCase();
  return code.includes("permission-denied");
}

async function getDocOrNull(docRef, { ignorePermissionError = false } = {}) {
  try {
    return await getDoc(docRef);
  } catch (error) {
    if (ignorePermissionError && isFirestorePermissionError(error)) {
      return null;
    }
    throw error;
  }
}

function getStaticProducts(pricingContext = {}) {
  if (!Array.isArray(staticProducts)) return [];
  return staticProducts
    .map((item) => normalizeProduct(item, item?.id, null, pricingContext))
    .filter((item) => item && item.id);
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
    const staticList = getStaticProducts(pricingContext);
    const staticById = new Map(staticList.map((item) => [item.id, item]));
    const purchaseCountByProductId = new Map();

    if (id) {
      let snapshot;
      let ratingSnapshot;
      try {
        [snapshot, ratingSnapshot] = await Promise.all([
          getDoc(doc(db, "products", id)),
          getDoc(doc(db, "product_rating_stats", id)),
        ]);
      } catch (error) {
        if (isFirestorePermissionError(error)) {
          const fallback = staticById.get(id);
          if (!fallback) return res.status(404).json({ error: "Product not found" });
          return res.status(200).json({ product: fallback });
        }
        throw error;
      }
      if (!snapshot.exists()) {
        return res.status(404).json({ error: "Product not found" });
      }
      const raw = snapshot.data();
      const exists = await r2ObjectExists(r2Client, bucket, String(raw?.storageKey || "").trim());
      if (!exists) {
        await deleteDoc(doc(db, "products", snapshot.id)).catch(() => {});
        return res.status(404).json({ error: "Product not found" });
      }
      const ratingStats = ratingSnapshot.exists()
        ? normalizeRatingStats(ratingSnapshot.data())
        : normalizeRatingStats({});
      const feedbackStats = ratingStats.ratingCount > 0
        ? null
        : await getFeedbackRatingStats(snapshot.id).catch(() => normalizeRatingStats({}));
      return res.status(200).json({
        product: normalizeProduct(
          raw,
          snapshot.id,
          ratingStats.ratingCount > 0 ? ratingStats : feedbackStats,
          pricingContext,
          purchaseCountByProductId
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

      let snapshots;
      try {
        snapshots = await Promise.all(
          ids.map(async (productId) => {
            const [activeSnap, archivedSnap, ratingSnap] = await Promise.all([
              getDocOrNull(doc(db, "products", productId)),
              getDocOrNull(doc(db, "archived_products", productId), {
                ignorePermissionError: true,
              }),
              getDocOrNull(doc(db, "product_rating_stats", productId), {
                ignorePermissionError: true,
              }),
            ]);

            let raw = null;
            let effectiveId = productId;
            if (activeSnap?.exists()) {
              raw = activeSnap.data();
              effectiveId = activeSnap.id;
            } else if (archivedSnap?.exists()) {
              raw = archivedSnap.data();
              effectiveId = archivedSnap.id;
            } else {
              return staticById.get(productId) || null;
            }

            const exists = await r2ObjectExists(r2Client, bucket, String(raw?.storageKey || "").trim());
            if (!exists) {
              if (activeSnap.exists()) {
                await deleteDoc(doc(db, "products", activeSnap.id)).catch(() => {});
              }
              return staticById.get(productId) || null;
            }
            const ratingStats = ratingSnap?.exists()
              ? normalizeRatingStats(ratingSnap.data())
              : normalizeRatingStats({});
            const feedbackStats = ratingStats.ratingCount > 0
              ? null
              : await getFeedbackRatingStats(effectiveId).catch(() => normalizeRatingStats({}));
            return normalizeProduct(
              raw,
              effectiveId,
              ratingStats.ratingCount > 0 ? ratingStats : feedbackStats,
              pricingContext,
              purchaseCountByProductId
            );
          })
        );
      } catch (error) {
        if (isFirestorePermissionError(error)) {
          const fallbackProducts = ids.map((productId) => staticById.get(productId)).filter(Boolean);
          return res.status(200).json({ products: fallbackProducts });
        }
        throw error;
      }

      return res.status(200).json({ products: snapshots.filter(Boolean) });
    }

    let snapshot;
    let ratingsSnapshot;
    const adminDb = getAdminDb();
    if (adminDb) {
      try {
        [snapshot, ratingsSnapshot] = await Promise.all([
          adminDb.collection("products").limit(1000).get(),
          adminDb.collection("product_rating_stats").limit(2000).get(),
        ]);
      } catch {
        snapshot = null;
        ratingsSnapshot = null;
      }
    }

    if (!snapshot || !ratingsSnapshot) {
      try {
        [snapshot, ratingsSnapshot] = await Promise.all([
          getDocs(query(collection(db, "products"), limit(1000))),
          getDocs(query(collection(db, "product_rating_stats"), limit(2000))),
        ]);
      } catch (error) {
        if (isFirestorePermissionError(error)) {
          return res.status(200).json({ products: staticList });
        }
        throw error;
      }
    }

    if (adminDb) {
      try {
        const purchasesSnapshot = await adminDb.collection("purchases").limit(5000).get();
        purchasesSnapshot.docs.forEach((docSnapshot) => {
          accumulatePurchaseCounts(docSnapshot.data() || {}, purchaseCountByProductId);
        });
      } catch {
        // Keep product-level purchase counts as fallback.
      }
    }

    if (purchaseCountByProductId.size === 0) {
      try {
        const purchasesSnapshot = await getDocs(query(collection(db, "purchases"), limit(5000)));
        purchasesSnapshot.docs.forEach((docSnapshot) => {
          accumulatePurchaseCounts(docSnapshot.data() || {}, purchaseCountByProductId);
        });
      } catch {
        // Firestore rules may block public reads to purchases.
      }
    }

    const ratingStatsByProductId = new Map(
      ratingsSnapshot.docs.map((ratingDoc) => [ratingDoc.id, ratingDoc.data()])
    );
    const feedbackStatsByProductId = await getFeedbackRatingStatsMap().catch(() => new Map());
    const checkedProducts = await Promise.all(
      snapshot.docs.map(async (item) => {
        const raw = item.data();
        const storageKey = String(raw?.storageKey || "").trim();
        const exists = await r2ObjectExists(r2Client, bucket, storageKey);
        if (!exists) {
          await deleteDoc(doc(db, "products", item.id)).catch(() => {});
          return null;
        }
        const ratingStats = normalizeRatingStats(ratingStatsByProductId.get(item.id));
        const feedbackStats = feedbackStatsByProductId.get(item.id) || normalizeRatingStats({});
        return normalizeProduct(
          raw,
          item.id,
          ratingStats.ratingCount > 0 ? ratingStats : feedbackStats,
          pricingContext,
          purchaseCountByProductId
        );
      })
    );
    const products = checkedProducts.filter((item) => item && item.id && item.storageKey);

    return res.status(200).json({ products });
  } catch (error) {
    console.error("Products API failed:", error);
    return res.status(500).json({ error: "Failed to load products" });
  }
}

import { collection, doc, getDoc, getDocs, limit, query } from "firebase/firestore";
import { db } from "../../../firebase/config";

const DEFAULT_ADMIN_EMAILS = ["rakesh12700@gmail.com"];
const REVIEW_FILTERS = new Set(["all", "with-review", "without-review"]);

function getAllowedAdminEmails() {
  const configured = String(process.env.ADMIN_ALLOWED_EMAILS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return configured.length > 0 ? configured : DEFAULT_ADMIN_EMAILS;
}

function getBearerToken(req) {
  const authHeader = String(req.headers?.authorization || "").trim();
  if (!authHeader.toLowerCase().startsWith("bearer ")) return "";
  return authHeader.slice(7).trim();
}

async function verifyFirebaseIdToken(idToken) {
  const token = String(idToken || "").trim();
  if (!token) return null;

  const apiKey = String(
    process.env.FIREBASE_API_KEY || process.env.NEXT_PUBLIC_FIREBASE_API_KEY || ""
  ).trim();
  if (!apiKey) {
    throw new Error("Missing FIREBASE_API_KEY");
  }

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: token }),
    }
  );

  if (!response.ok) return null;
  const payload = await response.json();
  const account = Array.isArray(payload?.users) ? payload.users[0] : null;
  if (!account?.email) return null;

  return {
    email: String(account.email || "").trim().toLowerCase(),
  };
}

function normalizeFetchLimit(value) {
  const parsed = Number.parseInt(String(value || "400"), 10);
  if (!Number.isFinite(parsed)) return 300;
  return Math.min(Math.max(parsed, 50), 1200);
}

function normalizeRating(value) {
  const parsed = Number.parseInt(String(value || "0"), 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 5) return 0;
  return parsed;
}

function normalizeRatingFilter(value) {
  const rating = normalizeRating(value);
  return rating >= 1 && rating <= 5 ? rating : "all";
}

function normalizeReviewFilter(value) {
  const normalized = String(value || "all").trim().toLowerCase();
  return REVIEW_FILTERS.has(normalized) ? normalized : "all";
}

function toIsoDate(value) {
  if (typeof value?.toDate === "function") {
    const date = value.toDate();
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function toDateMs(value) {
  if (typeof value?.toDate === "function") {
    const date = value.toDate();
    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 0;
  return parsed.getTime();
}

function normalizeReviewItem(raw, id) {
  const review = String(raw?.review || "").trim();
  const rating = normalizeRating(raw?.rating);
  const updatedAtMs = toDateMs(raw?.updatedAt || raw?.createdAt);

  return {
    id: String(id || "").trim(),
    productId: String(raw?.productId || "").trim(),
    userId: String(raw?.userId || "").trim(),
    email: String(raw?.email || "").trim().toLowerCase(),
    rating,
    review,
    hasReview: Boolean(review),
    updatedAt: toIsoDate(raw?.updatedAt || raw?.createdAt),
    updatedAtMs,
  };
}

async function getProductTitleMap(productIds = []) {
  if (!Array.isArray(productIds) || productIds.length === 0) return new Map();

  const entries = await Promise.all(
    productIds.map(async (productId) => {
      if (!productId) return [productId, ""];
      const snapshot = await getDoc(doc(db, "products", productId));
      if (!snapshot.exists()) return [productId, ""];

      return [productId, String(snapshot.data()?.title || "").trim()];
    })
  );

  return new Map(entries);
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const bearerToken = getBearerToken(req);
    const adminUser = await verifyFirebaseIdToken(bearerToken);
    if (!adminUser?.email) {
      return res.status(401).json({ error: "Admin login required" });
    }

    const allowedAdminEmails = getAllowedAdminEmails();
    if (allowedAdminEmails.length > 0 && !allowedAdminEmails.includes(adminUser.email)) {
      return res.status(403).json({ error: "This account is not allowed to view reviews" });
    }

    const searchQuery = String(req.query.search || "").trim().toLowerCase();
    const ratingFilter = normalizeRatingFilter(req.query.rating);
    const reviewFilter = normalizeReviewFilter(req.query.review);
    const fetchLimit = normalizeFetchLimit(req.query.limit);

    const reviewsQuery = query(collection(db, "product_feedback"), limit(fetchLimit));
    const snapshot = await getDocs(reviewsQuery);
    const rawReviews = snapshot.docs
      .map((docItem) => normalizeReviewItem(docItem.data(), docItem.id))
      .filter((item) => item.productId && item.rating >= 1 && item.rating <= 5)
      .sort((first, second) => second.updatedAtMs - first.updatedAtMs);

    const productIds = Array.from(new Set(rawReviews.map((item) => item.productId))).slice(0, 900);
    const productTitleMap = await getProductTitleMap(productIds);

    const reviews = rawReviews.map((item) => ({
      ...item,
      productTitle: productTitleMap.get(item.productId) || "",
    }));

    const filteredReviews = reviews.filter((item) => {
      if (ratingFilter !== "all" && item.rating !== ratingFilter) return false;
      if (reviewFilter === "with-review" && !item.hasReview) return false;
      if (reviewFilter === "without-review" && item.hasReview) return false;
      if (!searchQuery) return true;

      const haystack = [
        item.productId,
        item.productTitle,
        item.email,
        item.userId,
        item.review,
      ]
        .map((value) => String(value || "").toLowerCase())
        .join(" ");

      return haystack.includes(searchQuery);
    });

    const summary = reviews.reduce(
      (acc, item) => {
        acc.total += 1;
        acc.byRating[item.rating] += 1;
        if (item.hasReview) acc.withReview += 1;
        else acc.withoutReview += 1;
        return acc;
      },
      {
        total: 0,
        withReview: 0,
        withoutReview: 0,
        byRating: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      }
    );

    return res.status(200).json({
      ok: true,
      reviews: filteredReviews,
      summary,
    });
  } catch (error) {
    console.error("Admin reviews failed:", error);
    return res.status(500).json({ error: "Failed to load reviews" });
  }
}

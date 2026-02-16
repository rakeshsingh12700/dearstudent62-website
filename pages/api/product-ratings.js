import { collection, doc, getDoc, getDocs, query, setDoc, where, limit } from "firebase/firestore";
import { db } from "../../firebase/config";
import { normalizeRatingStats, normalizeRatingValue } from "../../lib/productRatings";

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
  if (!account?.email || !account?.localId) return null;

  return {
    uid: String(account.localId || "").trim(),
    email: String(account.email || "").trim().toLowerCase(),
  };
}

function sanitizeProductId(value) {
  return String(value || "").trim();
}

function sanitizeProductIds(value) {
  const raw = String(value || "").trim();
  if (!raw) return [];

  const uniqueIds = new Set(
    raw
      .split(",")
      .map((item) => sanitizeProductId(item))
      .filter(Boolean)
  );

  return Array.from(uniqueIds).slice(0, 120);
}

function sanitizeReview(value) {
  return String(value || "").trim().slice(0, 1200);
}

function sanitizeDisplayName(value) {
  return String(value || "").trim().slice(0, 120);
}

function sanitizeRating(value) {
  const parsed = Number.parseInt(String(value || 0), 10);
  if (!Number.isFinite(parsed)) return 0;
  if (parsed < 1 || parsed > 5) return 0;
  return parsed;
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

function normalizeUserRating(raw, fallbackId = "") {
  const rating = sanitizeRating(raw?.rating);
  return {
    id: String(fallbackId || "").trim(),
    rating,
    review: String(raw?.review || "").trim(),
    updatedAt: toIsoDate(raw?.updatedAt || raw?.createdAt),
  };
}

async function getUserFeedback({ uid, productId }) {
  if (!uid || !productId) return null;

  const feedbackRef = doc(db, "product_feedback", `${uid}_${productId}`);
  const snapshot = await getDoc(feedbackRef);
  if (!snapshot.exists()) return null;
  return normalizeUserRating(snapshot.data(), snapshot.id);
}

async function getUserFeedbackForProducts({ uid, productIds }) {
  if (!uid || !Array.isArray(productIds) || productIds.length === 0) return {};

  const entries = await Promise.all(
    productIds.map(async (productId) => {
      const feedbackRef = doc(db, "product_feedback", `${uid}_${productId}`);
      const snapshot = await getDoc(feedbackRef);
      return [productId, snapshot.exists() ? normalizeUserRating(snapshot.data(), snapshot.id) : null];
    })
  );

  return Object.fromEntries(entries);
}

async function getStatsForProduct(productId) {
  if (!productId) return normalizeRatingStats({});

  const statsRef = doc(db, "product_rating_stats", productId);
  const snapshot = await getDoc(statsRef);
  if (!snapshot.exists()) return normalizeRatingStats({});
  return normalizeRatingStats(snapshot.data());
}

async function getStatsForProducts(productIds = []) {
  if (!Array.isArray(productIds) || productIds.length === 0) return {};

  const entries = await Promise.all(
    productIds.map(async (productId) => {
      const statsRef = doc(db, "product_rating_stats", productId);
      const snapshot = await getDoc(statsRef);
      return [
        productId,
        snapshot.exists() ? normalizeRatingStats(snapshot.data()) : normalizeRatingStats({}),
      ];
    })
  );

  return Object.fromEntries(entries);
}

async function hasPurchasedProduct({ uid, email, productId }) {
  if (!productId) return false;

  if (uid) {
    const userQuery = query(
      collection(db, "purchases"),
      where("userId", "==", uid),
      where("productId", "==", productId),
      limit(1)
    );
    const userSnapshot = await getDocs(userQuery);
    if (!userSnapshot.empty) return true;
  }

  if (!email) return false;

  const emailQuery = query(
    collection(db, "purchases"),
    where("email", "==", email),
    where("productId", "==", productId),
    limit(1)
  );
  const emailSnapshot = await getDocs(emailQuery);
  return !emailSnapshot.empty;
}

async function recomputeAndSaveProductStats(productId) {
  const feedbackQuery = query(
    collection(db, "product_feedback"),
    where("productId", "==", productId)
  );
  const snapshot = await getDocs(feedbackQuery);

  const ratings = snapshot.docs
    .map((item) => sanitizeRating(item.data()?.rating))
    .filter((value) => value >= 1 && value <= 5);

  const ratingCount = ratings.length;
  const averageRating =
    ratingCount > 0
      ? Number(
          (ratings.reduce((sum, value) => sum + normalizeRatingValue(value), 0) / ratingCount).toFixed(2)
        )
      : 0;

  const stats = normalizeRatingStats({ averageRating, ratingCount });
  await setDoc(doc(db, "product_rating_stats", productId), {
    productId,
    averageRating: stats.averageRating,
    ratingCount: stats.ratingCount,
    updatedAt: new Date(),
  });

  return stats;
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const bearerToken = getBearerToken(req);
    const authUser = await verifyFirebaseIdToken(bearerToken);

    if (req.method === "GET") {
      const productIds = sanitizeProductIds(req.query.ids);
      const productId = sanitizeProductId(req.query.productId);

      if (productIds.length > 0) {
        const [statsByProductId, userRatingsByProductId] = await Promise.all([
          getStatsForProducts(productIds),
          authUser?.uid ? getUserFeedbackForProducts({ uid: authUser.uid, productIds }) : {},
        ]);

        return res.status(200).json({
          ok: true,
          items: productIds.map((id) => ({
            productId: id,
            stats: statsByProductId[id] || normalizeRatingStats({}),
            userRating: userRatingsByProductId[id] || null,
          })),
        });
      }

      if (!productId) {
        return res.status(400).json({ error: "productId or ids is required" });
      }

      const productSnapshot = await getDoc(doc(db, "products", productId));
      if (!productSnapshot.exists()) {
        return res.status(404).json({ error: "Product not found" });
      }

      const stats = await getStatsForProduct(productId);
      let userRating = null;
      if (authUser?.uid) {
        userRating = await getUserFeedback({
          uid: authUser.uid,
          productId,
        });
      }

      return res.status(200).json({
        ok: true,
        stats,
        userRating,
      });
    }

    const productId = sanitizeProductId(req.body?.productId);
    if (!productId) {
      return res.status(400).json({ error: "productId is required" });
    }

    const productSnapshot = await getDoc(doc(db, "products", productId));
    if (!productSnapshot.exists()) {
      return res.status(404).json({ error: "Product not found" });
    }

    if (!authUser?.uid || !authUser?.email) {
      return res.status(401).json({ error: "Login required" });
    }

    const rating = sanitizeRating(req.body?.rating);
    const review = sanitizeReview(req.body?.review);

    if (!rating) {
      return res.status(400).json({ error: "Please choose a rating between 1 and 5." });
    }

    const purchased = await hasPurchasedProduct({
      uid: authUser.uid,
      email: authUser.email,
      productId,
    });
    if (!purchased) {
      return res.status(403).json({ error: "You can rate only purchased worksheets." });
    }

    const feedbackRef = doc(db, "product_feedback", `${authUser.uid}_${productId}`);
    const existingSnapshot = await getDoc(feedbackRef);
    const existingCreatedAt = existingSnapshot.exists()
      ? existingSnapshot.data()?.createdAt || new Date()
      : new Date();

    const displayName = sanitizeDisplayName(req.body?.displayName);

    await setDoc(feedbackRef, {
      productId,
      userId: authUser.uid,
      email: authUser.email,
      ...(displayName ? { displayName } : {}),
      rating,
      review,
      createdAt: existingCreatedAt,
      updatedAt: new Date(),
    });

    const stats = await recomputeAndSaveProductStats(productId);
    const userRating = normalizeUserRating(
      {
        rating,
        review,
        updatedAt: new Date(),
      },
      `${authUser.uid}_${productId}`
    );

    return res.status(200).json({
      ok: true,
      stats,
      userRating,
    });
  } catch (error) {
    console.error("Product ratings API failed:", error);
    return res.status(500).json({ error: "Failed to process rating request" });
  }
}

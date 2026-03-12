import nextEnv from "@next/env";
import { initializeApp } from "firebase/app";
import { collection, doc, getDocs, limit, query, setDoc } from "firebase/firestore";
import { getFirestore } from "firebase/firestore";

const ROOT_DIR = process.cwd();
const { loadEnvConfig } = nextEnv;
loadEnvConfig(ROOT_DIR);

const CACHE_COLLECTION = "site_cache";
const CACHE_DOC_ID = "home-rails-v1";
const CACHE_SIZE = 24;

function requireEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

const firebaseConfig = {
  apiKey: requireEnv("NEXT_PUBLIC_FIREBASE_API_KEY"),
  authDomain: requireEnv("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"),
  projectId: requireEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID"),
  storageBucket: requireEnv("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET"),
  messagingSenderId: requireEnv("NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"),
  appId: requireEnv("NEXT_PUBLIC_FIREBASE_APP_ID"),
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

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

function normalizeProduct(raw, fallbackId = "") {
  const purchaseCount = Number(
    raw?.purchaseCount ?? raw?.purchases ?? raw?.soldCount ?? raw?.totalSales ?? 0
  );
  return {
    id: String(raw?.id || fallbackId || "").trim(),
    title: String(raw?.title || "").trim() || "Worksheet",
    class: toSlug(raw?.class) || "all",
    type: toSlug(raw?.type) || "worksheet",
    storageKey: String(raw?.storageKey || "").trim(),
    imageUrl: String(raw?.imageUrl || "").trim(),
    previewImageUrl: String(raw?.previewImageUrl || "").trim(),
    priceINR: Number(raw?.price || 0),
    purchaseCount: Number.isFinite(purchaseCount) && purchaseCount > 0 ? purchaseCount : 0,
    createdAtMs: Math.max(toDateMs(raw?.createdAt), toDateMs(raw?.updatedAt)),
  };
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

function buildRails(products = [], purchaseCountByProductId = new Map()) {
  const popular = [...products]
    .sort((first, second) => {
      const firstCount = Number(
        purchaseCountByProductId.get(first.id) ?? first.purchaseCount ?? 0
      );
      const secondCount = Number(
        purchaseCountByProductId.get(second.id) ?? second.purchaseCount ?? 0
      );
      if (secondCount !== firstCount) return secondCount - firstCount;
      return String(first.title).localeCompare(String(second.title));
    })
    .slice(0, CACHE_SIZE)
    .map((item) => ({
      ...item,
      purchaseCount: Number(
        purchaseCountByProductId.get(item.id) ?? item.purchaseCount ?? 0
      ),
    }));

  const recent = [...products]
    .sort((first, second) => {
      if (second.createdAtMs !== first.createdAtMs) return second.createdAtMs - first.createdAtMs;
      return String(first.title).localeCompare(String(second.title));
    })
    .slice(0, CACHE_SIZE)
    .map((item) => ({
      ...item,
      purchaseCount: Number(
        purchaseCountByProductId.get(item.id) ?? item.purchaseCount ?? 0
      ),
    }));

  return { popular, recent };
}

async function main() {
  const productsSnapshot = await getDocs(query(collection(db, "products"), limit(1000)));

  const purchaseCountByProductId = new Map();
  try {
    const purchasesSnapshot = await getDocs(query(collection(db, "purchases"), limit(5000)));
    purchasesSnapshot.docs.forEach((docSnapshot) => {
      const raw = docSnapshot.data() || {};
      accumulatePurchaseCounts(raw, purchaseCountByProductId);
    });
  } catch {
    // Firestore rules may block reads; keep product-level sale counts as fallback.
  }

  const products = productsSnapshot.docs
    .map((item) => normalizeProduct(item.data(), item.id))
    .filter((item) => item.id);

  const rails = buildRails(products, purchaseCountByProductId);
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

  console.log(
    `Refreshed home rails cache: popular=${rails.popular.length}, recent=${rails.recent.length}`
  );
}

main().catch((error) => {
  console.error("Failed to refresh home rails cache:", error);
  process.exitCode = 1;
});

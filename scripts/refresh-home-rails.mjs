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

async function main() {
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

import nextEnv from "@next/env";
import { cert, getApp, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const ROOT_DIR = process.cwd();
const { loadEnvConfig } = nextEnv;
loadEnvConfig(ROOT_DIR);

const CACHE_COLLECTION = "site_cache";
const CACHE_DOC_ID = "home-rails-v1";
const CACHE_SIZE = 24;

function normalizePrivateKey(rawValue) {
  return String(rawValue || "")
    .trim()
    .replace(/\\n/g, "\n");
}

function parseServiceAccountFromEnv() {
  const raw = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "").trim();
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      const projectId = String(parsed?.project_id || parsed?.projectId || "").trim();
      const clientEmail = String(parsed?.client_email || parsed?.clientEmail || "").trim();
      const privateKey = normalizePrivateKey(parsed?.private_key || parsed?.privateKey);
      if (projectId && clientEmail && privateKey) {
        return { projectId, clientEmail, privateKey };
      }
    } catch {
      // Continue with split vars.
    }
  }

  const projectId = String(
    process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || ""
  ).trim();
  const clientEmail = String(process.env.FIREBASE_ADMIN_CLIENT_EMAIL || "").trim();
  const privateKey = normalizePrivateKey(process.env.FIREBASE_ADMIN_PRIVATE_KEY || "");

  if (!projectId || !clientEmail || !privateKey) return null;
  return { projectId, clientEmail, privateKey };
}

function getAdminDb() {
  const serviceAccount = parseServiceAccountFromEnv();
  if (!serviceAccount) {
    throw new Error("Missing Firebase admin credentials in environment");
  }

  const app = getApps().length > 0 ? getApp() : initializeApp({ credential: cert(serviceAccount) });
  return getFirestore(app);
}

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

async function main() {
  const db = getAdminDb();
  const productsSnapshot = await db.collection("products").limit(1000).get();
  const products = productsSnapshot.docs
    .map((item) => normalizeProduct(item.data(), item.id))
    .filter((item) => item.id);

  const rails = buildRails(products);
  await db.collection(CACHE_COLLECTION).doc(CACHE_DOC_ID).set(
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

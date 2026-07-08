import nextEnv from "@next/env";
import { cert, getApp, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const ROOT_DIR = process.cwd();
const { loadEnvConfig } = nextEnv;
loadEnvConfig(ROOT_DIR);

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

function parsePositiveQuantity(rawValue, fallback = 1) {
  const parsed = Number(rawValue);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return fallback;
}

function incrementCount(map, productId, quantity = 1) {
  const normalizedProductId = String(productId || "").trim();
  if (!normalizedProductId) return;
  map.set(
    normalizedProductId,
    Number(map.get(normalizedProductId) || 0) + parsePositiveQuantity(quantity, 1)
  );
}

function accumulatePurchase(rawPurchase = {}, countByProductId = new Map()) {
  const primaryProductId = String(rawPurchase?.productId || "").trim();
  if (primaryProductId) {
    incrementCount(countByProductId, primaryProductId, rawPurchase?.quantity);
  }

  const orderItems = Array.isArray(rawPurchase?.items)
    ? rawPurchase.items
    : Array.isArray(rawPurchase?.products)
      ? rawPurchase.products
      : [];

  orderItems.forEach((item) => {
    incrementCount(countByProductId, item?.productId || item?.id, item?.quantity);
  });
}

async function commitInChunks(db, writes) {
  const chunkSize = 450;
  for (let index = 0; index < writes.length; index += chunkSize) {
    const batch = db.batch();
    writes.slice(index, index + chunkSize).forEach(({ ref, data }) => {
      batch.set(ref, data, { merge: true });
    });
    await batch.commit();
  }
}

async function main() {
  const db = getAdminDb();
  const countByProductId = new Map();
  const purchasesSnapshot = await db.collection("purchases").limit(10000).get();
  purchasesSnapshot.docs.forEach((docSnapshot) => {
    accumulatePurchase(docSnapshot.data() || {}, countByProductId);
  });

  const productRefs = Array.from(countByProductId.keys()).map((productId) =>
    db.collection("products").doc(productId)
  );
  const productSnapshots = productRefs.length > 0 ? await db.getAll(...productRefs) : [];

  const writes = [];
  productSnapshots.forEach((snapshot, index) => {
    const productId = productRefs[index].id;
    const computedCount = Math.max(0, Number(countByProductId.get(productId) || 0));
    const existing = snapshot.exists ? snapshot.data() || {} : {};
    const existingCount = Math.max(
      0,
      Number(existing.purchaseCount ?? existing.purchases ?? existing.soldCount ?? existing.totalSales ?? 0)
    );
    const nextCount = Math.max(existingCount, computedCount);
    if (nextCount <= 0) return;

    writes.push({
      ref: productRefs[index],
      data: {
        purchaseCount: nextCount,
        soldCount: nextCount,
        purchaseCountBackfilledAt: FieldValue.serverTimestamp(),
      },
    });
  });

  await commitInChunks(db, writes);
  console.log(
    JSON.stringify(
      {
        ok: true,
        purchasesScanned: purchasesSnapshot.size,
        productsWithPurchases: countByProductId.size,
        productsUpdated: writes.length,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error("backfill-product-purchase-counts failed:", error?.message || error);
  process.exit(1);
});

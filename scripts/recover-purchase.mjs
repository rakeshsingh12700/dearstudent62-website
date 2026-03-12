import { cert, getApp, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

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

function argValue(name, fallback = "") {
  const direct = process.argv.find((entry) => entry.startsWith(`--${name}=`));
  if (direct) return direct.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  return fallback;
}

async function main() {
  const paymentId = String(argValue("paymentId")).trim();
  const email = String(argValue("email")).trim().toLowerCase();
  const productId = String(argValue("productId")).trim();
  const quantity = Number(argValue("quantity", "1"));
  const amount = Number(argValue("amount", "0"));
  const currency = String(argValue("currency", "INR")).trim().toUpperCase();
  const userId = String(argValue("userId")).trim() || null;
  const orderId = String(argValue("orderId")).trim() || paymentId;

  if (!paymentId || !email || !productId) {
    throw new Error(
      "Usage: node scripts/recover-purchase.mjs --paymentId <id> --email <email> --productId <id> [--quantity 1] [--amount 0] [--currency INR] [--userId uid] [--orderId id]"
    );
  }

  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("quantity must be a positive number");
  }

  const db = getAdminDb();
  const docId = `${paymentId}_${productId}`;
  const payload = {
    email,
    userId,
    productId,
    quantity,
    paymentId,
    orderId,
    paymentMethod: "manual_recovery",
    orderCurrency: currency || "INR",
    orderAmount: Number.isFinite(amount) ? amount : 0,
    couponCode: null,
    couponId: null,
    couponDiscountAmount: 0,
    purchasedAt: new Date(),
  };

  await db.collection("purchases").doc(docId).set(payload, { merge: true });
  console.log(JSON.stringify({ ok: true, docId, paymentId, email, productId }));
}

main().catch((error) => {
  console.error("recover-purchase failed:", error?.message || error);
  process.exit(1);
});

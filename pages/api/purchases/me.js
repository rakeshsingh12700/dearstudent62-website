import { collection, getDocs, limit, query, where } from "firebase/firestore";
import { db } from "../../../firebase/config";
import { getBearerToken, verifyFirebaseIdToken } from "../../../lib/adminAuth";
import { getAdminDb } from "../../../lib/firebaseAdmin";

function dedupeById(items = []) {
  const map = new Map();
  (Array.isArray(items) ? items : []).forEach((item) => {
    const id = String(item?.id || "").trim();
    if (!id) return;
    map.set(id, item);
  });
  return Array.from(map.values());
}

function toDate(value) {
  if (!value) return null;
  if (typeof value?.toDate === "function") {
    const converted = value.toDate();
    return Number.isNaN(converted?.getTime?.()) ? null : converted;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === "object") {
    const seconds = Number(value?._seconds ?? value?.seconds);
    const nanoseconds = Number(value?._nanoseconds ?? value?.nanoseconds ?? 0);
    if (Number.isFinite(seconds)) {
      const date = new Date(seconds * 1000 + Math.floor(nanoseconds / 1000000));
      if (!Number.isNaN(date.getTime())) return date;
    }
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function normalizePurchaseForClient(raw = {}) {
  const purchase = raw && typeof raw === "object" ? { ...raw } : {};
  const purchasedAtDate = toDate(purchase.purchasedAt);
  if (purchasedAtDate) {
    purchase.purchasedAt = purchasedAtDate.toISOString();
  }
  return purchase;
}

async function getWithAdminDb({ uid, email }) {
  const adminDb = getAdminDb();
  if (!adminDb) return null;

  const promises = [];
  if (uid) {
    promises.push(adminDb.collection("purchases").where("userId", "==", uid).limit(500).get());
  } else {
    promises.push(Promise.resolve({ docs: [] }));
  }
  if (email) {
    promises.push(adminDb.collection("purchases").where("email", "==", email).limit(500).get());
  } else {
    promises.push(Promise.resolve({ docs: [] }));
  }

  const [byUidSnapshot, byEmailSnapshot] = await Promise.all(promises);
  return dedupeById([
    ...byUidSnapshot.docs.map((d) => ({ id: d.id, ...d.data() })),
    ...byEmailSnapshot.docs.map((d) => ({ id: d.id, ...d.data() })),
  ]).map(normalizePurchaseForClient);
}

async function getWithClientDb({ uid, email }) {
  const promises = [];
  if (uid) {
    promises.push(
      getDocs(query(collection(db, "purchases"), where("userId", "==", uid), limit(500))).catch(
        () => ({ docs: [] })
      )
    );
  } else {
    promises.push(Promise.resolve({ docs: [] }));
  }
  if (email) {
    promises.push(
      getDocs(query(collection(db, "purchases"), where("email", "==", email), limit(500))).catch(
        () => ({ docs: [] })
      )
    );
  } else {
    promises.push(Promise.resolve({ docs: [] }));
  }

  const [byUidSnapshot, byEmailSnapshot] = await Promise.all(promises);
  return dedupeById([
    ...byUidSnapshot.docs.map((d) => ({ id: d.id, ...d.data() })),
    ...byEmailSnapshot.docs.map((d) => ({ id: d.id, ...d.data() })),
  ]).map(normalizePurchaseForClient);
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const bearerToken = getBearerToken(req);
    const authUser = await verifyFirebaseIdToken(bearerToken);
    if (!authUser?.email) {
      return res.status(401).json({ error: "Login required" });
    }

    const uid = String(authUser?.uid || "").trim();
    const email = String(authUser?.email || "").trim().toLowerCase();
    const purchases = (await getWithAdminDb({ uid, email })) || (await getWithClientDb({ uid, email }));

    return res.status(200).json({
      ok: true,
      purchases,
      count: purchases.length,
    });
  } catch (error) {
    console.error("Fetch my purchases failed:", error);
    return res.status(500).json({ error: "Failed to fetch purchases" });
  }
}

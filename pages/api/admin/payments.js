import { collection, getDocs, limit, orderBy, query } from "firebase/firestore";
import { db } from "../../../firebase/config";

const DEFAULT_ADMIN_EMAILS = ["rakesh12700@gmail.com"];

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

function normalizeLimit(value) {
  const parsed = Number.parseInt(String(value || "300"), 10);
  if (!Number.isFinite(parsed)) return 300;
  return Math.min(Math.max(parsed, 50), 1000);
}

function toIsoDate(value) {
  if (typeof value?.toDate === "function") {
    const date = value.toDate();
    return Number.isNaN(date.getTime()) ? "" : date.toISOString();
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
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

function normalizeStatus(value) {
  const status = String(value || "").trim().toLowerCase();
  if (!status) return "unknown";
  return status;
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
      return res.status(403).json({ error: "This account is not allowed to view payments" });
    }

    const fetchLimit = normalizeLimit(req.query.limit);

    const [reconciliationSnapshot, webhookSnapshot] = await Promise.all([
      getDocs(
        query(
          collection(db, "razorpay_reconciliation"),
          orderBy("lastUpdatedAt", "desc"),
          limit(fetchLimit)
        )
      ),
      getDocs(
        query(
          collection(db, "razorpay_webhook_events"),
          orderBy("receivedAt", "desc"),
          limit(Math.min(fetchLimit * 3, 2000))
        )
      ),
    ]);

    const webhookEvents = webhookSnapshot.docs.map((docItem) => {
      const raw = docItem.data() || {};
      const paymentId = String(raw?.paymentId || "").trim();
      const orderId = String(raw?.orderId || "").trim();
      const status = normalizeStatus(raw?.status);
      const receivedAt = toIsoDate(raw?.receivedAt);
      return {
        id: docItem.id,
        event: String(raw?.event || "").trim() || "unknown",
        paymentId,
        orderId,
        status,
        amount: Number(raw?.amount || 0),
        currency: String(raw?.currency || "").trim().toUpperCase(),
        receivedAt,
        receivedAtMs: toDateMs(raw?.receivedAt),
        key: paymentId || orderId || docItem.id,
      };
    });

    const eventsByKey = webhookEvents.reduce((acc, item) => {
      if (!acc[item.key]) acc[item.key] = [];
      acc[item.key].push(item);
      return acc;
    }, {});

    const reconciliationRows = reconciliationSnapshot.docs.map((docItem) => {
      const raw = docItem.data() || {};
      const paymentId = String(raw?.paymentId || "").trim();
      const orderId = String(raw?.orderId || "").trim();
      const key = paymentId || orderId || docItem.id;
      const relatedEvents = eventsByKey[key] || [];
      return {
        id: docItem.id,
        paymentId,
        orderId,
        amount: Number(raw?.amount || 0),
        currency: String(raw?.currency || "").trim().toUpperCase(),
        status: normalizeStatus(raw?.lastStatus),
        lastEvent: String(raw?.lastEvent || "").trim() || "unknown",
        updatedAt: toIsoDate(raw?.lastUpdatedAt),
        updatedAtMs: toDateMs(raw?.lastUpdatedAt),
        eventCount: relatedEvents.length,
      };
    });

    const summary = reconciliationRows.reduce(
      (acc, item) => {
        acc.total += 1;
        if (item.status.includes("captured") || item.status.includes("paid")) {
          acc.captured += 1;
        } else if (item.status.includes("fail")) {
          acc.failed += 1;
        } else {
          acc.pending += 1;
        }
        return acc;
      },
      {
        total: 0,
        captured: 0,
        failed: 0,
        pending: 0,
      }
    );

    return res.status(200).json({
      ok: true,
      reconciliation: reconciliationRows,
      webhookEvents,
      summary: {
        ...summary,
        webhookEvents: webhookEvents.length,
      },
    });
  } catch (error) {
    console.error("Admin payments failed:", error);
    return res.status(500).json({ error: "Failed to load payment data" });
  }
}

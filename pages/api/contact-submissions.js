import { addDoc, collection } from "firebase/firestore";
import { db } from "../../firebase/config";

const ALLOWED_TOPICS = new Set([
  "general-feedback",
  "worksheet-issue",
  "payment-issue",
  "account-help",
  "other"
]);

function sanitizeField(value, maxLength = 120) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function sanitizeMessage(value, maxLength = 2400) {
  return String(value || "").trim().slice(0, maxLength);
}

function sanitizeWhatsapp(value) {
  const compact = String(value || "")
    .replace(/[^\d+]/g, "")
    .trim()
    .slice(0, 18);
  if (!compact) return "";
  if (compact.startsWith("+")) return compact;
  return compact.replace(/\+/g, "");
}

function sanitizeTopic(value) {
  const normalized = sanitizeField(value, 60).toLowerCase();
  return ALLOWED_TOPICS.has(normalized) ? normalized : "general-feedback";
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
  if (!apiKey) return null;

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: token }),
    }
  );

  if (!response.ok) return null;
  const payload = await response.json().catch(() => ({}));
  const account = Array.isArray(payload?.users) ? payload.users[0] : null;
  if (!account?.email) return null;

  return {
    email: sanitizeField(account.email, 180).toLowerCase(),
    uid: sanitizeField(account.localId, 128) || null,
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = req.body || {};
    const authUser = await verifyFirebaseIdToken(getBearerToken(req));
    const name = sanitizeField(body.name, 120);
    const email = sanitizeField(body.email, 180).toLowerCase() || String(authUser?.email || "");
    const whatsapp = sanitizeWhatsapp(body.whatsapp);
    const topic = sanitizeTopic(body.topic);
    const topicLabel = sanitizeField(body.topicLabel, 80) || "General feedback";
    const message = sanitizeMessage(body.message, 2400);

    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }
    if (!email && !whatsapp) {
      return res.status(400).json({ error: "Email or WhatsApp is required" });
    }

    const docRef = await addDoc(collection(db, "contact_submissions"), {
      name: name || null,
      email: email || null,
      userId: authUser?.uid || null,
      whatsapp: whatsapp || null,
      topic,
      topicLabel,
      message,
      status: "new",
      createdAt: new Date(),
      source: "contact-us-page"
    });

    return res.status(201).json({
      success: true,
      submissionId: docRef.id
    });
  } catch (error) {
    console.error("Contact submission failed:", error);
    return res.status(500).json({ error: "Unable to submit message right now" });
  }
}

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

function sanitizeTopic(value) {
  const normalized = sanitizeField(value, 60).toLowerCase();
  return ALLOWED_TOPICS.has(normalized) ? normalized : "general-feedback";
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = req.body || {};
    const name = sanitizeField(body.name, 120);
    const email = sanitizeField(body.email, 180).toLowerCase();
    const topic = sanitizeTopic(body.topic);
    const topicLabel = sanitizeField(body.topicLabel, 80) || "General feedback";
    const message = sanitizeMessage(body.message, 2400);

    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }

    const docRef = await addDoc(collection(db, "contact_submissions"), {
      name: name || null,
      email: email || null,
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

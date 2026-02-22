import crypto from "crypto";
import { doc, setDoc } from "firebase/firestore";
import { db } from "../../../firebase/config";

export const config = {
  api: {
    bodyParser: false,
  },
};

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function getSafeObject(value) {
  return value && typeof value === "object" ? value : {};
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const webhookSecret = String(process.env.RAZORPAY_WEBHOOK_SECRET || "").trim();
  if (!webhookSecret) {
    return res.status(500).json({ error: "Missing RAZORPAY_WEBHOOK_SECRET" });
  }

  try {
    const signature = String(req.headers["x-razorpay-signature"] || "").trim();
    if (!signature) {
      return res.status(400).json({ error: "Missing webhook signature" });
    }

    const rawBody = await readRawBody(req);
    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(rawBody)
      .digest("hex");

    if (expectedSignature !== signature) {
      return res.status(400).json({ error: "Invalid webhook signature" });
    }

    const payload = JSON.parse(rawBody.toString("utf8"));
    const eventId = String(payload?.id || "").trim() || `evt_${Date.now()}`;
    const eventType = String(payload?.event || "").trim() || "unknown";
    const entity = getSafeObject(payload?.payload?.payment?.entity);
    const orderEntity = getSafeObject(payload?.payload?.order?.entity);
    const paymentId = String(entity.id || "").trim();
    const orderId = String(entity.order_id || orderEntity.id || "").trim();

    await setDoc(
      doc(db, "razorpay_webhook_events", eventId),
      {
        id: eventId,
        event: eventType,
        paymentId,
        orderId,
        amount: Number(entity.amount || orderEntity.amount || 0),
        currency: String(entity.currency || orderEntity.currency || "").trim(),
        status: String(entity.status || orderEntity.status || "").trim(),
        payload,
        receivedAt: new Date().toISOString(),
      },
      { merge: true }
    );

    if (paymentId || orderId) {
      const reconciliationId = paymentId || orderId;
      await setDoc(
        doc(db, "razorpay_reconciliation", reconciliationId),
        {
          paymentId,
          orderId,
          lastEvent: eventType,
          lastStatus: String(entity.status || orderEntity.status || "").trim(),
          amount: Number(entity.amount || orderEntity.amount || 0),
          currency: String(entity.currency || orderEntity.currency || "").trim(),
          lastUpdatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Razorpay webhook handling failed:", error);
    return res.status(500).json({ error: "Webhook processing failed" });
  }
}

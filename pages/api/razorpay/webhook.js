import crypto from "crypto";
import { doc, setDoc } from "firebase/firestore";
import { db } from "../../../firebase/config";
import { getAdminDb } from "../../../lib/firebaseAdmin";
import { fulfillPurchaseOrder } from "../../../lib/purchaseFulfillment";

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

function parseItemsFromNote(rawItems) {
  return String(rawItems || "")
    .split("|")
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .map((part) => {
      const [productId, quantity] = part.split(":");
      const normalizedProductId = String(productId || "").trim();
      const normalizedQuantity = Number(quantity || 0);
      if (!normalizedProductId || !Number.isFinite(normalizedQuantity) || normalizedQuantity <= 0) {
        return null;
      }
      return { productId: normalizedProductId, quantity: normalizedQuantity };
    })
    .filter(Boolean)
    .slice(0, 25);
}

function normalizeAmountFromWebhook(entity = {}, orderEntity = {}) {
  const noteAmount = Number(entity?.notes?.displayAmount || orderEntity?.notes?.displayAmount || 0);
  if (Number.isFinite(noteAmount) && noteAmount > 0) {
    return noteAmount;
  }
  const smallestUnitAmount = Number(entity?.amount || orderEntity?.amount || 0);
  if (!Number.isFinite(smallestUnitAmount) || smallestUnitAmount <= 0) return 0;
  return smallestUnitAmount / 100;
}

async function upsertWithBestDb(path, data, options = { merge: true }) {
  const [collectionName, documentId] = path;
  const adminDb = getAdminDb();
  if (adminDb) {
    await adminDb.collection(collectionName).doc(documentId).set(data, options);
    return;
  }
  await setDoc(doc(db, collectionName, documentId), data, options);
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

    await upsertWithBestDb(
      ["razorpay_webhook_events", eventId],
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
      const normalizedStatus = String(entity.status || orderEntity.status || "").trim().toLowerCase();
      const eventIndicatesSuccess = eventType === "payment.captured" || eventType === "order.paid";
      const statusIndicatesSuccess = normalizedStatus === "captured" || normalizedStatus === "paid";
      const shouldAttemptFulfillment = Boolean(paymentId) && (eventIndicatesSuccess || statusIndicatesSuccess);

      let fulfillment = null;
      if (shouldAttemptFulfillment) {
        const notes = {
          ...getSafeObject(orderEntity.notes),
          ...getSafeObject(entity.notes),
        };
        const email = String(notes.buyerEmail || "").trim().toLowerCase();
        const items = parseItemsFromNote(notes.items);
        const orderCurrency = String(entity.currency || orderEntity.currency || "INR")
          .trim()
          .toUpperCase();
        const orderAmount = normalizeAmountFromWebhook(entity, orderEntity);

        if (email && items.length > 0) {
          fulfillment = await fulfillPurchaseOrder({
            email,
            userId: String(notes.buyerUserId || "").trim() || null,
            items,
            orderCurrency,
            orderAmount,
            appliedCoupon: {
              code: String(notes.couponCode || "").trim().toUpperCase() || null,
              id: String(notes.couponId || "").trim() || null,
              discountAmount: 0,
            },
            paymentId,
            orderId: orderId || paymentId,
            paymentMethod: "razorpay_webhook",
          });
        }
      }

      await upsertWithBestDb(
        ["razorpay_reconciliation", reconciliationId],
        {
          paymentId,
          orderId,
          lastEvent: eventType,
          lastStatus: String(entity.status || orderEntity.status || "").trim(),
          amount: Number(entity.amount || orderEntity.amount || 0),
          currency: String(entity.currency || orderEntity.currency || "").trim(),
          fulfillmentStatus: fulfillment?.ok ? "fulfilled" : "pending",
          fulfillmentError: fulfillment?.ok ? null : String(fulfillment?.error || ""),
          lastUpdatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      if (shouldAttemptFulfillment && fulfillment && !fulfillment.ok) {
        return res.status(500).json({ error: "Webhook purchase fulfillment failed" });
      }
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Razorpay webhook handling failed:", error);
    return res.status(500).json({ error: "Webhook processing failed" });
  }
}

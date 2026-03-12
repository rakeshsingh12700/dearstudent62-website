import { collection, getDocs, limit, query, where } from "firebase/firestore";
import { db } from "../../../firebase/config";
import { requireAdminUser } from "../../../lib/adminAuth";
import { getAdminDb } from "../../../lib/firebaseAdmin";
import { fulfillPurchaseOrder } from "../../../lib/purchaseFulfillment";

function normalizeItems(rawItems) {
  return (Array.isArray(rawItems) ? rawItems : [])
    .map((item) => ({
      productId: String(item?.productId || "").trim(),
      quantity: Number(item?.quantity || 0),
    }))
    .filter(
      (item) =>
        item.productId && Number.isFinite(item.quantity) && item.quantity > 0 && item.quantity <= 20
    )
    .slice(0, 25);
}

export default async function handler(req, res) {
  const adminAccess = await requireAdminUser(req);
  if (!adminAccess.ok) {
    return res.status(adminAccess.status).json({ error: adminAccess.error });
  }

  if (req.method === "GET") {
    try {
      const normalizedEmail = String(req.query?.email || "")
        .trim()
        .toLowerCase();
      if (!normalizedEmail) {
        return res.status(400).json({ error: "email query parameter is required" });
      }

      let purchases = [];
      const adminDb = getAdminDb();
      if (adminDb) {
        const snapshot = await adminDb
          .collection("purchases")
          .where("email", "==", normalizedEmail)
          .limit(200)
          .get();
        purchases = snapshot.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() }));
      } else {
        const snapshot = await getDocs(
          query(collection(db, "purchases"), where("email", "==", normalizedEmail), limit(200))
        );
        purchases = snapshot.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() }));
      }

      return res.status(200).json({ ok: true, count: purchases.length, purchases });
    } catch (error) {
      console.error("Admin purchase lookup failed:", error);
      return res.status(500).json({ error: "Failed to lookup purchases" });
    }
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const paymentId = String(req.body?.paymentId || "").trim();
    const email = String(req.body?.email || "")
      .trim()
      .toLowerCase();
    const orderId = String(req.body?.orderId || paymentId).trim() || paymentId;
    const orderCurrency = String(req.body?.orderCurrency || "INR")
      .trim()
      .toUpperCase();
    const orderAmount = Number(req.body?.orderAmount || 0);
    const userId = String(req.body?.userId || "").trim() || null;
    const appliedCoupon = req.body?.appliedCoupon || null;
    const items = normalizeItems(req.body?.items);

    if (!paymentId) {
      return res.status(400).json({ error: "paymentId is required" });
    }
    if (!email) {
      return res.status(400).json({ error: "email is required" });
    }
    if (items.length === 0) {
      return res.status(400).json({ error: "items are required" });
    }

    const fulfillment = await fulfillPurchaseOrder({
      email,
      userId,
      items,
      orderCurrency: orderCurrency || "INR",
      orderAmount: Number.isFinite(orderAmount) ? orderAmount : 0,
      appliedCoupon,
      paymentId,
      orderId,
      paymentMethod: "admin_recovery",
    });

    if (!fulfillment.ok) {
      return res
        .status(400)
        .json({ ok: false, error: fulfillment.error || "Purchase recovery failed" });
    }

    return res.status(200).json({
      ok: true,
      paymentId: fulfillment.paymentId,
      primaryProductId: fulfillment.primaryProductId,
      productIds: fulfillment.productIds,
      couponUsageTracked: fulfillment.couponUsageTracked,
    });
  } catch (error) {
    console.error("Admin purchase recovery failed:", error);
    return res.status(500).json({ error: "Failed to recover purchase" });
  }
}

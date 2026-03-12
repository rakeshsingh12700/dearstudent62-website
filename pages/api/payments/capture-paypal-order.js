import { capturePayPalOrder } from "../../../lib/payments/paypal";
import { fulfillPurchaseOrder } from "../../../lib/purchaseFulfillment";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const orderId = String(req.body?.orderId || "").trim();
    const payerId = String(req.body?.payerId || "").trim();
    const email = String(req.body?.email || "").trim().toLowerCase();
    const userId = String(req.body?.userId || "").trim() || null;
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const orderCurrency = String(req.body?.orderCurrency || "USD").trim().toUpperCase();
    const orderAmount = Number(req.body?.orderAmount || 0);
    const appliedCoupon = req.body?.appliedCoupon || null;

    if (!orderId) {
      return res.status(400).json({ error: "PayPal orderId is required." });
    }
    if (!payerId) {
      return res.status(400).json({ error: "PayPal payerId is required." });
    }
    if (!email) {
      return res.status(400).json({ error: "Email is required." });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Cart items are required." });
    }

    const capture = await capturePayPalOrder(orderId);
    const fulfillment = await fulfillPurchaseOrder({
      email,
      userId,
      items,
      orderCurrency,
      orderAmount,
      appliedCoupon,
      paymentId: capture.captureId,
      orderId: capture.orderId,
      paymentMethod: "paypal",
    });

    if (!fulfillment.ok) {
      return res.status(400).json({ success: false, error: fulfillment.error || "Purchase fulfillment failed" });
    }

    return res.status(200).json({
      success: true,
      token: fulfillment.token,
      paymentId: fulfillment.paymentId,
      primaryProductId: fulfillment.primaryProductId,
      productIds: fulfillment.productIds,
      couponUsageTracked: fulfillment.couponUsageTracked,
    });
  } catch (error) {
    console.error("PayPal capture error:", error);
    return res.status(500).json({ error: String(error?.message || "PayPal capture failed") });
  }
}

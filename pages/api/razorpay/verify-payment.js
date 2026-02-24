import crypto from "crypto";
import { fulfillPurchaseOrder } from "../../../lib/purchaseFulfillment";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).end();
  }

  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    email,
    userId,
    items,
    orderCurrency,
    orderAmount,
    appliedCoupon,
  } = req.body;

  const normalizedEmail = String(email || "").trim().toLowerCase();

  if (!normalizedEmail) {
    return res.status(400).json({ success: false, error: "Email is required" });
  }

  const expectedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");

  if (expectedSignature === razorpay_signature) {
    const fulfillment = await fulfillPurchaseOrder({
      email: normalizedEmail,
      userId,
      items,
      orderCurrency,
      orderAmount,
      appliedCoupon,
      paymentId: razorpay_payment_id,
      orderId: razorpay_order_id || razorpay_payment_id,
      paymentMethod: "razorpay",
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
  } else {
    return res.status(400).json({ success: false });
  }
}

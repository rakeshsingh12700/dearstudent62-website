import crypto from "crypto";
import Razorpay from "razorpay";
import { fulfillPurchaseOrder } from "../../../lib/purchaseFulfillment";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).end();
  }

  try {
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
    const keyId =
      process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    const host = String(req.headers?.host || "").trim().toLowerCase();
    const isLiveDomain = host === "dearstudent.in" || host === "www.dearstudent.in";

    if (!normalizedEmail) {
      return res.status(400).json({ success: false, error: "Email is required" });
    }
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ success: false, error: "Missing Razorpay verification fields" });
    }
    if (!keyId || !keySecret) {
      return res.status(500).json({
        success: false,
        error: "Razorpay server keys are missing. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.",
      });
    }
    if (isLiveDomain && String(keyId).startsWith("rzp_test_")) {
      return res.status(503).json({
        success: false,
        error: "Verification blocked on live domain because test Razorpay key is configured.",
      });
    }

    const expectedSignature = crypto
      .createHmac("sha256", keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (expectedSignature === razorpay_signature) {
      const razorpay = new Razorpay({
        key_id: keyId,
        key_secret: keySecret,
      });
      const [payment, order] = await Promise.all([
        razorpay.payments.fetch(razorpay_payment_id),
        razorpay.orders.fetch(razorpay_order_id),
      ]);

      if (!payment || !order) {
        return res.status(400).json({ success: false, error: "Could not verify payment/order with Razorpay." });
      }
      if (String(payment.order_id || "") !== String(razorpay_order_id)) {
        return res.status(400).json({ success: false, error: "Payment does not match order." });
      }
      if (String(payment.status || "").toLowerCase() !== "captured") {
        return res.status(400).json({
          success: false,
          error: `Payment not captured (status: ${String(payment.status || "unknown")}).`,
        });
      }

      const paymentAmountPaise = Number(payment.amount || 0);
      const orderAmountPaise = Number(order.amount || 0);
      if (!Number.isFinite(paymentAmountPaise) || paymentAmountPaise <= 0) {
        return res.status(400).json({ success: false, error: "Invalid captured payment amount." });
      }
      if (orderAmountPaise !== paymentAmountPaise) {
        return res.status(400).json({
          success: false,
          error: "Captured payment amount does not match order amount.",
        });
      }
      if (String(payment.currency || "").toUpperCase() !== String(order.currency || "").toUpperCase()) {
        return res.status(400).json({
          success: false,
          error: "Captured payment currency does not match order currency.",
        });
      }

      const trustedOrderCurrency = String(order.currency || orderCurrency || "INR").trim().toUpperCase();
      const trustedOrderAmount = paymentAmountPaise / 100;
      const fulfillment = await fulfillPurchaseOrder({
        email: normalizedEmail,
        userId,
        items,
        orderCurrency: trustedOrderCurrency,
        orderAmount: trustedOrderAmount,
        appliedCoupon,
        paymentId: razorpay_payment_id,
        orderId: razorpay_order_id || razorpay_payment_id,
        paymentMethod: "razorpay",
      });

      if (!fulfillment.ok) {
        return res
          .status(400)
          .json({ success: false, error: fulfillment.error || "Purchase fulfillment failed" });
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
  } catch (error) {
    console.error("Razorpay payment verification failed:", error);
    return res.status(500).json({ success: false, error: "Payment verification failed" });
  }
}

import Razorpay from "razorpay";
import { computeCheckoutPricing } from "../../../lib/checkoutPricing";
import { normalizeCouponCode } from "../../../lib/coupons/common";
import { validateCouponForCheckout } from "../../../lib/coupons/server";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const keyId =
      process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    const host = String(req.headers?.host || "").trim().toLowerCase();
    const isLiveDomain = host === "dearstudent.in" || host === "www.dearstudent.in";

    if (!keyId || !keySecret) {
      return res.status(500).json({
        error:
          "Razorpay server keys are missing. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in Vercel.",
      });
    }

    if (isLiveDomain && String(keyId).startsWith("rzp_test_")) {
      return res.status(503).json({
        error: "Checkout blocked on live domain because test Razorpay key is configured.",
      });
    }

    const pricingResult = await computeCheckoutPricing({
      req,
      items: req.body?.items,
      currencyOverride: req.body?.currencyOverride,
    });
    if (!pricingResult.ok) {
      return res.status(pricingResult.status || 400).json({ error: pricingResult.error });
    }
    const pricing = pricingResult.pricing;

    const couponCode = normalizeCouponCode(req.body?.couponCode || "");
    const buyerEmail = String(req.body?.email || "").trim().toLowerCase();
    const buyerUserId = String(req.body?.userId || "").trim() || null;
    let couponSummary = null;
    let finalAmount = Number(pricing.totalAmount || 0);

    if (couponCode) {
      const couponResult = await validateCouponForCheckout({
        code: couponCode,
        email: buyerEmail,
        userId: buyerUserId,
        orderAmount: pricing.totalAmount,
        currency: pricing.orderCurrency,
        pricingContext: pricing,
      });

      if (!couponResult.ok) {
        return res.status(couponResult.status || 400).json({ error: couponResult.error });
      }

      couponSummary = couponResult.couponSummary;
      finalAmount = Number(couponSummary.finalAmount || pricing.totalAmount);
    }

    if (!Number.isFinite(finalAmount) || finalAmount <= 0) {
      return res.status(400).json({ error: "Invalid final checkout total." });
    }

    const razorpay = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    });

    const order = await razorpay.orders.create({
      amount: Math.round(finalAmount * 100),
      currency: pricing.orderCurrency,
      receipt: `receipt_${Date.now()}`,
      notes: {
        countryCode: pricing.countryCode,
        pricingTier: pricing.countryCode === "IN" ? "india" : "international",
        couponCode: couponSummary?.code || "",
        couponId: couponSummary?.id || "",
      },
    });

    return res.status(200).json({
      ...order,
      displayAmount: finalAmount,
      subtotalAmount: Number(pricing.totalAmount || 0),
      couponDiscountAmount: Number(couponSummary?.discountAmount || 0),
      currency: pricing.orderCurrency,
      launchDiscountRate: pricing.launchDiscountRate,
      appliedCoupon: couponSummary,
    });
  } catch (error) {
    console.error("Razorpay order creation error:", error);
    return res.status(500).json({ error: "Order creation failed" });
  }
}

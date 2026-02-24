import { v4 as uuidv4 } from "uuid";
import { computeCheckoutPricing } from "../../../lib/checkoutPricing";
import { normalizeCouponCode } from "../../../lib/coupons/common";
import { validateCouponForCheckout } from "../../../lib/coupons/server";
import { fulfillPurchaseOrder } from "../../../lib/purchaseFulfillment";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const buyerEmail = String(req.body?.email || "").trim().toLowerCase();
    if (!buyerEmail) {
      return res.status(400).json({ error: "Email is required" });
    }

    const buyerUserId = String(req.body?.userId || "").trim() || null;
    const couponCode = normalizeCouponCode(req.body?.couponCode || "");

    const pricingResult = await computeCheckoutPricing({
      req,
      items: req.body?.items,
      currencyOverride: req.body?.currencyOverride,
    });
    if (!pricingResult.ok) {
      return res.status(pricingResult.status || 400).json({ error: pricingResult.error });
    }

    const pricing = pricingResult.pricing;
    let appliedCoupon = null;
    let finalAmount = Number(pricing.totalAmount || 0);

    if (couponCode) {
      const couponResult = await validateCouponForCheckout({
        code: couponCode,
        email: buyerEmail,
        userId: buyerUserId,
        orderAmount: pricing.totalAmount,
        currency: pricing.orderCurrency,
        pricingContext: pricing,
        allowZeroFinal: true,
      });

      if (!couponResult.ok) {
        return res.status(couponResult.status || 400).json({ error: couponResult.error });
      }

      appliedCoupon = couponResult.couponSummary;
      const couponFinalAmount = Number(appliedCoupon?.finalAmount);
      finalAmount = Number.isFinite(couponFinalAmount)
        ? couponFinalAmount
        : Number(pricing.totalAmount || 0);
    }

    if (!Number.isFinite(finalAmount) || finalAmount > 0) {
      return res.status(400).json({
        error: "This order is not free. Use regular payment checkout.",
      });
    }

    const freeOrderId = `free_${Date.now()}_${uuidv4().slice(0, 8)}`;
    const fulfillment = await fulfillPurchaseOrder({
      email: buyerEmail,
      userId: buyerUserId,
      items: pricing.validItems,
      orderCurrency: pricing.orderCurrency,
      orderAmount: finalAmount,
      appliedCoupon,
      paymentId: freeOrderId,
      orderId: freeOrderId,
      paymentMethod: "free_coupon",
    });

    if (!fulfillment.ok) {
      return res.status(400).json({
        error: fulfillment.error || "Failed to complete free order",
      });
    }

    return res.status(200).json({
      success: true,
      freeOrder: true,
      token: fulfillment.token,
      paymentId: fulfillment.paymentId,
      primaryProductId: fulfillment.primaryProductId,
      productIds: fulfillment.productIds,
      couponUsageTracked: fulfillment.couponUsageTracked,
    });
  } catch (error) {
    console.error("Free checkout completion failed:", error);
    return res.status(500).json({ error: "Failed to complete free checkout" });
  }
}

import { computeCheckoutPricing } from "../../../lib/checkoutPricing";
import { validateCouponForCheckout } from "../../../lib/coupons/server";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { code, email, userId, items, currencyOverride } = req.body || {};

    const pricingResult = await computeCheckoutPricing({
      req,
      items,
      currencyOverride,
    });

    if (!pricingResult.ok) {
      return res.status(pricingResult.status || 400).json({ error: pricingResult.error });
    }

    const pricing = pricingResult.pricing;
    const couponResult = await validateCouponForCheckout({
      code,
      email,
      userId,
      orderAmount: pricing.totalAmount,
      currency: pricing.orderCurrency,
      pricingContext: pricing,
      allowZeroFinal: true,
    });

    if (!couponResult.ok) {
      return res.status(couponResult.status || 400).json({ error: couponResult.error });
    }

    return res.status(200).json({
      ok: true,
      coupon: couponResult.couponSummary,
      pricing: {
        orderAmount: pricing.totalAmount,
        finalAmount: couponResult.couponSummary.finalAmount,
        currency: pricing.orderCurrency,
      },
    });
  } catch (error) {
    console.error("Coupon apply failed:", error);
    return res.status(500).json({ error: "Failed to apply coupon" });
  }
}

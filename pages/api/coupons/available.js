import { computeCheckoutPricing } from "../../../lib/checkoutPricing";
import { listCheckoutVisibleCoupons } from "../../../lib/coupons/server";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { email, userId, items, currencyOverride } = req.body || {};

    const pricingResult = await computeCheckoutPricing({
      req,
      items,
      currencyOverride,
    });

    if (!pricingResult.ok) {
      return res.status(pricingResult.status || 400).json({ error: pricingResult.error });
    }

    const pricing = pricingResult.pricing;
    const coupons = await listCheckoutVisibleCoupons({
      email,
      userId,
      orderAmount: pricing.totalAmount,
      currency: pricing.orderCurrency,
      pricingContext: pricing,
    });

    return res.status(200).json({
      ok: true,
      coupons,
      pricing: {
        orderAmount: pricing.totalAmount,
        currency: pricing.orderCurrency,
      },
    });
  } catch (error) {
    console.error("Available coupons fetch failed:", error);
    return res.status(500).json({ error: "Failed to load available coupons" });
  }
}

import { computeCheckoutPricing } from "../../../lib/checkoutPricing";
import { normalizeCouponCode } from "../../../lib/coupons/common";
import { validateCouponForCheckout } from "../../../lib/coupons/server";
import { createPayPalOrder, getPayPalClientId } from "../../../lib/payments/paypal";

const PAYPAL_SUPPORTED_CURRENCIES = new Set(["USD", "EUR", "GBP", "AUD", "CAD", "SGD"]);

function resolveBaseUrl(req) {
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").trim();
  const protocol = forwardedProto || "https";
  const host = String(req.headers.host || "").trim();
  if (!host) return "";
  return `${protocol}://${host}`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    if (!getPayPalClientId()) {
      return res.status(500).json({
        error: "PayPal is not configured. Missing PAYPAL_CLIENT_ID.",
      });
    }

    let pricingResult = await computeCheckoutPricing({
      req,
      items: req.body?.items,
      currencyOverride: req.body?.currencyOverride,
    });
    if (!pricingResult.ok) {
      return res.status(pricingResult.status || 400).json({ error: pricingResult.error });
    }
    let pricing = pricingResult.pricing;

    if (!PAYPAL_SUPPORTED_CURRENCIES.has(String(pricing.orderCurrency || "").toUpperCase())) {
      const usdPricingResult = await computeCheckoutPricing({
        req,
        items: req.body?.items,
        currencyOverride: "USD",
      });
      if (usdPricingResult.ok) {
        pricing = usdPricingResult.pricing;
      }
    }

    if (!PAYPAL_SUPPORTED_CURRENCIES.has(String(pricing.orderCurrency || "").toUpperCase())) {
      return res.status(400).json({
        error: "PayPal is currently unavailable for this currency. Please use Razorpay.",
      });
    }

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
        allowZeroFinal: true,
      });

      if (!couponResult.ok) {
        return res.status(couponResult.status || 400).json({ error: couponResult.error });
      }

      couponSummary = couponResult.couponSummary;
      const couponFinalAmount = Number(couponSummary?.finalAmount);
      finalAmount = Number.isFinite(couponFinalAmount)
        ? couponFinalAmount
        : Number(pricing.totalAmount || 0);
    }

    if (!Number.isFinite(finalAmount) || finalAmount <= 0) {
      return res.status(400).json({
        error: "This order is fully free. Please use Complete Free Order.",
      });
    }

    const baseUrl = resolveBaseUrl(req);
    if (!baseUrl) {
      return res.status(400).json({ error: "Unable to resolve host for PayPal redirect." });
    }

    const order = await createPayPalOrder({
      amount: finalAmount,
      currency: pricing.orderCurrency,
      returnUrl: `${baseUrl}/checkout?paypal=success`,
      cancelUrl: `${baseUrl}/checkout?paypal=cancel`,
    });

    return res.status(200).json({
      id: order.id,
      approvalUrl: order.approvalUrl,
      displayAmount: finalAmount,
      subtotalAmount: Number(pricing.totalAmount || 0),
      couponDiscountAmount: Number(couponSummary?.discountAmount || 0),
      currency: pricing.orderCurrency,
      appliedCoupon: couponSummary,
      paypalClientId: getPayPalClientId(),
    });
  } catch (error) {
    console.error("PayPal order creation error:", error);
    return res.status(500).json({ error: String(error?.message || "PayPal order creation failed") });
  }
}

import {
  detectCountryFromRequest,
  getCurrencyForCountry,
  getCurrencyOverrideFromRequest,
} from "../../lib/pricing";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const countryCode = detectCountryFromRequest(req);
    const currencyOverride = getCurrencyOverrideFromRequest(req);
    const autoCurrency = countryCode === "IN" ? "INR" : getCurrencyForCountry(countryCode);

    return res.status(200).json({
      countryCode,
      autoCurrency,
      currency: currencyOverride || autoCurrency,
      source: currencyOverride ? "cookie" : "ip",
    });
  } catch (error) {
    console.error("Pricing context API failed:", error);
    return res.status(500).json({ error: "Failed to detect pricing context" });
  }
}

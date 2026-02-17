export const PRICING_CONFIG = {
  baseCurrency: "INR",
  fallbackCountry: "IN",
  fallbackCurrency: "USD",
  internationalMultiplier: 4,
  supportedCurrencies: ["INR", "USD", "EUR", "GBP", "AED", "CAD", "AUD", "SGD"],
  // Fixed rates from INR for stable catalog pricing; update intentionally when needed.
  fxRatesFromINR: {
    INR: 1,
    USD: 0.012,
    EUR: 0.011,
    GBP: 0.0095,
    AED: 0.044,
    CAD: 0.016,
    AUD: 0.019,
    SGD: 0.016,
  },
};

export const COUNTRY_TO_CURRENCY = {
  IN: "INR",
  US: "USD",
  GB: "GBP",
  AE: "AED",
  DE: "EUR",
  FR: "EUR",
  IT: "EUR",
  ES: "EUR",
  NL: "EUR",
  IE: "EUR",
  PT: "EUR",
  BE: "EUR",
  CA: "CAD",
  AU: "AUD",
  SG: "SGD",
};

export const CURRENCY_SYMBOL = {
  INR: "₹",
  USD: "$",
  EUR: "€",
  GBP: "£",
  AED: "AED",
  CAD: "C$",
  AUD: "A$",
  SGD: "S$",
};

export const CURRENCY_LOCALE = {
  INR: "en-IN",
  USD: "en-US",
  EUR: "de-DE",
  GBP: "en-GB",
  AED: "en-AE",
  CAD: "en-CA",
  AUD: "en-AU",
  SGD: "en-SG",
};

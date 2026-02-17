import { COUNTRY_TO_CURRENCY, CURRENCY_LOCALE, CURRENCY_SYMBOL, PRICING_CONFIG } from "./config";

function normalizeCountryCode(value) {
  const normalized = String(value || "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(normalized) ? normalized : "";
}

function normalizeCurrency(value) {
  const normalized = String(value || "").trim().toUpperCase();
  return PRICING_CONFIG.supportedCurrencies.includes(normalized)
    ? normalized
    : PRICING_CONFIG.fallbackCurrency;
}

function parseCookies(cookieHeader) {
  const raw = String(cookieHeader || "");
  if (!raw) return {};

  return raw.split(";").reduce((acc, pair) => {
    const [key, ...rest] = pair.split("=");
    const normalizedKey = String(key || "").trim();
    if (!normalizedKey) return acc;
    acc[normalizedKey] = decodeURIComponent(rest.join("=") || "").trim();
    return acc;
  }, {});
}

export function detectCountryFromRequest(req) {
  const headers = req?.headers || {};
  const trustedCountryCode =
    headers["cf-ipcountry"] || headers["x-vercel-ip-country"] || headers["cloudfront-viewer-country"];

  const fallbackCountry = normalizeCountryCode(
    process.env.PRICING_FALLBACK_COUNTRY || process.env.NEXT_PUBLIC_PRICING_FALLBACK_COUNTRY
  );

  return (
    normalizeCountryCode(trustedCountryCode) ||
    fallbackCountry ||
    PRICING_CONFIG.fallbackCountry
  );
}

export function getCurrencyOverrideFromRequest(req) {
  const queryCurrency = normalizeCurrency(req?.query?.currency || "");
  if (String(req?.query?.currency || "").trim()) {
    return queryCurrency;
  }

  const cookies = parseCookies(req?.headers?.cookie);
  const cookieCurrency = String(cookies.ds_currency || "").trim();
  if (!cookieCurrency) return "";
  return normalizeCurrency(cookieCurrency);
}

export function getCurrencyForCountry(countryCode) {
  const normalizedCountry = normalizeCountryCode(countryCode);
  return COUNTRY_TO_CURRENCY[normalizedCountry] || PRICING_CONFIG.fallbackCurrency;
}

function roundPsychological(amount, currency) {
  if (!Number.isFinite(amount) || amount <= 0) return 0;

  if (currency === "INR") {
    if (amount < 50) return Math.max(1, Math.round(amount));
    const rounded = Math.round(amount / 10) * 10 - 1;
    return Math.max(1, rounded);
  }

  if (amount < 1.5) {
    return Math.max(0.99, Math.round(amount * 100) / 100);
  }

  const floorAmount = Math.floor(amount);
  return floorAmount + 0.49;
}

export function convertFromINR(amountINR, currency) {
  const safeAmount = Number(amountINR || 0);
  if (!Number.isFinite(safeAmount) || safeAmount <= 0) return 0;

  const normalizedCurrency = normalizeCurrency(currency);
  const rate =
    PRICING_CONFIG.fxRatesFromINR[normalizedCurrency] ||
    PRICING_CONFIG.fxRatesFromINR[PRICING_CONFIG.fallbackCurrency];

  return safeAmount * rate;
}

export function calculatePrice({ basePriceINR, countryCode, currencyOverride }) {
  const safeBasePriceINR = Number(basePriceINR || 0);
  const normalizedCountry = normalizeCountryCode(countryCode) || PRICING_CONFIG.fallbackCountry;
  const tier = normalizedCountry === "IN" ? "india" : "international";

  const defaultCurrency = normalizedCountry === "IN" ? "INR" : getCurrencyForCountry(normalizedCountry);
  const selectedCurrency = currencyOverride ? normalizeCurrency(currencyOverride) : defaultCurrency;

  const multiplier = tier === "india" ? 1 : PRICING_CONFIG.internationalMultiplier;
  const tieredPriceINR = safeBasePriceINR * multiplier;

  const converted =
    selectedCurrency === "INR"
      ? tieredPriceINR
      : convertFromINR(tieredPriceINR, selectedCurrency);

  const rounded = roundPsychological(converted, selectedCurrency);

  return {
    amount: Number(rounded.toFixed(selectedCurrency === "INR" ? 0 : 2)),
    currency: selectedCurrency,
    symbol: CURRENCY_SYMBOL[selectedCurrency] || selectedCurrency,
    locale: CURRENCY_LOCALE[selectedCurrency] || "en-US",
    tier,
    countryCode: normalizedCountry,
    basePriceINR: Number(safeBasePriceINR.toFixed(0)),
    tieredPriceINR: Number(tieredPriceINR.toFixed(0)),
  };
}

export function formatPrice(amount, currency) {
  const normalizedCurrency = normalizeCurrency(currency);
  const locale = CURRENCY_LOCALE[normalizedCurrency] || "en-US";
  const isINR = normalizedCurrency === "INR";

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: normalizedCurrency,
    maximumFractionDigits: isINR ? 0 : 2,
    minimumFractionDigits: isINR ? 0 : 2,
  }).format(Number(amount || 0));
}

export function getSupportedCurrencies() {
  return PRICING_CONFIG.supportedCurrencies;
}

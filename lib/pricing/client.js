import { CURRENCY_LOCALE, CURRENCY_SYMBOL, PRICING_CONFIG } from "./config";

export const CURRENCY_COOKIE_KEY = "ds_currency";

export function getPriceCurrency(product) {
  const normalized = String(product?.displayCurrency || product?.currency || "INR").toUpperCase();
  return PRICING_CONFIG.supportedCurrencies.includes(normalized) ? normalized : "INR";
}

export function getPriceAmount(product) {
  const amount = Number(product?.displayPrice ?? product?.price ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

export function formatMoney(amount, currency) {
  const normalizedCurrency = getPriceCurrency({ displayCurrency: currency });
  const locale = CURRENCY_LOCALE[normalizedCurrency] || "en-US";
  const isINR = normalizedCurrency === "INR";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: normalizedCurrency,
    maximumFractionDigits: isINR ? 0 : 2,
    minimumFractionDigits: isINR ? 0 : 2,
  }).format(Number(amount || 0));
}

export function getCurrencySymbol(currency) {
  const normalizedCurrency = getPriceCurrency({ displayCurrency: currency });
  return CURRENCY_SYMBOL[normalizedCurrency] || normalizedCurrency;
}

export function readCurrencyPreference() {
  if (typeof document === "undefined") return "";
  const cookies = document.cookie ? document.cookie.split(";") : [];

  for (const entry of cookies) {
    const [key, ...rest] = entry.split("=");
    if (String(key || "").trim() !== CURRENCY_COOKIE_KEY) continue;
    const value = decodeURIComponent(rest.join("=") || "").trim().toUpperCase();
    if (PRICING_CONFIG.supportedCurrencies.includes(value)) return value;
  }

  return "";
}

export function hasCurrencyPreference() {
  return Boolean(readCurrencyPreference());
}

export function setCurrencyPreference(currencyCode) {
  if (typeof document === "undefined") return;
  const normalized = String(currencyCode || "").trim().toUpperCase();
  if (!PRICING_CONFIG.supportedCurrencies.includes(normalized)) return;

  const maxAgeSeconds = 60 * 60 * 24 * 180;
  document.cookie = `${CURRENCY_COOKIE_KEY}=${encodeURIComponent(normalized)}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax`;
}

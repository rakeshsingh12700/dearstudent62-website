function normalizeCurrency(currency) {
  return String(currency || "INR").trim().toUpperCase() || "INR";
}

export function getLaunchDiscountRate(totalQuantity) {
  const qty = Math.max(0, Number(totalQuantity || 0));
  if (qty >= 2) return 0.2;
  if (qty >= 1) return 0.1;
  return 0;
}

export function getDiscountedUnitPrice(basePrice, currency, totalQuantity) {
  const amount = Number(basePrice || 0);
  if (!Number.isFinite(amount) || amount <= 0) return 0;

  const rate = getLaunchDiscountRate(totalQuantity);
  if (rate <= 0) return amount;

  const discounted = amount * (1 - rate);
  const normalizedCurrency = normalizeCurrency(currency);

  if (normalizedCurrency === "INR") {
    return Math.max(0, Math.round(discounted));
  }

  // Charm style endings: .09, .19, ... .99
  const snapped = Math.round((discounted + 0.01) * 10) / 10 - 0.01;
  return Number(Math.max(0.09, snapped).toFixed(2));
}

export function hasDisplayPriceChange(baseValue, discountedValue, currency) {
  const normalizedCurrency = normalizeCurrency(currency);
  if (normalizedCurrency === "INR") {
    return Math.round(Number(baseValue || 0)) !== Math.round(Number(discountedValue || 0));
  }
  return Number(baseValue || 0).toFixed(2) !== Number(discountedValue || 0).toFixed(2);
}


export function normalizeRatingValue(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(Math.max(numeric, 0), 5);
}

export function normalizeRatingCount(value) {
  const numeric = Number.parseInt(String(value || 0), 10);
  if (!Number.isFinite(numeric) || numeric < 0) return 0;
  return numeric;
}

export function normalizeRatingStats(raw) {
  const ratingCount = normalizeRatingCount(raw?.ratingCount ?? raw?.count ?? 0);
  const averageRaw = Number(raw?.averageRating ?? raw?.ratingAverage ?? raw?.avgRating ?? 0);
  const averageRating = ratingCount > 0 ? normalizeRatingValue(averageRaw) : 0;

  return {
    averageRating,
    ratingCount,
  };
}

export function hasRatings(raw) {
  return normalizeRatingStats(raw).ratingCount > 0;
}

export function formatRatingAverage(raw) {
  const stats = normalizeRatingStats(raw);
  if (stats.ratingCount <= 0) return "0.0";
  return stats.averageRating.toFixed(1);
}

export function buildRatingStars(value, maxStars = 5) {
  const starsCount = Math.max(Number.parseInt(String(maxStars || 5), 10) || 5, 1);
  const rounded = Math.round(normalizeRatingValue(value));
  return Array.from({ length: starsCount }, (_, index) =>
    index < rounded ? "★" : "☆"
  ).join("");
}

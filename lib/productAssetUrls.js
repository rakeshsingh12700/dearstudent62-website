export function getPreviewUrl(storageKey, pageCount) {
  const key = String(storageKey || "").trim();
  if (!key) return "";

  const previewUrl = `/api/preview?file=${encodeURIComponent(key)}`;
  if (!Number.isFinite(pageCount) || pageCount <= 0) return previewUrl;
  return `${previewUrl}&pages=${Math.floor(pageCount)}`;
}

export function getThumbnailKey(storageKey) {
  const key = String(storageKey || "").trim();
  if (!key) return "";
  return key.replace(/\.pdf$/i, ".jpg");
}

export function getThumbnailUrl(storageKey, imageUrl = "") {
  const explicit = String(imageUrl || "").trim();
  if (explicit) return explicit;

  const key = String(storageKey || "").trim();
  if (!key) return "";
  return `/api/thumbnail?file=${encodeURIComponent(key)}`;
}

export function getDisplayTypeLabel(type) {
  const slug = String(type || "").trim().toLowerCase();
  if (!slug) return "Worksheet";

  const map = {
    worksheet: "Worksheet",
    bundle: "Bundle",
    exams: "UnitTest",
    "unit-test": "UnitTest",
    unittest: "UnitTest",
    "half-year-exam": "HalfYear",
    "final-year-exam": "Final",
  };
  if (map[slug]) return map[slug];

  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function getDownloadUrl(storageKey, token) {
  const key = String(storageKey || "").trim();
  if (!key) return "";
  const tokenValue = String(token || "").trim();
  const tokenPart = tokenValue
    ? `&token=${encodeURIComponent(tokenValue)}`
    : "";
  return `/api/download?key=${encodeURIComponent(key)}${tokenPart}`;
}

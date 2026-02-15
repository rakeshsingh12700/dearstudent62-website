export function getPreviewUrl(storageKey, pageCount) {
  const key = String(storageKey || "").trim();
  if (!key) return "";

  const previewUrl = `/api/preview?file=${encodeURIComponent(key)}`;
  if (!Number.isFinite(pageCount) || pageCount <= 0) return previewUrl;
  return `${previewUrl}&pages=${Math.floor(pageCount)}`;
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

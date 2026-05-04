function trimTrailingSlash(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function trimLeadingSlash(value) {
  return String(value || "").trim().replace(/^\/+/, "");
}

export function getPublicAssetBaseUrl() {
  return trimTrailingSlash(process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL);
}

export function buildPublicAssetUrl(key, { version } = {}) {
  const baseUrl = getPublicAssetBaseUrl();
  const normalizedKey = trimLeadingSlash(key);
  if (!baseUrl || !normalizedKey) return "";

  const url = new URL(`${baseUrl}/${normalizedKey}`);
  const numericVersion = Number(version || 0);
  if (Number.isFinite(numericVersion) && numericVersion > 0) {
    url.searchParams.set("v", String(Math.floor(numericVersion)));
  }
  return url.toString();
}

export function resolveAssetUrl(urlValue, { version } = {}) {
  const raw = String(urlValue || "").trim();
  if (!raw) return "";

  const directFromLegacy = legacyThumbUrlToPublicUrl(raw, { version });
  if (directFromLegacy) return directFromLegacy;

  if (/^https?:\/\//i.test(raw)) {
    const url = new URL(raw);
    const numericVersion = Number(version || 0);
    if (Number.isFinite(numericVersion) && numericVersion > 0 && !url.searchParams.has("v")) {
      url.searchParams.set("v", String(Math.floor(numericVersion)));
    }
    return url.toString();
  }

  return raw;
}

export function extractStorageKeyFromAssetUrl(urlValue) {
  const raw = String(urlValue || "").trim();
  if (!raw) return "";

  if (raw.startsWith("/api/thumbnail?")) {
    const queryPart = raw.split("?")[1] || "";
    const params = new URLSearchParams(queryPart);
    return String(params.get("key") || params.get("file") || "").trim();
  }

  const baseUrl = getPublicAssetBaseUrl();
  if (baseUrl && raw.startsWith(baseUrl)) {
    const relative = raw.slice(baseUrl.length).replace(/^\/+/, "");
    const [pathPart] = relative.split("?");
    return trimLeadingSlash(pathPart);
  }

  return "";
}

function legacyThumbUrlToPublicUrl(urlValue, { version } = {}) {
  const raw = String(urlValue || "").trim();
  if (!raw.startsWith("/api/thumbnail?")) return "";

  const queryPart = raw.split("?")[1] || "";
  const params = new URLSearchParams(queryPart);
  const key = String(params.get("key") || params.get("file") || "").trim();
  if (!key) return "";

  const versionFromUrl = Number(params.get("v") || version || 0);
  return buildPublicAssetUrl(key, { version: versionFromUrl });
}

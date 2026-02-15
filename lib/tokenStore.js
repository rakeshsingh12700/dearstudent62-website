const downloadTokens = {};
const TOKEN_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes

export function saveToken(token, fileOrFiles) {
  const rawFiles = Array.isArray(fileOrFiles) ? fileOrFiles : [fileOrFiles];
  const files = rawFiles
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  const primaryFile = files[0] || "";

  downloadTokens[token] = {
    file: primaryFile,
    files,
    createdAt: Date.now(),
  };
}

export function getToken(token) {
  const tokenData = downloadTokens[token];

  if (!tokenData) return null;

  const isExpired =
    Date.now() - tokenData.createdAt > TOKEN_EXPIRY_MS;

  if (isExpired) {
    delete downloadTokens[token];
    return null;
  }

  return tokenData;
}

export function deleteToken(token) {
  delete downloadTokens[token];
}

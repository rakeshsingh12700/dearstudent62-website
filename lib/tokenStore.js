const downloadTokens = {};
const TOKEN_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes

export function saveToken(token, file) {
  downloadTokens[token] = {
    file,
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

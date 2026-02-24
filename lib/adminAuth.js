const DEFAULT_ADMIN_EMAILS = ["rakesh12700@gmail.com"];

export function getAllowedAdminEmails() {
  const configured = String(process.env.ADMIN_ALLOWED_EMAILS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return configured.length > 0 ? configured : DEFAULT_ADMIN_EMAILS;
}

export function getBearerToken(req) {
  const authHeader = String(req.headers?.authorization || "").trim();
  if (!authHeader.toLowerCase().startsWith("bearer ")) return "";
  return authHeader.slice(7).trim();
}

export async function verifyFirebaseIdToken(idToken) {
  const token = String(idToken || "").trim();
  if (!token) return null;

  const apiKey = String(
    process.env.FIREBASE_API_KEY || process.env.NEXT_PUBLIC_FIREBASE_API_KEY || ""
  ).trim();
  if (!apiKey) {
    throw new Error("Missing FIREBASE_API_KEY");
  }

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: token }),
    }
  );

  if (!response.ok) return null;

  const payload = await response.json().catch(() => ({}));
  const account = Array.isArray(payload?.users) ? payload.users[0] : null;
  if (!account?.email) return null;

  return {
    email: String(account.email || "").trim().toLowerCase(),
    uid: String(account.localId || "").trim() || null,
  };
}

export async function requireAdminUser(req) {
  const bearerToken = getBearerToken(req);
  const adminUser = await verifyFirebaseIdToken(bearerToken);
  if (!adminUser?.email) {
    return { ok: false, status: 401, error: "Admin login required" };
  }

  const allowedAdminEmails = getAllowedAdminEmails();
  if (allowedAdminEmails.length > 0 && !allowedAdminEmails.includes(adminUser.email)) {
    return { ok: false, status: 403, error: "This account is not allowed for admin access" };
  }

  return { ok: true, adminUser };
}

const DEFAULT_ADMIN_EMAILS = ["rakesh12700@gmail.com"];

function getAllowedAdminEmails() {
  const configured = String(process.env.ADMIN_ALLOWED_EMAILS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return configured.length > 0 ? configured : DEFAULT_ADMIN_EMAILS;
}

async function verifyFirebaseIdToken(idToken) {
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
  const payload = await response.json();
  const account = Array.isArray(payload?.users) ? payload.users[0] : null;
  if (!account?.email) return null;

  return {
    uid: String(account.localId || "").trim(),
    email: String(account.email || "").trim().toLowerCase(),
  };
}

function getBearerToken(req) {
  const authHeader = String(req.headers?.authorization || "").trim();
  if (!authHeader.toLowerCase().startsWith("bearer ")) return "";
  return authHeader.slice(7).trim();
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const bearerToken = getBearerToken(req);
    const adminUser = await verifyFirebaseIdToken(bearerToken);
    if (!adminUser?.email) {
      return res.status(401).json({ ok: false, authenticated: false, allowed: false });
    }

    const allowedAdminEmails = getAllowedAdminEmails();
    const allowed =
      allowedAdminEmails.length === 0 || allowedAdminEmails.includes(adminUser.email);

    return res.status(200).json({
      ok: true,
      authenticated: true,
      allowed,
      email: adminUser.email,
    });
  } catch (error) {
    console.error("Admin me check failed:", error);
    return res.status(500).json({ error: "Failed to verify admin access" });
  }
}

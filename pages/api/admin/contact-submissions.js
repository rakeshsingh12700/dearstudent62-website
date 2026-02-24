import { collection, doc, getDocs, limit, orderBy, query, updateDoc } from "firebase/firestore";
import { db } from "../../../firebase/config";

const DEFAULT_ADMIN_EMAILS = ["rakesh12700@gmail.com"];
const ALLOWED_STATUSES = new Set(["all", "new", "in-progress", "resolved"]);
const MUTABLE_STATUSES = new Set(["new", "in-progress", "resolved"]);

function getAllowedAdminEmails() {
  const configured = String(process.env.ADMIN_ALLOWED_EMAILS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return configured.length > 0 ? configured : DEFAULT_ADMIN_EMAILS;
}

function getBearerToken(req) {
  const authHeader = String(req.headers?.authorization || "").trim();
  if (!authHeader.toLowerCase().startsWith("bearer ")) return "";
  return authHeader.slice(7).trim();
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
    email: String(account.email || "").trim().toLowerCase(),
  };
}

function normalizeStatus(value) {
  const normalized = String(value || "all").trim().toLowerCase();
  return ALLOWED_STATUSES.has(normalized) ? normalized : "all";
}

function normalizeLimit(value) {
  const parsed = Number.parseInt(String(value || "120"), 10);
  if (!Number.isFinite(parsed)) return 40;
  return Math.min(Math.max(parsed, 10), 300);
}

function normalizeMutableStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return MUTABLE_STATUSES.has(normalized) ? normalized : "";
}

function sanitizeStatusNote(value, maxLength = 600) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function toIsoDate(value) {
  if (typeof value?.toDate === "function") {
    const date = value.toDate();
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function normalizeSubmission(item, id) {
  return {
    id: String(id || "").trim(),
    name: String(item?.name || "").trim(),
    email: String(item?.email || "").trim(),
    whatsapp: String(item?.whatsapp || "").trim(),
    topic: String(item?.topic || "general-feedback").trim(),
    topicLabel: String(item?.topicLabel || "General feedback").trim(),
    message: String(item?.message || "").trim(),
    status: String(item?.status || "new").trim().toLowerCase() || "new",
    statusNote: String(item?.statusNote || "").trim(),
    createdAt: toIsoDate(item?.createdAt),
    statusUpdatedAt: toIsoDate(item?.statusUpdatedAt),
    statusUpdatedBy: String(item?.statusUpdatedBy || "").trim().toLowerCase() || null,
  };
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "PATCH") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const bearerToken = getBearerToken(req);
    const adminUser = await verifyFirebaseIdToken(bearerToken);
    if (!adminUser?.email) {
      return res.status(401).json({ error: "Admin login required" });
    }

    const allowedAdminEmails = getAllowedAdminEmails();
    if (allowedAdminEmails.length > 0 && !allowedAdminEmails.includes(adminUser.email)) {
      return res.status(403).json({ error: "This account is not allowed to view submissions" });
    }

    if (req.method === "PATCH") {
      const submissionId = String(req.body?.id || "").trim();
      const nextStatus = normalizeMutableStatus(req.body?.status);
      const statusNote = sanitizeStatusNote(req.body?.statusNote);
      if (!submissionId) {
        return res.status(400).json({ error: "Submission id is required" });
      }
      if (!nextStatus && !statusNote) {
        return res.status(400).json({ error: "Provide status or note to update" });
      }

      try {
        const updatePayload = {
          statusUpdatedAt: new Date(),
          statusUpdatedBy: adminUser.email,
        };
        if (nextStatus) {
          updatePayload.status = nextStatus;
        }
        if (statusNote || statusNote === "") {
          updatePayload.statusNote = statusNote || null;
        }

        await updateDoc(doc(db, "contact_submissions", submissionId), updatePayload);
      } catch (updateError) {
        const message = String(updateError?.message || "").toLowerCase();
        if (message.includes("no document to update")) {
          return res.status(404).json({ error: "Submission not found" });
        }
        throw updateError;
      }

      return res.status(200).json({
        ok: true,
        id: submissionId,
        status: nextStatus || null,
        statusNote: statusNote || "",
      });
    }

    const statusFilter = normalizeStatus(req.query.status);
    const requestedLimit = normalizeLimit(req.query.limit);
    const fetchLimit =
      statusFilter === "all"
        ? requestedLimit
        : Math.min(Math.max(requestedLimit * 4, 40), 400);

    const submissionsQuery = query(
      collection(db, "contact_submissions"),
      orderBy("createdAt", "desc"),
      limit(fetchLimit)
    );
    const snapshot = await getDocs(submissionsQuery);

    const allSubmissions = snapshot.docs.map((docItem) =>
      normalizeSubmission(docItem.data(), docItem.id)
    );
    const submissions = allSubmissions
      .filter((item) => (statusFilter === "all" ? true : item.status === statusFilter))
      .slice(0, requestedLimit);

    const summary = allSubmissions.reduce(
      (acc, item) => {
        const key = item.status;
        if (!acc[key]) acc[key] = 0;
        acc[key] += 1;
        acc.total += 1;
        return acc;
      },
      {
        total: 0,
        new: 0,
        "in-progress": 0,
        resolved: 0,
      }
    );

    return res.status(200).json({
      ok: true,
      submissions,
      summary,
    });
  } catch (error) {
    console.error("Admin contact submissions failed:", error);
    return res.status(500).json({ error: "Failed to load contact submissions" });
  }
}

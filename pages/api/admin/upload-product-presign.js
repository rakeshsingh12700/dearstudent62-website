import { randomUUID } from "crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const DEFAULT_ADMIN_EMAILS = ["rakesh12700@gmail.com"];

function getAllowedAdminEmails() {
  const configured = String(process.env.ADMIN_ALLOWED_EMAILS || "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return configured.length > 0 ? configured : DEFAULT_ADMIN_EMAILS;
}

function getR2Client() {
  const accountId = String(process.env.R2_ACCOUNT_ID || "").trim();
  const accessKeyId = String(process.env.R2_ACCESS_KEY_ID || "").trim();
  const secretAccessKey = String(process.env.R2_SECRET_ACCESS_KEY || "").trim();

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error("Missing Cloudflare R2 environment variables");
  }

  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
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

function sanitizeFilename(value, fallback) {
  const cleaned = String(value || "")
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return cleaned || fallback;
}

function normalizeFileDescriptor(value) {
  if (!value || typeof value !== "object") return null;
  const originalFilename = String(value.name || "").trim();
  const contentType = String(value.contentType || "").trim().toLowerCase();
  const size = Number(value.size || 0);

  return {
    originalFilename,
    contentType,
    size: Number.isFinite(size) ? size : 0,
  };
}

function validateDescriptor(kind, descriptor) {
  if (!descriptor?.originalFilename || !descriptor?.contentType) {
    throw new Error(`Missing ${kind} descriptor`);
  }
  if (descriptor.size <= 0) {
    throw new Error(`${kind} file is empty`);
  }
  if (descriptor.size > 80 * 1024 * 1024) {
    throw new Error(`${kind} file is too large (max 80MB)`);
  }
  if (kind === "pdf" && !descriptor.contentType.includes("pdf")) {
    throw new Error("PDF file type is invalid");
  }
  if ((kind === "coverImage" || kind === "previewImage") && !descriptor.contentType.startsWith("image/")) {
    throw new Error(`${kind} file type is invalid`);
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const bucket = String(process.env.R2_BUCKET_NAME || "").trim();
  if (!bucket) {
    return res.status(500).json({ error: "Missing R2_BUCKET_NAME" });
  }

  try {
    const bearerToken = getBearerToken(req);
    const adminUser = await verifyFirebaseIdToken(bearerToken);
    if (!adminUser?.email) {
      return res.status(401).json({ error: "Admin login required" });
    }

    const allowedAdminEmails = getAllowedAdminEmails();
    if (allowedAdminEmails.length > 0 && !allowedAdminEmails.includes(adminUser.email)) {
      return res.status(403).json({ error: "This account is not allowed to upload products" });
    }

    const files = req.body?.files && typeof req.body.files === "object" ? req.body.files : {};
    const pdf = normalizeFileDescriptor(files.pdf);
    const coverImage = normalizeFileDescriptor(files.coverImage);
    const previewImage = normalizeFileDescriptor(files.previewImage);

    validateDescriptor("pdf", pdf);
    validateDescriptor("coverImage", coverImage);
    if (previewImage) validateDescriptor("previewImage", previewImage);

    const r2Client = getR2Client();
    const nowPrefix = Date.now();

    async function createUpload(kind, descriptor) {
      if (!descriptor) return null;
      const safeName = sanitizeFilename(descriptor.originalFilename, `${kind}.bin`);
      const key = `tmp/admin-uploads/${nowPrefix}-${randomUUID()}-${safeName}`;
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: descriptor.contentType,
      });
      const url = await getSignedUrl(r2Client, command, { expiresIn: 15 * 60 });
      return {
        key,
        url,
        contentType: descriptor.contentType,
        originalFilename: descriptor.originalFilename,
      };
    }

    const uploads = {
      pdf: await createUpload("pdf", pdf),
      coverImage: await createUpload("coverImage", coverImage),
      previewImage: await createUpload("previewImage", previewImage),
    };

    return res.status(200).json({
      ok: true,
      uploads,
    });
  } catch (error) {
    const message = String(error?.message || "").trim();
    return res.status(400).json({
      error: message || "Failed to create upload URLs",
    });
  }
}

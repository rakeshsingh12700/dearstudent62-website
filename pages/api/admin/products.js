import {
  CopyObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { collection, deleteDoc, doc, getDoc, getDocs, limit, query, setDoc } from "firebase/firestore";
import { db } from "../../../firebase/config";

const DEFAULT_ADMIN_EMAILS = ["rakesh12700@gmail.com"];

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

function normalizeLimit(value) {
  const parsed = Number.parseInt(String(value || "400"), 10);
  if (!Number.isFinite(parsed)) return 400;
  return Math.min(Math.max(parsed, 50), 1500);
}

function toDateMs(value) {
  if (typeof value?.toDate === "function") {
    const date = value.toDate();
    return Number.isNaN(date.getTime()) ? 0 : date.getTime();
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 0;
  return parsed.getTime();
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

function normalizeProduct(raw, id) {
  return {
    id: String(raw?.id || id || "").trim(),
    title: String(raw?.title || "").trim(),
    class: String(raw?.class || "").trim(),
    type: String(raw?.type || "").trim(),
    subject: String(raw?.subject || "").trim(),
    topic: String(raw?.topic || "").trim(),
    subtopic: String(raw?.subtopic || "").trim(),
    price: Number(raw?.price || 0),
    pages: Number(raw?.pages || 0),
    storageKey: String(raw?.storageKey || "").trim(),
    imageUrl: String(raw?.imageUrl || "").trim(),
    previewImageUrl: String(raw?.previewImageUrl || "").trim(),
    showPreviewPage: Boolean(raw?.showPreviewPage),
    updatedBy: String(raw?.updatedBy || "").trim(),
    updatedAt: toIsoDate(raw?.updatedAt),
    updatedAtMs: toDateMs(raw?.updatedAt),
  };
}

function getR2Client() {
  const accountId = String(process.env.R2_ACCOUNT_ID || "").trim();
  const accessKeyId = String(process.env.R2_ACCESS_KEY_ID || "").trim();
  const secretAccessKey = String(process.env.R2_SECRET_ACCESS_KEY || "").trim();
  if (!accountId || !accessKeyId || !secretAccessKey) return null;

  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

function extractKeyFromThumbUrl(urlValue) {
  const raw = String(urlValue || "").trim();
  if (!raw) return "";
  const queryPart = raw.includes("?") ? raw.split("?")[1] : "";
  if (!queryPart) return "";
  const params = new URLSearchParams(queryPart);
  const key = String(params.get("key") || "").trim();
  if (key) return key;
  return String(params.get("file") || "").trim();
}

function buildDerivedKeys(product) {
  const keys = new Set();
  const storageKey = String(product?.storageKey || "").trim();
  if (storageKey) keys.add(storageKey);

  const coverKeyFromUrl = extractKeyFromThumbUrl(product?.imageUrl);
  if (coverKeyFromUrl) keys.add(coverKeyFromUrl);

  const previewKeyFromUrl = extractKeyFromThumbUrl(product?.previewImageUrl);
  if (previewKeyFromUrl) keys.add(previewKeyFromUrl);

  if (storageKey) {
    const base = storageKey.replace(/\.pdf$/i, "");
    keys.add(`${base}__meta.json`);
    keys.add(`${base}__preview1.png`);
  }

  return Array.from(keys).filter(Boolean);
}

function toArchiveKey(key) {
  const cleaned = String(key || "").trim().replace(/^\/+/, "");
  return cleaned ? `archive/${cleaned}` : "";
}

async function objectExists(r2Client, bucket, key) {
  if (!r2Client || !bucket || !key) return false;
  try {
    await r2Client.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    );
    return true;
  } catch (error) {
    const code = String(error?.name || error?.Code || "");
    if (code === "NotFound" || code === "NoSuchKey") return false;
    throw error;
  }
}

async function moveR2ObjectsToArchive(r2Client, bucket, keys = []) {
  if (!r2Client || !bucket || !Array.isArray(keys) || keys.length === 0) {
    return { moved: [], missing: [], failed: [] };
  }

  const moved = [];
  const missing = [];
  const failed = [];

  for (const rawKey of keys) {
    const sourceKey = String(rawKey || "").trim();
    if (!sourceKey) continue;

    const exists = await objectExists(r2Client, bucket, sourceKey);
    if (!exists) {
      missing.push(sourceKey);
      continue;
    }

    const archiveKey = toArchiveKey(sourceKey);
    if (!archiveKey) {
      failed.push({ key: sourceKey, reason: "Invalid archive key" });
      continue;
    }

    try {
      await r2Client.send(
        new CopyObjectCommand({
          Bucket: bucket,
          Key: archiveKey,
          CopySource: `${bucket}/${sourceKey}`,
          MetadataDirective: "COPY",
        })
      );
      await r2Client.send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: sourceKey,
        })
      );
      moved.push({ from: sourceKey, to: archiveKey });
    } catch (error) {
      failed.push({ key: sourceKey, reason: String(error?.message || "Copy/delete failed") });
    }
  }

  return { moved, missing, failed };
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "DELETE") {
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
      return res.status(403).json({ error: "This account is not allowed to manage products" });
    }

    if (req.method === "GET") {
      const fetchLimit = normalizeLimit(req.query.limit);
      const productsQuery = query(collection(db, "products"), limit(fetchLimit));
      const snapshot = await getDocs(productsQuery);
      const products = snapshot.docs
        .map((docItem) => normalizeProduct(docItem.data(), docItem.id))
        .filter((item) => item.id && item.title)
        .sort((first, second) => second.updatedAtMs - first.updatedAtMs);

      return res.status(200).json({
        ok: true,
        products,
      });
    }

    const productId = String(req.body?.id || "").trim();
    if (!productId) {
      return res.status(400).json({ error: "Product id is required" });
    }

    const productRef = doc(db, "products", productId);
    const snapshot = await getDoc(productRef);
    if (!snapshot.exists()) {
      return res.status(404).json({ error: "Product not found" });
    }

    const product = normalizeProduct(snapshot.data(), snapshot.id);
    const keysToDelete = buildDerivedKeys(product);
    const r2Client = getR2Client();
    const bucket = String(process.env.R2_BUCKET_NAME || "").trim();
    const archiveResult = await moveR2ObjectsToArchive(r2Client, bucket, keysToDelete);

    const archiveRecord = {
      ...snapshot.data(),
      id: product.id,
      archivedAt: new Date().toISOString(),
      archivedBy: adminUser.email,
      archiveStorageKey: toArchiveKey(product.storageKey),
      archivedKeys: archiveResult.moved,
      archiveMissingKeys: archiveResult.missing,
      archivedFromCollection: "products",
    };

    if (archiveResult.failed.length > 0) {
      return res.status(500).json({
        error: "Failed to archive one or more product files. Product was not removed.",
        failedKeys: archiveResult.failed,
      });
    }

    await setDoc(doc(db, "archived_products", productId), archiveRecord, { merge: true });
    await deleteDoc(productRef);

    return res.status(200).json({
      ok: true,
      archivedId: productId,
      archivedKeys: archiveResult.moved,
      missingKeys: archiveResult.missing,
    });
  } catch (error) {
    console.error("Admin products API failed:", error);
    return res.status(500).json({ error: "Failed to manage products" });
  }
}

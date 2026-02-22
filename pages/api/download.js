import { S3Client, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { collection, doc, getDoc, getDocs, limit, query, where } from "firebase/firestore";
import { db } from "../../firebase/config";
import { PRODUCT_CATALOG } from "../../lib/productCatalog";
import { getToken as getCheckoutToken } from "../../lib/tokenStore";

const SIGNED_URL_TTL_SECONDS = 60;

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

async function hasUserPurchasedProduct({ email, uid, productId }) {
  const normalizedProductId = String(productId || "").trim();
  if (!normalizedProductId) return false;

  if (uid) {
    const byUserIdQuery = query(
      collection(db, "purchases"),
      where("userId", "==", uid),
      where("productId", "==", normalizedProductId),
      limit(1)
    );
    const byUserIdSnapshot = await getDocs(byUserIdQuery);
    if (!byUserIdSnapshot.empty) return true;
  }

  if (!email) return false;

  const byEmailQuery = query(
    collection(db, "purchases"),
    where("email", "==", email),
    where("productId", "==", normalizedProductId),
    limit(1)
  );
  const byEmailSnapshot = await getDocs(byEmailQuery);
  return !byEmailSnapshot.empty;
}

function hasValidCheckoutToken(token, key) {
  const tokenData = getCheckoutToken(token);
  if (!tokenData) return false;

  const normalizedKey = String(key || "").trim();
  const fileList = Array.isArray(tokenData.files) ? tokenData.files : [];
  if (fileList.length > 0) {
    return fileList.some((item) => String(item || "").trim() === normalizedKey);
  }
  if (!tokenData?.file) return false;
  return String(tokenData.file).trim() === normalizedKey;
}

function toArchiveKey(key) {
  const normalized = String(key || "").trim().replace(/^\/+/, "");
  return normalized ? `archive/${normalized}` : "";
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

async function getProductByStorageKey(key) {
  const normalizedKey = String(key || "").trim();
  if (!normalizedKey) return null;

  try {
    const productsQuery = query(
      collection(db, "products"),
      where("storageKey", "==", normalizedKey),
      limit(1)
    );
    const snapshot = await getDocs(productsQuery);
    if (!snapshot.empty) {
      const product = snapshot.docs[0];
      return {
        id: product.id,
        archiveStorageKey: String(product.data()?.archiveStorageKey || "").trim(),
      };
    }
  } catch {
    // Continue with static fallback.
  }

  try {
    const archivedQuery = query(
      collection(db, "archived_products"),
      where("storageKey", "==", normalizedKey),
      limit(1)
    );
    const archivedSnapshot = await getDocs(archivedQuery);
    if (!archivedSnapshot.empty) {
      const archivedProduct = archivedSnapshot.docs[0];
      return {
        id: archivedProduct.id,
        archiveStorageKey:
          String(archivedProduct.data()?.archiveStorageKey || "").trim() ||
          toArchiveKey(normalizedKey),
      };
    }
  } catch {
    // Continue with static fallback.
  }

  const staticEntry = Object.values(PRODUCT_CATALOG).find(
    (product) => String(product?.storageKey || "").trim() === normalizedKey
  );
  if (!staticEntry?.id) return null;

  try {
    const archivedDoc = await getDoc(doc(db, "archived_products", staticEntry.id));
    const archiveStorageKey = archivedDoc.exists()
      ? String(archivedDoc.data()?.archiveStorageKey || "").trim()
      : "";
    return { id: staticEntry.id, archiveStorageKey };
  } catch {
    return { id: staticEntry.id, archiveStorageKey: "" };
  }
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const key = String(req.query.key || "").trim();
  const token = String(req.query.token || "").trim();

  if (!key) {
    return res.status(400).json({ error: "Missing key query parameter" });
  }

  // Keep keys as exact bucket object names; reject path-like values.
  if (key.includes("/") || key.includes("\\") || key.includes("..")) {
    return res.status(400).json({ error: "Invalid key" });
  }

  const bucket = String(process.env.R2_BUCKET_NAME || "").trim();
  if (!bucket) {
    return res.status(500).json({ error: "Missing R2_BUCKET_NAME" });
  }

  try {
    const productEntry = await getProductByStorageKey(key);
    if (!productEntry?.id) {
      return res.status(404).json({ error: "Product not found for this key" });
    }

    const user = await verifyFirebaseIdToken(token);
    const purchasedWithLogin = user?.email
      ? await hasUserPurchasedProduct({
          email: user.email,
          uid: user.uid,
          productId: productEntry.id,
        })
      : false;
    const purchasedWithCheckoutToken = hasValidCheckoutToken(token, key);

    if (!purchasedWithLogin && !purchasedWithCheckoutToken) {
      return res.status(403).json({ error: "Not authorized" });
    }

    const r2Client = getR2Client();
    const requestedKey = key;
    const fallbackArchiveKey =
      String(productEntry?.archiveStorageKey || "").trim() || toArchiveKey(requestedKey);
    const downloadKey = (await objectExists(r2Client, bucket, requestedKey))
      ? requestedKey
      : fallbackArchiveKey;

    if (!(await objectExists(r2Client, bucket, downloadKey))) {
      return res.status(404).json({ error: "File not found" });
    }

    const fileName = requestedKey.replace(/"/g, "");
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: downloadKey,
      ResponseContentType: "application/pdf",
      ResponseContentDisposition: `attachment; filename="${fileName}"`,
    });
    const signedUrl = await getSignedUrl(r2Client, command, {
      expiresIn: SIGNED_URL_TTL_SECONDS,
    });

    res.setHeader("Cache-Control", "no-store");
    return res.redirect(302, signedUrl);
  } catch (error) {
    console.error("R2 signed URL generation failed:", error);
    return res.status(500).json({ error: "Failed to create signed download URL" });
  }
}

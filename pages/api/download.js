import { S3Client, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { collection, doc, getDoc, getDocs, limit, query, where } from "firebase/firestore";
import { db } from "../../firebase/config";
import { getAdminDb } from "../../lib/firebaseAdmin";
import { PRODUCT_CATALOG } from "../../lib/productCatalog";
import { getToken as getCheckoutToken } from "../../lib/tokenStore";

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
    forcePathStyle: true,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

async function verifyFirebaseIdToken(idToken) {
  const token = String(idToken || "").trim();
  if (!token) return null;
  if (token.split(".").length !== 3) return null;

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

  const adminDb = getAdminDb();
  if (adminDb) {
    if (uid) {
      const byUserIdSnapshot = await adminDb
        .collection("purchases")
        .where("userId", "==", uid)
        .where("productId", "==", normalizedProductId)
        .limit(1)
        .get();
      if (!byUserIdSnapshot.empty) return true;
    }

    if (!email) return false;

    const byEmailSnapshot = await adminDb
      .collection("purchases")
      .where("email", "==", email)
      .where("productId", "==", normalizedProductId)
      .limit(1)
      .get();
    return !byEmailSnapshot.empty;
  }

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

async function hasValidCheckoutToken(token, key) {
  const tokenData = await getCheckoutToken(token);
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

function normalizeLegacyStorageKey(key) {
  return String(key || "")
    .trim()
    .replace(
      /^(.+?)\s*[–—]\s+(Worksheets|Worksheet|Exams|UnitTest|Unit Test|HalfYear|Half Year|Final)\-/i,
      "$1-$2-"
    );
}

function uniqueValues(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

function getStorageKeyCandidates(key) {
  const normalized = String(key || "").trim();
  return uniqueValues([normalized, normalizeLegacyStorageKey(normalized)]);
}

function getDownloadKeyCandidates(key, archiveStorageKey = "") {
  const storageCandidates = getStorageKeyCandidates(key);
  return uniqueValues([
    ...storageCandidates,
    String(archiveStorageKey || "").trim(),
    ...storageCandidates.map((item) => toArchiveKey(item)),
  ]);
}

function getContentDisposition(fileName) {
  const cleaned = String(fileName || "worksheet.pdf")
    .replace(/^archive\//, "")
    .replace(/[\r\n"]/g, "")
    .trim() || "worksheet.pdf";
  const asciiFallback = cleaned
    .replace(/[^\x20-\x7E]/g, "-")
    .replace(/[\\/:*?<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim() || "worksheet.pdf";
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(cleaned)}`;
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
  const lookupKeys = getStorageKeyCandidates(normalizedKey);

  const adminDb = getAdminDb();
  if (adminDb) {
    for (const lookupKey of lookupKeys) {
      try {
        const snapshot = await adminDb
          .collection("products")
          .where("storageKey", "==", lookupKey)
          .limit(1)
          .get();
        if (!snapshot.empty) {
          const product = snapshot.docs[0];
          return {
            id: product.id,
            storageKey: String(product.data()?.storageKey || lookupKey).trim(),
            archiveStorageKey: String(product.data()?.archiveStorageKey || "").trim(),
          };
        }
      } catch {
        // Continue with client SDK fallback.
      }
    }

    for (const lookupKey of lookupKeys) {
      try {
        const archivedSnapshot = await adminDb
          .collection("archived_products")
          .where("storageKey", "==", lookupKey)
          .limit(1)
          .get();
        if (!archivedSnapshot.empty) {
          const archivedProduct = archivedSnapshot.docs[0];
          return {
            id: archivedProduct.id,
            storageKey: String(archivedProduct.data()?.storageKey || lookupKey).trim(),
            archiveStorageKey:
              String(archivedProduct.data()?.archiveStorageKey || "").trim() ||
              toArchiveKey(lookupKey),
          };
        }
      } catch {
        // Continue with client SDK fallback.
      }
    }
  }

  for (const lookupKey of lookupKeys) {
    try {
      const productsQuery = query(
        collection(db, "products"),
        where("storageKey", "==", lookupKey),
        limit(1)
      );
      const snapshot = await getDocs(productsQuery);
      if (!snapshot.empty) {
        const product = snapshot.docs[0];
        return {
          id: product.id,
          storageKey: String(product.data()?.storageKey || lookupKey).trim(),
          archiveStorageKey: String(product.data()?.archiveStorageKey || "").trim(),
        };
      }
    } catch {
      // Continue with static fallback.
    }
  }

  for (const lookupKey of lookupKeys) {
    try {
      const archivedQuery = query(
        collection(db, "archived_products"),
        where("storageKey", "==", lookupKey),
        limit(1)
      );
      const archivedSnapshot = await getDocs(archivedQuery);
      if (!archivedSnapshot.empty) {
        const archivedProduct = archivedSnapshot.docs[0];
        return {
          id: archivedProduct.id,
          storageKey: String(archivedProduct.data()?.storageKey || lookupKey).trim(),
          archiveStorageKey:
            String(archivedProduct.data()?.archiveStorageKey || "").trim() ||
            toArchiveKey(lookupKey),
        };
      }
    } catch {
      // Continue with static fallback.
    }
  }

  const staticEntry = Object.values(PRODUCT_CATALOG).find(
    (product) => lookupKeys.includes(String(product?.storageKey || "").trim())
  );
  if (!staticEntry?.id) return null;

  try {
    const archivedDoc = await getDoc(doc(db, "archived_products", staticEntry.id));
    const archiveStorageKey = archivedDoc.exists()
      ? String(archivedDoc.data()?.archiveStorageKey || "").trim()
      : "";
    return { id: staticEntry.id, archiveStorageKey };
  } catch {
    return { id: staticEntry.id, storageKey: staticEntry.storageKey, archiveStorageKey: "" };
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
    const purchasedWithCheckoutToken = await hasValidCheckoutToken(token, key);
    const productEntry = await getProductByStorageKey(key);

    const user = purchasedWithCheckoutToken ? null : await verifyFirebaseIdToken(token);
    const purchasedWithLogin = user?.email && productEntry?.id
      ? await hasUserPurchasedProduct({
          email: user.email,
          uid: user.uid,
          productId: productEntry.id,
        })
      : false;

    if (!productEntry?.id && !purchasedWithCheckoutToken) {
      return res.status(404).json({ error: "Product not found for this key" });
    }

    if (!purchasedWithLogin && !purchasedWithCheckoutToken) {
      return res.status(403).json({ error: "Not authorized" });
    }

    const r2Client = getR2Client();
    const requestedKey = key;
    const fallbackArchiveKey =
      String(productEntry?.archiveStorageKey || "").trim() || toArchiveKey(requestedKey);
    let downloadKey = "";
    for (const candidateKey of getDownloadKeyCandidates(requestedKey, fallbackArchiveKey)) {
      if (await objectExists(r2Client, bucket, candidateKey)) {
        downloadKey = candidateKey;
        break;
      }
    }

    if (!downloadKey) {
      return res.status(404).json({ error: "File not found" });
    }

    const fileName = downloadKey.replace(/^archive\//, "");
    const contentDisposition = getContentDisposition(fileName);
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: downloadKey,
      ResponseContentType: "application/pdf",
      ResponseContentDisposition: contentDisposition,
    });
    const object = await r2Client.send(command);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", contentDisposition);

    const body = object?.Body;
    if (body && typeof body.pipe === "function") {
      body.pipe(res);
      return;
    }
    if (body && typeof body.transformToByteArray === "function") {
      const bytes = await body.transformToByteArray();
      return res.status(200).send(Buffer.from(bytes));
    }
    return res.status(500).json({ error: "Download stream unavailable" });
  } catch (error) {
    const code = String(error?.name || error?.Code || error?.code || "").trim();
    const rawMessage = String(error?.message || "").trim();
    const lower = `${code} ${rawMessage}`.toLowerCase();

    let message = "Download failed";
    if (lower.includes("invalidaccesskeyid") || lower.includes("signaturedoesnotmatch")) {
      message = "Download storage credentials are invalid";
    } else if (lower.includes("accessdenied")) {
      message = "Download access denied by storage provider";
    } else if (lower.includes("nosuchkey") || lower.includes("notfound")) {
      message = "File not found in storage";
    } else if (lower.includes("fetch failed") || lower.includes("enotfound") || lower.includes("econn")) {
      message = "Storage network connection failed";
    } else if (rawMessage) {
      message = rawMessage;
    }

    console.error("Download API failed:", {
      code: code || "unknown",
      message: rawMessage || "unknown",
      key,
    });
    return res.status(500).json({
      error: message,
      code: code || "unknown",
    });
  }
}

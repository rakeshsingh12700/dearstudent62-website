import nextEnv from "@next/env";
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { initializeApp } from "firebase/app";
import { collection, doc, getDocs, limit, query, setDoc } from "firebase/firestore";
import { getFirestore } from "firebase/firestore";

const ROOT_DIR = process.cwd();
const { loadEnvConfig } = nextEnv;
loadEnvConfig(ROOT_DIR);

const CONCURRENCY = 3;

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

const firebaseConfig = {
  apiKey: required("NEXT_PUBLIC_FIREBASE_API_KEY"),
  authDomain: required("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"),
  projectId: required("NEXT_PUBLIC_FIREBASE_PROJECT_ID"),
  storageBucket: required("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET"),
  messagingSenderId: required("NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"),
  appId: required("NEXT_PUBLIC_FIREBASE_APP_ID"),
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const bucket = required("R2_BUCKET_NAME");
const r2Client = new S3Client({
  region: "auto",
  endpoint: `https://${required("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: required("R2_ACCESS_KEY_ID"),
    secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
  },
});

function toThumbUrl(key) {
  return `/api/thumbnail?key=${encodeURIComponent(key)}`;
}

function extractKeyFromThumbUrl(urlValue) {
  const raw = String(urlValue || "").trim();
  if (!raw) return "";
  const queryPart = raw.includes("?") ? raw.split("?")[1] : "";
  if (!queryPart) return "";
  const params = new URLSearchParams(queryPart);
  return String(params.get("key") || params.get("file") || "").trim();
}

async function existsKey(key) {
  if (!key) return false;
  try {
    await r2Client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (error) {
    const code = String(error?.name || error?.Code || "");
    if (code === "NotFound" || code === "NoSuchKey") return false;
    throw error;
  }
}

async function getObjectBuffer(key) {
  const response = await r2Client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const body = response.Body;
  if (!body) return null;

  if (typeof body.transformToByteArray === "function") {
    const bytes = await body.transformToByteArray();
    return Buffer.from(bytes);
  }
  if (typeof body[Symbol.asyncIterator] === "function") {
    const chunks = [];
    for await (const chunk of body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }
  return null;
}

async function generateThumb(buffer, maxWidth = 640) {
  if (!buffer || buffer.length === 0) return null;
  const canvasApi = await import("@napi-rs/canvas");
  const image = await canvasApi.loadImage(buffer);
  const sourceWidth = Math.max(Number(image?.width || 0), 1);
  const sourceHeight = Math.max(Number(image?.height || 0), 1);
  const targetWidth = Math.max(1, Math.min(Math.round(maxWidth), sourceWidth));
  const targetHeight = Math.max(1, Math.round((targetWidth / sourceWidth) * sourceHeight));
  const canvas = canvasApi.createCanvas(targetWidth, targetHeight);
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, targetWidth, targetHeight);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, targetWidth, targetHeight);

  try {
    return { body: canvas.toBuffer("image/jpeg"), contentType: "image/jpeg", extension: ".jpg" };
  } catch {
    return { body: canvas.toBuffer("image/png"), contentType: "image/png", extension: ".png" };
  }
}

async function putObject(key, body, contentType) {
  await r2Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    })
  );
}

async function findFirstExisting(keys = []) {
  for (const key of keys) {
    if (!key) continue;
    if (await existsKey(key)) return key;
  }
  return "";
}

async function processProduct(item) {
  const raw = item.data() || {};
  const id = String(raw?.id || item.id || "").trim();
  const storageKey = String(raw?.storageKey || "").trim();
  if (!id || !storageKey) return { id, skipped: true };

  const base = storageKey.replace(/\.pdf$/i, "");
  const currentImageKey = extractKeyFromThumbUrl(raw?.imageUrl);
  const currentImageOriginalKey = extractKeyFromThumbUrl(raw?.imageOriginalUrl);
  const currentPreviewKey = extractKeyFromThumbUrl(raw?.previewImageUrl);
  const currentPreviewOriginalKey = extractKeyFromThumbUrl(raw?.previewImageOriginalUrl);

  const coverSourceKey = await findFirstExisting([
    currentImageOriginalKey,
    currentImageKey,
    `${base}__cover.jpg`,
    `${base}__cover.jpeg`,
    `${base}__cover.png`,
    `${base}__cover.webp`,
    `${base}.jpg`,
    `${base}.jpeg`,
    `${base}.png`,
    `${base}.webp`,
  ]);

  const previewSourceKey = await findFirstExisting([
    currentPreviewOriginalKey,
    currentPreviewKey,
    `${base}__preview1.jpg`,
    `${base}__preview1.jpeg`,
    `${base}__preview1.png`,
    `${base}__preview1.webp`,
  ]);

  let coverThumbKey = await findFirstExisting([
    `${base}__cover__thumb640.jpg`,
    `${base}__cover__thumb640.png`,
  ]);

  let previewThumbKey = await findFirstExisting([
    `${base}__preview1__thumb640.jpg`,
    `${base}__preview1__thumb640.png`,
  ]);

  if (!coverThumbKey && coverSourceKey) {
    const coverBuffer = await getObjectBuffer(coverSourceKey);
    const thumb = await generateThumb(coverBuffer, 640);
    if (thumb?.body) {
      coverThumbKey = `${base}__cover__thumb640${thumb.extension}`;
      await putObject(coverThumbKey, thumb.body, thumb.contentType);
    }
  }

  if (!previewThumbKey && previewSourceKey) {
    const previewBuffer = await getObjectBuffer(previewSourceKey);
    const thumb = await generateThumb(previewBuffer, 640);
    if (thumb?.body) {
      previewThumbKey = `${base}__preview1__thumb640${thumb.extension}`;
      await putObject(previewThumbKey, thumb.body, thumb.contentType);
    }
  }

  const updatePayload = {
    imageUrl: coverThumbKey ? toThumbUrl(coverThumbKey) : String(raw?.imageUrl || "").trim(),
    imageOriginalUrl: coverSourceKey ? toThumbUrl(coverSourceKey) : String(raw?.imageOriginalUrl || "").trim(),
    previewImageUrl: previewThumbKey ? toThumbUrl(previewThumbKey) : String(raw?.previewImageUrl || "").trim(),
    previewImageOriginalUrl: previewSourceKey
      ? toThumbUrl(previewSourceKey)
      : String(raw?.previewImageOriginalUrl || "").trim(),
    showPreviewPage: Boolean(previewSourceKey || raw?.showPreviewPage),
    updatedAt: new Date().toISOString(),
  };

  await setDoc(doc(db, "products", id), updatePayload, { merge: true });
  return { id, coverThumbKey, previewThumbKey };
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.max(1, Math.min(concurrency, items.length || 1)) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

async function main() {
  const productsSnapshot = await getDocs(query(collection(db, "products"), limit(1500)));
  const docs = productsSnapshot.docs;
  const results = await mapWithConcurrency(docs, CONCURRENCY, async (item) => {
    try {
      return await processProduct(item);
    } catch (error) {
      return { id: item.id, error: String(error?.message || error) };
    }
  });

  const failed = results.filter((item) => item?.error);
  const updated = results.filter((item) => !item?.error && !item?.skipped);
  console.log(`Backfill completed. Updated: ${updated.length}, Failed: ${failed.length}`);
  if (failed.length > 0) {
    failed.slice(0, 20).forEach((entry) => {
      console.error(`- ${entry.id}: ${entry.error}`);
    });
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("Backfill failed:", error);
  process.exitCode = 1;
});

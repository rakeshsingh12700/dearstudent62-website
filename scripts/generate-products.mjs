import fs from "fs/promises";
import path from "path";
import { GetObjectCommand, ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import nextEnv from "@next/env";
import { PDFDocument } from "pdf-lib/dist/pdf-lib.esm.js";

const ROOT_DIR = process.cwd();
const OUTPUT_FILE = path.join(ROOT_DIR, "data", "products.generated.json");
const LIST_PAGE_SIZE = 1000;
const PAGE_COUNT_CONCURRENCY = 8;
const { loadEnvConfig } = nextEnv;

// Plain node scripts do not auto-load Next.js .env files.
loadEnvConfig(ROOT_DIR);

function getR2Client() {
  const accountId = String(process.env.R2_ACCOUNT_ID || "").trim();
  const accessKeyId = String(process.env.R2_ACCESS_KEY_ID || "").trim();
  const secretAccessKey = String(process.env.R2_SECRET_ACCESS_KEY || "").trim();

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error("Missing R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY");
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

function hasRequiredR2Env() {
  const accountId = String(process.env.R2_ACCOUNT_ID || "").trim();
  const accessKeyId = String(process.env.R2_ACCESS_KEY_ID || "").trim();
  const secretAccessKey = String(process.env.R2_SECRET_ACCESS_KEY || "").trim();
  const bucket = String(process.env.R2_BUCKET_NAME || "").trim();
  return Boolean(accountId && accessKeyId && secretAccessKey && bucket);
}

function getR2BucketName() {
  const bucket = String(process.env.R2_BUCKET_NAME || "").trim();
  if (!bucket) throw new Error("Missing R2_BUCKET_NAME");
  return bucket;
}

async function bodyToBuffer(body) {
  if (!body) throw new Error("Missing object body");

  if (typeof body.transformToByteArray === "function") {
    const byteArray = await body.transformToByteArray();
    return Buffer.from(byteArray);
  }

  if (typeof body[Symbol.asyncIterator] === "function") {
    const chunks = [];
    for await (const chunk of body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  throw new Error("Unsupported object body stream");
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toTitleCase(value) {
  return String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function parseProductFromFilename(fileName) {
  const ext = path.extname(fileName);
  const baseName = path.basename(fileName, ext);
  const parts = baseName.split("-").map((part) => part.trim()).filter(Boolean);

  if (parts.length < 4) {
    throw new Error(
      `Invalid PDF filename \"${fileName}\". Use: Class-Category-Subcategory-Price.pdf`
    );
  }

  const classPart = parts[0];
  const categoryPart = parts[1];
  const pricePart = parts[parts.length - 1];
  const subcategoryParts = parts.slice(2, -1);

  const price = Number.parseInt(pricePart, 10);
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error(`Invalid price in filename \"${fileName}\".`);
  }

  const subcategory = subcategoryParts.join("-").trim();
  if (!subcategory) {
    throw new Error(`Missing subcategory in filename \"${fileName}\".`);
  }

  const category = toTitleCase(categoryPart);
  const classValue = slugify(classPart);
  const categorySlug = slugify(categoryPart);
  const typeValue =
    categorySlug === "worksheets" ? "worksheet" : categorySlug || "worksheet";
  const title = subcategory;

  return {
    id: `${classValue}-${slugify(subcategory)}`,
    class: classValue,
    type: typeValue,
    title,
    category,
    subcategory,
    price,
    ageLabel: "AGE 3+",
    storageKey: fileName,
    imageUrl: "",
  };
}

async function getPdfPageCount(r2Client, bucket, fileName) {
  const response = await r2Client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: fileName,
    })
  );
  const bytes = await bodyToBuffer(response.Body);
  const pdf = await PDFDocument.load(bytes);
  return pdf.getPageCount();
}

async function listFlatKeysFromBucket() {
  const r2Client = getR2Client();
  const bucket = getR2BucketName();
  const keys = [];

  let continuationToken;
  do {
    const response = await r2Client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        MaxKeys: LIST_PAGE_SIZE,
        ContinuationToken: continuationToken,
      })
    );

    const pageKeys = (response.Contents || [])
      .map((item) => String(item?.Key || "").trim())
      .filter(Boolean)
      .filter((key) => !key.includes("/") && !key.includes("\\"));

    keys.push(...pageKeys);
    continuationToken = response.IsTruncated
      ? String(response.NextContinuationToken || "")
      : "";
  } while (continuationToken);

  return [...new Set(keys)].sort((a, b) => a.localeCompare(b));
}

function toAssetUrlFromKey(key) {
  const objectKey = String(key || "").trim();
  if (!objectKey) return "";
  return `/api/thumbnail?key=${encodeURIComponent(objectKey)}`;
}

function findFirstMatchingKey(baseName, candidates, allKeysSet) {
  const base = String(baseName || "").trim();
  if (!base) return "";

  for (const suffix of candidates) {
    const key = `${base}${suffix}`;
    if (allKeysSet.has(key)) return key;
  }
  return "";
}

async function tryReadJsonObject(r2Client, bucket, key) {
  const objectKey = String(key || "").trim();
  if (!objectKey) return null;

  try {
    const response = await r2Client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: objectKey,
      })
    );
    const bytes = await bodyToBuffer(response.Body);
    if (!bytes) return null;
    const text = bytes.toString("utf8");
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  const runners = Array.from(
    { length: Math.max(1, Math.min(concurrency, items.length || 1)) },
    async () => {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await worker(items[index], index);
      }
    }
  );

  await Promise.all(runners);
  return results;
}

async function generateProducts() {
  if (!hasRequiredR2Env()) {
    try {
      await fs.access(OUTPUT_FILE);
      console.warn(
        "R2 environment variables are missing. Using existing data/products.generated.json."
      );
      return;
    } catch {
      throw new Error(
        "Missing R2 env vars and no existing data/products.generated.json. " +
          "Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET_NAME."
      );
    }
  }

  const r2Client = getR2Client();
  const bucket = getR2BucketName();
  const allKeys = await listFlatKeysFromBucket();
  const allKeysSet = new Set(allKeys);
  const files = allKeys
    .filter((key) => key.toLowerCase().endsWith(".pdf"))
    .sort((a, b) => a.localeCompare(b));
  if (files.length === 0) {
    throw new Error("No PDF objects found in R2 bucket.");
  }

  const products = await mapWithConcurrency(
    files,
    PAGE_COUNT_CONCURRENCY,
    async (fileName) => {
      const product = parseProductFromFilename(fileName);
      const pages = await getPdfPageCount(r2Client, bucket, fileName);
      const base = fileName.replace(/\.pdf$/i, "");
      const coverKey =
        findFirstMatchingKey(
          base,
          [".jpg", ".jpeg", ".png", ".webp", "__cover.jpg", "__cover.jpeg", "__cover.png", "__cover.webp"],
          allKeysSet
        ) ||
        findFirstMatchingKey(
          base,
          ["__cover.jpg", "__cover.jpeg", "__cover.png", "__cover.webp"],
          allKeysSet
        );
      const previewImageKey = findFirstMatchingKey(
        base,
        ["__preview1.jpg", "__preview1.jpeg", "__preview1.png", "__preview1.webp"],
        allKeysSet
      );
      const metadataKey = `${base}__meta.json`;
      const metadata = allKeysSet.has(metadataKey)
        ? await tryReadJsonObject(r2Client, bucket, metadataKey)
        : null;
      const showPreviewPage = Boolean(metadata?.showPreviewPage && previewImageKey);
      const hideAgeLabel = Boolean(metadata?.hideAgeLabel);
      const ageLabel =
        hideAgeLabel
          ? ""
          : String(metadata?.ageLabel || "").trim() || String(product.ageLabel || "AGE 3+").trim();
      const subject = String(metadata?.subject || "").trim().toLowerCase();
      const topic = String(metadata?.topic || "").trim().toLowerCase();

      return {
        ...product,
        pages,
        ageLabel,
        hideAgeLabel,
        subject,
        topic,
        imageUrl: toAssetUrlFromKey(coverKey),
        previewImageUrl: toAssetUrlFromKey(previewImageKey),
        showPreviewPage,
      };
    }
  );

  await fs.writeFile(OUTPUT_FILE, `${JSON.stringify(products, null, 2)}\n`, "utf8");
  console.log(
    `Generated ${products.length} products from R2 bucket -> data/products.generated.json`
  );
}

generateProducts().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

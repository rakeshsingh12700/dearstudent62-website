import fs from "fs/promises";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { doc, setDoc } from "firebase/firestore";
import formidable from "formidable";
import { PDFDocument } from "pdf-lib";
import { db } from "../../../firebase/config";

export const config = {
  api: {
    bodyParser: false,
  },
};

const CLASS_TO_LABEL = {
  "pre-nursery": "Pre Nursery",
  nursery: "Nursery",
  lkg: "LKG",
  ukg: "UKG",
  "class-1": "Class 1",
  "class-2": "Class 2",
  "class-3": "Class 3",
};

const TYPE_TO_CATEGORY_LABEL = {
  worksheet: "Worksheets",
  exams: "Exams",
  "half-year-exam": "Half Year Exam",
  "final-year-exam": "Final Year Exam",
  bundle: "Bundle",
};

const SUBJECT_VALUES = new Set(["english", "maths", "evs", "hindi"]);
const TOPICS_BY_SUBJECT = {
  english: new Set(["reading", "writing", "grammar", "poems", "sight-words"]),
  maths: new Set(["numbers", "addition", "subtraction", "shapes", "measurement"]),
  evs: new Set(["environment", "plants", "animals", "water", "food"]),
  hindi: new Set(),
};
const ENGLISH_GRAMMAR_SUBTOPICS = new Set([
  "noun",
  "pronoun",
  "verb",
  "articles",
  "opposites",
  "singular-plural",
  "is-am-are",
  "prepositions",
  "adjectives",
  "have-has-had",
]);
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

function toSingleFile(value) {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] || null;
  return value;
}

function toSingleField(value) {
  if (Array.isArray(value)) return String(value[0] || "").trim();
  return String(value || "").trim();
}

function sanitizeFilenamePart(value) {
  return String(value || "")
    .replace(/[\\/]/g, " ")
    .replace(/\.+/g, ".")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[-]+/g, " ");
}

function toSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getAgeLabelByClass(classValue) {
  const map = {
    "pre-nursery": "AGE 2+",
    nursery: "AGE 3+",
    lkg: "AGE 4+",
    ukg: "AGE 5+",
    "class-1": "AGE 6+",
    "class-2": "AGE 7+",
    "class-3": "AGE 8+",
  };
  return String(map[classValue] || "").trim();
}

function getProductId({ classValue, subject, typeValue, title }) {
  const titleSlug = toSlug(title);
  if (!titleSlug) return "";

  const subjectSlug = toSlug(subject);
  const classSlug = toSlug(classValue);
  const isCrossClassWorksheet =
    typeValue === "worksheet" && (subjectSlug === "english" || subjectSlug === "maths");

  if (isCrossClassWorksheet) {
    return `${subjectSlug}-${titleSlug}`;
  }

  return `${classSlug}-${titleSlug}`;
}

function extensionForContentType(contentType, fallback = "") {
  const type = String(contentType || "").toLowerCase();
  const original = String(fallback || "").toLowerCase();

  if (type.includes("png") || original.endsWith(".png")) return ".png";
  if (type.includes("webp") || original.endsWith(".webp")) return ".webp";
  if (type.includes("jpeg") || type.includes("jpg") || original.endsWith(".jpg") || original.endsWith(".jpeg")) {
    return ".jpg";
  }
  if (original.endsWith(".pdf") || type.includes("pdf")) return ".pdf";
  return ".bin";
}

function isJsonRequest(req) {
  const contentType = String(req.headers?.["content-type"] || "").toLowerCase();
  return contentType.includes("application/json");
}

async function parseJsonBody(req, { maxBytes = 1 * 1024 * 1024 } = {}) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += part.length;
    if (total > maxBytes) {
      const error = new Error("JSON payload too large");
      error.httpCode = 413;
      throw error;
    }
    chunks.push(part);
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    const error = new Error("Invalid JSON payload");
    error.httpCode = 400;
    throw error;
  }
}

async function streamToBuffer(body) {
  if (!body) return Buffer.alloc(0);
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof Uint8Array) return Buffer.from(body);
  if (typeof body.transformToByteArray === "function") {
    const bytes = await body.transformToByteArray();
    return Buffer.from(bytes);
  }

  const chunks = [];
  for await (const chunk of body) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function normalizeUploadRef(value) {
  if (!value || typeof value !== "object") return null;
  const key = String(value.key || "").trim();
  if (!key) return null;
  return {
    key,
    contentType: String(value.contentType || "").trim(),
    originalFilename: String(value.originalFilename || "").trim(),
  };
}

async function getTempUploadFromR2(r2Client, bucket, uploadRef) {
  const ref = normalizeUploadRef(uploadRef);
  if (!ref?.key) return null;
  if (!ref.key.startsWith("tmp/admin-uploads/")) {
    throw new Error("Invalid temp upload key");
  }

  const response = await r2Client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: ref.key,
    })
  );
  const body = await streamToBuffer(response.Body);

  return {
    sourceKey: ref.key,
    buffer: body,
    mimetype: ref.contentType || String(response.ContentType || "").trim(),
    originalFilename: ref.originalFilename,
  };
}

async function deleteKeysBestEffort(r2Client, bucket, keys = []) {
  const unique = Array.from(
    new Set(
      (Array.isArray(keys) ? keys : [])
        .map((value) => String(value || "").trim())
        .filter(Boolean)
    )
  );

  await Promise.all(
    unique.map(async (key) => {
      try {
        await r2Client.send(
          new DeleteObjectCommand({
            Bucket: bucket,
            Key: key,
          })
        );
      } catch (error) {
        console.warn("Temp upload cleanup failed:", key, error);
      }
    })
  );
}

function buildPdfKey({ classValue, typeValue, title, price }) {
  const classLabel = CLASS_TO_LABEL[classValue] || "All Classes";
  const categoryLabel = TYPE_TO_CATEGORY_LABEL[typeValue] || typeValue;
  const safeClass = sanitizeFilenamePart(classLabel);
  const safeCategory = sanitizeFilenamePart(categoryLabel);
  const safeTitle = sanitizeFilenamePart(title);
  const safePrice = Number.parseInt(String(price || "0"), 10);

  if (!safeClass || !safeCategory || !safeTitle || !Number.isFinite(safePrice) || safePrice <= 0) {
    throw new Error("Invalid class/type/title/price for filename");
  }

  return `${safeClass}-${safeCategory}-${safeTitle}-${safePrice}.pdf`;
}

async function parseMultipart(req) {
  const form = formidable({
    multiples: false,
    maxFiles: 3,
    maxFileSize: 40 * 1024 * 1024,
    allowEmptyFiles: false,
  });

  return new Promise((resolve, reject) => {
    form.parse(req, (err, fields, files) => {
      if (err) {
        reject(err);
        return;
      }
      resolve({ fields, files });
    });
  });
}

async function putObject(r2Client, bucket, key, body, contentType) {
  await r2Client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType || "application/octet-stream",
      CacheControl: "public, max-age=31536000, immutable",
    })
  );
}

async function generateThumbnailVariant(buffer, { maxWidth = 640 } = {}) {
  if (!buffer || buffer.length === 0) return null;
  try {
    const canvasApi = await import("@napi-rs/canvas");
    const image = await canvasApi.loadImage(buffer);
    const sourceWidth = Math.max(Number(image?.width || 0), 1);
    const sourceHeight = Math.max(Number(image?.height || 0), 1);

    const targetWidth = Math.max(1, Math.min(Math.round(maxWidth), sourceWidth));
    const scale = targetWidth / sourceWidth;
    const targetHeight = Math.max(1, Math.round(sourceHeight * scale));

    const canvas = canvasApi.createCanvas(targetWidth, targetHeight);
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, targetWidth, targetHeight);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, targetWidth, targetHeight);

    try {
      return {
        body: canvas.toBuffer("image/jpeg"),
        contentType: "image/jpeg",
        extension: ".jpg",
      };
    } catch {
      return {
        body: canvas.toBuffer("image/png"),
        contentType: "image/png",
        extension: ".png",
      };
    }
  } catch (error) {
    console.error("Thumbnail variant generation failed:", error);
    return null;
  }
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

async function readPdfInfoFromBytes(bytes, { renderPreview = false } = {}) {
  const parsedPdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = Math.max(
    Number.parseInt(String(parsedPdf.getPageCount() || "1"), 10) || 1,
    1
  );

  let previewPng = null;
  if (renderPreview) {
    try {
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const canvasApi = await import("@napi-rs/canvas");
      if (canvasApi.DOMMatrix && !globalThis.DOMMatrix) globalThis.DOMMatrix = canvasApi.DOMMatrix;
      if (canvasApi.Path2D && !globalThis.Path2D) globalThis.Path2D = canvasApi.Path2D;
      if (canvasApi.ImageData && !globalThis.ImageData) globalThis.ImageData = canvasApi.ImageData;

      const loadingTask = pdfjs.getDocument({
        data: new Uint8Array(bytes),
        disableWorker: true,
      });

      const pdf = await loadingTask.promise;
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 1.6 });
      const canvas = canvasApi.createCanvas(
        Math.max(Math.ceil(viewport.width), 1),
        Math.max(Math.ceil(viewport.height), 1)
      );
      const context = canvas.getContext("2d");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({
        canvasContext: context,
        viewport,
      }).promise;

      previewPng = canvas.toBuffer("image/png");
      page.cleanup();
      await pdf.destroy();
    } catch (previewReadError) {
      console.error("Preview generation skipped:", previewReadError);
    }
  }
  return { pages, previewPng };
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

    const r2Client = getR2Client();
    const tempKeysForCleanup = [];

    let fields;
    let pdfInput;
    let coverInput;
    let previewImageInput;
    try {
      if (isJsonRequest(req)) {
        const payload = await parseJsonBody(req);
        const uploadRefs = payload?.uploads && typeof payload.uploads === "object" ? payload.uploads : {};
        fields = payload?.fields && typeof payload.fields === "object" ? payload.fields : {};

        pdfInput = await getTempUploadFromR2(r2Client, bucket, uploadRefs.pdf);
        if (pdfInput?.sourceKey) tempKeysForCleanup.push(pdfInput.sourceKey);
        coverInput = await getTempUploadFromR2(r2Client, bucket, uploadRefs.coverImage);
        if (coverInput?.sourceKey) tempKeysForCleanup.push(coverInput.sourceKey);
        previewImageInput = await getTempUploadFromR2(r2Client, bucket, uploadRefs.previewImage);
        if (previewImageInput?.sourceKey) tempKeysForCleanup.push(previewImageInput.sourceKey);
      } else {
        const parsed = await parseMultipart(req);
        fields = parsed.fields;
        const files = parsed.files;
        const pdfFile = toSingleFile(files.pdf);
        const coverFile = toSingleFile(files.coverImage);
        const previewImageFile = toSingleFile(files.previewImage);
        pdfInput = pdfFile
          ? {
              filepath: pdfFile.filepath,
              mimetype: pdfFile.mimetype,
              originalFilename: pdfFile.originalFilename,
            }
          : null;
        coverInput = coverFile
          ? {
              filepath: coverFile.filepath,
              mimetype: coverFile.mimetype,
              originalFilename: coverFile.originalFilename,
            }
          : null;
        previewImageInput = previewImageFile
          ? {
              filepath: previewImageFile.filepath,
              mimetype: previewImageFile.mimetype,
              originalFilename: previewImageFile.originalFilename,
            }
          : null;
      }
    } catch (parseError) {
      const msg = String(parseError?.message || parseError || "Invalid upload payload");
      const tooLarge =
        Number(parseError?.httpCode) === 413 ||
        Number(parseError?.code) === 1009 ||
        /maxFileSize|larger than|max total file size|payload too large/i.test(msg);
      await deleteKeysBestEffort(r2Client, bucket, tempKeysForCleanup);
      return res.status(tooLarge ? 413 : 400).json({
        error: tooLarge
          ? "Uploaded file is too large for this endpoint."
          : "Invalid upload payload.",
      });
    }

    try {
      const typeValue = toSingleField(fields.type);
      const title = toSingleField(fields.title);
      const price = toSingleField(fields.price);
      const subject = toSingleField(fields.subject);
      const topic = toSlug(toSingleField(fields.topic));
      const subtopicRaw = toSlug(toSingleField(fields.subtopic));
      const showPreviewPage = toSingleField(fields.showPreviewPage) === "true";
      const classFromField = toSingleField(fields.class);
      const isCrossClassWorksheet =
        typeValue === "worksheet" && (subject === "english" || subject === "maths");
      const classValue = isCrossClassWorksheet ? "" : classFromField;

    if (!isCrossClassWorksheet && !CLASS_TO_LABEL[classValue]) {
      return res.status(400).json({ error: "Invalid class" });
    }

    if (!TYPE_TO_CATEGORY_LABEL[typeValue]) {
      return res.status(400).json({ error: "Invalid type" });
    }

    if (!title) {
      return res.status(400).json({ error: "Title is required" });
    }
    if (!SUBJECT_VALUES.has(subject)) {
      return res.status(400).json({ error: "Subject is required" });
    }
    if (topic && !TOPICS_BY_SUBJECT[subject]?.has(topic)) {
      return res.status(400).json({ error: "Invalid topic for selected subject" });
    }
    const subtopic =
      subject === "english" && topic === "grammar"
        ? subtopicRaw
        : "";
    if (subtopic && !ENGLISH_GRAMMAR_SUBTOPICS.has(subtopic)) {
      return res.status(400).json({ error: "Invalid subtopic for English grammar" });
    }

    const hideAgeLabel = subject === "english" || subject === "maths";
    const ageLabel = hideAgeLabel ? "" : getAgeLabelByClass(classValue);

    const normalizedPrice = Number.parseInt(String(price || ""), 10);
    if (!Number.isFinite(normalizedPrice) || normalizedPrice <= 0) {
      return res.status(400).json({ error: "Price must be a positive number" });
    }

    if (!pdfInput) {
      return res.status(400).json({ error: "PDF file is required" });
    }

    if (!coverInput) {
      return res.status(400).json({ error: "Cover image is required" });
    }

    const pdfType = String(pdfInput.mimetype || "").toLowerCase();
    if (!pdfType.includes("pdf")) {
      return res.status(400).json({ error: "Uploaded PDF file is invalid" });
    }

    const coverType = String(coverInput.mimetype || "").toLowerCase();
    if (!coverType.startsWith("image/")) {
      return res.status(400).json({ error: "Cover image file is invalid" });
    }
    if (previewImageInput) {
      const previewType = String(previewImageInput.mimetype || "").toLowerCase();
      if (!previewType.startsWith("image/")) {
        return res.status(400).json({ error: "Preview image file is invalid" });
      }
    }

    const pdfBody = pdfInput.buffer || (pdfInput.filepath ? await fs.readFile(pdfInput.filepath) : null);
    const coverBody =
      coverInput.buffer || (coverInput.filepath ? await fs.readFile(coverInput.filepath) : null);
    if (!pdfBody || pdfBody.length === 0) {
      return res.status(400).json({ error: "Uploaded PDF file is empty" });
    }
    if (!coverBody || coverBody.length === 0) {
      return res.status(400).json({ error: "Uploaded cover image is empty" });
    }

    let pdfInfo;
    try {
      pdfInfo = await readPdfInfoFromBytes(pdfBody, {
        renderPreview: showPreviewPage && !previewImageInput,
      });
    } catch (pdfInfoError) {
      console.error("PDF read failed:", pdfInfoError);
      return res.status(400).json({ error: "Could not read pages from the uploaded PDF." });
    }

    const pages = pdfInfo.pages;

    const pdfKey = buildPdfKey({
      classValue,
      typeValue,
      title,
      price: normalizedPrice,
    });
    const base = pdfKey.replace(/\.pdf$/i, "");
    const productId = getProductId({ classValue, subject, typeValue, title });
    if (!productId) {
      return res.status(400).json({ error: "Unable to generate product id" });
    }

    const coverExt = extensionForContentType(coverInput.mimetype, coverInput.originalFilename);
    const coverKey = `${base}__cover${coverExt}`;
    const previewKey = `${base}__preview1.png`;

    const metaKey = `${base}__meta.json`;

    await putObject(r2Client, bucket, pdfKey, pdfBody, "application/pdf");
    await putObject(r2Client, bucket, coverKey, coverBody, coverInput.mimetype);

    let coverThumbKey = "";
    const coverThumbVariant = await generateThumbnailVariant(coverBody, { maxWidth: 640 });
    if (coverThumbVariant?.body) {
      coverThumbKey = `${base}__cover__thumb640${coverThumbVariant.extension}`;
      await putObject(
        r2Client,
        bucket,
        coverThumbKey,
        coverThumbVariant.body,
        coverThumbVariant.contentType
      );
    }

    let previewPageKey = "";
    let previewThumbKey = "";

    if (showPreviewPage) {
      try {
        const previewBody = previewImageInput
          ? previewImageInput.buffer ||
            (previewImageInput.filepath ? await fs.readFile(previewImageInput.filepath) : null)
          : pdfInfo.previewPng;
        if (!previewBody) {
          throw new Error("Missing generated preview image buffer");
        }
        await putObject(r2Client, bucket, previewKey, previewBody, "image/png");
        previewPageKey = previewKey;

        const previewThumbVariant = await generateThumbnailVariant(previewBody, { maxWidth: 640 });
        if (previewThumbVariant?.body) {
          previewThumbKey = `${base}__preview1__thumb640${previewThumbVariant.extension}`;
          await putObject(
            r2Client,
            bucket,
            previewThumbKey,
            previewThumbVariant.body,
            previewThumbVariant.contentType
          );
        }
      } catch (previewError) {
        console.error("Auto preview generation failed:", previewError);
      }
    }

    const metadata = {
      version: 1,
      id: productId,
      class: classValue,
      type: typeValue,
      title,
      price: normalizedPrice,
      pages,
      ageLabel,
      hideAgeLabel,
      subject,
      topic,
      subtopic,
      showPreviewPage,
      assets: {
        pdfKey,
        coverKey,
        coverThumbKey,
        previewPageKey,
        previewThumbKey,
      },
      adminEmail: adminUser.email,
      createdAt: new Date().toISOString(),
    };

    await r2Client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: metaKey,
        Body: JSON.stringify(metadata, null, 2),
        ContentType: "application/json",
        CacheControl: "public, max-age=60",
      })
    );

    await setDoc(
      doc(db, "products", productId),
      {
        id: productId,
        class: classValue,
        type: typeValue,
        subject,
        topic,
        subtopic,
        title,
        category: TYPE_TO_CATEGORY_LABEL[typeValue] || "Worksheet",
        subcategory: title,
        price: normalizedPrice,
        pages,
        ageLabel,
        hideAgeLabel,
        storageKey: pdfKey,
        imageUrl: `/api/thumbnail?key=${encodeURIComponent(coverThumbKey || coverKey)}`,
        imageOriginalUrl: `/api/thumbnail?key=${encodeURIComponent(coverKey)}`,
        previewImageUrl: showPreviewPage && previewPageKey
          ? `/api/thumbnail?key=${encodeURIComponent(previewThumbKey || previewPageKey)}`
          : "",
        previewImageOriginalUrl: showPreviewPage && previewPageKey
          ? `/api/thumbnail?key=${encodeURIComponent(previewPageKey)}`
          : "",
        showPreviewPage: Boolean(showPreviewPage),
        updatedBy: adminUser.email,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );

      return res.status(200).json({
        ok: true,
        message: "Product assets uploaded to R2",
        storage: {
          productId,
          pdfKey,
          coverKey,
          coverThumbKey,
          previewKey: showPreviewPage ? previewPageKey : "",
          previewThumbKey: showPreviewPage ? previewThumbKey : "",
          metaKey,
        },
        nextStep: "Listing is saved to Firestore and should appear automatically in the library.",
      });
    } finally {
      await deleteKeysBestEffort(r2Client, bucket, tempKeysForCleanup);
    }
  } catch (error) {
    console.error("Admin upload failed:", error);
    const message = String(error?.message || "").trim();
    if (message) {
      return res.status(500).json({ error: message });
    }
    return res.status(500).json({ error: "Failed to upload product assets" });
  }
}

import fs from "fs/promises";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { doc, setDoc } from "firebase/firestore";
import formidable from "formidable";
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

const SUBJECT_VALUES = new Set(["english", "maths", "evs"]);
const TOPICS_BY_SUBJECT = {
  english: new Set(["reading", "writing", "grammar", "poems", "sight-words"]),
  maths: new Set(["numbers", "addition", "subtraction", "shapes", "measurement"]),
  evs: new Set(["environment", "plants", "animals", "water", "food"]),
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

function buildPdfKey({ classValue, typeValue, title, price }) {
  const classLabel = CLASS_TO_LABEL[classValue] || classValue;
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
    maxFiles: 2,
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

async function readPdfInfo(pdfPath, { renderPreview = false } = {}) {
  const bytes = await fs.readFile(pdfPath);
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  let canvasApi = null;
  if (renderPreview) {
    canvasApi = await import("@napi-rs/canvas");
    if (canvasApi.DOMMatrix && !globalThis.DOMMatrix) globalThis.DOMMatrix = canvasApi.DOMMatrix;
    if (canvasApi.Path2D && !globalThis.Path2D) globalThis.Path2D = canvasApi.Path2D;
    if (canvasApi.ImageData && !globalThis.ImageData) globalThis.ImageData = canvasApi.ImageData;
  }

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(bytes),
    disableWorker: true,
  });

  const pdf = await loadingTask.promise;
  const pages = Math.max(Number.parseInt(String(pdf.numPages || "1"), 10) || 1, 1);

  let previewPng = null;
  if (renderPreview && canvasApi) {
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
  }

  await pdf.destroy();
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

    const { fields, files } = await parseMultipart(req);

    const typeValue = toSingleField(fields.type);
    const title = toSingleField(fields.title);
    const price = toSingleField(fields.price);
    const subject = toSingleField(fields.subject);
    const topic = toSlug(toSingleField(fields.topic));
    const subtopicRaw = toSlug(toSingleField(fields.subtopic));
    const showPreviewPage = toSingleField(fields.showPreviewPage) === "true";
    const classFromField = toSingleField(fields.class);
    const classValue =
      subject === "english" && typeValue === "worksheet"
        ? "class-1"
        : classFromField;

    if (!CLASS_TO_LABEL[classValue]) {
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

    const pdfFile = toSingleFile(files.pdf);
    const coverFile = toSingleFile(files.coverImage);
    if (!pdfFile) {
      return res.status(400).json({ error: "PDF file is required" });
    }

    if (!coverFile) {
      return res.status(400).json({ error: "Cover image is required" });
    }

    const pdfType = String(pdfFile.mimetype || "").toLowerCase();
    if (!pdfType.includes("pdf")) {
      return res.status(400).json({ error: "Uploaded PDF file is invalid" });
    }

    const coverType = String(coverFile.mimetype || "").toLowerCase();
    if (!coverType.startsWith("image/")) {
      return res.status(400).json({ error: "Cover image file is invalid" });
    }

    let pdfInfo;
    try {
      pdfInfo = await readPdfInfo(pdfFile.filepath, { renderPreview: showPreviewPage });
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
    const productId = `${toSlug(classValue)}-${toSlug(title)}`;

    const coverExt = extensionForContentType(coverFile.mimetype, coverFile.originalFilename);
    const coverKey = `${base}__cover${coverExt}`;

    const previewKey = `${base}__preview1.png`;

    const metaKey = `${base}__meta.json`;

    const r2Client = getR2Client();

    const pdfBody = await fs.readFile(pdfFile.filepath);
    const coverBody = await fs.readFile(coverFile.filepath);
    await putObject(r2Client, bucket, pdfKey, pdfBody, "application/pdf");
    await putObject(r2Client, bucket, coverKey, coverBody, coverFile.mimetype);

    let previewPageKey = "";

    if (showPreviewPage) {
      try {
        if (!pdfInfo.previewPng) {
          throw new Error("Missing generated preview image buffer");
        }
        await putObject(r2Client, bucket, previewKey, pdfInfo.previewPng, "image/png");
        previewPageKey = previewKey;
      } catch (previewError) {
        console.error("Auto preview generation failed:", previewError);
        return res.status(500).json({
          error: "Could not generate first-page preview from this PDF.",
        });
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
        previewPageKey,
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
        imageUrl: `/api/thumbnail?key=${encodeURIComponent(coverKey)}`,
        previewImageUrl: showPreviewPage && previewPageKey
          ? `/api/thumbnail?key=${encodeURIComponent(previewPageKey)}`
          : "",
        showPreviewPage: Boolean(showPreviewPage && previewPageKey),
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
        previewKey: showPreviewPage ? previewPageKey : "",
        metaKey,
      },
      nextStep: "Listing is saved to Firestore and should appear automatically in the library.",
    });
  } catch (error) {
    console.error("Admin upload failed:", error);
    return res.status(500).json({ error: "Failed to upload product assets" });
  }
}

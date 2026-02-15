import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { PDFDocument } from "pdf-lib/dist/pdf-lib.esm.js";

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

async function bodyToBuffer(body) {
  if (!body) return null;

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

  return null;
}

export default async function handler(req, res) {
  const key = String(req.query.file || "").trim();
  const pagesToPreview = Number.parseInt(String(req.query.pages || ""), 10);
  const shouldLimitPages = Number.isFinite(pagesToPreview) && pagesToPreview > 0;

  if (!key) {
    return res.status(400).json({ error: "File not specified" });
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
    const r2Client = getR2Client();
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ResponseContentType: "application/pdf",
    });
    const response = await r2Client.send(command);
    const sourceBytes = await bodyToBuffer(response.Body);
    if (!sourceBytes) {
      return res.status(404).json({ error: "File not found" });
    }

    if (shouldLimitPages) {
      const sourceDoc = await PDFDocument.load(sourceBytes);
      const totalPages = sourceDoc.getPageCount();
      const targetPageCount = Math.min(pagesToPreview, totalPages);
      const previewDoc = await PDFDocument.create();
      const pageIndexes = Array.from(
        { length: targetPageCount },
        (_, index) => index
      );
      const copiedPages = await previewDoc.copyPages(sourceDoc, pageIndexes);
      copiedPages.forEach((page) => previewDoc.addPage(page));
      const previewBytes = await previewDoc.save();

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `inline; filename="${key}"`);
      res.setHeader("Cache-Control", "public, max-age=300");
      return res.status(200).send(Buffer.from(previewBytes));
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${key}"`);
    res.setHeader("Cache-Control", "public, max-age=300");
    return res.status(200).send(sourceBytes);
  } catch (error) {
    if (error?.name === "NoSuchKey") {
      return res.status(404).json({ error: "File not found" });
    }
    console.error("Preview fetch from R2 failed:", error);
    return res.status(500).json({ error: "Failed to load preview" });
  }
}

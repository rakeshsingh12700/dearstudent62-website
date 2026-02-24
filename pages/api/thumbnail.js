import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";

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

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const key = String(req.query.key || "").trim();
  const file = String(req.query.file || "").trim();
  if (!key && !file) {
    return res.status(400).json({ error: "Thumbnail key/file is required" });
  }

  const bucket = String(process.env.R2_BUCKET_NAME || "").trim();
  if (!bucket) {
    return res.status(500).json({ error: "Missing R2_BUCKET_NAME" });
  }

  const addCandidate = (set, value) => {
    const v = String(value || "").trim();
    if (!v) return;
    if (v.includes("/") || v.includes("\\") || v.includes("..")) return;
    set.add(v);
  };

  const candidates = new Set();
  addCandidate(candidates, key);

  const source = file || key;
  if (source) {
    const base = source.replace(/\.[^.]+$/i, "");
    addCandidate(candidates, `${base}.jpg`);
    addCandidate(candidates, `${base}.jpeg`);
    addCandidate(candidates, `${base}.png`);
    addCandidate(candidates, `${base}.webp`);
  }

  const contentTypeFromKey = (objectKey) => {
    const lower = String(objectKey || "").toLowerCase();
    if (lower.endsWith(".webp")) return "image/webp";
    if (lower.endsWith(".png")) return "image/png";
    if (lower.endsWith(".jpeg") || lower.endsWith(".jpg")) return "image/jpeg";
    return "application/octet-stream";
  };

  try {
    const r2Client = getR2Client();
    for (const candidate of candidates) {
      try {
        const command = new GetObjectCommand({
          Bucket: bucket,
          Key: candidate,
        });
        const response = await r2Client.send(command);
        const body = response.Body;
        if (!body) continue;

        res.setHeader(
          "Content-Type",
          String(response.ContentType || contentTypeFromKey(candidate))
        );
        res.setHeader("Cache-Control", "public, max-age=31536000, s-maxage=31536000, immutable");

        if (response.ContentLength) {
          res.setHeader("Content-Length", String(response.ContentLength));
        }

        if (typeof body.pipe === "function") {
          res.status(200);
          body.pipe(res);
          return;
        }

        if (typeof body.transformToByteArray === "function") {
          const byteArray = await body.transformToByteArray();
          return res.status(200).send(Buffer.from(byteArray));
        }

        if (typeof body[Symbol.asyncIterator] === "function") {
          const chunks = [];
          for await (const chunk of body) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          }
          return res.status(200).send(Buffer.concat(chunks));
        }
      } catch (error) {
        if (error?.name === "NoSuchKey" || error?.name === "NotFound") {
          continue;
        }
        throw error;
      }
    }
    return res.status(404).json({ error: "Thumbnail not found" });
  } catch (error) {
    if (error?.name === "NoSuchKey") {
      return res.status(404).json({ error: "Thumbnail not found" });
    }
    console.error("Thumbnail fetch from R2 failed:", error);
    return res.status(500).json({ error: "Failed to load thumbnail" });
  }
}

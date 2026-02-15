import { HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";

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
  if (!key) {
    return res.status(400).json({ error: "Missing key query parameter" });
  }
  if (key.includes("/") || key.includes("\\") || key.includes("..")) {
    return res.status(400).json({ error: "Invalid key" });
  }

  const bucket = String(process.env.R2_BUCKET_NAME || "").trim();
  if (!bucket) {
    return res.status(500).json({ error: "Missing R2_BUCKET_NAME" });
  }

  try {
    const r2Client = getR2Client();
    await r2Client.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: key,
      })
    );
    return res.status(200).json({ exists: true });
  } catch (error) {
    const code = String(error?.name || error?.Code || "");
    if (code === "NotFound" || code === "NoSuchKey") {
      return res.status(200).json({ exists: false });
    }
    console.error("Asset exists check failed:", error);
    return res.status(500).json({ error: "Failed to check asset" });
  }
}

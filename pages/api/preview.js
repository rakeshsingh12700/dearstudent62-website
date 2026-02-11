import fs from "fs";
import path from "path";

export default async function handler(req, res) {
  const { file } = req.query;

  if (!file) {
    return res.status(400).json({ error: "File not specified" });
  }

  const filePath = path.join(process.cwd(), "private/pdfs", file);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "File not found" });
  }

  const fileStream = fs.createReadStream(filePath);

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${file}"`);

  fileStream.pipe(res);
}

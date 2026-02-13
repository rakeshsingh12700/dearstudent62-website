import fs from "fs";
import path from "path";
import { PDFDocument } from "pdf-lib/dist/pdf-lib.esm.js";

export default async function handler(req, res) {
  const { file } = req.query;
  const pagesToPreview = Number.parseInt(String(req.query.pages || ""), 10);
  const shouldLimitPages = Number.isFinite(pagesToPreview) && pagesToPreview > 0;

  if (!file) {
    return res.status(400).json({ error: "File not specified" });
  }

  const normalizedFileName = path.basename(String(file));
  const filePath = path.join(process.cwd(), "private/pdfs", normalizedFileName);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "File not found" });
  }

  if (shouldLimitPages) {
    const sourceBytes = fs.readFileSync(filePath);
    const sourceDoc = await PDFDocument.load(sourceBytes);
    const totalPages = sourceDoc.getPageCount();
    const targetPageCount = Math.min(pagesToPreview, totalPages);
    const previewDoc = await PDFDocument.create();
    const pageIndexes = Array.from({ length: targetPageCount }, (_, index) => index);
    const copiedPages = await previewDoc.copyPages(sourceDoc, pageIndexes);
    copiedPages.forEach((page) => previewDoc.addPage(page));
    const previewBytes = await previewDoc.save();

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${normalizedFileName}"`);
    res.setHeader("Cache-Control", "public, max-age=300");
    return res.status(200).send(Buffer.from(previewBytes));
  }

  const fileStream = fs.createReadStream(filePath);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${normalizedFileName}"`);
  return fileStream.pipe(res);
}

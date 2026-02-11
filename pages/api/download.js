import fs from "fs";
import path from "path";
import { getDoc, doc } from "firebase/firestore";
import { db } from "../../firebase/config";

export default async function handler(req, res) {
  const { paymentId } = req.query;

  if (!paymentId) {
    return res.status(400).json({ error: "Payment ID required" });
  }

  const purchaseDoc = await getDoc(
    doc(db, "purchases", paymentId)
  );

  if (!purchaseDoc.exists()) {
    return res.status(403).json({ error: "Unauthorized" });
  }

  const filePath = path.join(
    process.cwd(),
    "private/pdfs",
    "nursery-english.pdf"
  );

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "File not found" });
  }

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="nursery-english.pdf"`
  );

  fs.createReadStream(filePath).pipe(res);
}

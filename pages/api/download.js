import fs from "fs";
import path from "path";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  where,
} from "firebase/firestore";
import { db } from "../../firebase/config";
import { DEFAULT_PRODUCT_ID, PRODUCT_CATALOG } from "../../lib/productCatalog";

export default async function handler(req, res) {
  const paymentId = String(req.query.paymentId || "").trim();
  const requestedProductId = String(req.query.productId || "").trim();

  if (!paymentId) {
    return res.status(400).json({ error: "Payment ID required" });
  }

  let purchaseData = null;

  if (requestedProductId) {
    const productOrderQuery = query(
      collection(db, "purchases"),
      where("paymentId", "==", paymentId),
      where("productId", "==", requestedProductId),
      limit(1)
    );

    const productOrderSnapshot = await getDocs(productOrderQuery);
    if (!productOrderSnapshot.empty) {
      purchaseData = productOrderSnapshot.docs[0].data();
    }
  }

  if (!purchaseData) {
    const legacyDoc = await getDoc(doc(db, "purchases", paymentId));
    if (legacyDoc.exists()) {
      purchaseData = legacyDoc.data();
    }
  }

  if (!purchaseData) {
    const firstOrderItemQuery = query(
      collection(db, "purchases"),
      where("paymentId", "==", paymentId),
      limit(1)
    );
    const firstOrderItemSnapshot = await getDocs(firstOrderItemQuery);
    if (!firstOrderItemSnapshot.empty) {
      purchaseData = firstOrderItemSnapshot.docs[0].data();
    }
  }

  if (!purchaseData) {
    return res.status(403).json({ error: "Unauthorized" });
  }

  const finalProductId =
    requestedProductId ||
    String(purchaseData.productId || "").trim() ||
    DEFAULT_PRODUCT_ID;
  const productEntry = PRODUCT_CATALOG[finalProductId];

  if (!productEntry) {
    return res.status(404).json({ error: "Product file mapping not found" });
  }

  const filePath = path.join(
    process.cwd(),
    "private/pdfs",
    productEntry.file
  );

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "File not found" });
  }

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${productEntry.file}"`
  );

  fs.createReadStream(filePath).pipe(res);
}

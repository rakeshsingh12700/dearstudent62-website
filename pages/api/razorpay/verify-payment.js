import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import { doc, setDoc } from "firebase/firestore";
import { db } from "../../../firebase/config";
import { saveToken } from "../../../lib/tokenStore";
import { DEFAULT_PRODUCT_ID, PRODUCT_CATALOG } from "../../../lib/productCatalog";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).end();
  }

  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    email,
    userId,
    items,
  } = req.body;

  const normalizedEmail = String(email || "").trim().toLowerCase();

  if (!normalizedEmail) {
    return res.status(400).json({ success: false, error: "Email is required" });
  }

  const expectedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");

  if (expectedSignature === razorpay_signature) {
    const token = uuidv4();
    const now = new Date();
    const normalizedUserId =
      typeof userId === "string" && userId ? userId : null;

    const normalizedItems = (Array.isArray(items) ? items : [])
      .map((item) => ({
        productId: String(item?.productId || "").trim(),
        quantity: Number(item?.quantity || 0),
      }))
      .filter(
        (item) =>
          item.productId &&
          Number.isFinite(item.quantity) &&
          item.quantity > 0 &&
          PRODUCT_CATALOG[item.productId]
      );

    const aggregatedItems = normalizedItems.reduce((acc, item) => {
      const existing = acc[item.productId] || 0;
      acc[item.productId] = existing + item.quantity;
      return acc;
    }, {});

    const productIds = Object.keys(aggregatedItems);
    const purchaseProductIds =
      productIds.length > 0 ? productIds : [DEFAULT_PRODUCT_ID];
    const primaryProductId = purchaseProductIds[0];
    const primaryProduct = PRODUCT_CATALOG[primaryProductId];
    const purchasedStorageKeys = purchaseProductIds
      .map((productId) => String(PRODUCT_CATALOG[productId]?.storageKey || ""))
      .filter(Boolean);

    saveToken(
      token,
      purchasedStorageKeys.length > 0 ? purchasedStorageKeys : [primaryProduct.file]
    );

    await Promise.all(
      purchaseProductIds.map((productId) =>
        setDoc(doc(db, "purchases", `${razorpay_payment_id}_${productId}`), {
          email: normalizedEmail,
          userId: normalizedUserId,
          productId,
          quantity: aggregatedItems[productId] || 1,
          paymentId: razorpay_payment_id,
          purchasedAt: now,
        })
      )
    );

    return res.status(200).json({
      success: true,
      token,
      paymentId: razorpay_payment_id,
      primaryProductId,
      productIds: purchaseProductIds,
    });
  } else {
    return res.status(400).json({ success: false });
  }
}

import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import { doc, setDoc } from "firebase/firestore";
import { db } from "../../../firebase/config";
import { saveToken } from "../../../lib/tokenStore";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).end();
  }

  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    email,
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

    saveToken(token, "nursery-english.pdf");

    await setDoc(
      doc(db, "purchases", razorpay_payment_id),
      {
        email: normalizedEmail,
        userId: null,
        productId: "nursery-english",
        paymentId: razorpay_payment_id,
        purchasedAt: new Date(),
      }
    );

    return res.status(200).json({
      success: true,
      token,
      paymentId: razorpay_payment_id,
    });
  } else {
    return res.status(400).json({ success: false });
  }
}

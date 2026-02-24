import { doc, updateDoc } from "firebase/firestore";
import { db } from "../../../../firebase/config";
import { requireAdminUser } from "../../../../lib/adminAuth";
import { getCouponById, listCouponUsages } from "../../../../lib/coupons/server";

export default async function handler(req, res) {
  const auth = await requireAdminUser(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }

  try {
    const couponId = String(req.query.couponId || "").trim();
    if (!couponId) {
      return res.status(400).json({ error: "Coupon id is required" });
    }

    if (req.method === "GET") {
      const coupon = await getCouponById(couponId);
      if (!coupon) {
        return res.status(404).json({ error: "Coupon not found" });
      }

      const usages = await listCouponUsages(couponId, req.query.limit || 500);
      return res.status(200).json({
        ok: true,
        coupon,
        usages,
        summary: {
          totalUsages: usages.length,
          totalDiscountGiven: usages.reduce(
            (sum, item) => sum + Number(item.discountAmount || 0),
            0
          ),
        },
      });
    }

    if (req.method !== "PATCH") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const action = String(req.body?.action || "disable").trim().toLowerCase();
    const isActive = action === "enable";
    const now = new Date().toISOString();

    await updateDoc(doc(db, "coupons", couponId), {
      isActive,
      updatedAt: now,
      disabledAt: isActive ? null : now,
      disabledBy: isActive ? null : auth.adminUser.email,
    });

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Admin coupon patch failed:", error);
    return res.status(500).json({ error: "Failed to update coupon" });
  }
}

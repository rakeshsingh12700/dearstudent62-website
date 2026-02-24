import { collection, getDocs, limit, query, updateDoc, doc } from "firebase/firestore";
import { db } from "../../../firebase/config";
import { requireAdminUser } from "../../../lib/adminAuth";
import {
  createCouponFromAdminPayload,
  normalizeCouponDocument,
} from "../../../lib/coupons/server";
import { getCouponRuntimeStatus } from "../../../lib/coupons/common";

function normalizeStatusFilter(value) {
  const normalized = String(value || "all").trim().toLowerCase();
  if (["all", "active", "disabled", "expired", "scheduled"].includes(normalized)) {
    return normalized;
  }
  return "all";
}

function normalizeScopeFilter(value) {
  const normalized = String(value || "all").trim().toLowerCase();
  if (["all", "public", "user_specific", "hidden"].includes(normalized)) return normalized;
  return "all";
}

function normalizeFetchLimit(value) {
  const parsed = Number.parseInt(String(value || "300"), 10);
  if (!Number.isFinite(parsed)) return 300;
  return Math.min(Math.max(parsed, 25), 1000);
}

function toDateMs(value) {
  const date = new Date(value || 0);
  if (Number.isNaN(date.getTime())) return 0;
  return date.getTime();
}

function matchesFilters(item, { status, scope, search }) {
  const runtimeStatus = getCouponRuntimeStatus(item, new Date());

  if (status !== "all" && runtimeStatus !== status) return false;
  if (scope !== "all" && String(item.visibilityScope || "public") !== scope) return false;

  const searchQuery = String(search || "").trim().toLowerCase();
  if (!searchQuery) return true;

  const haystack = [
    item.code,
    item.description,
    item.discountType,
    item.visibilityScope,
    item.userEmail,
    runtimeStatus,
  ]
    .map((value) => String(value || "").toLowerCase())
    .join(" ");

  return haystack.includes(searchQuery);
}

export default async function handler(req, res) {
  const auth = await requireAdminUser(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ error: auth.error });
  }

  if (req.method === "GET") {
    try {
      const fetchLimit = normalizeFetchLimit(req.query.limit);
      const status = normalizeStatusFilter(req.query.status);
      const scope = normalizeScopeFilter(req.query.scope);
      const search = String(req.query.search || "");

      const snapshot = await getDocs(query(collection(db, "coupons"), limit(fetchLimit)));
      const rows = snapshot.docs
        .map((item) => normalizeCouponDocument(item.data(), item.id))
        .sort((a, b) => toDateMs(b.createdAt) - toDateMs(a.createdAt))
        .filter((item) => matchesFilters(item, { status, scope, search }))
        .map((item) => ({
          ...item,
          runtimeStatus: getCouponRuntimeStatus(item, new Date()),
        }));

      const stats = rows.reduce(
        (acc, item) => {
          acc.total += 1;
          const statusValue = item.runtimeStatus;
          acc[statusValue] = (acc[statusValue] || 0) + 1;
          const visibilityScope = String(item.visibilityScope || "public");
          if (visibilityScope === "user_specific") acc.userSpecific += 1;
          else if (visibilityScope === "hidden") acc.hidden += 1;
          else acc.public += 1;
          return acc;
        },
        {
          total: 0,
          active: 0,
          disabled: 0,
          expired: 0,
          scheduled: 0,
          public: 0,
          userSpecific: 0,
          hidden: 0,
        }
      );

      return res.status(200).json({ ok: true, coupons: rows, stats });
    } catch (error) {
      console.error("Admin coupons list failed:", error);
      return res.status(500).json({ error: "Failed to load coupons" });
    }
  }

  if (req.method === "POST") {
    try {
      const created = await createCouponFromAdminPayload(req.body, auth.adminUser.email);
      if (!created.ok) {
        return res.status(created.status || 400).json({ error: created.error || "Invalid coupon payload" });
      }

      return res.status(201).json({ ok: true, coupon: created.coupon });
    } catch (error) {
      console.error("Admin coupon creation failed:", error);
      return res.status(500).json({ error: "Failed to create coupon" });
    }
  }

  if (req.method === "PATCH") {
    try {
      const couponId = String(req.body?.couponId || "").trim();
      const action = String(req.body?.action || "disable").trim().toLowerCase();
      if (!couponId) {
        return res.status(400).json({ error: "couponId is required" });
      }
      if (!["disable", "enable", "enable_new_campaign"].includes(action)) {
        return res.status(400).json({ error: "Invalid action" });
      }

      const now = new Date().toISOString();
      if (action === "enable_new_campaign") {
        await updateDoc(doc(db, "coupons", couponId), {
          isActive: true,
          usedCount: 0,
          updatedAt: now,
          disabledAt: null,
          disabledBy: null,
          usageResetAt: now,
          usageResetBy: auth.adminUser.email,
          usageResetReason: "enable_new_campaign",
        });
      } else {
        const isActive = action === "enable";
        await updateDoc(doc(db, "coupons", couponId), {
          isActive,
          updatedAt: now,
          disabledAt: isActive ? null : now,
          disabledBy: isActive ? null : auth.adminUser.email,
        });
      }

      return res.status(200).json({ ok: true });
    } catch (error) {
      console.error("Admin coupon status update failed:", error);
      return res.status(500).json({ error: "Failed to update coupon status" });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}

import Link from "next/link";
import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useState } from "react";
import Navbar from "../../../components/Navbar";
import AdminShell from "../../../components/AdminShell";
import { useAuth } from "../../../context/AuthContext";
const PAGE_SIZE_OPTIONS = [20, 50, 100];

function formatDateTime(value) {
  const raw = String(value || "").trim();
  if (!raw) return "-";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

export default function AdminCouponDetailsPage() {
  const router = useRouter();
  const { couponId } = router.query;
  const { user } = useAuth();

  const [checkingAccess, setCheckingAccess] = useState(false);
  const [accessAllowed, setAccessAllowed] = useState(false);
  const [accessMessage, setAccessMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [coupon, setCoupon] = useState(null);
  const [usages, setUsages] = useState([]);
  const [summary, setSummary] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);

  const showAdminNav = Boolean(user && accessAllowed);

  useEffect(() => {
    if (!user) {
      setAccessAllowed(false);
      setAccessMessage("");
      return;
    }

    let cancelled = false;
    const checkAccess = async () => {
      setCheckingAccess(true);
      setAccessMessage("");
      try {
        const idToken = await user.getIdToken();
        const response = await fetch("/api/admin/me", {
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        });
        const payload = await response.json().catch(() => ({}));
        if (cancelled) return;

        if (!response.ok || !payload?.allowed) {
          setAccessAllowed(false);
          setAccessMessage(payload?.error || "Your account is not approved for admin access.");
          return;
        }

        setAccessAllowed(true);
      } catch {
        if (cancelled) return;
        setAccessAllowed(false);
        setAccessMessage("Unable to verify admin access right now.");
      } finally {
        if (!cancelled) setCheckingAccess(false);
      }
    };

    checkAccess();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const loadCouponDetails = useCallback(async () => {
    if (!user || !accessAllowed || typeof couponId !== "string") return;

    setLoading(true);
    setError("");

    try {
      const idToken = await user.getIdToken();
      const response = await fetch(`/api/admin/coupons/${encodeURIComponent(couponId)}?limit=600`, {
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok || !payload?.ok) {
        throw new Error(String(payload?.error || "Failed to load coupon details"));
      }

      setCoupon(payload.coupon || null);
      setUsages(Array.isArray(payload?.usages) ? payload.usages : []);
      setSummary(payload?.summary || null);
    } catch (fetchError) {
      setCoupon(null);
      setUsages([]);
      setSummary(null);
      setError(String(fetchError?.message || "Failed to load coupon details"));
    } finally {
      setLoading(false);
    }
  }, [accessAllowed, couponId, user]);

  useEffect(() => {
    loadCouponDetails();
  }, [loadCouponDetails]);

  const totalDiscountLabel = useMemo(() => {
    const amount = Number(summary?.totalDiscountGiven || 0);
    if (!coupon?.discountType) return `${amount}`;
    return `${amount} ${coupon?.discountType === "flat" ? "INR" : ""}`.trim();
  }, [coupon?.discountType, summary?.totalDiscountGiven]);

  const filteredUsages = useMemo(() => {
    const query = String(searchQuery || "").trim().toLowerCase();
    if (!query) return usages;
    return usages.filter((item) =>
      [
        item.email,
        item.userId,
        item.paymentId,
        item.orderId,
        item.status,
        item.currency,
      ]
        .map((value) => String(value || "").toLowerCase())
        .join(" ")
        .includes(query)
    );
  }, [searchQuery, usages]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filteredUsages.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * pageSize;
  const pagedUsages = filteredUsages.slice(startIndex, startIndex + pageSize);

  return (
    <>
      <Navbar />
      <main className="auth-page admin-page admin-coupons-page">
        <section className="container admin-wrap">
          <AdminShell currentSection={showAdminNav ? "coupons" : "public"}>
            <section className="auth-card admin-card">
              <div className="admin-card__header">
                <div>
                  <h1>Coupon Usage Details</h1>
                  <p className="auth-subtext">Usage history by user and order/payment reference.</p>
                </div>
                <div className="admin-card__actions">
                  <Link href="/admin/coupons" className="btn btn-secondary">Back to Coupons</Link>
                  <button type="button" className="btn btn-secondary" onClick={loadCouponDetails} disabled={loading}>
                    {loading ? "Refreshing..." : "Refresh"}
                  </button>
                </div>
              </div>

              {!user ? (
                <div className="auth-status auth-status--error">
                  <p>Please login with your admin account to view coupon usage.</p>
                  <Link href="/auth?next=/admin/coupons" className="btn btn-primary auth-status__action">
                    Login to Admin
                  </Link>
                </div>
              ) : (
                <p className="auth-subtext">
                  Logged in as {user.email}
                  {checkingAccess ? " (Checking access...)" : ""}
                </p>
              )}

              {user && !checkingAccess && !accessAllowed && (
                <div className="auth-status auth-status--error">
                  <p>Access denied for this account.</p>
                  <p>{accessMessage}</p>
                </div>
              )}

              {error && (
                <div className="auth-status auth-status--error">
                  <p>{error}</p>
                </div>
              )}

              {user && accessAllowed && coupon && (
                <>
                  <section className="admin-stats-grid">
                    <article className="admin-stat-card">
                      <span>Coupon</span>
                      <strong>{coupon.code}</strong>
                    </article>
                    <article className="admin-stat-card">
                      <span>Total Usages</span>
                      <strong>{summary?.totalUsages || 0}</strong>
                    </article>
                    <article className="admin-stat-card">
                      <span>Total Discount Given</span>
                      <strong>{totalDiscountLabel}</strong>
                    </article>
                    <article className="admin-stat-card">
                      <span>Status</span>
                      <strong>{coupon.isActive ? "Active" : "Disabled"}</strong>
                    </article>
                  </section>

                  <div className="admin-coupon-table-wrap">
                    <div className="admin-card__actions admin-toolbar-row">
                      <label className="admin-filter admin-search" htmlFor="coupon-usage-search">
                        <span>Search</span>
                        <input
                          id="coupon-usage-search"
                          type="search"
                          value={searchQuery}
                          onChange={(event) => setSearchQuery(event.target.value)}
                          placeholder="Search email, payment, order"
                        />
                      </label>
                      <label className="admin-filter" htmlFor="coupon-usage-page-size">
                        <span>Rows</span>
                        <select
                          id="coupon-usage-page-size"
                          value={String(pageSize)}
                          onChange={(event) => setPageSize(Number(event.target.value))}
                        >
                          {PAGE_SIZE_OPTIONS.map((size) => (
                            <option key={size} value={size}>
                              {size} / page
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <table className="admin-coupon-table">
                      <thead>
                        <tr>
                          <th>User Email</th>
                          <th>User ID</th>
                          <th>Payment ID</th>
                          <th>Order ID</th>
                          <th>Order Amount</th>
                          <th>Discount</th>
                          <th>Status</th>
                          <th>Used At</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagedUsages.map((item) => (
                          <tr key={item.id}>
                            <td>{item.email || "-"}</td>
                            <td>{item.userId || "-"}</td>
                            <td>{item.paymentId || "-"}</td>
                            <td>{item.orderId || "-"}</td>
                            <td>{item.orderAmount} {item.currency || "INR"}</td>
                            <td>{item.discountAmount} {item.currency || "INR"}</td>
                            <td>{item.status || "applied"}</td>
                            <td>{formatDateTime(item.usedAt)}</td>
                          </tr>
                        ))}
                        {pagedUsages.length === 0 && (
                          <tr>
                            <td colSpan={8}>No usage records found for this coupon yet.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  {totalPages > 1 && (
                    <div className="admin-pagination">
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
                        disabled={currentPage <= 1}
                      >
                        Previous
                      </button>
                      <span>
                        Page {currentPage} of {totalPages}
                      </span>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => setPage((prev) => Math.min(prev + 1, totalPages))}
                        disabled={currentPage >= totalPages}
                      >
                        Next
                      </button>
                    </div>
                  )}
                </>
              )}
            </section>
          </AdminShell>
        </section>
      </main>
    </>
  );
}

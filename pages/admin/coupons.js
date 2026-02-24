import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import Navbar from "../../components/Navbar";
import AdminShell from "../../components/AdminShell";
import { useAuth } from "../../context/AuthContext";
import { generateCouponCode } from "../../lib/coupons/common";

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "disabled", label: "Disabled" },
  { value: "expired", label: "Expired" },
  { value: "scheduled", label: "Scheduled" },
];

const SCOPE_FILTERS = [
  { value: "all", label: "All" },
  { value: "public", label: "Public" },
  { value: "user_specific", label: "User-specific" },
  { value: "hidden", label: "Hidden (Code Only)" },
];
const PAGE_SIZE_OPTIONS = [20, 50, 100];

function formatDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "-";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatDiscount(coupon) {
  if (!coupon) return "-";
  if (coupon.discountType === "free_item") return "1 item free";
  if (coupon.discountType === "flat") return `₹${coupon.discountValue}`;
  return `${coupon.discountValue}%`;
}

function formatUsage(coupon) {
  const used = Math.max(0, Number(coupon?.usedCount || 0));
  if (coupon?.totalUsageLimit === null || coupon?.totalUsageLimit === undefined) {
    return `${used} / Unlimited`;
  }
  return `${used} / ${coupon.totalUsageLimit}`;
}

function normalizePerUserLabel(coupon) {
  const mode = String(coupon?.perUserMode || "").trim().toLowerCase();
  if (mode === "one_item") return "1 item";
  if (mode === "one_order") return "1 order";
  if (coupon?.perUserLimit === null || coupon?.perUserLimit === undefined) return "Unlimited";
  if (mode === "multiple") return `${coupon.perUserLimit} orders`;
  if (Number(coupon.perUserLimit) === 1) return "1";
  return String(coupon.perUserLimit);
}

function formatVisibility(coupon) {
  const scope = String(coupon?.visibilityScope || "public").trim().toLowerCase();
  if (scope === "user_specific") {
    return coupon?.userEmail ? `User: ${coupon.userEmail}` : "User-specific";
  }
  if (scope === "hidden") return "Hidden (Code only)";
  return "Public";
}

export default function AdminCouponsPage() {
  const { user } = useAuth();
  const [checkingAccess, setCheckingAccess] = useState(false);
  const [accessAllowed, setAccessAllowed] = useState(false);
  const [accessMessage, setAccessMessage] = useState("");
  const showAdminNav = Boolean(user && accessAllowed);

  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [coupons, setCoupons] = useState([]);
  const [stats, setStats] = useState(null);

  const [statusFilter, setStatusFilter] = useState("all");
  const [scopeFilter, setScopeFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);

  const [form, setForm] = useState({
    code: "",
    description: "",
    discountType: "percentage",
    discountValue: "10",
    visibilityScope: "hidden",
    perUserMode: "one_item",
    perUserLimit: "",
    totalUsageMode: "custom",
    totalUsageLimit: "100",
    minOrderAmount: "",
    firstPurchaseOnly: false,
    userEmail: "",
    startDate: "",
    expiryDate: "",
    isActive: true,
  });

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

  const loadCoupons = useCallback(async () => {
    if (!user || !accessAllowed) return;

    setLoading(true);
    setError("");

    try {
      const idToken = await user.getIdToken();
      const params = new URLSearchParams({
        status: statusFilter,
        scope: scopeFilter,
        search: searchQuery,
        limit: "500",
      });

      const response = await fetch(`/api/admin/coupons?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok || !payload?.ok) {
        throw new Error(String(payload?.error || "Failed to load coupons"));
      }

      setCoupons(Array.isArray(payload?.coupons) ? payload.coupons : []);
      setStats(payload?.stats || null);
    } catch (fetchError) {
      setCoupons([]);
      setStats(null);
      setError(String(fetchError?.message || "Failed to load coupons"));
    } finally {
      setLoading(false);
    }
  }, [accessAllowed, scopeFilter, searchQuery, statusFilter, user]);

  useEffect(() => {
    loadCoupons();
  }, [loadCoupons]);

  const handleGenerateCode = () => {
    const prefix =
      form.discountType === "flat"
        ? "SAVE"
        : form.discountType === "free_item"
          ? "FREE"
          : "STUDENT";
    setForm((prev) => ({ ...prev, code: generateCouponCode(prefix, 10) }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!user || !accessAllowed) return;

    setSubmitting(true);
    setError("");
    setSuccess("");

    try {
      const idToken = await user.getIdToken();
      const response = await fetch("/api/admin/coupons", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          ...form,
          autoGenerate: !String(form.code || "").trim(),
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok) {
        throw new Error(String(payload?.error || "Failed to create coupon"));
      }

      setSuccess(`Coupon ${payload?.coupon?.code || ""} created.`.trim());
      setForm((prev) => ({
        ...prev,
        code: "",
        description: "",
        visibilityScope: "hidden",
        discountValue:
          prev.discountType === "percentage"
            ? "10"
            : prev.discountType === "flat"
              ? "50"
              : "0",
        minOrderAmount: "",
        firstPurchaseOnly: false,
        userEmail: "",
      }));
      await loadCoupons();
    } catch (submitError) {
      setError(String(submitError?.message || "Failed to create coupon"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleCoupon = async (couponId, action) => {
    if (!user || !accessAllowed || !couponId) return;

    setError("");
    setSuccess("");

    try {
      const idToken = await user.getIdToken();
      const response = await fetch(`/api/admin/coupons/${encodeURIComponent(couponId)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ action }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok) {
        throw new Error(String(payload?.error || "Failed to update coupon"));
      }

      setSuccess(action === "enable" ? "Coupon enabled." : "Coupon disabled.");
      await loadCoupons();
    } catch (toggleError) {
      setError(String(toggleError?.message || "Failed to update coupon"));
    }
  };

  const statsCards = useMemo(() => {
    if (!stats) return [];
    return [
      { label: "Total", value: stats.total || 0 },
      { label: "Active", value: stats.active || 0 },
      { label: "Expired", value: stats.expired || 0 },
      { label: "User-specific", value: stats.userSpecific || 0 },
      { label: "Hidden", value: stats.hidden || 0 },
    ];
  }, [stats]);

  useEffect(() => {
    setPage(1);
  }, [pageSize, searchQuery, scopeFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(coupons.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * pageSize;
  const pagedCoupons = coupons.slice(startIndex, startIndex + pageSize);

  return (
    <>
      <Navbar />
      <main className="auth-page admin-page admin-coupons-page">
        <section className="container admin-wrap">
          <AdminShell currentSection={showAdminNav ? "coupons" : "public"}>
            <section className="auth-card admin-card">
              <div className="admin-card__header">
                <div>
                  <h1>Coupons</h1>
                  <p className="auth-subtext">
                    Create, monitor, and disable checkout coupon campaigns.
                  </p>
                </div>
              </div>

              {!user ? (
                <div className="auth-status auth-status--error">
                  <p>Please login with your admin account to manage coupons.</p>
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

              {user && checkingAccess && (
                <div className="auth-status">
                  <p>Checking admin access...</p>
                </div>
              )}

              {user && accessAllowed && (
                <>
                  <form className="admin-coupon-form" onSubmit={handleSubmit}>
                    <div className="admin-coupon-form__row">
                      <label className="admin-filter">
                        <span>Coupon Code</span>
                        <input
                          type="text"
                          value={form.code}
                          onChange={(event) =>
                            setForm((prev) => ({ ...prev, code: event.target.value.toUpperCase() }))
                          }
                          placeholder="STUDENT10"
                        />
                      </label>
                      <button
                        type="button"
                        className="btn btn-secondary admin-coupon-generate-btn"
                        onClick={handleGenerateCode}
                      >
                        Auto Generate
                      </button>
                    </div>

                    <label className="admin-filter">
                      <span>Description</span>
                      <input
                        type="text"
                        value={form.description}
                        onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                        placeholder="Launch campaign / WhatsApp blast"
                      />
                    </label>

                    <div className="admin-coupon-form__grid">
                      <label className="admin-filter">
                        <span>Discount Type</span>
                        <select
                          value={form.discountType}
                          onChange={(event) =>
                            setForm((prev) => ({
                              ...prev,
                              discountType: event.target.value,
                              discountValue:
                                event.target.value === "percentage"
                                  ? "10"
                                  : event.target.value === "flat"
                                    ? "50"
                                    : "0",
                            }))
                          }
                        >
                          <option value="percentage">Percentage</option>
                          <option value="flat">Flat Amount</option>
                          <option value="free_item">One Item Free</option>
                        </select>
                      </label>

                      <label className="admin-filter">
                        <span>
                          {form.discountType === "percentage"
                            ? "Discount %"
                            : form.discountType === "flat"
                              ? "Discount Amount"
                              : "Discount Value"}
                        </span>
                        <input
                          type="number"
                          min="1"
                          max={form.discountType === "percentage" ? "100" : undefined}
                          value={form.discountValue}
                          onChange={(event) =>
                            setForm((prev) => ({ ...prev, discountValue: event.target.value }))
                          }
                          required={form.discountType !== "free_item"}
                          disabled={form.discountType === "free_item"}
                          placeholder={form.discountType === "free_item" ? "Auto: highest item free" : ""}
                        />
                      </label>

                      <label className="admin-filter">
                        <span>Visibility</span>
                        <select
                          value={form.visibilityScope}
                          onChange={(event) =>
                            setForm((prev) => ({
                              ...prev,
                              visibilityScope: event.target.value,
                              userEmail:
                                event.target.value === "user_specific" ? prev.userEmail : "",
                            }))
                          }
                        >
                          <option value="hidden">Hidden (Code only)</option>
                          <option value="public">Public</option>
                          <option value="user_specific">User-specific (email)</option>
                        </select>
                      </label>

                      <label className="admin-filter">
                        <span>Per User Usage</span>
                        <select
                          value={form.perUserMode}
                          onChange={(event) =>
                            setForm((prev) => ({ ...prev, perUserMode: event.target.value }))
                          }
                        >
                          <option value="one_item">One item per user</option>
                          <option value="one_order">One order per user</option>
                          <option value="multiple">Multiple orders per user (set limit)</option>
                          <option value="unlimited">Unlimited orders per user</option>
                        </select>
                      </label>

                      {form.perUserMode === "multiple" ? (
                        <label className="admin-filter">
                          <span>Per User Limit</span>
                          <input
                            type="number"
                            min="1"
                            value={form.perUserLimit}
                            onChange={(event) =>
                              setForm((prev) => ({ ...prev, perUserLimit: event.target.value }))
                            }
                            placeholder="e.g. 3 orders"
                          />
                        </label>
                      ) : (
                        <label className="admin-filter">
                          <span>Per User Limit</span>
                          <input type="text" value="Not required" disabled />
                        </label>
                      )}

                      <label className="admin-filter">
                        <span>Total Usage</span>
                        <select
                          value={form.totalUsageMode}
                          onChange={(event) =>
                            setForm((prev) => ({ ...prev, totalUsageMode: event.target.value }))
                          }
                        >
                          <option value="one">One total usage</option>
                          <option value="custom">Custom usage limit</option>
                          <option value="unlimited">Unlimited</option>
                        </select>
                      </label>

                      {form.totalUsageMode === "custom" ? (
                        <label className="admin-filter">
                          <span>Total Usage Limit</span>
                          <input
                            type="number"
                            min="1"
                            value={form.totalUsageLimit}
                            onChange={(event) =>
                              setForm((prev) => ({ ...prev, totalUsageLimit: event.target.value }))
                            }
                            placeholder="e.g. 100"
                          />
                        </label>
                      ) : (
                        <label className="admin-filter">
                          <span>Total Usage Limit</span>
                          <input type="text" value="Not required" disabled />
                        </label>
                      )}

                      {form.visibilityScope === "user_specific" ? (
                        <label className="admin-filter">
                          <span>User Email (Required)</span>
                          <input
                            type="email"
                            value={form.userEmail}
                            onChange={(event) => setForm((prev) => ({ ...prev, userEmail: event.target.value }))}
                            placeholder="parent@example.com"
                            required
                          />
                        </label>
                      ) : null}

                      <label className="admin-filter">
                        <span>Minimum Order Amount</span>
                        <input
                          type="number"
                          min="1"
                          value={form.minOrderAmount}
                          onChange={(event) =>
                            setForm((prev) => ({ ...prev, minOrderAmount: event.target.value }))
                          }
                          placeholder="Optional (e.g. 199)"
                        />
                      </label>

                      <label className="admin-filter">
                        <span>Start Date (Optional)</span>
                        <input
                          type="date"
                          value={form.startDate}
                          onChange={(event) => setForm((prev) => ({ ...prev, startDate: event.target.value }))}
                        />
                      </label>

                      <label className="admin-filter">
                        <span>Expiry Date (Optional)</span>
                        <input
                          type="date"
                          value={form.expiryDate}
                          onChange={(event) => setForm((prev) => ({ ...prev, expiryDate: event.target.value }))}
                        />
                      </label>
                    </div>

                    <label className="admin-checkbox-row">
                      <input
                        type="checkbox"
                        checked={form.isActive}
                        onChange={(event) =>
                          setForm((prev) => ({ ...prev, isActive: event.target.checked }))
                        }
                      />
                      <span>Create coupon as active</span>
                    </label>
                    <label className="admin-checkbox-row">
                      <input
                        type="checkbox"
                        checked={form.firstPurchaseOnly}
                        onChange={(event) =>
                          setForm((prev) => ({ ...prev, firstPurchaseOnly: event.target.checked }))
                        }
                      />
                      <span>First purchase only</span>
                    </label>

                    <div className="admin-card__actions">
                      <button type="submit" className="btn btn-primary" disabled={submitting}>
                        {submitting ? "Creating..." : "Create Coupon"}
                      </button>
                    </div>
                  </form>

                  {statsCards.length > 0 && (
                    <section className="admin-stats-grid">
                      {statsCards.map((card) => (
                        <article className="admin-stat-card" key={card.label}>
                          <span>{card.label}</span>
                          <strong>{card.value}</strong>
                        </article>
                      ))}
                    </section>
                  )}

                  <div className="admin-card__actions admin-toolbar-row">
                    <label className="admin-filter" htmlFor="coupon-status-filter">
                      <span>Status</span>
                      <select
                        id="coupon-status-filter"
                        value={statusFilter}
                        onChange={(event) => setStatusFilter(event.target.value)}
                      >
                        {STATUS_FILTERS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="admin-filter" htmlFor="coupon-scope-filter">
                      <span>Scope</span>
                      <select
                        id="coupon-scope-filter"
                        value={scopeFilter}
                        onChange={(event) => setScopeFilter(event.target.value)}
                      >
                        {SCOPE_FILTERS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="admin-filter admin-search" htmlFor="coupon-search">
                      <span>Search</span>
                      <input
                        id="coupon-search"
                        type="search"
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        placeholder="Search code or email"
                      />
                    </label>
                    <label className="admin-filter" htmlFor="coupon-page-size">
                      <span>Rows</span>
                      <select
                        id="coupon-page-size"
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

                    <button
                      type="button"
                      className="btn btn-secondary admin-refresh-btn"
                      onClick={loadCoupons}
                      disabled={loading}
                    >
                      {loading ? "Refreshing..." : "Refresh"}
                    </button>
                  </div>

                  <p className="admin-results-meta">
                    Showing {pagedCoupons.length} of {coupons.length} coupon
                    {coupons.length === 1 ? "" : "s"}
                  </p>

                  {error && (
                    <div className="auth-status auth-status--error">
                      <p>{error}</p>
                    </div>
                  )}

                  {success && (
                    <div className="auth-status auth-status--ok">
                      <p>{success}</p>
                    </div>
                  )}

                  <div className="admin-coupon-table-wrap">
                    <table className="admin-coupon-table">
                      <thead>
                        <tr>
                          <th>Code</th>
                          <th>Type</th>
                          <th>Discount</th>
                          <th>Usage</th>
                          <th>Per User</th>
                          <th>Visibility</th>
                          <th>Min Order</th>
                          <th>First Buy</th>
                          <th>Created</th>
                          <th>Expires</th>
                          <th>Status</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagedCoupons.map((coupon) => (
                          <tr key={coupon.id}>
                            <td>
                              <strong>{coupon.code}</strong>
                              {coupon.description ? <p>{coupon.description}</p> : null}
                            </td>
                            <td>
                              {coupon.discountType === "flat"
                                ? "Flat"
                                : coupon.discountType === "free_item"
                                  ? "Free Item"
                                  : "%"}
                            </td>
                            <td>{formatDiscount(coupon)}</td>
                            <td>{formatUsage(coupon)}</td>
                            <td>{normalizePerUserLabel(coupon)}</td>
                            <td>{formatVisibility(coupon)}</td>
                            <td>{coupon.minOrderAmount || "-"}</td>
                            <td>{coupon.firstPurchaseOnly ? "Yes" : "No"}</td>
                            <td>{formatDate(coupon.createdAt)}</td>
                            <td>{formatDate(coupon.expiryDate)}</td>
                            <td>
                              <span className={`admin-submission-status admin-submission-status--coupon-${coupon.runtimeStatus}`}>
                                {coupon.runtimeStatus}
                              </span>
                            </td>
                            <td>
                              <div className="admin-coupon-action-row">
                                <Link href={`/admin/coupons/${encodeURIComponent(coupon.id)}`} className="btn btn-secondary">
                                  Usage Details
                                </Link>
                                {coupon.isActive ? (
                                  <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={() => handleToggleCoupon(coupon.id, "disable")}
                                  >
                                    Disable
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={() => handleToggleCoupon(coupon.id, "enable")}
                                  >
                                    Enable
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
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

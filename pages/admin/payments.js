import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Navbar from "../../components/Navbar";
import AdminShell from "../../components/AdminShell";
import { useAuth } from "../../context/AuthContext";

const STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "captured", label: "Captured / Paid" },
  { value: "failed", label: "Failed" },
  { value: "pending", label: "Pending / Other" },
];

const PAGE_SIZE_OPTIONS = [10, 20, 40];

function formatDateTime(value) {
  const raw = String(value || "").trim();
  if (!raw) return "Unknown time";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return "Unknown time";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function classifyStatus(value) {
  const status = String(value || "").trim().toLowerCase();
  if (status.includes("captured") || status.includes("paid")) return "captured";
  if (status.includes("fail")) return "failed";
  return "pending";
}

function formatAmount(value, currency) {
  const amount = Number(value || 0);
  const code = String(currency || "INR").trim().toUpperCase() || "INR";
  if (!Number.isFinite(amount) || amount <= 0) return `0 ${code}`;
  return `${amount.toFixed(2)} ${code}`;
}

export default function AdminPaymentsPage() {
  const { user } = useAuth();
  const [checkingAccess, setCheckingAccess] = useState(false);
  const [accessAllowed, setAccessAllowed] = useState(false);
  const [accessMessage, setAccessMessage] = useState("");
  const showAdminNav = Boolean(user && accessAllowed);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [reconciliation, setReconciliation] = useState([]);
  const [webhookEventCount, setWebhookEventCount] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);

  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);

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
          setAccessMessage(
            payload?.error || "Your account is logged in but not approved for admin access."
          );
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

  useEffect(() => {
    if (!user || !accessAllowed) {
      setReconciliation([]);
      setWebhookEventCount(0);
      setError("");
      setLoading(false);
      return;
    }

    let cancelled = false;
    const loadPayments = async () => {
      setLoading(true);
      setError("");
      try {
        const idToken = await user.getIdToken();
        const response = await fetch("/api/admin/payments?limit=600", {
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        });
        const payload = await response.json().catch(() => ({}));
        if (cancelled) return;

        if (!response.ok || !payload?.ok) {
          throw new Error(String(payload?.error || "Failed to load payment data"));
        }

        setReconciliation(Array.isArray(payload?.reconciliation) ? payload.reconciliation : []);
        setWebhookEventCount(Number(payload?.summary?.webhookEvents || 0));
      } catch (fetchError) {
        if (cancelled) return;
        setReconciliation([]);
        setWebhookEventCount(0);
        setError(String(fetchError?.message || "Failed to load payment data"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadPayments();
    return () => {
      cancelled = true;
    };
  }, [accessAllowed, refreshKey, user]);

  const stats = useMemo(
    () =>
      reconciliation.reduce(
        (acc, item) => {
          const group = classifyStatus(item?.status);
          acc.total += 1;
          acc[group] += 1;
          return acc;
        },
        { total: 0, captured: 0, failed: 0, pending: 0 }
      ),
    [reconciliation]
  );

  const filteredRows = useMemo(() => {
    const query = String(searchQuery || "").trim().toLowerCase();
    return reconciliation.filter((item) => {
      const group = classifyStatus(item?.status);
      if (statusFilter !== "all" && group !== statusFilter) return false;
      if (!query) return true;
      const haystack = [
        item?.paymentId,
        item?.orderId,
        item?.status,
        item?.lastEvent,
        item?.currency,
      ]
        .map((value) => String(value || "").toLowerCase())
        .join(" ");
      return haystack.includes(query);
    });
  }, [reconciliation, searchQuery, statusFilter]);

  useEffect(() => {
    setPage(1);
  }, [pageSize, searchQuery, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * pageSize;
  const pagedRows = filteredRows.slice(startIndex, startIndex + pageSize);
  const hasActiveFilter = statusFilter !== "all" || String(searchQuery || "").trim();

  return (
    <>
      <Navbar />
      <main className="auth-page admin-page admin-payments-page">
        <section className="container admin-wrap">
          <AdminShell currentSection={showAdminNav ? "payments" : "public"}>
            <section className="auth-card admin-card">
              <div className="admin-card__header">
                <div>
                  <h1>Payments</h1>
                  <p className="auth-subtext">
                    Razorpay reconciliation snapshot with webhook-backed status.
                  </p>
                </div>
              </div>

              {!user ? (
                <div className="auth-status auth-status--error">
                  <p>Please login with your admin account to view payment status.</p>
                  <Link href="/auth?next=/admin/payments" className="btn btn-primary auth-status__action">
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
                  <section className="admin-stats-grid">
                    <article className="admin-stat-card">
                      <span>Total Payments</span>
                      <strong>{stats.total}</strong>
                    </article>
                    <article className="admin-stat-card">
                      <span>Captured</span>
                      <strong>{stats.captured}</strong>
                    </article>
                    <article className="admin-stat-card">
                      <span>Failed</span>
                      <strong>{stats.failed}</strong>
                    </article>
                    <article className="admin-stat-card">
                      <span>Webhook Events</span>
                      <strong>{webhookEventCount}</strong>
                    </article>
                  </section>

                  <div className="admin-card__actions admin-toolbar-row">
                    <label className="admin-filter" htmlFor="payments-status-filter">
                      <span>Status</span>
                      <select
                        id="payments-status-filter"
                        value={statusFilter}
                        onChange={(event) => setStatusFilter(event.target.value)}
                      >
                        {STATUS_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="admin-filter admin-search" htmlFor="payments-search">
                      <span>Search</span>
                      <input
                        id="payments-search"
                        type="search"
                        placeholder="Payment ID, order ID, status, event"
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                      />
                    </label>

                    <label className="admin-filter" htmlFor="payments-page-size">
                      <span>Page Size</span>
                      <select
                        id="payments-page-size"
                        value={String(pageSize)}
                        onChange={(event) => setPageSize(Number.parseInt(event.target.value, 10) || 20)}
                      >
                        {PAGE_SIZE_OPTIONS.map((option) => (
                          <option key={option} value={String(option)}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>

                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => setRefreshKey((value) => value + 1)}
                      disabled={loading}
                    >
                      {loading ? "Refreshing..." : "Refresh"}
                    </button>
                  </div>

                  <p className="admin-results-meta">
                    Showing {pagedRows.length} of {filteredRows.length} payment rows
                    {hasActiveFilter ? " (filtered)" : ""}.
                  </p>

                  {error && <p className="auth-status auth-status--error">{error}</p>}
                  {loading && !error && <p className="auth-status">Loading payment data...</p>}

                  {!loading && !error && pagedRows.length === 0 && (
                    <p className="auth-status">No payment rows found for the current filters.</p>
                  )}

                  {!loading && !error && pagedRows.length > 0 && (
                    <div className="admin-submissions-list admin-payments-list">
                      {pagedRows.map((item) => (
                        <article key={item.id} className="admin-submission-item admin-review-item">
                          <div className="admin-submission-top">
                            <span className="admin-submission-topic">
                              {formatAmount(item.amount, item.currency)}
                            </span>
                            <span
                              className={`admin-submission-status ${
                                classifyStatus(item.status) === "captured"
                                  ? "admin-submission-status--resolved"
                                  : classifyStatus(item.status) === "failed"
                                    ? ""
                                    : "admin-submission-status--in-progress"
                              }`}
                            >
                              {item.status || "unknown"}
                            </span>
                          </div>

                          <div className="admin-submission-meta">
                            <span>Payment ID: {item.paymentId || "NA"}</span>
                            <span>Order ID: {item.orderId || "NA"}</span>
                            <span>Last Event: {item.lastEvent || "unknown"}</span>
                            <span>Events Seen: {Number(item.eventCount || 0)}</span>
                            <span>Updated: {formatDateTime(item.updatedAt)}</span>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}

                  {totalPages > 1 && (
                    <div className="admin-card__actions">
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
                        disabled={currentPage <= 1}
                      >
                        Previous
                      </button>
                      <p className="auth-subtext">
                        Page {currentPage} of {totalPages}
                      </p>
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

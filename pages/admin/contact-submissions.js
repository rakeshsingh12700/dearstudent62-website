import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Navbar from "../../components/Navbar";
import AdminShell from "../../components/AdminShell";
import { useAuth } from "../../context/AuthContext";

const STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "new", label: "New" },
  { value: "in-progress", label: "In Progress" },
  { value: "resolved", label: "Resolved" },
];

const PAGE_SIZE_OPTIONS = [10, 20, 40];

function normalizeStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "new" || normalized === "in-progress" || normalized === "resolved") {
    return normalized;
  }
  return "new";
}

function formatSubmissionDate(value) {
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

export default function AdminContactSubmissionsPage() {
  const { user } = useAuth();
  const [checkingAccess, setCheckingAccess] = useState(false);
  const [accessAllowed, setAccessAllowed] = useState(false);
  const [accessMessage, setAccessMessage] = useState("");
  const showAdminNav = Boolean(user && accessAllowed);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [submissions, setSubmissions] = useState([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [updatingSubmissionId, setUpdatingSubmissionId] = useState("");

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
      setSubmissions([]);
      setError("");
      setLoading(false);
      return;
    }

    let cancelled = false;
    const loadSubmissions = async () => {
      setLoading(true);
      setError("");
      try {
        const idToken = await user.getIdToken();
        const params = new URLSearchParams({
          status: "all",
          limit: "300",
        });

        const response = await fetch(`/api/admin/contact-submissions?${params.toString()}`, {
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        });
        const payload = await response.json().catch(() => ({}));
        if (cancelled) return;

        if (!response.ok) {
          throw new Error(String(payload?.error || "Failed to load contact submissions"));
        }

        setSubmissions(Array.isArray(payload?.submissions) ? payload.submissions : []);
      } catch (fetchError) {
        if (cancelled) return;
        setSubmissions([]);
        setError(String(fetchError?.message || "Failed to load contact submissions"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadSubmissions();
    return () => {
      cancelled = true;
    };
  }, [accessAllowed, refreshKey, user]);

  const stats = useMemo(() => {
    return submissions.reduce(
      (acc, item) => {
        const status = normalizeStatus(item?.status);
        if (!acc[status]) acc[status] = 0;
        acc[status] += 1;
        acc.total += 1;
        return acc;
      },
      { total: 0, new: 0, "in-progress": 0, resolved: 0 }
    );
  }, [submissions]);

  const filteredSubmissions = useMemo(() => {
    const query = String(searchQuery || "").trim().toLowerCase();

    return submissions.filter((item) => {
      const status = normalizeStatus(item?.status);
      if (statusFilter !== "all" && status !== statusFilter) return false;
      if (!query) return true;

      const haystack = [
        item?.topicLabel,
        item?.name,
        item?.email,
        item?.message,
      ]
        .map((value) => String(value || "").toLowerCase())
        .join(" ");
      return haystack.includes(query);
    });
  }, [searchQuery, statusFilter, submissions]);

  useEffect(() => {
    setPage(1);
  }, [pageSize, searchQuery, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredSubmissions.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * pageSize;
  const pagedSubmissions = filteredSubmissions.slice(startIndex, startIndex + pageSize);

  const handleStatusUpdate = async (submissionId, nextStatus) => {
    const normalized = normalizeStatus(nextStatus);
    if (!submissionId) return;

    try {
      setUpdatingSubmissionId(submissionId);
      setError("");

      if (!user) {
        throw new Error("Please login as admin.");
      }
      const idToken = await user.getIdToken();

      const response = await fetch("/api/admin/contact-submissions", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          id: submissionId,
          status: normalized,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok) {
        throw new Error(String(payload?.error || "Failed to update status"));
      }

      setSubmissions((prev) =>
        prev.map((item) =>
          item.id === submissionId
            ? {
                ...item,
                status: normalized,
              }
            : item
        )
      );
    } catch (statusError) {
      setError(String(statusError?.message || "Failed to update status"));
    } finally {
      setUpdatingSubmissionId("");
    }
  };

  const hasActiveFilter = statusFilter !== "all" || String(searchQuery || "").trim();

  return (
    <>
      <Navbar />
      <main className="auth-page admin-page admin-submissions-page">
        <section className="container admin-wrap">
          <AdminShell currentSection={showAdminNav ? "support" : "public"}>
            <section className="auth-card admin-card">
              <div className="admin-card__header">
                <div>
                  <h1>Contact Submissions</h1>
                  <p className="auth-subtext">
                    Review parent feedback and issues in one place.
                  </p>
                </div>
              </div>

              {!user ? (
                <div className="auth-status auth-status--error">
                  <p>Please login with your admin account to view submissions.</p>
                  <Link
                    href="/auth?next=/admin/contact-submissions"
                    className="btn btn-primary auth-status__action"
                  >
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
                      <span>Total</span>
                      <strong>{stats.total}</strong>
                    </article>
                    <article className="admin-stat-card">
                      <span>New</span>
                      <strong>{stats.new}</strong>
                    </article>
                    <article className="admin-stat-card">
                      <span>In Progress</span>
                      <strong>{stats["in-progress"]}</strong>
                    </article>
                    <article className="admin-stat-card">
                      <span>Resolved</span>
                      <strong>{stats.resolved}</strong>
                    </article>
                  </section>

                  <div className="admin-card__actions admin-toolbar-row">
                    <label className="admin-filter" htmlFor="submission-status-filter">
                      <span>Status</span>
                      <select
                        id="submission-status-filter"
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

                    <label className="admin-filter admin-search" htmlFor="submission-search">
                      <span>Search</span>
                      <input
                        id="submission-search"
                        type="search"
                        placeholder="Name, email, topic, or message"
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                      />
                    </label>

                    <label className="admin-filter" htmlFor="submission-page-size">
                      <span>Page Size</span>
                      <select
                        id="submission-page-size"
                        value={String(pageSize)}
                        onChange={(event) => setPageSize(Number.parseInt(event.target.value, 10) || 20)}
                      >
                        {PAGE_SIZE_OPTIONS.map((size) => (
                          <option key={size} value={String(size)}>
                            {size}
                          </option>
                        ))}
                      </select>
                    </label>

                    {hasActiveFilter && (
                      <button
                        type="button"
                        className="btn btn-secondary admin-refresh-btn"
                        onClick={() => {
                          setStatusFilter("all");
                          setSearchQuery("");
                        }}
                      >
                        Clear Filters
                      </button>
                    )}

                    <button
                      type="button"
                      className="btn btn-secondary admin-refresh-btn"
                      onClick={() => setRefreshKey((prev) => prev + 1)}
                      disabled={loading}
                    >
                      {loading ? "Refreshing..." : "Refresh"}
                    </button>
                  </div>

                  <p className="admin-results-meta">
                    Showing {pagedSubmissions.length} of {filteredSubmissions.length} filtered
                    submissions.
                  </p>

                  {error && <p className="auth-status auth-status--error">{error}</p>}
                  {loading && !error && (
                    <p className="auth-status">Loading contact submissions...</p>
                  )}

                  {!loading && !error && filteredSubmissions.length === 0 && (
                    <p className="auth-status">No contact submissions found for the current filters.</p>
                  )}

                  {!loading && filteredSubmissions.length > 0 && (
                    <>
                      <div className="admin-submissions-list">
                        {pagedSubmissions.map((item) => {
                          const statusValue = normalizeStatus(item?.status);
                          return (
                            <article className="admin-submission-item" key={item.id}>
                              <div className="admin-submission-top">
                                <span className="admin-submission-topic">
                                  {item?.topicLabel || "General feedback"}
                                </span>
                                <span
                                  className={`admin-submission-status admin-submission-status--${statusValue}`}
                                >
                                  {statusValue.replace(/-/g, " ")}
                                </span>
                              </div>

                              <p className="admin-submission-message">
                                {item?.message || "No message provided."}
                              </p>

                              <div className="admin-submission-meta">
                                <span>Name: {item?.name || "Not provided"}</span>
                                <span>Email: {item?.email || "Not provided"}</span>
                                <span>Received: {formatSubmissionDate(item?.createdAt)}</span>
                                <span className="admin-submission-id">ID: {item.id}</span>
                              </div>

                              <div className="admin-submission-actions">
                                <label htmlFor={`status-${item.id}`}>Update status</label>
                                <select
                                  id={`status-${item.id}`}
                                  value={statusValue}
                                  disabled={updatingSubmissionId === item.id}
                                  onChange={(event) => handleStatusUpdate(item.id, event.target.value)}
                                >
                                  <option value="new">New</option>
                                  <option value="in-progress">In Progress</option>
                                  <option value="resolved">Resolved</option>
                                </select>
                              </div>
                            </article>
                          );
                        })}
                      </div>

                      <div className="admin-pagination">
                        <button
                          type="button"
                          className="btn btn-secondary"
                          disabled={currentPage <= 1}
                          onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
                        >
                          Previous
                        </button>
                        <span>
                          Page {currentPage} of {totalPages}
                        </span>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          disabled={currentPage >= totalPages}
                          onClick={() => setPage((prev) => Math.min(prev + 1, totalPages))}
                        >
                          Next
                        </button>
                      </div>
                    </>
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

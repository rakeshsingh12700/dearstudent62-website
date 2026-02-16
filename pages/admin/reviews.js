import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Navbar from "../../components/Navbar";
import AdminShell from "../../components/AdminShell";
import { useAuth } from "../../context/AuthContext";
import { buildRatingStars } from "../../lib/productRatings";

const RATING_OPTIONS = [
  { value: "all", label: "All Ratings" },
  { value: "5", label: "5 Stars" },
  { value: "4", label: "4 Stars" },
  { value: "3", label: "3 Stars" },
  { value: "2", label: "2 Stars" },
  { value: "1", label: "1 Star" },
];

const REVIEW_OPTIONS = [
  { value: "all", label: "All" },
  { value: "with-review", label: "With Review Text" },
  { value: "without-review", label: "Rating Only" },
];

const PAGE_SIZE_OPTIONS = [10, 20, 40];

function normalizeReviewFilter(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "with-review" || normalized === "without-review") return normalized;
  return "all";
}

function normalizeRating(value) {
  const parsed = Number.parseInt(String(value || "0"), 10);
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 5) return 0;
  return parsed;
}

function formatReviewDate(value) {
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

export default function AdminReviewsPage() {
  const { user } = useAuth();
  const [checkingAccess, setCheckingAccess] = useState(false);
  const [accessAllowed, setAccessAllowed] = useState(false);
  const [accessMessage, setAccessMessage] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [reviews, setReviews] = useState([]);
  const [refreshKey, setRefreshKey] = useState(0);

  const [ratingFilter, setRatingFilter] = useState("all");
  const [reviewFilter, setReviewFilter] = useState("all");
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
      setReviews([]);
      setError("");
      setLoading(false);
      return;
    }

    let cancelled = false;
    const loadReviews = async () => {
      setLoading(true);
      setError("");
      try {
        const idToken = await user.getIdToken();
        const response = await fetch("/api/admin/reviews?limit=1000", {
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        });
        const payload = await response.json().catch(() => ({}));
        if (cancelled) return;

        if (!response.ok) {
          throw new Error(String(payload?.error || "Failed to load reviews"));
        }

        setReviews(Array.isArray(payload?.reviews) ? payload.reviews : []);
      } catch (fetchError) {
        if (cancelled) return;
        setReviews([]);
        setError(String(fetchError?.message || "Failed to load reviews"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadReviews();
    return () => {
      cancelled = true;
    };
  }, [accessAllowed, refreshKey, user]);

  const stats = useMemo(() => {
    const total = reviews.length;
    const withReview = reviews.filter((item) => Boolean(item?.hasReview)).length;
    const withoutReview = total - withReview;
    const averageRating =
      total > 0
        ? (
            reviews.reduce((sum, item) => sum + normalizeRating(item?.rating), 0) /
            total
          ).toFixed(1)
        : "0.0";

    return {
      total,
      withReview,
      withoutReview,
      averageRating,
    };
  }, [reviews]);

  const filteredReviews = useMemo(() => {
    const ratingValue = normalizeRating(ratingFilter);
    const reviewValue = normalizeReviewFilter(reviewFilter);
    const query = String(searchQuery || "").trim().toLowerCase();

    return reviews.filter((item) => {
      const rating = normalizeRating(item?.rating);
      if (ratingValue >= 1 && ratingValue <= 5 && rating !== ratingValue) return false;
      if (reviewValue === "with-review" && !item?.hasReview) return false;
      if (reviewValue === "without-review" && item?.hasReview) return false;
      if (!query) return true;

      const haystack = [
        item?.productTitle,
        item?.productId,
        item?.email,
        item?.review,
      ]
        .map((value) => String(value || "").toLowerCase())
        .join(" ");

      return haystack.includes(query);
    });
  }, [ratingFilter, reviewFilter, reviews, searchQuery]);

  useEffect(() => {
    setPage(1);
  }, [pageSize, ratingFilter, reviewFilter, searchQuery]);

  const totalPages = Math.max(1, Math.ceil(filteredReviews.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * pageSize;
  const pagedReviews = filteredReviews.slice(startIndex, startIndex + pageSize);
  const hasActiveFilter =
    ratingFilter !== "all" || reviewFilter !== "all" || String(searchQuery || "").trim();

  return (
    <>
      <Navbar />
      <main className="auth-page admin-page admin-reviews-page">
        <section className="container admin-wrap">
          <AdminShell currentSection="reviews">
            <section className="auth-card admin-card">
              <div className="admin-card__header">
                <div>
                  <h1>Reviews Inbox</h1>
                  <p className="auth-subtext">
                    Private worksheet ratings and optional parent comments.
                  </p>
                </div>
              </div>

              {!user ? (
                <div className="auth-status auth-status--error">
                  <p>Please login with your admin account to view reviews.</p>
                  <p>
                    <Link href="/auth?next=/admin/reviews">Login to Admin</Link>
                  </p>
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
                      <span>Total Ratings</span>
                      <strong>{stats.total}</strong>
                    </article>
                    <article className="admin-stat-card">
                      <span>Avg Rating</span>
                      <strong>{stats.averageRating}</strong>
                    </article>
                    <article className="admin-stat-card">
                      <span>With Review</span>
                      <strong>{stats.withReview}</strong>
                    </article>
                    <article className="admin-stat-card">
                      <span>Rating Only</span>
                      <strong>{stats.withoutReview}</strong>
                    </article>
                  </section>

                  <div className="admin-card__actions admin-toolbar-row">
                    <label className="admin-filter" htmlFor="review-rating-filter">
                      <span>Rating</span>
                      <select
                        id="review-rating-filter"
                        value={ratingFilter}
                        onChange={(event) => setRatingFilter(event.target.value)}
                      >
                        {RATING_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="admin-filter" htmlFor="review-text-filter">
                      <span>Type</span>
                      <select
                        id="review-text-filter"
                        value={reviewFilter}
                        onChange={(event) => setReviewFilter(event.target.value)}
                      >
                        {REVIEW_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="admin-filter admin-search" htmlFor="review-search">
                      <span>Search</span>
                      <input
                        id="review-search"
                        type="search"
                        placeholder="Product, email, or review text"
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                      />
                    </label>

                    <label className="admin-filter" htmlFor="review-page-size">
                      <span>Page Size</span>
                      <select
                        id="review-page-size"
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
                          setRatingFilter("all");
                          setReviewFilter("all");
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
                    Showing {pagedReviews.length} of {filteredReviews.length} filtered ratings.
                  </p>

                  {error && <p className="auth-status auth-status--error">{error}</p>}
                  {loading && !error && <p className="auth-status">Loading reviews...</p>}

                  {!loading && !error && filteredReviews.length === 0 && (
                    <p className="auth-status">No reviews found for the current filters.</p>
                  )}

                  {!loading && filteredReviews.length > 0 && (
                    <>
                      <div className="admin-submissions-list admin-reviews-list">
                        {pagedReviews.map((item) => {
                          const rating = normalizeRating(item?.rating);
                          const productTitle = String(item?.productTitle || "").trim();
                          const title = productTitle || item?.productId || "Worksheet";
                          return (
                            <article className="admin-submission-item admin-review-item" key={item.id}>
                              <div className="admin-submission-top admin-review-item__top">
                                <span className="admin-review-item__title">{title}</span>
                                <span className="admin-review-item__rating">
                                  {buildRatingStars(rating)} ({rating}/5)
                                </span>
                              </div>

                              <p className="admin-submission-message">
                                {item?.hasReview ? item.review : "No written review. Rating only."}
                              </p>

                              <div className="admin-submission-meta admin-review-item__meta">
                                <span>Email: {item?.email || "Not provided"}</span>
                                <span>Product ID: {item?.productId || "Unknown"}</span>
                                <span>Updated: {formatReviewDate(item?.updatedAt)}</span>
                                <span className="admin-submission-id">ID: {item.id}</span>
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

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Navbar from "../../components/Navbar";
import AdminShell from "../../components/AdminShell";
import { useAuth } from "../../context/AuthContext";

const TYPE_OPTIONS = [
  { value: "all", label: "All Types" },
  { value: "worksheet", label: "Worksheet" },
  { value: "exams", label: "Unit Test" },
  { value: "half-year-exam", label: "Half Year" },
  { value: "final-year-exam", label: "Final Year" },
  { value: "bundle", label: "Bundle" },
];

const CLASS_OPTIONS = [
  { value: "all", label: "All Classes" },
  { value: "pre-nursery", label: "Pre Nursery" },
  { value: "nursery", label: "Nursery" },
  { value: "lkg", label: "LKG" },
  { value: "ukg", label: "UKG" },
  { value: "class-1", label: "Class 1" },
  { value: "class-2", label: "Class 2" },
  { value: "class-3", label: "Class 3" },
];

const PAGE_SIZE_OPTIONS = [10, 20, 40];

function formatProductDate(value) {
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

function humanize(value) {
  const slug = String(value || "").trim();
  if (!slug) return "NA";
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function AdminProductsPage() {
  const { user } = useAuth();
  const [checkingAccess, setCheckingAccess] = useState(false);
  const [accessAllowed, setAccessAllowed] = useState(false);
  const [accessMessage, setAccessMessage] = useState("");
  const showAdminNav = Boolean(user && accessAllowed);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [products, setProducts] = useState([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [deletingId, setDeletingId] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [classFilter, setClassFilter] = useState("all");
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
      setProducts([]);
      setError("");
      setLoading(false);
      return;
    }

    let cancelled = false;
    const loadProducts = async () => {
      setLoading(true);
      setError("");
      try {
        const idToken = await user.getIdToken();
        const response = await fetch("/api/admin/products?limit=1200", {
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        });
        const payload = await response.json().catch(() => ({}));
        if (cancelled) return;

        if (!response.ok || !payload?.ok) {
          throw new Error(String(payload?.error || "Failed to load products"));
        }

        setProducts(Array.isArray(payload?.products) ? payload.products : []);
      } catch (fetchError) {
        if (cancelled) return;
        setProducts([]);
        setError(String(fetchError?.message || "Failed to load products"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadProducts();
    return () => {
      cancelled = true;
    };
  }, [accessAllowed, refreshKey, user]);

  const filteredProducts = useMemo(() => {
    const query = String(searchQuery || "").trim().toLowerCase();
    return products.filter((item) => {
      if (typeFilter !== "all" && String(item?.type || "") !== typeFilter) return false;
      if (classFilter !== "all" && String(item?.class || "") !== classFilter) return false;
      if (!query) return true;

      const haystack = [
        item?.title,
        item?.id,
        item?.subject,
        item?.topic,
        item?.storageKey,
      ]
        .map((value) => String(value || "").toLowerCase())
        .join(" ");
      return haystack.includes(query);
    });
  }, [classFilter, products, searchQuery, typeFilter]);

  useEffect(() => {
    setPage(1);
  }, [classFilter, pageSize, searchQuery, typeFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * pageSize;
  const pagedProducts = filteredProducts.slice(startIndex, startIndex + pageSize);
  const hasActiveFilter =
    typeFilter !== "all" || classFilter !== "all" || String(searchQuery || "").trim();

  const handleDelete = async (product) => {
    const productId = String(product?.id || "").trim();
    if (!productId || !user) return;

    const confirmed = window.confirm(
      `Delete "${product.title}"?\n\nThis removes the listing and related R2 files.`
    );
    if (!confirmed) return;

    try {
      setDeletingId(productId);
      setError("");
      const idToken = await user.getIdToken();

      const response = await fetch("/api/admin/products", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ id: productId }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok) {
        throw new Error(String(payload?.error || "Failed to delete product"));
      }

      setProducts((prev) => prev.filter((item) => item.id !== productId));
    } catch (deleteError) {
      setError(String(deleteError?.message || "Failed to delete product"));
    } finally {
      setDeletingId("");
    }
  };

  return (
    <>
      <Navbar />
      <main className="auth-page admin-page admin-products-page">
        <section className="container admin-wrap">
          <AdminShell currentSection={showAdminNav ? "products" : "public"}>
            <section className="auth-card admin-card">
              <div className="admin-card__header">
                <div>
                  <h1>Listed Products</h1>
                  <p className="auth-subtext">View all product listings and delete unwanted items.</p>
                </div>
              </div>

              {!user ? (
                <div className="auth-status auth-status--error">
                  <p>Please login with your admin account to view products.</p>
                  <Link href="/auth?next=/admin/products" className="btn btn-primary auth-status__action">
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
                  <div className="admin-card__actions admin-toolbar-row">
                    <label className="admin-filter" htmlFor="products-class-filter">
                      <span>Class</span>
                      <select
                        id="products-class-filter"
                        value={classFilter}
                        onChange={(event) => setClassFilter(event.target.value)}
                      >
                        {CLASS_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="admin-filter" htmlFor="products-type-filter">
                      <span>Type</span>
                      <select
                        id="products-type-filter"
                        value={typeFilter}
                        onChange={(event) => setTypeFilter(event.target.value)}
                      >
                        {TYPE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="admin-filter admin-search" htmlFor="products-search">
                      <span>Search</span>
                      <input
                        id="products-search"
                        type="search"
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        placeholder="Search by title, id, topic..."
                      />
                    </label>

                    <label className="admin-filter" htmlFor="products-page-size">
                      <span>Rows</span>
                      <select
                        id="products-page-size"
                        value={pageSize}
                        onChange={(event) => setPageSize(Number(event.target.value))}
                      >
                        {PAGE_SIZE_OPTIONS.map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </select>
                    </label>

                    <button
                      type="button"
                      className="btn btn-secondary admin-refresh-btn"
                      onClick={() => setRefreshKey((value) => value + 1)}
                      disabled={loading}
                    >
                      {loading ? "Refreshing..." : "Refresh"}
                    </button>
                  </div>

                  <p className="admin-results-meta">
                    Showing {pagedProducts.length} of {filteredProducts.length} products
                    {hasActiveFilter ? " (filtered)" : ""}.
                  </p>

                  {pagedProducts.length === 0 ? (
                    <div className="auth-status">
                      <p>{loading ? "Loading products..." : "No products found for current filters."}</p>
                    </div>
                  ) : (
                    <div className="admin-submissions-list">
                      {pagedProducts.map((item) => (
                        <article key={item.id} className="admin-submission-item admin-product-item">
                          <div className="admin-submission-top">
                            <span className="admin-submission-topic">
                              {humanize(item.class)} | {humanize(item.type)}
                            </span>
                            <span className="admin-submission-status">
                              INR {Number(item.price || 0)}
                            </span>
                          </div>

                          <p className="admin-product-title">{item.title}</p>

                          <div className="admin-submission-meta">
                            <span>Pages: {Number(item.pages || 1)}</span>
                            <span>Subject: {humanize(item.subject)}</span>
                            <span>Topic: {humanize(item.topic)}</span>
                            <span>Updated: {formatProductDate(item.updatedAt)}</span>
                          </div>

                          <p className="admin-submission-id">ID: {item.id}</p>
                          <p className="admin-submission-id">Storage: {item.storageKey || "NA"}</p>

                          <div className="admin-submission-actions">
                            <button
                              type="button"
                              className="btn btn-secondary admin-delete-btn"
                              onClick={() => handleDelete(item)}
                              disabled={deletingId === item.id}
                            >
                              {deletingId === item.id ? "Deleting..." : "Delete Product"}
                            </button>
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
                        onClick={() => setPage((value) => Math.max(1, value - 1))}
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
                        onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
                        disabled={currentPage >= totalPages}
                      >
                        Next
                      </button>
                    </div>
                  )}
                </>
              )}

              {error && <p className="auth-status auth-status--error">{error}</p>}
            </section>
          </AdminShell>
        </section>
      </main>
    </>
  );
}

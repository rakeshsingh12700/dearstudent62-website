import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useAuth } from "../context/AuthContext";
import { getUserPurchases } from "../firebase/purchases";
import Navbar from "../components/Navbar";
import products from "../data/products";
import { getDownloadUrl } from "../lib/productAssetUrls";
import { getSubjectBadgeClass, getSubjectLabel } from "../lib/subjectBadge";

const CART_STORAGE_KEY = "ds-worksheet-cart-v1";
function toDate(value) {
  if (!value) return null;
  if (typeof value?.toDate === "function") return value.toDate();
  if (value instanceof Date) return value;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

function formatDateTime(value) {
  const date = toDate(value);
  if (!date) return "Date unavailable";

  const datePart = new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);

  const timePart = new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);

  return `${datePart}, ${timePart}`;
}

function humanizeId(id) {
  return String(id || "Worksheet purchase")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function MyPurchases() {
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [purchases, setPurchases] = useState([]);
  const [runtimeProducts, setRuntimeProducts] = useState([]);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const productById = useMemo(() => {
    const map = new Map(products.map((product) => [product.id, product]));
    runtimeProducts.forEach((product) => {
      if (!product?.id) return;
      map.set(product.id, product);
    });
    return map;
  }, [runtimeProducts]);

  const normalizedPurchases = useMemo(() => {
    const detailedOrderIds = new Set(
      purchases
        .filter((purchase) => purchase.paymentId && purchase.id !== purchase.paymentId)
        .map((purchase) => purchase.paymentId)
    );

    return purchases.filter((purchase) => {
      if (!purchase.paymentId) return true;
      if (!detailedOrderIds.has(purchase.paymentId)) return true;
      return purchase.id !== purchase.paymentId;
    });
  }, [purchases]);

  const enrichedPurchases = useMemo(() => {
    return normalizedPurchases
      .map((purchase) => {
        const productId = purchase.productId || "";
        const product = productById.get(productId);
        const purchasedDate = toDate(purchase.purchasedAt);
        const fallbackId = purchase.paymentId || purchase.id;

        return {
          id: purchase.id,
          productId: productId || "unknown",
          storageKey: String(product?.storageKey || "").trim(),
          title: product?.title || humanizeId(productId),
          category: product?.category || "Digital Worksheet",
          classLabel: product?.class
            ? humanizeId(product.class)
            : "Early Learning",
          pages: product?.pages || null,
          type: product?.type || "worksheet",
          subject: String(product?.subject || "").trim(),
          price: typeof product?.price === "number" ? product.price : null,
          quantity:
            Number.isFinite(Number(purchase.quantity)) &&
            Number(purchase.quantity) > 0
              ? Number(purchase.quantity)
              : 1,
          purchasedAtMs: purchasedDate ? purchasedDate.getTime() : 0,
          purchasedAtLabel: formatDateTime(purchase.purchasedAt),
          paymentId: fallbackId,
          viewHref: productId ? `/product/${productId}` : null,
        };
      })
      .sort((first, second) => second.purchasedAtMs - first.purchasedAtMs);
  }, [normalizedPurchases, productById]);

  const orders = useMemo(() => {
    const grouped = new Map();

    enrichedPurchases.forEach((purchase) => {
      const orderId = purchase.paymentId || purchase.id;
      const existing = grouped.get(orderId);

      if (!existing) {
          grouped.set(orderId, {
          orderId,
          placedAtMs: purchase.purchasedAtMs,
          placedAtLabel: purchase.purchasedAtLabel,
          total: (purchase.price || 0) * purchase.quantity,
          itemsCount: purchase.quantity,
          items: [purchase],
        });
        return;
      }

      existing.total += (purchase.price || 0) * purchase.quantity;
      existing.itemsCount += purchase.quantity;
      existing.items.push(purchase);
      if (purchase.purchasedAtMs > existing.placedAtMs) {
        existing.placedAtMs = purchase.purchasedAtMs;
        existing.placedAtLabel = purchase.purchasedAtLabel;
      }
    });

    return Array.from(grouped.values()).sort(
      (first, second) => second.placedAtMs - first.placedAtMs
    );
  }, [enrichedPurchases]);

  const filteredOrders = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return orders;

    return orders.filter((order) => {
      const haystack = [
        order.orderId,
        ...order.items.map((item) => item.title),
        ...order.items.map((item) => item.productId),
        ...order.items.map((item) => item.classLabel),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [orders, searchQuery]);

  const stats = useMemo(() => {
    const totalPurchases = orders.length;
    const uniqueWorksheets = new Set(
      enrichedPurchases.map((purchase) => purchase.productId)
    ).size;
    const latestPurchaseDate =
      orders[0]?.placedAtLabel || "No purchases yet";

    return { totalPurchases, uniqueWorksheets, latestPurchaseDate };
  }, [enrichedPurchases, orders]);

  const userLabel = useMemo(() => {
    const displayName = String(user?.displayName || "").trim();
    if (displayName) return displayName;
    return String(user?.email || "Learner").split("@")[0];
  }, [user?.displayName, user?.email]);

  useEffect(() => {
    if (!user?.email) return;

    const loadPurchases = async () => {
      setLoading(true);
      setError("");
      try {
        const result = await getUserPurchases(user);
        setPurchases(result);
      } catch {
        setError("Unable to fetch purchases. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    loadPurchases();
  }, [user]);

  useEffect(() => {
    const ids = Array.from(
      new Set(
        purchases
          .map((item) => String(item?.productId || "").trim())
          .filter(Boolean)
      )
    );
    if (ids.length === 0) {
      setRuntimeProducts([]);
      return;
    }

    let cancelled = false;
    const loadProducts = async () => {
      try {
        const response = await fetch(`/api/products?ids=${encodeURIComponent(ids.join(","))}`);
        if (!response.ok) return;
        const payload = await response.json().catch(() => ({}));
        const list = Array.isArray(payload?.products) ? payload.products : [];
        if (!cancelled) setRuntimeProducts(list);
      } catch {
        // Keep static fallback only.
      }
    };

    loadProducts();
    return () => {
      cancelled = true;
    };
  }, [purchases]);

  const handleBuyAgain = (order) => {
    if (typeof window === "undefined") return;

    const raw = window.localStorage.getItem(CART_STORAGE_KEY);
    let existingCart = [];

    try {
      const parsed = JSON.parse(raw || "[]");
      existingCart = Array.isArray(parsed) ? parsed : [];
    } catch {
      existingCart = [];
    }

    const byId = new Map(
      existingCart.map((item) => [
        item.id,
        {
          ...item,
          quantity:
            Number.isFinite(Number(item.quantity)) && Number(item.quantity) > 0
              ? Number(item.quantity)
              : 1,
        },
      ])
    );

    order.items.forEach((item) => {
      const existing = byId.get(item.productId);
      const qtyToAdd =
        Number.isFinite(Number(item.quantity)) && Number(item.quantity) > 0
          ? Number(item.quantity)
          : 1;

      if (existing) {
        byId.set(item.productId, {
          ...existing,
          quantity: existing.quantity + qtyToAdd,
        });
        return;
      }

      byId.set(item.productId, {
        id: item.productId,
        title: item.title,
        price: Number(item.price || 0),
        class: item.classLabel,
        type: item.type,
        quantity: qtyToAdd,
      });
    });

    const nextCart = Array.from(byId.values());
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(nextCart));
    window.dispatchEvent(new CustomEvent("ds-cart-updated"));
    router.push("/worksheets?openCart=1");
  };

  const handleDownload = async (storageKey) => {
    const key = String(storageKey || "").trim();
    if (!key) return;
    if (!user) {
      alert("Please login to download.");
      return;
    }

    try {
      const idToken = await user.getIdToken();
      const link = document.createElement("a");
      link.href = getDownloadUrl(key, idToken);
      link.download = key;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      alert("Unable to verify your login. Please login again.");
    }
  };

  return (
    <>
      <Navbar />
      <main className="my-purchases-page">
        <section className="container my-purchases-wrap">
          <header className="my-purchases-header">
            <div>
              <h1>My Purchases</h1>
              <p>Your personal worksheet vault with instant downloads.</p>
            </div>
            <Link href="/worksheets" className="btn btn-secondary">
              Browse Library
            </Link>
          </header>

          <section className="my-purchases-support-card">
            <p>Missing a download, invoice, or payment update?</p>
            <Link href="/contact-us" className="btn btn-secondary">
              Contact Support
            </Link>
          </section>

          {!user?.email && (
            <section className="my-purchases-login-card">
              <h2>Login to unlock your purchases</h2>
              <p>
                We will load everything linked to your email and keep it available
                anytime.
              </p>
              <Link href="/auth?next=/my-purchases" className="btn btn-primary">
                Login / Sign Up
              </Link>
            </section>
          )}

          {user?.email && (
            <>
              <section className="my-purchases-profile-card">
                <div>
                  <p className="my-purchases-profile-card__eyebrow">Welcome back</p>
                  <h2>{userLabel}</h2>
                  <p className="my-purchases-profile-card__email">
                    Library linked to <strong>{user.email}</strong>
                  </p>
                </div>
                <div className="my-purchases-stat-grid">
                  <article>
                    <span>Total Purchases</span>
                    <strong>{stats.totalPurchases}</strong>
                  </article>
                  <article>
                    <span>Unique Worksheets</span>
                    <strong>{stats.uniqueWorksheets}</strong>
                  </article>
                  <article>
                    <span>Latest Purchase</span>
                    <strong>{stats.latestPurchaseDate}</strong>
                  </article>
                </div>
              </section>

              <section className="my-purchases-toolbar">
                <label htmlFor="purchase-search">Find worksheet</label>
                <input
                  id="purchase-search"
                  type="search"
                  placeholder="Search all orders"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
              </section>
            </>
          )}

          {user?.email && loading && (
            <section className="my-purchases-info-card">Loading your purchases...</section>
          )}

          {user?.email && error && (
            <section className="my-purchases-info-card my-purchases-info-card--error">
              {error}
            </section>
          )}

          {user?.email && !loading && !error && filteredOrders.length === 0 && (
            <section className="my-purchases-empty-card">
              {orders.length === 0 ? (
                <>
                  <h3>No purchases yet</h3>
                  <p>Pick a worksheet from the library and it will appear here.</p>
                  <Link href="/worksheets" className="btn btn-primary">
                    Explore Worksheets
                  </Link>
                </>
              ) : (
                <>
                  <h3>No matches found</h3>
                  <p>Try a different search term.</p>
                </>
              )}
            </section>
          )}

          {user?.email && !loading && !error && filteredOrders.length > 0 && (
            <section className="my-orders-list">
              {filteredOrders.map((order) => (
                <article className="my-order-card" key={order.orderId}>
                  <div className="my-order-card__header">
                    <div>
                      <span>Order placed</span>
                      <strong>{order.placedAtLabel}</strong>
                    </div>
                    <div>
                      <span>Total</span>
                      <strong>INR {order.total}</strong>
                    </div>
                    <div>
                      <span>Items</span>
                      <strong>{order.itemsCount}</strong>
                    </div>
                    <div className="my-order-card__header-actions">
                      <p>Order # {order.orderId}</p>
                      <div>
                        <Link href={`/orders/${encodeURIComponent(order.orderId)}`}>
                          View order details
                        </Link>
                        <span aria-hidden="true">|</span>
                        <a
                          href={`/api/invoice?paymentId=${encodeURIComponent(order.orderId)}&email=${encodeURIComponent(user.email)}`}
                        >
                          Invoice
                        </a>
                      </div>
                    </div>
                  </div>

                  <div className="my-order-card__body">
                    <div className="my-order-card__items">
                      {order.items.map((item) => (
                        <div className="my-order-item" key={`${order.orderId}-${item.id}`}>
                          <div className="my-order-item__thumb">
                            {item.viewHref ? (
                              <Link
                                href={item.viewHref}
                                className="my-order-item__thumb-link"
                                aria-label={`Open ${item.title}`}
                              >
                                <span className={getSubjectBadgeClass(item.subject)}>
                                  {getSubjectLabel(item.subject)}
                                </span>
                              </Link>
                            ) : (
                              <span className={getSubjectBadgeClass(item.subject)}>
                                {getSubjectLabel(item.subject)}
                              </span>
                            )}
                          </div>
                          <div className="my-order-item__content">
                            <h3>
                              {item.viewHref ? (
                                <Link href={item.viewHref}>{item.title}</Link>
                              ) : (
                                item.title
                              )}
                            </h3>
                            <p>
                              {item.classLabel} • {item.category} •{" "}
                              {item.pages ? `${item.pages} pages` : "Printable PDF"} • Qty{" "}
                              {item.quantity}
                            </p>
                            {item.storageKey ? (
                              <button
                                type="button"
                                className="btn-link"
                                onClick={() => handleDownload(item.storageKey)}
                              >
                                Download PDF
                              </button>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>

                    <aside className="my-order-card__cta">
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => handleBuyAgain(order)}
                      >
                        Buy again
                      </button>
                    </aside>
                  </div>
                </article>
              ))}
            </section>
          )}
        </section>
      </main>
    </>
  );
}

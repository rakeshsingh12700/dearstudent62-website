import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";

import Navbar from "../../components/Navbar";
import { useAuth } from "../../context/AuthContext";
import products from "../../data/products";
import { getUserPurchases } from "../../firebase/purchases";

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

  const datePart = date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const timePart = date.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  return `${datePart}, ${timePart}`;
}

function humanizeId(id) {
  return String(id || "Workbook purchase")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function OrderDetailsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { orderId } = router.query;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [orderItems, setOrderItems] = useState([]);

  const productById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    []
  );

  useEffect(() => {
    if (!user?.email || typeof orderId !== "string") return;

    const loadOrder = async () => {
      setLoading(true);
      setError("");
      try {
        const purchases = await getUserPurchases(user);
        const matched = purchases.filter((purchase) => {
          const paymentId = purchase.paymentId || purchase.id;
          return paymentId === orderId;
        });

        const hasDetailedRows = matched.some(
          (purchase) => purchase.paymentId && purchase.id !== purchase.paymentId
        );
        const normalizedMatched = hasDetailedRows
          ? matched.filter(
              (purchase) =>
                !purchase.paymentId || purchase.id !== purchase.paymentId
            )
          : matched;

        const mapped = normalizedMatched.map((purchase) => {
          const product = productById.get(purchase.productId || "");
          return {
            id: purchase.id,
            title: product?.title || humanizeId(purchase.productId),
            price: Number(product?.price || 0),
            quantity:
              Number.isFinite(Number(purchase.quantity)) &&
              Number(purchase.quantity) > 0
                ? Number(purchase.quantity)
                : 1,
            pages: product?.pages || null,
            category: product?.category || "Digital Workbook",
            classLabel: product?.class ? humanizeId(product.class) : "Early Learning",
            purchasedAtLabel: formatDateTime(purchase.purchasedAt),
            downloadHref: `/api/download?paymentId=${encodeURIComponent(
              purchase.paymentId || purchase.id
            )}&productId=${encodeURIComponent(String(purchase.productId || ""))}`,
          };
        });

        setOrderItems(mapped);

        if (mapped.length === 0) {
          setError("Order not found for this account.");
        }
      } catch {
        setError("Unable to load order details right now.");
      } finally {
        setLoading(false);
      }
    };

    loadOrder();
  }, [orderId, productById, user]);

  const orderTotal = useMemo(
    () =>
      orderItems.reduce(
        (sum, item) => sum + (item.price || 0) * (item.quantity || 1),
        0
      ),
    [orderItems]
  );
  const totalItems = useMemo(
    () => orderItems.reduce((sum, item) => sum + (item.quantity || 1), 0),
    [orderItems]
  );

  return (
    <>
      <Navbar />
      <main className="order-details-page">
        <section className="container order-details-wrap">
          <header className="order-details-header">
            <div>
              <p className="order-details-back">
                <Link href="/my-purchases">Your Account</Link> › Your Orders
              </p>
              <h1>Order Details</h1>
              <p>Order # {typeof orderId === "string" ? orderId : "-"}</p>
            </div>
            <div className="order-details-header__actions">
              <Link href="/my-purchases" className="btn btn-secondary">
                Back to Orders
              </Link>
              {user?.email && typeof orderId === "string" && (
                <a
                  href={`/api/invoice?paymentId=${encodeURIComponent(orderId)}&email=${encodeURIComponent(user.email)}`}
                  className="btn btn-primary"
                >
                  Download Invoice
                </a>
              )}
            </div>
          </header>

          {!user?.email && (
            <section className="order-details-card">
              <p>
                Please <Link href={`/auth?next=${encodeURIComponent(router.asPath)}`}>login</Link>{" "}
                to view this order.
              </p>
            </section>
          )}

          {user?.email && loading && (
            <section className="order-details-card">
              <p>Loading order details...</p>
            </section>
          )}

          {user?.email && error && (
            <section className="order-details-card order-details-card--error">
              <p>{error}</p>
            </section>
          )}

          {user?.email && !loading && !error && (
            <>
              <section className="order-summary-card">
                <article>
                  <span>Total Items</span>
                  <strong>{totalItems}</strong>
                </article>
                <article>
                  <span>Order Total</span>
                  <strong>INR {orderTotal}</strong>
                </article>
                <article>
                  <span>Order Date & Time</span>
                  <strong>{orderItems[0]?.purchasedAtLabel || "N/A"}</strong>
                </article>
              </section>

              <section className="order-line-list">
                {orderItems.map((item) => (
                  <article key={item.id} className="order-line-item">
                    <div>
                      <h3>{item.title}</h3>
                      <p>
                        {item.classLabel} • {item.category} •{" "}
                        {item.pages ? `${item.pages} pages` : "Printable PDF"} • Qty{" "}
                        {item.quantity}
                      </p>
                    </div>
                    <div className="order-line-item__actions">
                      <strong>INR {(item.price || 0) * (item.quantity || 1)}</strong>
                      <a href={item.downloadHref} className="btn btn-secondary" download>
                        Download
                      </a>
                    </div>
                  </article>
                ))}
              </section>
            </>
          )}
        </section>
      </main>
    </>
  );
}

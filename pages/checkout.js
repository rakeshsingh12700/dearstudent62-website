import { useEffect, useState } from "react";
import Link from "next/link";

import Navbar from "../components/Navbar";
import { useAuth } from "../context/AuthContext";
import products from "../data/products";

const RAZORPAY_SDK_SRC = "https://checkout.razorpay.com/v1/checkout.js";
const CART_STORAGE_KEY = "ds-worksheet-cart-v1";
const PRODUCTS_BY_ID = products.reduce((acc, product) => {
  acc[product.id] = product;
  return acc;
}, {});

const formatCurrency = (amount) =>
  new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0,
  }).format(Math.round(Number(amount) || 0));

const humanizeLabel = (value) =>
  String(value || "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

const loadRazorpaySdk = () => {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);

  return new Promise((resolve) => {
    const existingScript = document.querySelector(
      'script[data-razorpay-sdk="true"]'
    );

    if (existingScript) {
      const onLoad = () => resolve(true);
      const onError = () => resolve(false);
      existingScript.addEventListener("load", onLoad, { once: true });
      existingScript.addEventListener("error", onError, { once: true });
      setTimeout(() => resolve(Boolean(window.Razorpay)), 2500);
      return;
    }

    const script = document.createElement("script");
    script.src = RAZORPAY_SDK_SRC;
    script.async = true;
    script.dataset.razorpaySdk = "true";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
};

const readCartFromStorage = () => {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(CART_STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const getCartSummary = () => {
  const cart = readCartFromStorage();
  return cart.reduce(
    (acc, item) => ({
      count: acc.count + Number(item.quantity || 0),
      total: acc.total + Number(item.price || 0) * Number(item.quantity || 0),
    }),
    { count: 0, total: 0 }
  );
};

const getCartItems = () => {
  const cart = readCartFromStorage();
  return cart
    .map((item) => ({
      productId: String(item?.id || "").trim(),
      quantity: Number(item?.quantity || 0),
      price: Number(item?.price || 0),
    }))
    .filter((item) => item.productId && item.quantity > 0);
};

const getCartPreviewItems = () => {
  const cart = readCartFromStorage();
  return cart
    .map((item) => {
      const productId = String(item?.id || "").trim();
      const quantity = Number(item?.quantity || 0);
      if (!productId || quantity <= 0) return null;

      const product = PRODUCTS_BY_ID[productId];
      const price = Number(item?.price || product?.price || 0);

      return {
        productId,
        title: product?.title || String(item?.title || "Worksheet"),
        classLabel: humanizeLabel(product?.class || item?.class || "Early Learning"),
        typeLabel: humanizeLabel(product?.type || item?.type || "Worksheet"),
        pages: Number(product?.pages || 0) || null,
        quantity,
        price,
        lineTotal: quantity * price,
        previewUrl: String(product?.pdf || ""),
        href: `/product/${productId}`,
      };
    })
    .filter(Boolean);
};

export default function Checkout() {
  const { user } = useAuth();
  const loggedInEmail = user?.email || "";
  const [loading, setLoading] = useState(false);
  const [cartSummary, setCartSummary] = useState(() => getCartSummary());
  const [cartPreviewItems, setCartPreviewItems] = useState(() => getCartPreviewItems());
  const [email, setEmail] = useState("");

  const totalAmount = Math.round(cartSummary.total);
  const hasItems = cartSummary.count > 0 && totalAmount > 0;

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const syncSummary = () => {
      setCartSummary(getCartSummary());
      setCartPreviewItems(getCartPreviewItems());
    };

    window.addEventListener("storage", syncSummary);
    window.addEventListener("ds-cart-updated", syncSummary);

    return () => {
      window.removeEventListener("storage", syncSummary);
      window.removeEventListener("ds-cart-updated", syncSummary);
    };
  }, []);

  const payNow = async () => {
    try {
      setLoading(true);
      const latestCart = getCartSummary();
      const latestItems = getCartItems();
      const payableAmount = Math.round(latestCart.total);
      const buyerEmail = (loggedInEmail || email).trim().toLowerCase();

      if (payableAmount <= 0 || latestItems.length === 0) {
        alert("Your cart is empty. Please add items before checkout.");
        return;
      }

      if (!buyerEmail) {
        alert("Please enter your email before payment.");
        return;
      }

      const isSdkLoaded = await loadRazorpaySdk();

      if (!isSdkLoaded || !window.Razorpay) {
        alert(
          "Razorpay SDK could not load. Check your internet/ad-blocker and try again."
        );
        return;
      }

      if (!process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID) {
        alert("Missing NEXT_PUBLIC_RAZORPAY_KEY_ID in environment.");
        return;
      }

      const res = await fetch("/api/razorpay/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: payableAmount }),
      });

      if (!res.ok) {
        const errorPayload = await res.json().catch(() => ({}));
        alert(errorPayload.error || "Order creation failed. Please try again.");
        return;
      }

      const order = await res.json();

      if (!order?.id) {
        alert("Order creation failed. Please try again.");
        return;
      }

      const options = {
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        amount: order.amount,
        currency: "INR",
        name: "Dear Student",
        description: "Worksheet Purchase",
        order_id: order.id,
        handler: async function handlePaymentResponse(response) {
          try {
            const verifyRes = await fetch("/api/razorpay/verify-payment", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                ...response,
                email: buyerEmail,
                userId: user?.uid || null,
                items: latestItems,
              }),
            });

            const result = await verifyRes.json();

            if (result.success) {
              if (typeof window !== "undefined") {
                window.localStorage.removeItem(CART_STORAGE_KEY);
                window.dispatchEvent(new CustomEvent("ds-cart-updated"));
                window.sessionStorage.setItem("ds-last-checkout-email", buyerEmail);
              }
              setCartSummary({ count: 0, total: 0 });
              setCartPreviewItems([]);
              const primaryProductId = encodeURIComponent(
                result.primaryProductId || ""
              );
              window.location.href = `/success?token=${result.token}&paymentId=${result.paymentId}&email=${encodeURIComponent(buyerEmail)}&productId=${primaryProductId}`;
            } else {
              alert(result.error || "Payment verification failed.");
            }
          } catch (err) {
            console.error("Verification error:", err);
            alert(
              "Payment was processed, but purchase syncing failed. Please contact support."
            );
          }
        },
        theme: {
          color: "#f97316",
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (err) {
      console.error("Checkout error:", err);
      alert("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const actionLabel = loading
    ? "Processing..."
    : `Pay INR ${formatCurrency(totalAmount)}`;

  return (
    <>
      <Navbar />
      <main className="checkout-page">
        <section className="container checkout-wrap">
          <header className="checkout-header">
            <p className="checkout-eyebrow">Secure checkout</p>
            <h1>Almost there</h1>
            <p>
              Confirm your details and complete payment to unlock your worksheet
              downloads instantly.
            </p>
          </header>

          <div className="checkout-grid">
            <section className="checkout-card checkout-card--items">
              <div className="checkout-card__title-row">
                <h2>Your items</h2>
                <span>
                  {cartSummary.count} item{cartSummary.count === 1 ? "" : "s"}
                </span>
              </div>

              {cartPreviewItems.length === 0 ? (
                <div className="checkout-empty-state">
                  <p>Your cart is empty right now.</p>
                  <Link href="/worksheets" className="btn btn-secondary">
                    Browse Library
                  </Link>
                </div>
              ) : (
                <div className="checkout-items-list">
                  {cartPreviewItems.map((item) => (
                    <article className="checkout-item" key={item.productId}>
                      <Link
                        href={item.href}
                        className="checkout-item__thumb"
                        aria-label={`Open ${item.title}`}
                      >
                        {item.previewUrl ? (
                          <iframe
                            src={`${item.previewUrl}#page=1&view=FitH,88&toolbar=0&navpanes=0`}
                            title={`${item.title} preview`}
                            loading="lazy"
                          />
                        ) : (
                          <span>{item.classLabel}</span>
                        )}
                      </Link>
                      <div className="checkout-item__content">
                        <h3>
                          <Link href={item.href}>{item.title}</Link>
                        </h3>
                        <p>
                          {item.classLabel} • {item.typeLabel}
                          {item.pages ? ` • ${item.pages} pages` : ""}
                        </p>
                        <div className="checkout-item__meta">
                          <span>Qty {item.quantity}</span>
                          <strong>INR {formatCurrency(item.lineTotal)}</strong>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}

              {loggedInEmail ? (
                <div className="checkout-account-box">
                  <span>Paying with account email</span>
                  <strong>{loggedInEmail}</strong>
                </div>
              ) : (
                <div className="checkout-account-box checkout-account-box--guest">
                  <label htmlFor="checkout-email">Email for purchase access</label>
                  <input
                    id="checkout-email"
                    type="email"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                  />
                  <p>
                    Already have an account?{" "}
                    <Link
                      href={`/auth?next=/checkout&email=${encodeURIComponent(
                        email || ""
                      )}`}
                    >
                      Login / Sign Up
                    </Link>
                  </p>
                </div>
              )}
            </section>

            <aside className="checkout-card checkout-card--summary">
              <h2>Order summary</h2>
              <div className="checkout-summary-row">
                <span>Items</span>
                <strong>{cartSummary.count}</strong>
              </div>
              <div className="checkout-summary-row">
                <span>Subtotal</span>
                <strong>INR {formatCurrency(totalAmount)}</strong>
              </div>
              <div className="checkout-summary-row">
                <span>Tax</span>
                <strong>INR 0</strong>
              </div>
              <div className="checkout-summary-row checkout-summary-row--total">
                <span>Total payable</span>
                <strong>INR {formatCurrency(totalAmount)}</strong>
              </div>

              <button
                type="button"
                className="btn btn-primary checkout-pay-btn"
                onClick={payNow}
                disabled={loading || !hasItems}
              >
                {actionLabel}
              </button>

              {!hasItems && (
                <p className="checkout-note">
                  Add at least one worksheet to continue with payment.
                </p>
              )}

              <ul className="checkout-trust-list">
                <li>Instant PDF delivery after successful payment.</li>
                <li>Order stays available in My Purchases.</li>
                <li>Secured by Razorpay.</li>
              </ul>
            </aside>
          </div>
        </section>
      </main>
    </>
  );
}

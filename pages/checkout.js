import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import Navbar from "../components/Navbar";
import { useAuth } from "../context/AuthContext";
import products from "../data/products";
import { formatMoney, getCurrencySymbol, getPriceCurrency, readCurrencyPreference } from "../lib/pricing/client";
import { getDiscountedUnitPrice } from "../lib/pricing/launchOffer";
import { getSubjectBadgeClass, getSubjectLabel } from "../lib/subjectBadge";

const RAZORPAY_SDK_SRC = "https://checkout.razorpay.com/v1/checkout.js";
const CART_STORAGE_KEY = "ds-worksheet-cart-v1";
const LIVE_HOSTS = new Set(["dearstudent.in", "www.dearstudent.in"]);
const PRODUCTS_BY_ID = products.reduce((acc, product) => {
  acc[product.id] = product;
  return acc;
}, {});

const humanizeLabel = (value) =>
  String(value || "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

const getInAppBrowserName = () => {
  if (typeof navigator === "undefined") return "";
  const ua = String(navigator.userAgent || "");
  if (/Instagram/i.test(ua)) return "Instagram";
  if (/FBAN|FBAV|FBIOS/i.test(ua)) return "Facebook";
  if (/Line/i.test(ua)) return "LINE";
  return "";
};

const openCurrentUrlInBrowser = () => {
  if (typeof window === "undefined") return false;
  const href = String(window.location.href || "");
  if (!href) return false;

  const isAndroid = /Android/i.test(String(navigator.userAgent || ""));
  if (isAndroid) {
    const currentUrl = new URL(href);
    const intentUrl =
      `intent://${currentUrl.host}${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}` +
      "#Intent;scheme=https;package=com.android.chrome;end";
    window.location.href = intentUrl;
    return true;
  }

  window.open(href, "_blank", "noopener,noreferrer");
  return true;
};

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
        subject: String(product?.subject || item?.subject || "").trim(),
        pages: Number(product?.pages || 0) || null,
        quantity,
        price,
        lineTotal: quantity * price,
        href: `/product/${productId}`,
      };
    })
    .filter(Boolean);
};

export default function Checkout() {
  const { user } = useAuth();
  const loggedInEmail = user?.email || "";
  const [loading, setLoading] = useState(false);
  const [couponLoading, setCouponLoading] = useState(false);
  const [cartSummary, setCartSummary] = useState(() => getCartSummary());
  const [cartPreviewItems, setCartPreviewItems] = useState(() => getCartPreviewItems());
  const [runtimeProducts, setRuntimeProducts] = useState([]);
  const [email, setEmail] = useState("");
  const [inAppBrowserName, setInAppBrowserName] = useState("");
  const [couponCodeInput, setCouponCodeInput] = useState("");
  const [couponError, setCouponError] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [availableCoupons, setAvailableCoupons] = useState([]);

  const hasItems = cartSummary.count > 0;
  const cartItemsSignature = useMemo(
    () =>
      cartPreviewItems
        .map((item) => `${item.productId}:${Number(item.quantity || 0)}`)
        .sort()
        .join("|"),
    [cartPreviewItems]
  );

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

  useEffect(() => {
    setInAppBrowserName(getInAppBrowserName());
  }, []);

  useEffect(() => {
    const ids = cartPreviewItems
      .map((item) => String(item?.productId || "").trim())
      .filter(Boolean);
    if (ids.length === 0) {
      setRuntimeProducts([]);
      return;
    }

    let cancelled = false;
    const loadProducts = async () => {
      try {
        const preferredCurrency = readCurrencyPreference();
        const response = await fetch(
          `/api/products?ids=${encodeURIComponent(ids.join(","))}${
            preferredCurrency ? `&currency=${encodeURIComponent(preferredCurrency)}` : ""
          }`
        );
        if (!response.ok) return;
        const payload = await response.json().catch(() => ({}));
        const list = Array.isArray(payload?.products) ? payload.products : [];
        if (!cancelled) setRuntimeProducts(list);
      } catch {
        // Keep static/local cart fallback.
      }
    };

    loadProducts();
    return () => {
      cancelled = true;
    };
  }, [cartPreviewItems]);

  const runtimeProductById = useMemo(() => {
    const map = new Map();
    runtimeProducts.forEach((item) => {
      if (!item?.id) return;
      map.set(item.id, item);
    });
    return map;
  }, [runtimeProducts]);

  const displayCartPreviewItems = useMemo(
    () =>
      cartPreviewItems.map((item) => {
        const runtimeProduct = runtimeProductById.get(item.productId);
        const unitPrice = Number(runtimeProduct?.displayPrice ?? runtimeProduct?.price ?? 0);
        const currency = getPriceCurrency(runtimeProduct || { displayCurrency: readCurrencyPreference() || "INR" });
        return {
          ...item,
          title: runtimeProduct?.title || item.title,
          classLabel: runtimeProduct?.class
            ? humanizeLabel(runtimeProduct.class)
            : item.classLabel,
          typeLabel: runtimeProduct?.type
            ? humanizeLabel(runtimeProduct.type)
            : item.typeLabel,
          subject: String(runtimeProduct?.subject || item.subject || "").trim(),
          pages:
            Number(runtimeProduct?.pages || 0) > 0
              ? Number(runtimeProduct.pages)
              : item.pages,
          price: unitPrice,
          currency,
          lineTotal: runtimeProduct ? unitPrice * Number(item.quantity || 0) : 0,
        };
      }),
    [cartPreviewItems, runtimeProductById]
  );
  const pricesReady = useMemo(
    () =>
      displayCartPreviewItems.length === 0 ||
      displayCartPreviewItems.every((item) => runtimeProductById.has(item.productId)),
    [displayCartPreviewItems, runtimeProductById]
  );

  const displayCurrency = useMemo(
    () => getPriceCurrency(displayCartPreviewItems[0] || { displayCurrency: readCurrencyPreference() || "INR" }),
    [displayCartPreviewItems]
  );
  const launchItemCount = useMemo(
    () => displayCartPreviewItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
    [displayCartPreviewItems]
  );
  const subtotalAmount = useMemo(
    () => displayCartPreviewItems.reduce((sum, item) => sum + Number(item.lineTotal || 0), 0),
    [displayCartPreviewItems]
  );
  const launchTierAmount = useMemo(
    () =>
      displayCartPreviewItems.reduce((sum, item) => {
        const launchUnit = getDiscountedUnitPrice(item.price, item.currency, 1);
        return sum + Number(item.quantity || 0) * launchUnit;
      }, 0),
    [displayCartPreviewItems]
  );
  const totalAmount = useMemo(
    () =>
      displayCartPreviewItems.reduce((sum, item) => {
        const unit = getDiscountedUnitPrice(item.price, item.currency, launchItemCount);
        return sum + Number(item.quantity || 0) * unit;
      }, 0),
    [displayCartPreviewItems, launchItemCount]
  );
  const launchDiscountAmount = useMemo(
    () => Math.max(0, subtotalAmount - launchTierAmount),
    [subtotalAmount, launchTierAmount]
  );
  const multiItemDiscountAmount = useMemo(
    () => Math.max(0, launchTierAmount - totalAmount),
    [launchTierAmount, totalAmount]
  );
  const buyerEmail = (loggedInEmail || email).trim().toLowerCase();
  const couponDiscountAmount = Number(appliedCoupon?.discountAmount || 0);
  const payableAmount = Math.max(0, Number(totalAmount || 0) - couponDiscountAmount);
  const couponFinalAmount = Number(appliedCoupon?.finalAmount);
  const effectiveFinalAmount =
    Number.isFinite(couponFinalAmount) && couponFinalAmount >= 0
      ? couponFinalAmount
      : payableAmount;
  const actionLabel = loading
    ? "Processing..."
    : pricesReady
      ? effectiveFinalAmount <= 0
        ? "Complete Free Order"
        : `Pay ${formatMoney(effectiveFinalAmount, displayCurrency)}`
      : "Updating prices...";

  useEffect(() => {
    setAppliedCoupon(null);
    setCouponError("");
  }, [cartItemsSignature, buyerEmail, displayCurrency]);

  useEffect(() => {
    let cancelled = false;

    const loadAvailableCoupons = async () => {
      if (!hasItems) {
        setAvailableCoupons([]);
        return;
      }

      try {
        setCouponLoading(true);
        const response = await fetch("/api/coupons/available", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: buyerEmail,
            userId: user?.uid || null,
            items: getCartItems(),
            currencyOverride: readCurrencyPreference(),
          }),
        });
        const payload = await response.json().catch(() => ({}));
        if (cancelled) return;
        if (!response.ok || !payload?.ok) {
          setAvailableCoupons([]);
          return;
        }
        setAvailableCoupons(Array.isArray(payload?.coupons) ? payload.coupons : []);
      } catch {
        if (cancelled) return;
        setAvailableCoupons([]);
      } finally {
        if (!cancelled) setCouponLoading(false);
      }
    };

    loadAvailableCoupons();
    return () => {
      cancelled = true;
    };
  }, [hasItems, buyerEmail, cartItemsSignature, user?.uid]);

  const applyCoupon = async (rawCode) => {
    const normalizedCode = String(rawCode || "").trim().toUpperCase();
    if (!normalizedCode) {
      setCouponError("Enter a coupon code.");
      return;
    }

    try {
      setCouponLoading(true);
      setCouponError("");

      const response = await fetch("/api/coupons/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: normalizedCode,
          email: buyerEmail,
          userId: user?.uid || null,
          items: getCartItems(),
          currencyOverride: readCurrencyPreference(),
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok || !payload?.coupon) {
        throw new Error(String(payload?.error || "Unable to apply coupon"));
      }

      setAppliedCoupon(payload.coupon);
      setCouponCodeInput(payload.coupon.code || normalizedCode);
    } catch (applyError) {
      setAppliedCoupon(null);
      setCouponError(String(applyError?.message || "Unable to apply coupon"));
    } finally {
      setCouponLoading(false);
    }
  };

  const payNow = async () => {
    try {
      setLoading(true);

      if (inAppBrowserName) {
        const continueInsideApp = window.confirm(
          `${inAppBrowserName} in-app browser can block PhonePe/UPI app switching. Press Cancel to open this page in Chrome/browser for best payment success, or OK to continue here.`
        );
        if (!continueInsideApp) {
          openCurrentUrlInBrowser();
          return;
        }
      }

      const latestCart = getCartSummary();
      const latestItems = getCartItems();
      const currentBuyerEmail = (loggedInEmail || email).trim().toLowerCase();

      if (latestCart.count <= 0 || latestItems.length === 0) {
        alert("Your cart is empty. Please add items before checkout.");
        return;
      }

      if (!currentBuyerEmail) {
        alert("Please enter email to receive your download.");
        return;
      }

      if (effectiveFinalAmount <= 0) {
        const freeOrderRes = await fetch("/api/checkout/complete-free-order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: latestItems,
            currencyOverride: readCurrencyPreference(),
            couponCode: appliedCoupon?.code || "",
            email: currentBuyerEmail,
            userId: user?.uid || null,
          }),
        });

        const freeOrderPayload = await freeOrderRes.json().catch(() => ({}));
        if (!freeOrderRes.ok || !freeOrderPayload?.success) {
          const freeOrderError = String(freeOrderPayload?.error || "").trim();
          const isNotFree = /not free/i.test(freeOrderError);
          if (!isNotFree) {
            alert(freeOrderError || "Free checkout failed. Please try again.");
            return;
          }
        }

        if (freeOrderRes.ok && freeOrderPayload?.success) {
          if (typeof window !== "undefined") {
            window.localStorage.removeItem(CART_STORAGE_KEY);
            window.dispatchEvent(new CustomEvent("ds-cart-updated"));
            window.sessionStorage.setItem("ds-last-checkout-email", currentBuyerEmail);
          }
          setCartSummary({ count: 0, total: 0 });
          setCartPreviewItems([]);
          const primaryProductId = encodeURIComponent(
            freeOrderPayload.primaryProductId || ""
          );
          const productIdsParam = encodeURIComponent(
            Array.isArray(freeOrderPayload.productIds)
              ? freeOrderPayload.productIds.join(",")
              : ""
          );
          window.location.href = `/success?token=${freeOrderPayload.token}&paymentId=${freeOrderPayload.paymentId}&email=${encodeURIComponent(currentBuyerEmail)}&productId=${primaryProductId}&productIds=${productIdsParam}`;
          return;
        }
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

      if (
        typeof window !== "undefined" &&
        LIVE_HOSTS.has(String(window.location.hostname || "").toLowerCase()) &&
        String(process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || "").startsWith("rzp_test_")
      ) {
        alert("Live checkout is blocked: test Razorpay key detected on production domain.");
        return;
      }

      const res = await fetch("/api/razorpay/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: latestItems,
          currencyOverride: readCurrencyPreference(),
          couponCode: appliedCoupon?.code || "",
          email: currentBuyerEmail,
          userId: user?.uid || null,
        }),
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
        currency: order.currency || "INR",
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
                email: currentBuyerEmail,
                userId: user?.uid || null,
                items: latestItems,
                orderCurrency: order.currency || "INR",
                orderAmount: Number(order.displayAmount || 0),
                appliedCoupon: order.appliedCoupon || null,
              }),
            });

            const result = await verifyRes.json();

            if (result.success) {
              if (typeof window !== "undefined") {
                window.localStorage.removeItem(CART_STORAGE_KEY);
                window.dispatchEvent(new CustomEvent("ds-cart-updated"));
                window.sessionStorage.setItem("ds-last-checkout-email", currentBuyerEmail);
              }
              setCartSummary({ count: 0, total: 0 });
              setCartPreviewItems([]);
              const primaryProductId = encodeURIComponent(
                result.primaryProductId || ""
              );
              const productIdsParam = encodeURIComponent(
                Array.isArray(result.productIds) ? result.productIds.join(",") : ""
              );
              window.location.href = `/success?token=${result.token}&paymentId=${result.paymentId}&email=${encodeURIComponent(currentBuyerEmail)}&productId=${primaryProductId}&productIds=${productIdsParam}`;
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

              {displayCartPreviewItems.length === 0 ? (
                <div className="checkout-empty-state">
                  <p>Your cart is empty right now.</p>
                  <Link href="/worksheets" className="btn btn-secondary">
                    Browse Library
                  </Link>
                </div>
              ) : (
                <div className="checkout-items-list">
                  {displayCartPreviewItems.map((item) => (
                    <article className="checkout-item" key={item.productId}>
                      <Link
                        href={item.href}
                        className="checkout-item__thumb"
                        aria-label={`Open ${item.title}`}
                      >
                        <span className={getSubjectBadgeClass(item.subject)}>
                          {getSubjectLabel(item.subject)}
                        </span>
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
                          <strong>
                            {formatMoney(
                              getDiscountedUnitPrice(item.price, item.currency, launchItemCount)
                                * Number(item.quantity || 0),
                              item.currency
                            )}
                          </strong>
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
                  <label htmlFor="checkout-email">Enter email to receive download</label>
                  <input
                    id="checkout-email"
                    type="email"
                    placeholder="parent@school.com"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    required
                  />
                  <p>
                    No login needed. We will send access and invoice to this email.
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
                <strong>{pricesReady ? formatMoney(subtotalAmount, displayCurrency) : "..."}</strong>
              </div>
              {launchDiscountAmount > 0 ? (
                <div className="checkout-summary-row">
                  <span>Launch discount (10%)</span>
                  <strong>-{pricesReady ? formatMoney(launchDiscountAmount, displayCurrency) : "..."}</strong>
                </div>
              ) : null}
              {multiItemDiscountAmount > 0 ? (
                <div className="checkout-summary-row">
                  <span>Multi-item discount (+10%)</span>
                  <strong>-{pricesReady ? formatMoney(multiItemDiscountAmount, displayCurrency) : "..."}</strong>
                </div>
              ) : null}
              <div className="checkout-summary-row">
                <span>Tax</span>
                <strong>{getCurrencySymbol(displayCurrency)}0</strong>
              </div>
              <div className="checkout-coupon-panel">
                <p className="checkout-coupon-panel__title">Apply coupon</p>
                <div className="checkout-coupon-input-row">
                  <input
                    type="text"
                    value={couponCodeInput}
                    onChange={(event) => setCouponCodeInput(event.target.value.toUpperCase())}
                    placeholder="Enter coupon code"
                  />
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => applyCoupon(couponCodeInput)}
                    disabled={couponLoading || !hasItems}
                  >
                    {couponLoading ? "Applying..." : "Apply"}
                  </button>
                </div>

                {appliedCoupon ? (
                  <div className="checkout-coupon-applied">
                    <p>
                      Coupon applied: <strong>{appliedCoupon.code}</strong>
                    </p>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => {
                        setAppliedCoupon(null);
                        setCouponError("");
                      }}
                    >
                      Remove
                    </button>
                  </div>
                ) : null}

                {couponError ? (
                  <p className="checkout-coupon-error" role="alert">
                    {couponError}
                  </p>
                ) : null}

                {availableCoupons.length > 0 ? (
                  <div className="checkout-coupon-list">
                    <p className="checkout-coupon-list__label">Available coupons for you</p>
                    {availableCoupons.map((coupon) => (
                      <button
                        type="button"
                        key={coupon.id}
                        className="checkout-coupon-list__item"
                        onClick={() => applyCoupon(coupon.code)}
                        disabled={couponLoading}
                      >
                        <span>{coupon.code}</span>
                        <strong>
                          {coupon.discountType === "percentage"
                            ? `${coupon.discountValue}% off${
                                coupon.discountScope === "single_highest_item" ? " (1 item)" : ""
                              }`
                            : coupon.discountType === "free_item"
                              ? "1 highest item free"
                              : `${getCurrencySymbol(coupon.currency)}${coupon.discountValue} off`}
                        </strong>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              {couponDiscountAmount > 0 ? (
                <div className="checkout-summary-row">
                  <span>Coupon discount</span>
                  <strong>-{formatMoney(couponDiscountAmount, displayCurrency)}</strong>
                </div>
              ) : null}
              <div className="checkout-summary-row checkout-summary-row--total">
                <span>Total payable</span>
                <strong>{pricesReady ? formatMoney(payableAmount, displayCurrency) : "..."}</strong>
              </div>

              {inAppBrowserName ? (
                <div className="checkout-inapp-warning" role="alert">
                  <p>
                    You are inside {inAppBrowserName} browser. PhonePe/UPI app handoff may fail here.
                  </p>
                  <button
                    type="button"
                    className="btn btn-secondary checkout-inapp-warning__btn"
                    onClick={openCurrentUrlInBrowser}
                  >
                    Open in Chrome / Browser
                  </button>
                </div>
              ) : null}

              <button
                type="button"
                className="btn btn-primary checkout-pay-btn"
                onClick={payNow}
                disabled={loading || couponLoading || !hasItems || !pricesReady}
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

              <div className="checkout-support-card">
                <p>Need help with payment or access?</p>
                <Link href="/contact-us" className="btn btn-secondary">
                  Contact Support
                </Link>
              </div>
            </aside>
          </div>
        </section>
      </main>
    </>
  );
}

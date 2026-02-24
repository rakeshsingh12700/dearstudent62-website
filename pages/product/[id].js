import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import Navbar from "../../components/Navbar";
import products from "../../data/products";
import { useAuth } from "../../context/AuthContext";
import { hasPurchased } from "../../firebase/purchases";
import { getPreviewUrl } from "../../lib/productAssetUrls";
import { formatMoney, getPriceAmount, getPriceCurrency, readCurrencyPreference } from "../../lib/pricing/client";
import { buildRatingStars, formatRatingAverage, normalizeRatingStats } from "../../lib/productRatings";

const CART_STORAGE_KEY = "ds-worksheet-cart-v1";

const BENEFITS = [
  "Builds confidence through short, focused activities",
  "Screen-light format for home, class, and travel use",
  "Teacher-ready worksheets with easy repetition patterns",
];

function EyeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M15.0102 3.39975L19.7695 7.60782C20.6566 8.39207 21.3816 9.03306 21.8774 9.61267C22.395 10.2176 22.75 10.8531 22.75 11.6327C22.75 12.4122 22.395 13.0477 21.8774 13.6527C21.3816 14.2323 20.6566 14.8733 19.7696 15.6575L15.0101 19.8656C14.6238 20.2073 14.2737 20.5169 13.974 20.7137C13.6785 20.9078 13.184 21.1599 12.6363 20.9153C12.0868 20.6698 11.9466 20.1315 11.8959 19.7815C11.8446 19.4273 11.8446 18.961 11.8447 18.4471L11.8447 16.4191C10.0727 16.5216 8.26985 16.9819 6.69743 17.744C4.89831 18.616 3.45132 19.8572 2.66328 21.3502C2.50236 21.6551 2.15431 21.811 1.81967 21.7281C1.48503 21.6452 1.25 21.3449 1.25 21.0001C1.25 15.4966 2.86837 11.9338 5.16167 9.75118C7.20044 7.81083 9.69493 7.03571 11.8447 6.89302V4.87269C11.8447 4.85449 11.8447 4.83634 11.8447 4.81825C11.8446 4.30437 11.8446 3.83799 11.8959 3.48381C11.9466 3.13387 12.0868 2.59554 12.6363 2.35008C13.184 2.10545 13.6785 2.35755 13.974 2.55163C14.2738 2.74848 14.6238 3.05806 15.0102 3.39975ZM13.3571 3.95726C13.5307 4.09508 13.7528 4.29022 14.0572 4.5594L18.7333 8.69388C19.6735 9.5251 20.3181 10.0974 20.7376 10.5878C21.1434 11.0621 21.25 11.3606 21.25 11.6327C21.25 11.9048 21.1434 12.2033 20.7376 12.6776C20.3181 13.168 19.6735 13.7402 18.7333 14.5715L14.0572 18.7059C13.7528 18.9751 13.5307 19.1703 13.3571 19.3081C13.3456 19.0884 13.3447 18.7952 13.3447 18.3926V15.6473C13.3447 15.2331 13.0089 14.8973 12.5947 14.8973C10.3638 14.8973 8.04463 15.4242 6.04321 16.3942C4.85692 16.9692 3.76443 17.709 2.86794 18.6031C3.26004 14.8062 4.58671 12.3691 6.19578 10.8377C8.13314 8.9939 10.5792 8.36804 12.5947 8.36804C13.0089 8.36804 13.3447 8.03226 13.3447 7.61804V4.87269C13.3447 4.47017 13.3456 4.17694 13.3571 3.95726Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false">
      <rect x="4" y="4" width="16" height="16" rx="5" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="3.5" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="17" cy="7" r="1.2" fill="currentColor" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false">
      <path
        d="M14 8h3V4h-3c-3 0-5 2-5 5v3H6v4h3v4h4v-4h3l1-4h-4V9c0-.6.4-1 1-1z"
        fill="currentColor"
      />
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false">
      <path
        d="M12 4a8 8 0 0 0-6.9 12l-.8 4 4.1-.8A8 8 0 1 0 12 4z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M9.5 9.2c.3-.7.7-.7 1-.7h.3c.1 0 .3 0 .4.3l.8 1.8c.1.2 0 .4-.1.5l-.4.5c-.1.1-.2.3 0 .5.3.4 1.1 1.7 2.7 2.3.2.1.4 0 .5-.1l.6-.7c.1-.1.3-.2.5-.1l1.7.8c.2.1.3.2.3.4v.3c0 .3-.1.7-.7 1-.6.3-1.2.5-2 .3-1.1-.3-2.5-1-3.7-2.2-1.3-1.2-2.1-2.7-2.3-3.8-.1-.8.1-1.4.4-2z"
        fill="currentColor"
      />
    </svg>
  );
}

function CopyLinkIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false">
      <path
        d="M10 14l4-4m-6 8H7a3 3 0 0 1-3-3v-1a3 3 0 0 1 3-3h1m8 0h1a3 3 0 0 1 3 3v1a3 3 0 0 1-3 3h-1m-6-8h4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function humanize(value) {
  return String(value || "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function ProductPage() {
  const router = useRouter();
  const { query } = router;
  const { user } = useAuth();

  const [purchased, setPurchased] = useState(false);
  const [checking, setChecking] = useState(true);
  const [assetAvailable, setAssetAvailable] = useState(true);
  const [checkingAsset, setCheckingAsset] = useState(true);
  const [cartNotice, setCartNotice] = useState("");
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [runtimeProduct, setRuntimeProduct] = useState(null);
  const [runtimeResolved, setRuntimeResolved] = useState(false);
  const [currencyRefreshKey, setCurrencyRefreshKey] = useState(0);
  const [shareLinksOpen, setShareLinksOpen] = useState(false);
  const [shareStatus, setShareStatus] = useState("");
  const [ratingStats, setRatingStats] = useState(() => normalizeRatingStats({}));
  const [ratingForm, setRatingForm] = useState({ rating: 0, review: "" });
  const [ratingLoading, setRatingLoading] = useState(false);
  const [ratingSubmitting, setRatingSubmitting] = useState(false);
  const [ratingNotice, setRatingNotice] = useState({ type: "", text: "" });
  const [editingRating, setEditingRating] = useState(false);

  const staticProduct = products.find((item) => item.id === query.id);
  const product = runtimeProduct || (runtimeResolved ? staticProduct : null);
  const typeLabel = useMemo(() => humanize(product?.type), [product?.type]);
  const classLabel = useMemo(() => humanize(product?.class), [product?.class]);
  const singlePagePreviewUrl = useMemo(
    () => getPreviewUrl(product?.storageKey, 1),
    [product?.storageKey]
  );
  const thumbnailUrl = useMemo(
    () => String(product?.imageUrl || "").trim(),
    [product?.imageUrl]
  );
  const previewImageUrl = useMemo(
    () => String(product?.previewImageUrl || "").trim(),
    [product?.previewImageUrl]
  );
  const showPreviewImage = Boolean(previewImageUrl);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const syncCurrency = () => setCurrencyRefreshKey((value) => value + 1);
    window.addEventListener("ds-currency-updated", syncCurrency);
    return () => {
      window.removeEventListener("ds-currency-updated", syncCurrency);
    };
  }, []);

  useEffect(() => {
    if (typeof query.id !== "string" || !query.id) return;
    let cancelled = false;
    setRuntimeResolved(false);
    setRuntimeProduct(null);

    const loadProduct = async () => {
      try {
        const preferredCurrency = readCurrencyPreference();
        const response = await fetch(
          `/api/products?id=${encodeURIComponent(query.id)}${
            preferredCurrency ? `&currency=${encodeURIComponent(preferredCurrency)}` : ""
          }`
        );
        if (!response.ok) return;
        const payload = await response.json().catch(() => ({}));
        if (!cancelled && payload?.product?.id) {
          setRuntimeProduct(payload.product);
        }
      } catch {
        // Keep static fallback.
      } finally {
        if (!cancelled) setRuntimeResolved(true);
      }
    };

    loadProduct();
    return () => {
      cancelled = true;
    };
  }, [currencyRefreshKey, query.id]);

  useEffect(() => {
    const checkPurchase = async () => {
      const email = String(user?.email || "").trim().toLowerCase();
      if (!email || !product) {
        setPurchased(false);
        setChecking(false);
        return;
      }

      const result = await hasPurchased({
        email,
        productId: product.id,
      });

      setPurchased(result);
      setChecking(false);
    };

    checkPurchase();
  }, [user, product]);

  useEffect(() => {
    const checkAssetAvailability = async () => {
      const key = String(product?.storageKey || "").trim();
      if (!key) {
        setAssetAvailable(false);
        setCheckingAsset(false);
        return;
      }

      setCheckingAsset(true);
      try {
        const response = await fetch(
          `/api/asset-exists?key=${encodeURIComponent(key)}`
        );
        const payload = await response.json().catch(() => ({}));
        setAssetAvailable(Boolean(payload?.exists));
      } catch {
        setAssetAvailable(false);
      } finally {
        setCheckingAsset(false);
      }
    };

    if (product) {
      checkAssetAvailability();
    }
  }, [product]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const closeShare = () => setShareLinksOpen(false);
    window.addEventListener("click", closeShare);
    return () => {
      window.removeEventListener("click", closeShare);
    };
  }, []);

  useEffect(() => {
    setRatingStats(
      normalizeRatingStats({
        averageRating: product?.averageRating,
        ratingCount: product?.ratingCount,
      })
    );
  }, [product?.averageRating, product?.id, product?.ratingCount]);

  useEffect(() => {
    if (!product?.id) return;

    let cancelled = false;
    const loadRatingInfo = async () => {
      setRatingLoading(true);
      try {
        const headers = {};
        if (user) {
          const idToken = await user.getIdToken();
          headers.Authorization = `Bearer ${idToken}`;
        }

        const response = await fetch(
          `/api/product-ratings?productId=${encodeURIComponent(product.id)}`,
          { headers }
        );
        if (!response.ok) return;

        const payload = await response.json().catch(() => ({}));
        if (cancelled) return;

        setRatingStats(normalizeRatingStats(payload?.stats || {}));
        if (payload?.userRating) {
          setRatingForm({
            rating: Number(payload.userRating.rating || 0),
            review: String(payload.userRating.review || ""),
          });
        } else {
          setRatingForm({ rating: 0, review: "" });
        }
      } catch {
        // Keep fallback from product data.
      } finally {
        if (!cancelled) setRatingLoading(false);
      }
    };

    loadRatingInfo();
    return () => {
      cancelled = true;
    };
  }, [product?.id, user]);

  if (!product) {
    return (
      <>
        <Navbar />
        <p>Loading...</p>
      </>
    );
  }

  const addProductToCart = () => {
    if (typeof window === "undefined") return;

    const raw = window.localStorage.getItem(CART_STORAGE_KEY);
    let existingCart = [];
    try {
      const parsed = JSON.parse(raw || "[]");
      existingCart = Array.isArray(parsed) ? parsed : [];
    } catch {
      existingCart = [];
    }

    const existingItem = existingCart.find((item) => item.id === product.id);
    const nextCart = existingItem
      ? existingCart.map((item) =>
          item.id === product.id
            ? { ...item, quantity: Number(item.quantity || 0) + 1 }
            : item
        )
      : [
          ...existingCart,
          {
            id: product.id,
            title: product.title,
            price: getPriceAmount(product),
            currency: getPriceCurrency(product),
            class: product.class,
            subject: product.subject,
            type: product.type,
            quantity: 1,
          },
        ];

    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(nextCart));
    window.dispatchEvent(new CustomEvent("ds-cart-updated"));
  };

  const handleAddToCart = () => {
    addProductToCart();
    setCartNotice("Added to cart. You can checkout anytime.");
  };

  const handleBuyNow = () => {
    addProductToCart();
    router.push("/checkout");
  };

  const handleBuyAgain = () => {
    addProductToCart();
    router.push("/checkout");
  };

  const getShareUrl = () => {
    if (typeof window === "undefined" || !product?.id) return "";
    return `${window.location.origin}/product/${encodeURIComponent(product.id)}`;
  };

  const handleShare = () => {
    const url = getShareUrl();
    if (!url) return;
    setShareStatus("");

    setShareLinksOpen((prev) => !prev);
  };

  const copyShareLink = async () => {
    const url = getShareUrl();
    if (!url) return false;
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setShareStatus("Link copied.");
        return true;
      }
      const input = document.createElement("input");
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      input.remove();
      setShareStatus("Link copied.");
      return true;
    } catch {
      setShareStatus("Could not copy link.");
      return false;
    }
  };

  const shareUrl = getShareUrl();
  const encodedShareUrl = encodeURIComponent(shareUrl);
  const encodedShareText = encodeURIComponent(
    `${product?.title || "Worksheet"} - printable worksheet`
  );

  const shareInstagram = async () => {
    const copied = await copyShareLink();
    if (!copied) {
      setShareStatus("Could not copy link.");
    } else {
      setShareStatus("Link copied. Paste in Instagram.");
    }
    if (typeof window !== "undefined") {
      window.open("https://www.instagram.com/", "_blank", "noopener,noreferrer");
    }
    setShareLinksOpen(false);
  };

  const shareFacebook = () => {
    if (!shareUrl || typeof window === "undefined") return;
    window.open(
      `https://www.facebook.com/sharer/sharer.php?u=${encodedShareUrl}`,
      "_blank",
      "noopener,noreferrer"
    );
    setShareLinksOpen(false);
  };

  const shareWhatsApp = () => {
    if (!shareUrl || typeof window === "undefined") return;
    window.open(
      `https://wa.me/?text=${encodedShareText}%20${encodedShareUrl}`,
      "_blank",
      "noopener,noreferrer"
    );
    setShareLinksOpen(false);
  };

  const ratingSummaryLabel =
    ratingStats.ratingCount > 0
      ? `${formatRatingAverage(ratingStats)} (${ratingStats.ratingCount} rating${
          ratingStats.ratingCount === 1 ? "" : "s"
        })`
      : "";

  const submitRating = async (event) => {
    event.preventDefault();
    if (!user) {
      setRatingNotice({
        type: "error",
        text: "Please login first to submit a rating.",
      });
      return;
    }
    if (!purchased) {
      setRatingNotice({
        type: "error",
        text: "You can rate only worksheets you have purchased.",
      });
      return;
    }
    const rating = Number.parseInt(String(ratingForm.rating || 0), 10);
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      setRatingNotice({
        type: "error",
        text: "Please select a rating from 1 to 5 stars.",
      });
      return;
    }

    try {
      setRatingSubmitting(true);
      setRatingNotice({ type: "", text: "" });

      const idToken = await user.getIdToken();
      const response = await fetch("/api/product-ratings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          productId: product.id,
          rating,
          review: String(ratingForm.review || "").trim(),
          displayName: String(user?.displayName || "").trim(),
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || "Unable to submit rating right now.");
      }

      setRatingStats(normalizeRatingStats(payload?.stats || {}));
      if (payload?.userRating) {
        setRatingForm({
          rating: Number(payload.userRating.rating || 0),
          review: String(payload.userRating.review || ""),
        });
      }
      setRatingNotice({ type: "ok", text: "Thanks for your rating. Your feedback has been saved." });
      setEditingRating(false);
    } catch (error) {
      setRatingNotice({
        type: "error",
        text: String(error?.message || "Unable to submit rating right now."),
      });
    } finally {
      setRatingSubmitting(false);
    }
  };

  return (
    <>
      <Navbar />
      <main className="product-page">
        <section className="container product-wrap">
          <nav className="product-breadcrumb" aria-label="Breadcrumb">
            <Link href="/">Home</Link>
            <span aria-hidden="true">›</span>
            <Link href="/worksheets">Worksheets</Link>
            <span aria-hidden="true">›</span>
            <span>{product.title}</span>
          </nav>

          <section className="product-hero">
            <div className="product-preview-card">
              <div className="product-preview-card__header">
                <p>Worksheet Peek</p>
              </div>
              <div className="product-preview-card__frame">
                <button
                  type="button"
                  className="product-preview-card__preview-btn"
                  aria-label={`Quick preview ${product.title}`}
                  onClick={() => setIsPreviewOpen(true)}
                >
                  <EyeIcon />
                </button>
                <div className="product-share product-preview-card__share">
                  <button
                    type="button"
                    className="product-share__trigger product-share__trigger--icon"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleShare();
                    }}
                    aria-label={`Share ${product.title}`}
                  >
                    <ShareIcon />
                  </button>
                  {shareLinksOpen && (
                    <div className="product-share__links" onClick={(event) => event.stopPropagation()}>
                      <button type="button" onClick={shareInstagram}>
                        <span className="share-option__icon share-option__icon--instagram">
                          <InstagramIcon />
                        </span>
                        Instagram
                      </button>
                      <button type="button" onClick={shareFacebook}>
                        <span className="share-option__icon share-option__icon--facebook">
                          <FacebookIcon />
                        </span>
                        Facebook
                      </button>
                      <button type="button" onClick={shareWhatsApp}>
                        <span className="share-option__icon share-option__icon--whatsapp">
                          <WhatsAppIcon />
                        </span>
                        WhatsApp
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await copyShareLink();
                          setShareLinksOpen(false);
                        }}
                      >
                        <span className="share-option__icon share-option__icon--copy">
                          <CopyLinkIcon />
                        </span>
                        Copy Link
                      </button>
                    </div>
                  )}
                </div>
                {thumbnailUrl ? (
                  <Image
                    src={thumbnailUrl}
                    alt={`${product.title} thumbnail`}
                    fill
                    sizes="(max-width: 767px) 92vw, (max-width: 1200px) 50vw, 420px"
                    quality={65}
                    priority
                    unoptimized
                  />
                ) : (
                  <div className="product-preview-card__android-fallback">
                    <span>Preview available</span>
                  </div>
                )}
              </div>
              <p className="product-preview-card__hint">
                Preview shows page 1 only.
              </p>
              {shareStatus && <p className="product-share__status">{shareStatus}</p>}
            </div>

            <div className="product-info-card">
              <div className="product-info-card__eyebrow-row">
                <span>{classLabel}</span>
                <span>{typeLabel}</span>
                {!product.hideAgeLabel && product.ageLabel && <span>{product.ageLabel}</span>}
              </div>
              <h1>{product.title}</h1>
              <p className="product-info-card__subtitle">
                A playful printable set to build early confidence with structured,
                repeatable activities.
              </p>
              {ratingStats.ratingCount > 0 && (
                <p className="product-rating-summary" aria-label={ratingSummaryLabel}>
                  <span className="product-rating-summary__stars">
                    {buildRatingStars(ratingStats.averageRating)}
                  </span>
                  <span>{ratingSummaryLabel}</span>
                </p>
              )}

              <div className="product-info-card__price-row">
                <div>
                  <strong>{formatMoney(getPriceAmount(product), getPriceCurrency(product))}</strong>
                  <p>{product.pages || 0} printable pages • Instant digital access</p>
                </div>
              </div>

              {checking && (
                <p className="product-info-card__status">Checking your library access...</p>
              )}
              {checkingAsset && (
                <p className="product-info-card__status">Verifying file availability...</p>
              )}
              {!checkingAsset && !assetAvailable && (
                <p className="product-info-card__status">
                  This worksheet file is currently unavailable.
                </p>
              )}

              {!checking && purchased && assetAvailable && (
                <div className="product-info-card__owned">
                  <p>This worksheet is already in your library.</p>
                  <div className="product-info-card__cta-row">
                    <Link href="/my-purchases" className="btn btn-primary">
                      Open My Purchases
                    </Link>
                    <button type="button" className="btn btn-secondary" onClick={handleBuyAgain}>
                      Buy Again
                    </button>
                  </div>
                </div>
              )}

              {!checking && purchased && assetAvailable && (
                <div className="product-info-card__help">
                  <p>Questions before purchase or a checkout issue?</p>
                  <Link href="/contact-us" className="btn-link">Contact Support</Link>
                </div>
              )}

              {!checking && purchased && assetAvailable && (() => {
                const hasRated = ratingForm.rating >= 1 && !ratingLoading;
                if (hasRated && !editingRating) {
                  return (
                    <div className="product-rating-form product-rating-form--rated">
                      <p className="product-rating-form__summary">
                        <span className="product-rating-form__summary-stars">{buildRatingStars(ratingForm.rating)}</span>
                        You rated this worksheet
                      </p>
                      <button type="button" className="btn btn-secondary" onClick={() => setEditingRating(true)}>
                        Change rating
                      </button>
                    </div>
                  );
                }
                return (
                  <form className="product-rating-form" onSubmit={submitRating}>
                    <h3>Rate This Worksheet</h3>
                    <p className="product-rating-form__hint">
                      Share your rating. Review text is optional and kept private for quality checks.
                    </p>
                    <div className="product-rating-form__stars" role="group" aria-label="Rating">
                      {[1, 2, 3, 4, 5].map((value) => (
                        <button
                          key={`rate-${value}`}
                          type="button"
                          className={`product-rating-form__star ${ratingForm.rating >= value ? "active" : ""}`}
                          onClick={() => setRatingForm((prev) => ({ ...prev, rating: value }))}
                          aria-label={`${value} star${value === 1 ? "" : "s"}`}
                        >
                          ★
                        </button>
                      ))}
                    </div>
                    <label htmlFor="product-rating-review">Optional review</label>
                    <textarea
                      id="product-rating-review"
                      name="review"
                      value={ratingForm.review}
                      maxLength={1200}
                      onChange={(e) => setRatingForm((prev) => ({ ...prev, review: e.target.value }))}
                      placeholder="Tell us what worked well or what can improve."
                      rows={4}
                    />
                    <button type="submit" className="btn btn-secondary" disabled={ratingSubmitting || ratingLoading}>
                      {ratingSubmitting ? "Saving..." : "Submit Rating"}
                    </button>
                    {ratingNotice.text && (
                      <p className={`product-rating-form__status ${ratingNotice.type === "error" ? "product-rating-form__status--error" : "product-rating-form__status--ok"}`}>
                        {ratingNotice.text}
                      </p>
                    )}
                  </form>
                );
              })()}

              {!checking && !purchased && assetAvailable && (
                <>
                  <div className="product-info-card__cta-row product-info-card__cta-row--buy">
                    <button
                      type="button"
                      className="btn btn-primary product-info-card__buy-btn"
                      onClick={handleBuyNow}
                    >
                      Buy Now
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary product-info-card__cart-btn"
                      onClick={handleAddToCart}
                    >
                      Add to Cart
                    </button>
                  </div>
                  <div className="product-info-card__help">
                    <p>Questions before purchase or a checkout issue?</p>
                    <Link href="/contact-us" className="btn-link">Contact Support</Link>
                  </div>
                  {cartNotice && <p className="product-info-card__status">{cartNotice}</p>}
                </>
              )}

              <ul className="product-info-card__benefits">
                {BENEFITS.map((benefit) => (
                  <li key={benefit}>{benefit}</li>
                ))}
              </ul>
            </div>
          </section>

          <section className="product-details-grid">
            <article className="product-detail-panel">
              <h2>What Teachers Love</h2>
              <p>
                Ready-to-print pages with clear progression. Easy to use in class warmups,
                revision rounds, and home assignments.
              </p>
            </article>
            <article className="product-detail-panel">
              <h2>Parent Friendly</h2>
              <p>
                Simple instructions, engaging activity flow, and no extra setup. Just print,
                guide, and celebrate progress.
              </p>
            </article>
            <article className="product-detail-panel">
              <h2>Format</h2>
              <p>
                PDF worksheet • {product.pages || 0} pages • Reusable for revision cycles.
              </p>
            </article>
          </section>

        </section>
      </main>

      {isPreviewOpen && (
        <div className="worksheet-preview-modal">
          <button
            className="worksheet-preview-modal__overlay"
            onClick={() => setIsPreviewOpen(false)}
            type="button"
            aria-label="Close preview"
          />
          <section className="worksheet-preview-modal__panel">
            <header className="worksheet-preview-modal__header">
              <h2>{product.title} - Quick Preview</h2>
              <button
                type="button"
                className="btn-link"
                onClick={() => setIsPreviewOpen(false)}
              >
                Close
              </button>
            </header>
            <p className="worksheet-preview-modal__hint">
              Preview shows cover image
              {showPreviewImage ? " and first-page image." : "."}
            </p>
            {(thumbnailUrl || showPreviewImage) ? (
              <div className="worksheet-preview-modal__pages">
                {thumbnailUrl ? (
                  <Image
                    className="worksheet-preview-modal__page-image"
                    src={thumbnailUrl}
                    alt={`${product.title} cover`}
                    width={900}
                    height={1273}
                    sizes="(max-width: 767px) 92vw, 700px"
                    loading="lazy"
                    quality={70}
                    unoptimized
                  />
                ) : null}
                {showPreviewImage && (
                  <Image
                    className="worksheet-preview-modal__page-image"
                    src={previewImageUrl}
                    alt={`${product.title} first page`}
                    width={900}
                    height={1273}
                    sizes="(max-width: 767px) 92vw, 700px"
                    loading="lazy"
                    quality={70}
                    unoptimized
                  />
                )}
              </div>
            ) : (
              <div className="worksheet-preview-modal__fallback">
                <p>Preview image is not available for this worksheet.</p>
                <a href={singlePagePreviewUrl} target="_blank" rel="noreferrer">
                  Open preview in new tab
                </a>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}

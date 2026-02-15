import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import Navbar from "../../components/Navbar";
import products from "../../data/products";
import { useAuth } from "../../context/AuthContext";
import { hasPurchased } from "../../firebase/purchases";
import { getPreviewUrl } from "../../lib/productAssetUrls";

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

function humanize(value) {
  return String(value || "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function ProductPage() {
  const router = useRouter();
  const { query } = router;
  const { user } = useAuth();

  const [guestEmail, setGuestEmail] = useState("");
  const [purchased, setPurchased] = useState(false);
  const [checking, setChecking] = useState(true);
  const [assetAvailable, setAssetAvailable] = useState(true);
  const [checkingAsset, setCheckingAsset] = useState(true);
  const [cartNotice, setCartNotice] = useState("");
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const product = products.find((item) => item.id === query.id);
  const typeLabel = useMemo(() => humanize(product?.type), [product?.type]);
  const classLabel = useMemo(() => humanize(product?.class), [product?.class]);
  const singlePagePreviewUrl = useMemo(
    () => getPreviewUrl(product?.storageKey, 1),
    [product?.storageKey]
  );

  useEffect(() => {
    const checkPurchase = async () => {
      const email = user?.email || guestEmail;
      if (!email || !product) {
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
  }, [user, guestEmail, product]);

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
            price: product.price,
            class: product.class,
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
                <iframe
                  src={`${singlePagePreviewUrl}#page=1&view=FitH,95&toolbar=0&navpanes=0&scrollbar=0`}
                  title={`${product.title} preview`}
                />
              </div>
              <p className="product-preview-card__hint">
                Preview shows page 1 only.
              </p>
            </div>

            <div className="product-info-card">
              <div className="product-info-card__eyebrow-row">
                <span>{classLabel}</span>
                <span>{typeLabel}</span>
                <span>{product.ageLabel || "AGE 3+"}</span>
              </div>
              <h1>{product.title}</h1>
              <p className="product-info-card__subtitle">
                A playful printable set to build early confidence with structured,
                repeatable activities.
              </p>

              <div className="product-info-card__price-row">
                <strong>INR {product.price}</strong>
                <p>{product.pages || 0} printable pages • Instant digital access</p>
              </div>

              <ul className="product-info-card__benefits">
                {BENEFITS.map((benefit) => (
                  <li key={benefit}>{benefit}</li>
                ))}
              </ul>

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

              {!checking && !purchased && assetAvailable && (
                <>
                  {!user && (
                    <div className="product-info-card__guest">
                      <label htmlFor="guest-email">Email for purchase receipts</label>
                      <input
                        id="guest-email"
                        type="email"
                        placeholder="parent@school.com"
                        value={guestEmail}
                        onChange={(event) => setGuestEmail(event.target.value)}
                      />
                      <p>
                        Guest checkout is supported. You can create/login later and keep all
                        purchases in one place.
                      </p>
                    </div>
                  )}

                  <div className="product-info-card__cta-row">
                    <button type="button" className="btn btn-primary" onClick={handleBuyNow}>
                      Buy Now
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={handleAddToCart}>
                      Add to Cart
                    </button>
                  </div>

                  {cartNotice && <p className="product-info-card__status">{cartNotice}</p>}
                </>
              )}
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
            <p className="worksheet-preview-modal__hint">Preview shows page 1 only.</p>
            <iframe
              className="worksheet-preview-modal__frame"
              src={`${singlePagePreviewUrl}#page=1&view=FitH,110&toolbar=0&navpanes=0&scrollbar=0`}
              title={`${product.title} preview`}
            />
          </section>
        </div>
      )}
    </>
  );
}

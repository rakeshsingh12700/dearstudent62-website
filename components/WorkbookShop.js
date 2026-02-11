import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import products from "../data/products";

const CLASS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "pre-nursery", label: "Pre Nursery" },
  { value: "nursery", label: "Nursery" },
  { value: "lkg", label: "LKG" },
  { value: "ukg", label: "UKG" }
];

const TYPE_OPTIONS = [
  { value: "all", label: "All Assets" },
  { value: "workbook", label: "Workbooks" },
  { value: "exams", label: "Exams" },
  { value: "half-year-exam", label: "Half Year Exam" },
  { value: "final-year-exam", label: "Final Year Exam" }
];

const SORT_OPTIONS = [
  { value: "default", label: "Default sorting" },
  { value: "price-low", label: "Price: Low to High" },
  { value: "price-high", label: "Price: High to Low" },
  { value: "title", label: "Title: A-Z" }
];

const CART_STORAGE_KEY = "ds-workbook-cart-v1";

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

export default function WorkbookShop({
  initialClass = "all",
  initialType = "all",
  initialOpenCart = false
}) {
  const [selectedClass, setSelectedClass] = useState(initialClass);
  const [selectedType, setSelectedType] = useState(initialType);
  const [sortBy, setSortBy] = useState("default");
  const [isCartOpen, setIsCartOpen] = useState(initialOpenCart);
  const [previewState, setPreviewState] = useState(null);
  const [thumbnailPages, setThumbnailPages] = useState({});
  const [cart, setCart] = useState(() => {
    if (typeof window === "undefined") return [];
    const savedCart = window.localStorage.getItem(CART_STORAGE_KEY);
    if (!savedCart) return [];
    try {
      const parsed = JSON.parse(savedCart);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
    window.dispatchEvent(new CustomEvent("ds-cart-updated"));
  }, [cart]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const openCart = () => setIsCartOpen(true);
    window.addEventListener("ds-open-cart", openCart);
    return () => {
      window.removeEventListener("ds-open-cart", openCart);
    };
  }, []);

  const visibleProducts = useMemo(() => {
    const filtered = products.filter((item) => {
      const classMatch = selectedClass === "all" || item.class === selectedClass;
      const typeMatch = selectedType === "all" || item.type === selectedType;
      return classMatch && typeMatch;
    });

    const sorted = [...filtered];
    if (sortBy === "price-low") {
      sorted.sort((a, b) => a.price - b.price);
    } else if (sortBy === "price-high") {
      sorted.sort((a, b) => b.price - a.price);
    } else if (sortBy === "title") {
      sorted.sort((a, b) => a.title.localeCompare(b.title));
    }
    return sorted;
  }, [selectedClass, selectedType, sortBy]);

  const cartTotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.quantity * item.price, 0),
    [cart]
  );

  const updateCartItem = (product, delta) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      if (!existing && delta > 0) {
        return [...prev, { ...product, quantity: 1 }];
      }
      if (!existing) return prev;

      const nextQty = existing.quantity + delta;
      if (nextQty <= 0) {
        return prev.filter((item) => item.id !== product.id);
      }

      return prev.map((item) =>
        item.id === product.id ? { ...item, quantity: nextQty } : item
      );
    });
  };

  const clearCart = () => {
    setCart([]);
  };

  const setThumbnailPage = (productId, page) => {
    setThumbnailPages((prev) => ({ ...prev, [productId]: page }));
  };

  const getItemQuantity = (productId) => {
    const item = cart.find((cartItem) => cartItem.id === productId);
    return item ? item.quantity : 0;
  };

  return (
    <main className="workbooks-page">
      <section className="workbooks-wrap container workbooks-wrap--wide">
        <div className="workbooks-top-row">
          <div className="workbooks-heading">
            <h1 className="workbooks-title">The Library</h1>
            <p className="workbooks-subtitle">
              Hand-picked worksheet sets for early learners.
            </p>
          </div>

          <div className="workbooks-filter-pane">
            <div className="workbooks-segment">
              {CLASS_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={selectedClass === option.value ? "active" : ""}
                  onClick={() => setSelectedClass(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="workbooks-segment workbooks-segment--type">
              {TYPE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={selectedType === option.value ? "active" : ""}
                  onClick={() => setSelectedType(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="workbooks-toolbar">
          <p>
            Showing {visibleProducts.length === 0 ? 0 : 1}-{visibleProducts.length}{" "}
            of {visibleProducts.length} results
          </p>
          <label className="workbooks-sort">
            <span>Sort:</span>
            <select
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value)}
            >
              {SORT_OPTIONS.map((option) => (
                <option value={option.value} key={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {visibleProducts.length === 0 && (
          <div className="workbooks-empty">
            No assets found for selected filters. Try another class or asset type.
          </div>
        )}

        <div className="workbooks-grid">
          {visibleProducts.map((product) => {
            const currentPage = thumbnailPages[product.id] || 1;
            const quantity = getItemQuantity(product.id);

            return (
              <article className="workbook-card" key={product.id}>
                <div className="workbook-card__media workbook-card__media--pdf">
                  <Link
                    href={`/product/${product.id}`}
                    className="workbook-card__media-click"
                    aria-label={`Open ${product.title}`}
                  >
                    <span className="workbook-card__badge">Sale!</span>
                    <iframe
                      src={`${product.pdf}#page=${currentPage}&view=FitH,88&toolbar=0&navpanes=0`}
                      title={`${product.title} page ${currentPage} thumbnail`}
                      loading="lazy"
                    />
                  </Link>
                  <div className="workbook-card__dots" aria-hidden="true">
                    <button
                      type="button"
                      className={currentPage === 1 ? "active" : ""}
                      onClick={() => setThumbnailPage(product.id, 1)}
                    />
                    <button
                      type="button"
                      className={currentPage === 2 ? "active" : ""}
                      onClick={() => setThumbnailPage(product.id, 2)}
                    />
                  </div>
                  <button
                    type="button"
                    className="workbook-card__preview-btn"
                    aria-label={`Quick preview ${product.title}`}
                    onClick={() => setPreviewState(product)}
                  >
                    <EyeIcon />
                  </button>
                </div>

                <p className="workbook-card__age">{product.ageLabel || "AGE 3+"}</p>
                <h3 className="workbook-card__title">
                  <Link href={`/product/${product.id}`}>{product.title}</Link>
                </h3>
                <p className="workbook-card__meta">
                  {(product.type || "workbook").replaceAll("-", " ")} |{" "}
                  {product.pages || 0} Pages | Digital PDF
                </p>
                <p className="workbook-card__price">INR {product.price}</p>
                <div className="workbook-card__actions">
                  {quantity === 0 ? (
                    <button
                      type="button"
                      className="cart-stepper cart-stepper--empty"
                      onClick={() => updateCartItem(product, 1)}
                    >
                      <span className="cart-stepper__label">Add to Cart</span>
                      <span className="cart-stepper__plus">+</span>
                    </button>
                  ) : (
                    <div className="cart-stepper">
                      <button
                        type="button"
                        className="cart-stepper__btn"
                        aria-label={`Decrease quantity for ${product.title}`}
                        onClick={() => updateCartItem(product, -1)}
                      >
                        {quantity === 1 ? (
                          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                            <path
                              d="M6 7h12M9 7V5h6v2m-7 3v8m4-8v8m4-8v8M8 7l1 12h6l1-12"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                            />
                          </svg>
                        ) : (
                          "-"
                        )}
                      </button>
                      <span className="cart-stepper__count">{quantity}</span>
                      <button
                        type="button"
                        className="cart-stepper__btn"
                        aria-label={`Increase quantity for ${product.title}`}
                        onClick={() => updateCartItem(product, 1)}
                      >
                        +
                      </button>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {previewState && (
        <div className="workbook-preview-modal">
          <button
            className="workbook-preview-modal__overlay"
            onClick={() => setPreviewState(null)}
            type="button"
            aria-label="Close preview"
          />
          <section className="workbook-preview-modal__panel">
            <header className="workbook-preview-modal__header">
              <h2>{previewState.title} - Quick Preview</h2>
              <button
                type="button"
                className="btn-link"
                onClick={() => setPreviewState(null)}
              >
                Close
              </button>
            </header>
            <p className="workbook-preview-modal__hint">
              Scroll inside preview to browse worksheet pages.
            </p>
            <iframe
              className="workbook-preview-modal__frame"
              src={`${previewState.pdf}#page=1&view=FitH,110&toolbar=0&navpanes=0`}
              title={`${previewState.title} preview`}
            />
          </section>
        </div>
      )}

      {isCartOpen && (
        <div className="workbook-cart">
          <button
            className="workbook-cart__overlay"
            onClick={() => setIsCartOpen(false)}
            type="button"
            aria-label="Close cart"
          />
          <aside className="workbook-cart__panel">
            <div className="workbook-cart__header">
              <h2>My Cart</h2>
              <div className="workbook-cart__header-actions">
                {cart.length > 0 && (
                  <button
                    type="button"
                    className="btn-link workbook-cart__clear-btn"
                    onClick={clearCart}
                  >
                    Clear cart
                  </button>
                )}
                <button
                  type="button"
                  className="btn-link"
                  onClick={() => setIsCartOpen(false)}
                >
                  Close
                </button>
              </div>
            </div>

            <div className="workbook-cart__items">
              {cart.length === 0 && (
                <p className="workbook-cart__empty">Your cart is empty.</p>
              )}
              {cart.map((item) => (
                <div className="workbook-cart__item" key={item.id}>
                  <div>
                    <p className="workbook-cart__item-title">{item.title}</p>
                    <p className="workbook-cart__item-price">INR {item.price}</p>
                  </div>
                  <div className="workbook-cart__qty">
                    <button
                      type="button"
                      onClick={() => updateCartItem(item, -1)}
                      aria-label={`Decrease quantity for ${item.title}`}
                    >
                      -
                    </button>
                    <span>{item.quantity}</span>
                    <button
                      type="button"
                      onClick={() => updateCartItem(item, 1)}
                      aria-label={`Increase quantity for ${item.title}`}
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="workbook-cart__footer">
              <p>
                Total <strong>INR {cartTotal}</strong>
              </p>
              <Link href="/checkout" className="btn btn-primary">
                Proceed to Checkout
              </Link>
            </div>
          </aside>
        </div>
      )}
    </main>
  );
}

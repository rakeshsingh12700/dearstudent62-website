import Navbar from "../components/Navbar";
import Link from "next/link";
import Head from "next/head";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { useAuth } from "../context/AuthContext";
import { motion } from "framer-motion";
import productsCatalog from "../data/products";
import { getThumbnailUrl } from "../lib/productAssetUrls";
import { getDiscountedUnitPrice, hasDisplayPriceChange } from "../lib/pricing/launchOffer";

const FALLBACK_POPULAR = [...productsCatalog]
  .sort((first, second) => {
    const firstScore = Number(first?.pages || 0) * 100 + Number(first?.price || 0);
    const secondScore = Number(second?.pages || 0) * 100 + Number(second?.price || 0);
    return secondScore - firstScore;
  })
  .slice(0, 8)
  .map((item) => ({
    id: item.id,
    title: item.title,
    class: item.class,
    type: item.type,
    price: Number(item.price || 0),
    displaySymbol: "INR",
    displayCurrency: "INR",
    purchaseCount: 0,
    storageKey: item.storageKey || "",
    imageUrl: item.imageUrl || "",
  }));

const FALLBACK_RECENT = [...productsCatalog]
  .slice(-8)
  .reverse()
  .map((item) => ({
    id: item.id,
    title: item.title,
    class: item.class,
    type: item.type,
    price: Number(item.price || 0),
    displaySymbol: "INR",
    displayCurrency: "INR",
    purchaseCount: 0,
    storageKey: item.storageKey || "",
    imageUrl: item.imageUrl || "",
  }));

const CART_STORAGE_KEY = "ds-worksheet-cart-v1";

function formatPrice(value, symbol, currency) {
  const amount = Number(value || 0);
  const formatted = Number.isFinite(amount) ? amount.toLocaleString("en-IN") : "0";
  const normalizedSymbol = String(symbol || "").trim();
  if (!normalizedSymbol || normalizedSymbol.toUpperCase() === String(currency || "").toUpperCase()) {
    return `${String(currency || "INR")} ${formatted}`;
  }
  return `${normalizedSymbol} ${formatted}`;
}

export default function Home() {
  const { user } = useAuth();
  const router = useRouter();
  const [rails, setRails] = useState({
    popular: FALLBACK_POPULAR,
    recent: FALLBACK_RECENT,
  });
  const [cardsPerRail, setCardsPerRail] = useState(4);
  const [cartNoticeById, setCartNoticeById] = useState({});
  const [cartQtyById, setCartQtyById] = useState({});
  const [instagramFollowersLabel, setInstagramFollowersLabel] = useState("122k+");

  useEffect(() => {
    if (!router.isReady) return;

    const mode = typeof router.query.mode === "string" ? router.query.mode : "";
    const oobCode =
      typeof router.query.oobCode === "string" ? router.query.oobCode : "";
    if (!mode || !oobCode) return;

    router.replace(
      {
        pathname: "/__/auth/action",
        query: router.query,
      },
      undefined,
      { shallow: true }
    );
  }, [router, router.isReady, router.query]);

  useEffect(() => {
    let cancelled = false;
    const loadRails = async () => {
      try {
        const response = await fetch("/api/home-rails");
        if (!response.ok) return;
        const payload = await response.json().catch(() => null);
        if (!payload || cancelled) return;
        const popular = Array.isArray(payload.popular) && payload.popular.length > 0
          ? payload.popular
          : FALLBACK_POPULAR;
        const recent = Array.isArray(payload.recent) && payload.recent.length > 0
          ? payload.recent
          : FALLBACK_RECENT;
        setRails({ popular, recent });
      } catch {
        // Keep fallback rails.
      }
    };

    loadRails();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadSocialProof = async () => {
      try {
        const response = await fetch("/api/social-proof");
        if (!response.ok) return;
        const payload = await response.json().catch(() => null);
        const nextLabel = String(payload?.instagramFollowersLabel || "").trim();
        if (!cancelled && nextLabel) {
          setInstagramFollowersLabel(nextLabel);
        }
      } catch {
        // Keep default fallback.
      }
    };

    loadSocialProof();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const syncCartQty = () => {
      const next = {};
      const raw = window.localStorage.getItem(CART_STORAGE_KEY);
      if (!raw) {
        setCartQtyById({});
        return;
      }
      try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
          setCartQtyById({});
          return;
        }
        parsed.forEach((item) => {
          const id = String(item?.id || "").trim();
          const qty =
            Number.isFinite(Number(item?.quantity)) && Number(item.quantity) > 0
              ? Number(item.quantity)
              : 0;
          if (id && qty > 0) next[id] = qty;
        });
        setCartQtyById(next);
      } catch {
        setCartQtyById({});
      }
    };

    syncCartQty();
    window.addEventListener("storage", syncCartQty);
    window.addEventListener("ds-cart-updated", syncCartQty);
    return () => {
      window.removeEventListener("storage", syncCartQty);
      window.removeEventListener("ds-cart-updated", syncCartQty);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const syncCardsPerRail = () => {
      const width = window.innerWidth;
      if (width < 760) {
        setCardsPerRail(2);
        return;
      }
      if (width < 1100) {
        setCardsPerRail(3);
        return;
      }
      setCardsPerRail(4);
    };
    syncCardsPerRail();
    window.addEventListener("resize", syncCardsPerRail);
    return () => {
      window.removeEventListener("resize", syncCardsPerRail);
    };
  }, []);

  const popularRail = useMemo(
    () => rails.popular.slice(0, cardsPerRail),
    [rails.popular, cardsPerRail]
  );
  const recentRail = useMemo(
    () => rails.recent.slice(0, cardsPerRail),
    [rails.recent, cardsPerRail]
  );

  const addRailItemToCart = (item) => {
    if (typeof window === "undefined" || !item?.id) return;
    let cartItems = [];
    const raw = window.localStorage.getItem(CART_STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) cartItems = parsed;
      } catch {
        cartItems = [];
      }
    }

    const index = cartItems.findIndex((entry) => entry?.id === item.id);
    if (index >= 0) {
      const currentQty =
        Number.isFinite(Number(cartItems[index]?.quantity)) &&
        Number(cartItems[index].quantity) > 0
          ? Number(cartItems[index].quantity)
          : 0;
      cartItems[index] = {
        ...cartItems[index],
        quantity: currentQty + 1,
      };
    } else {
      cartItems.push({
        id: item.id,
        title: item.title,
        price: Number(item.price || 0),
        quantity: 1,
        storageKey: item.storageKey || "",
        imageUrl: item.imageUrl || "",
        class: item.class || "all",
        type: item.type || "worksheet",
      });
    }

    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartItems));
    window.dispatchEvent(new CustomEvent("ds-cart-updated"));
    setCartNoticeById((prev) => ({ ...prev, [item.id]: "Added" }));
    window.setTimeout(() => {
      setCartNoticeById((prev) => ({ ...prev, [item.id]: "" }));
    }, 1200);
  };

  const updateRailItemQty = (item, delta) => {
    if (typeof window === "undefined" || !item?.id) return;
    let cartItems = [];
    const raw = window.localStorage.getItem(CART_STORAGE_KEY);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) cartItems = parsed;
      } catch {
        cartItems = [];
      }
    }

    const index = cartItems.findIndex((entry) => entry?.id === item.id);
    if (index === -1 && delta > 0) {
      cartItems.push({
        id: item.id,
        title: item.title,
        price: Number(item.price || 0),
        quantity: 1,
        storageKey: item.storageKey || "",
        imageUrl: item.imageUrl || "",
        class: item.class || "all",
        type: item.type || "worksheet",
      });
    } else if (index >= 0) {
      const currentQty =
        Number.isFinite(Number(cartItems[index]?.quantity)) &&
        Number(cartItems[index].quantity) > 0
          ? Number(cartItems[index].quantity)
          : 0;
      const nextQty = currentQty + Number(delta || 0);
      if (nextQty <= 0) {
        cartItems.splice(index, 1);
      } else {
        cartItems[index] = {
          ...cartItems[index],
          quantity: nextQty,
        };
      }
    }

    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartItems));
    window.dispatchEvent(new CustomEvent("ds-cart-updated"));
  };

  return (
    <>
      <Head>
        <title>Dear Student</title>
        <meta
          name="description"
          content="Printable worksheets for young learners with playful, engaging activities."
        />
      </Head>
      <Navbar />
      <motion.main
        className="hero"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
      >
        <section className="container hero__shell">
          <div className="hero__grid">
            <motion.div
              className="hero__content"
              initial={{ opacity: 0, x: -18 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, ease: "easeOut", delay: 0.08 }}
            >
              <span className="hero__eyebrow">Fun Learning Awaits</span>
              <h1 className="hero__title">
                Learning is <span className="hero__title-accent">Playtime!</span>
              </h1>
              <p className="hero__copy">
                We make early learning exciting with
                worksheets for your little ones.
              </p>
              <div className="hero__actions">
                <Link href="/worksheets" className="btn btn-primary">
                  Shop Worksheets
                </Link>
                {!user && (
                  <Link href="/auth" className="btn btn-secondary">
                    Get Started
                  </Link>
                )}
              </div>
              <p className="hero__social-proof">
                <span className="hero__offer-note">
                  Launch Offer: 10% off | 20% off on 2+
                </span>
                <a
                  href="https://www.instagram.com/dearstudent62/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Born on Instagram. Trusted by {instagramFollowersLabel} parents.
                </a>
              </p>
            </motion.div>
            <motion.div
              className="hero__visual"
              aria-hidden="true"
              initial={{ opacity: 0, x: 24, scale: 0.98 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              transition={{ duration: 0.55, ease: "easeOut", delay: 0.16 }}
            >
              <Image
                src="/home-hero-illustration.svg"
                alt=""
                width={760}
                height={520}
                className="hero__visual-art"
                priority
              />
            </motion.div>
          </div>
        </section>
        <div className="hero__wave" aria-hidden="true">
          <svg viewBox="0 0 1200 140" preserveAspectRatio="none">
            <path d="M0,92 C170,40 350,38 530,74 C710,112 900,112 1200,70 L1200,140 L0,140 Z" />
          </svg>
        </div>
      </motion.main>
      <section className="home-rails">
        <div className="container home-rails__inner">
          <section className="home-rail">
            <div className="home-rail__head">
              <h2>Popular</h2>
            </div>
            <div className="home-rail__track" role="list" aria-label="Popular worksheets">
              {popularRail.map((item) => {
                const singleItemPrice = getDiscountedUnitPrice(item.price, item.displayCurrency, 1);
                const twoPlusItemPrice = getDiscountedUnitPrice(item.price, item.displayCurrency, 2);
                const hasSingleDiscount = hasDisplayPriceChange(
                  item.price,
                  singleItemPrice,
                  item.displayCurrency
                );
                const hasTwoPlusDiscount = hasDisplayPriceChange(
                  item.price,
                  twoPlusItemPrice,
                  item.displayCurrency
                );
                return (
                  <article className="home-rail-card" role="listitem" key={`popular-${item.id}`}>
                    <div className="home-rail-card__media">
                      {getThumbnailUrl(item.storageKey, item.imageUrl) ? (
                        <Image
                          src={getThumbnailUrl(item.storageKey, item.imageUrl)}
                          alt={`${item.title} thumbnail`}
                          width={520}
                          height={340}
                          className="home-rail-card__thumb"
                          unoptimized
                        />
                      ) : (
                        <div className="home-rail-card__thumb-fallback">Worksheet</div>
                      )}
                    </div>
                    <span className="home-rail-card__meta">
                      {String(item.class || "all").replace("-", " ")} · {String(item.type || "worksheet")}
                    </span>
                    <h3>{item.title}</h3>
                    <p className="home-rail-card__sub">
                      Bought {Math.max(0, Number(item.purchaseCount || 0))} time
                      {Math.max(0, Number(item.purchaseCount || 0)) === 1 ? "" : "s"}
                    </p>
                    <div className="home-rail-card__foot">
                      <div className="home-rail-card__price-block">
                        <p className="home-rail-card__price-tier">
                          {hasSingleDiscount ? (
                            <>
                              <span className="home-rail-card__price-mrp">
                                {formatPrice(item.price, item.displaySymbol, item.displayCurrency)}
                              </span>
                              <strong>{formatPrice(singleItemPrice, item.displaySymbol, item.displayCurrency)}</strong>
                            </>
                          ) : (
                            <strong>{formatPrice(item.price, item.displaySymbol, item.displayCurrency)}</strong>
                          )}
                        </p>
                        {hasTwoPlusDiscount ? (
                          <p className="home-rail-card__price-tier">
                            <strong>{`2+: ${formatPrice(twoPlusItemPrice, item.displaySymbol, item.displayCurrency)}`}</strong>
                          </p>
                        ) : null}
                      </div>
                      {Number(cartQtyById[item.id] || 0) > 0 ? (
                        <div className="home-rail-card__stepper" aria-label={`Cart quantity for ${item.title}`}>
                          <button
                            type="button"
                            className="home-rail-card__stepper-btn"
                            onClick={() => updateRailItemQty(item, -1)}
                            aria-label={`Decrease quantity for ${item.title}`}
                          >
                            -
                          </button>
                          <span className="home-rail-card__stepper-count">
                            {cartQtyById[item.id]}
                          </span>
                          <button
                            type="button"
                            className="home-rail-card__stepper-btn"
                            onClick={() => updateRailItemQty(item, 1)}
                            aria-label={`Increase quantity for ${item.title}`}
                          >
                            +
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="home-rail-card__cart-btn"
                          onClick={() => addRailItemToCart(item)}
                        >
                          Add to cart
                        </button>
                      )}
                    </div>
                    {cartNoticeById[item.id] ? (
                      <p className="home-rail-card__status">{cartNoticeById[item.id]}</p>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </section>

          <section className="home-rail">
            <div className="home-rail__head">
              <h2>Recently Added</h2>
            </div>
            <div className="home-rail__track" role="list" aria-label="Recently added worksheets">
              {recentRail.map((item) => {
                const singleItemPrice = getDiscountedUnitPrice(item.price, item.displayCurrency, 1);
                const twoPlusItemPrice = getDiscountedUnitPrice(item.price, item.displayCurrency, 2);
                const hasSingleDiscount = hasDisplayPriceChange(
                  item.price,
                  singleItemPrice,
                  item.displayCurrency
                );
                const hasTwoPlusDiscount = hasDisplayPriceChange(
                  item.price,
                  twoPlusItemPrice,
                  item.displayCurrency
                );
                return (
                  <article className="home-rail-card" role="listitem" key={`recent-${item.id}`}>
                    <div className="home-rail-card__media">
                      {getThumbnailUrl(item.storageKey, item.imageUrl) ? (
                        <Image
                          src={getThumbnailUrl(item.storageKey, item.imageUrl)}
                          alt={`${item.title} thumbnail`}
                          width={520}
                          height={340}
                          className="home-rail-card__thumb"
                          unoptimized
                        />
                      ) : (
                        <div className="home-rail-card__thumb-fallback">Worksheet</div>
                      )}
                    </div>
                    <span className="home-rail-card__meta">
                      {String(item.class || "all").replace("-", " ")} · {String(item.type || "worksheet")}
                    </span>
                    <h3>{item.title}</h3>
                    <div className="home-rail-card__foot">
                      <div className="home-rail-card__price-block">
                        <p className="home-rail-card__price-tier">
                          {hasSingleDiscount ? (
                            <>
                              <span className="home-rail-card__price-mrp">
                                {formatPrice(item.price, item.displaySymbol, item.displayCurrency)}
                              </span>
                              <strong>{formatPrice(singleItemPrice, item.displaySymbol, item.displayCurrency)}</strong>
                            </>
                          ) : (
                            <strong>{formatPrice(item.price, item.displaySymbol, item.displayCurrency)}</strong>
                          )}
                        </p>
                        {hasTwoPlusDiscount ? (
                          <p className="home-rail-card__price-tier">
                            <strong>{`2+: ${formatPrice(twoPlusItemPrice, item.displaySymbol, item.displayCurrency)}`}</strong>
                          </p>
                        ) : null}
                      </div>
                      {Number(cartQtyById[item.id] || 0) > 0 ? (
                        <div className="home-rail-card__stepper" aria-label={`Cart quantity for ${item.title}`}>
                          <button
                            type="button"
                            className="home-rail-card__stepper-btn"
                            onClick={() => updateRailItemQty(item, -1)}
                            aria-label={`Decrease quantity for ${item.title}`}
                          >
                            -
                          </button>
                          <span className="home-rail-card__stepper-count">
                            {cartQtyById[item.id]}
                          </span>
                          <button
                            type="button"
                            className="home-rail-card__stepper-btn"
                            onClick={() => updateRailItemQty(item, 1)}
                            aria-label={`Increase quantity for ${item.title}`}
                          >
                            +
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="home-rail-card__cart-btn"
                          onClick={() => addRailItemToCart(item)}
                        >
                          Add to cart
                        </button>
                      )}
                    </div>
                    {cartNoticeById[item.id] ? (
                      <p className="home-rail-card__status">{cartNoticeById[item.id]}</p>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      </section>
    </>
  );
}

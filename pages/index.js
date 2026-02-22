import Navbar from "../components/Navbar";
import Link from "next/link";
import Head from "next/head";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { useAuth } from "../context/AuthContext";
import { motion } from "framer-motion";
import productsCatalog from "../data/products";
import { getPreviewUrl, getThumbnailUrl } from "../lib/productAssetUrls";
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

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
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
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
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
  const [previewState, setPreviewState] = useState(null);
  const [previewLoadFailed, setPreviewLoadFailed] = useState(false);
  const [shareMenuCardKey, setShareMenuCardKey] = useState("");
  const [shareStatus, setShareStatus] = useState({ cardKey: "", message: "" });

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

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const closeOnOutside = () => {
      setShareMenuCardKey("");
      setShareStatus({ cardKey: "", message: "" });
    };
    window.addEventListener("click", closeOnOutside);
    return () => {
      window.removeEventListener("click", closeOnOutside);
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

  const openQuickPreview = async (event, item) => {
    event.stopPropagation();
    let previewItem = { ...item };

    const productId = String(item?.id || "").trim();
    if (productId) {
      try {
        const response = await fetch(`/api/products?id=${encodeURIComponent(productId)}`);
        if (response.ok) {
          const payload = await response.json().catch(() => null);
          const fullProduct = payload?.product;
          if (fullProduct?.id) {
            previewItem = {
              ...previewItem,
              storageKey: String(fullProduct.storageKey || previewItem.storageKey || "").trim(),
              imageUrl: String(fullProduct.imageUrl || previewItem.imageUrl || "").trim(),
              previewImageUrl: String(fullProduct.previewImageUrl || previewItem.previewImageUrl || "").trim(),
              showPreviewPage: Boolean(fullProduct.showPreviewPage ?? previewItem.showPreviewPage),
            };
          }
        }
      } catch {
        // Keep rail payload values.
      }
    }

    const imageUrl = String(previewItem?.imageUrl || "").trim() || getThumbnailUrl(previewItem?.storageKey, "");
    const previewImageUrl = String(previewItem?.previewImageUrl || "").trim();
    const showPreviewPage = Boolean(previewItem?.showPreviewPage);
    if (!imageUrl && !previewImageUrl && !previewItem?.storageKey) return;
    setPreviewLoadFailed(false);
    setPreviewState({
      ...previewItem,
      imageUrl,
      previewImageUrl,
      showPreviewPage,
    });
  };

  const previewUrl = previewState ? getPreviewUrl(previewState.storageKey, 1) : "";

  const getProductShareUrl = (productId) => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/product/${encodeURIComponent(productId)}`;
  };

  const copyText = async (text) => {
    if (!text) return false;
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
      const input = document.createElement("input");
      input.value = text;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      input.remove();
      return true;
    } catch {
      return false;
    }
  };

  const openShareMenu = (event, item, cardKey) => {
    event.stopPropagation();
    const url = getProductShareUrl(item?.id);
    if (!url) return;
    setShareStatus({ cardKey: "", message: "" });
    setShareMenuCardKey((prev) => (prev === cardKey ? "" : cardKey));
  };

  const shareToInstagram = async (event, item, cardKey) => {
    event.stopPropagation();
    const url = getProductShareUrl(item?.id);
    if (!url) return;
    const copied = await copyText(url);
    setShareStatus({
      cardKey,
      message: copied ? "Link copied. Paste in Instagram." : "Could not copy link.",
    });
    if (typeof window !== "undefined") {
      window.open("https://www.instagram.com/", "_blank", "noopener,noreferrer");
    }
    setShareMenuCardKey("");
  };

  const shareToFacebook = (event, item) => {
    event.stopPropagation();
    const url = encodeURIComponent(getProductShareUrl(item?.id));
    if (!url || typeof window === "undefined") return;
    window.open(
      `https://www.facebook.com/sharer/sharer.php?u=${url}`,
      "_blank",
      "noopener,noreferrer"
    );
    setShareMenuCardKey("");
  };

  const shareToWhatsApp = (event, item) => {
    event.stopPropagation();
    const url = getProductShareUrl(item?.id);
    if (!url || typeof window === "undefined") return;
    const text = encodeURIComponent(`${item.title} - ${url}`);
    window.open(`https://wa.me/?text=${text}`, "_blank", "noopener,noreferrer");
    setShareMenuCardKey("");
  };

  const shareCopyLink = async (event, item, cardKey) => {
    event.stopPropagation();
    const url = getProductShareUrl(item?.id);
    const copied = await copyText(url);
    setShareStatus({
      cardKey,
      message: copied ? "Link copied." : "Could not copy link.",
    });
    setShareMenuCardKey("");
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
                const cardKey = `popular-${item.id}`;
                return (
                  <article className="home-rail-card" role="listitem" key={cardKey}>
                    <div className="home-rail-card__media">
                      <Link
                        href={`/product/${item.id}`}
                        className="home-rail-card__media-link"
                        aria-label={`Open ${item.title}`}
                      >
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
                      </Link>
                      <button
                        type="button"
                        className="worksheet-card__preview-btn"
                        aria-label={`Quick preview ${item.title}`}
                        onClick={(event) => openQuickPreview(event, item)}
                      >
                        <EyeIcon />
                      </button>
                      <div className="worksheet-card__share worksheet-card__share--overlay">
                        <button
                          type="button"
                          className="worksheet-card__share-btn"
                          aria-label={`Share ${item.title}`}
                          onClick={(event) => openShareMenu(event, item, cardKey)}
                        >
                          <ShareIcon />
                        </button>
                        {shareMenuCardKey === cardKey && (
                          <div className="worksheet-card__share-menu" onClick={(event) => event.stopPropagation()}>
                            <button type="button" onClick={(event) => shareToInstagram(event, item, cardKey)}>
                              <span className="share-option__icon share-option__icon--instagram">
                                <InstagramIcon />
                              </span>
                              Instagram
                            </button>
                            <button type="button" onClick={(event) => shareToFacebook(event, item)}>
                              <span className="share-option__icon share-option__icon--facebook">
                                <FacebookIcon />
                              </span>
                              Facebook
                            </button>
                            <button type="button" onClick={(event) => shareToWhatsApp(event, item)}>
                              <span className="share-option__icon share-option__icon--whatsapp">
                                <WhatsAppIcon />
                              </span>
                              WhatsApp
                            </button>
                            <button type="button" onClick={(event) => shareCopyLink(event, item, cardKey)}>
                              <span className="share-option__icon share-option__icon--copy">
                                <CopyLinkIcon />
                              </span>
                              Copy Link
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    <Link href={`/product/${item.id}`} className="home-rail-card__meta-link">
                      <span className="home-rail-card__meta">
                        {String(item.class || "all").replace("-", " ")} · {String(item.type || "worksheet")}
                      </span>
                    </Link>
                    <h3>
                      <Link href={`/product/${item.id}`} className="home-rail-card__title-link">
                        {item.title}
                      </Link>
                    </h3>
                    <p className="home-rail-card__sub">
                      <Link href={`/product/${item.id}`} className="home-rail-card__sub-link">
                        Bought {Math.max(0, Number(item.purchaseCount || 0))} time
                        {Math.max(0, Number(item.purchaseCount || 0)) === 1 ? "" : "s"}
                      </Link>
                    </p>
                    {shareStatus?.cardKey === cardKey && shareStatus?.message ? (
                      <p className="worksheet-card__share-status">{shareStatus.message}</p>
                    ) : null}
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
                const cardKey = `recent-${item.id}`;
                return (
                  <article className="home-rail-card" role="listitem" key={cardKey}>
                    <div className="home-rail-card__media">
                      <Link
                        href={`/product/${item.id}`}
                        className="home-rail-card__media-link"
                        aria-label={`Open ${item.title}`}
                      >
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
                      </Link>
                      <button
                        type="button"
                        className="worksheet-card__preview-btn"
                        aria-label={`Quick preview ${item.title}`}
                        onClick={(event) => openQuickPreview(event, item)}
                      >
                        <EyeIcon />
                      </button>
                      <div className="worksheet-card__share worksheet-card__share--overlay">
                        <button
                          type="button"
                          className="worksheet-card__share-btn"
                          aria-label={`Share ${item.title}`}
                          onClick={(event) => openShareMenu(event, item, cardKey)}
                        >
                          <ShareIcon />
                        </button>
                        {shareMenuCardKey === cardKey && (
                          <div className="worksheet-card__share-menu" onClick={(event) => event.stopPropagation()}>
                            <button type="button" onClick={(event) => shareToInstagram(event, item, cardKey)}>
                              <span className="share-option__icon share-option__icon--instagram">
                                <InstagramIcon />
                              </span>
                              Instagram
                            </button>
                            <button type="button" onClick={(event) => shareToFacebook(event, item)}>
                              <span className="share-option__icon share-option__icon--facebook">
                                <FacebookIcon />
                              </span>
                              Facebook
                            </button>
                            <button type="button" onClick={(event) => shareToWhatsApp(event, item)}>
                              <span className="share-option__icon share-option__icon--whatsapp">
                                <WhatsAppIcon />
                              </span>
                              WhatsApp
                            </button>
                            <button type="button" onClick={(event) => shareCopyLink(event, item, cardKey)}>
                              <span className="share-option__icon share-option__icon--copy">
                                <CopyLinkIcon />
                              </span>
                              Copy Link
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    <Link href={`/product/${item.id}`} className="home-rail-card__meta-link">
                      <span className="home-rail-card__meta">
                        {String(item.class || "all").replace("-", " ")} · {String(item.type || "worksheet")}
                      </span>
                    </Link>
                    <h3>
                      <Link href={`/product/${item.id}`} className="home-rail-card__title-link">
                        {item.title}
                      </Link>
                    </h3>
                    {shareStatus?.cardKey === cardKey && shareStatus?.message ? (
                      <p className="worksheet-card__share-status">{shareStatus.message}</p>
                    ) : null}
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
      {previewState && (
        <div className="worksheet-preview-modal">
          <button
            className="worksheet-preview-modal__overlay"
            onClick={() => setPreviewState(null)}
            type="button"
            aria-label="Close preview"
          />
          <section className="worksheet-preview-modal__panel">
            <header className="worksheet-preview-modal__header">
              <h2>{previewState.title} - Quick Preview</h2>
              <button
                type="button"
                className="btn-link"
                onClick={() => setPreviewState(null)}
              >
                Close
              </button>
            </header>
            <p className="worksheet-preview-modal__hint">
              Preview shows cover image
              {previewState?.showPreviewPage ? " and first-page of the pdf." : "."}
            </p>
            {previewState?.imageUrl ? (
              <div className="worksheet-preview-modal__pages">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className="worksheet-preview-modal__page-image"
                  src={previewState.imageUrl}
                  alt={`${previewState.title} cover`}
                />
                {Boolean(previewState?.showPreviewPage && previewState?.previewImageUrl) && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    className="worksheet-preview-modal__page-image"
                    src={previewState.previewImageUrl}
                    alt={`${previewState.title} first page`}
                  />
                )}
                {Boolean(
                  previewState?.showPreviewPage
                  && !previewState?.previewImageUrl
                  && previewState?.storageKey
                ) && (
                  <iframe
                    className="worksheet-preview-modal__frame"
                    src={`${previewUrl}#page=1&view=FitH,110&toolbar=0&navpanes=0&scrollbar=0`}
                    title={`${previewState.title} first page preview`}
                    onError={() => setPreviewLoadFailed(true)}
                  />
                )}
              </div>
            ) : !previewLoadFailed ? (
              <iframe
                className="worksheet-preview-modal__frame"
                src={`${previewUrl}#page=1&view=FitH,110&toolbar=0&navpanes=0&scrollbar=0`}
                title={`${previewState.title} preview`}
                onError={() => setPreviewLoadFailed(true)}
              />
            ) : (
              <div className="worksheet-preview-modal__fallback">
                <p>Preview could not load on this device/browser.</p>
                <a
                  href={previewUrl}
                  target="_blank"
                  rel="noreferrer"
                >
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

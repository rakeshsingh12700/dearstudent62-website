import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { signOut } from "firebase/auth";
import { auth } from "../firebase/config";
import { useRouter } from "next/router";
import productsCatalog from "../data/products";
import { clearCartStorage, readCartStorage, writeCartStorage } from "../lib/cartStorage";
import { calculatePrice } from "../lib/pricing";
import { PRICING_CONFIG } from "../lib/pricing/config";
import {
  getCurrencySymbol,
  hasCurrencyPreference,
  readCurrencyPreference,
  setCurrencyPreference,
} from "../lib/pricing/client";

const NAV_LINKS = [
  { label: "Home", href: "/" },
  { label: "Library", href: "/worksheets?view=library" }
];

const MOBILE_MENU_LINKS = [
  { label: "Home", href: "/" },
  { label: "Library", href: "/worksheets?view=library" },
  { label: "Classes", href: "/worksheets?view=classes" },
  { label: "English", href: "/worksheets?view=english&subject=english" },
  { label: "Maths", href: "/worksheets?view=library&subject=maths" },
  { label: "Exams", href: "/worksheets?view=library&type=exams" }
];

const BASE_PRICE_INR_BY_ID = new Map(
  (Array.isArray(productsCatalog) ? productsCatalog : [])
    .map((item) => [String(item?.id || "").trim(), Number(item?.price || 0)])
    .filter(([id, price]) => id && Number.isFinite(price) && price > 0)
);

function BrandLogo() {
  return (
    <>
      <span className="navbar__brand-dear">Dear</span>
      <span className="navbar__brand-student">Student</span>
    </>
  );
}

export default function Navbar() {
  const { user } = useAuth();
  const router = useRouter();
  const [cartCount, setCartCount] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [mobileProfileOpen, setMobileProfileOpen] = useState(false);
  const [currency, setCurrency] = useState(() => readCurrencyPreference() || "INR");
  const searchDebounceRef = useRef(null);
  const currencySyncPromiseRef = useRef(Promise.resolve());

  const handleLogout = async () => {
    if (typeof window !== "undefined") {
      clearCartStorage();
      window.dispatchEvent(new CustomEvent("ds-cart-updated"));
    }
    if (auth) {
      await signOut(auth);
    }
    setMobileMenuOpen(false);
    setProfileOpen(false);
    setMobileProfileOpen(false);
    router.push("/");
  };

  useEffect(() => {
    if (typeof window === "undefined") return;

    const refreshCount = () => {
      const cartItems = readCartStorage();
      const count = cartItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
      setCartCount(count);
    };

    refreshCount();
    window.addEventListener("storage", refreshCount);
    window.addEventListener("ds-cart-updated", refreshCount);
    return () => {
      window.removeEventListener("storage", refreshCount);
      window.removeEventListener("ds-cart-updated", refreshCount);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (hasCurrencyPreference()) return;

    let cancelled = false;
    const loadAutoCurrency = async () => {
      try {
        const response = await fetch("/api/pricing-context");
        if (!response.ok) return;
        const payload = await response.json().catch(() => ({}));
        const detectedCurrency = String(payload?.currency || "").trim().toUpperCase();
        if (!cancelled && PRICING_CONFIG.supportedCurrencies.includes(detectedCurrency)) {
          setCurrency(detectedCurrency);
        }
      } catch {
        // Keep default fallback.
      }
    };

    loadAutoCurrency();
    return () => {
      cancelled = true;
    };
  }, []);

  const cartLabel = useMemo(() => `Cart (${cartCount})`, [cartCount]);

  const userLabel = useMemo(() => {
    const displayName = String(user?.displayName || "").trim();
    if (displayName) {
      const [firstName] = displayName.split(/\s+/).filter(Boolean);
      return firstName || displayName;
    }

    const email = String(user?.email || "").trim();
    if (!email) return "Account";

    const [emailPrefix] = email.split("@");
    const [firstNameFromEmail] = String(emailPrefix || "")
      .split(/[._-]+/)
      .filter(Boolean);
    return firstNameFromEmail || emailPrefix || email;
  }, [user?.displayName, user?.email]);

  const userInitial = useMemo(() => {
    const label = String(userLabel || "").trim();
    if (!label) return "A";
    return label.charAt(0).toUpperCase();
  }, [userLabel]);

  const waitForCurrencySync = async () => {
    try {
      await Promise.race([
        currencySyncPromiseRef.current,
        new Promise((resolve) => {
          if (typeof window === "undefined") return resolve();
          window.setTimeout(resolve, 700);
        }),
      ]);
    } catch {
      // If sync fails, still continue to cart.
    }
  };

  const syncCartPricingForCurrency = async (nextCurrency) => {
    if (typeof window === "undefined") return;
    const currentCart = readCartStorage();
    if (!Array.isArray(currentCart) || currentCart.length === 0) return;

    const localCurrency = String(nextCurrency || "").trim().toUpperCase() || "INR";
    const localCountry = localCurrency === "INR" ? "IN" : "US";
    const localRepriced = currentCart.map((item) => {
      const id = String(item?.id || "").trim();
      const basePriceINR = Number(item?.basePriceINR || BASE_PRICE_INR_BY_ID.get(id) || 0);
      if (!id || !Number.isFinite(basePriceINR) || basePriceINR <= 0) {
        return {
          ...item,
          currency: localCurrency,
          displayCurrency: localCurrency,
        };
      }
      const pricing = calculatePrice({
        basePriceINR,
        countryCode: localCountry,
        currencyOverride: localCurrency,
      });

      return {
        ...item,
        price: pricing.amount,
        currency: pricing.currency,
        displayPrice: pricing.amount,
        displayCurrency: pricing.currency,
        displaySymbol: pricing.symbol,
        basePriceINR: pricing.basePriceINR,
        tieredPriceINR: pricing.tieredPriceINR,
      };
    });
    writeCartStorage(localRepriced);
    window.dispatchEvent(new CustomEvent("ds-cart-updated"));

    const ids = Array.from(
      new Set(
        localRepriced
          .map((item) => String(item?.id || "").trim())
          .filter(Boolean)
      )
    );
    if (ids.length === 0) return;

    const chunks = [];
    for (let index = 0; index < ids.length; index += 10) {
      chunks.push(ids.slice(index, index + 10));
    }

    void (async () => {
      const responses = await Promise.all(
        chunks.map(async (chunkIds) => {
          const response = await fetch(
            `/api/products?ids=${encodeURIComponent(chunkIds.join(","))}&currency=${encodeURIComponent(nextCurrency)}`
          );
          if (!response.ok) return [];
          const payload = await response.json().catch(() => ({}));
          return Array.isArray(payload?.products) ? payload.products : [];
        })
      );

      const runtimeById = new Map(responses.flat().map((item) => [item.id, item]));
      const mergedCart = readCartStorage().map((item) => {
        const runtime = runtimeById.get(item.id);
        if (!runtime) return item;
        const nextPrice = Number(runtime?.displayPrice ?? runtime?.price ?? item?.price ?? 0);
        const nextDisplayCurrency = String(
          runtime?.displayCurrency || runtime?.currency || nextCurrency || item?.displayCurrency || item?.currency || "INR"
        )
          .trim()
          .toUpperCase();
        const nextSymbol = String(runtime?.displaySymbol || item?.displaySymbol || "").trim();
        const nextSubject = String(runtime?.subject || item?.subject || "").trim();

        return {
          ...item,
          price: nextPrice,
          currency: nextDisplayCurrency,
          displayPrice: nextPrice,
          displayCurrency: nextDisplayCurrency,
          displaySymbol: nextSymbol,
          subject: nextSubject,
        };
      });
      writeCartStorage(mergedCart);
      window.dispatchEvent(new CustomEvent("ds-cart-updated"));
    })().catch(() => {});
  };

  const handleCartClick = async () => {
    await waitForCurrencySync();
    const isWorksheetRoute =
      router.pathname === "/worksheets" || router.pathname === "/worksheets/[class]";

    if (isWorksheetRoute && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("ds-open-cart"));
      return;
    }

    router.push("/worksheets?openCart=1");
  };

  const handleCurrencyChange = (nextCurrency) => {
    const normalized = String(nextCurrency || "").trim().toUpperCase();
    if (!PRICING_CONFIG.supportedCurrencies.includes(normalized)) return;
    setCurrencyPreference(normalized);
    setCurrency(normalized);
    currencySyncPromiseRef.current = syncCartPricingForCurrency(normalized)
      .catch(() => {})
      .finally(() => {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("ds-currency-updated", { detail: { currency: normalized } }));
        }
      });
  };

  const formatCurrencyOptionLabel = (code) => {
    const symbol = String(getCurrencySymbol(code) || "").trim();
    if (!symbol || symbol.toUpperCase() === String(code).toUpperCase()) return String(code);
    return `${symbol} ${code}`;
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const closeMenus = (event) => {
      if (event.key !== "Escape") return;
      setMobileMenuOpen(false);
      setProfileOpen(false);
      setMobileProfileOpen(false);
    };
    window.addEventListener("keydown", closeMenus);
    return () => {
      window.removeEventListener("keydown", closeMenus);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (mobileMenuOpen || mobileProfileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen, mobileProfileOpen]);

  const handleDesktopSearchSubmit = (event) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const trimmed = String(formData.get("q") || "").trim();
    const isWorksheetRoute =
      router.pathname === "/worksheets" || router.pathname === "/worksheets/[class]";
    const nextQuery = isWorksheetRoute ? { ...router.query } : { view: "library" };

    if (trimmed) {
      nextQuery.q = trimmed;
    } else {
      delete nextQuery.q;
    }

    if (!isWorksheetRoute) {
      router.push({ pathname: "/worksheets", query: nextQuery });
      return;
    }

    router.replace(
      { pathname: "/worksheets", query: nextQuery },
      undefined,
      { shallow: true, scroll: false }
    );
  };

  const routeSearchQuery = typeof router.query.q === "string" ? router.query.q : "";
  const isWorksheetRoute =
    router.pathname === "/worksheets" || router.pathname === "/worksheets/[class]";

  const handleDesktopSearchInput = (event) => {
    if (!isWorksheetRoute || typeof window === "undefined") return;
    const nextValue = String(event.currentTarget.value || "");

    if (searchDebounceRef.current) {
      window.clearTimeout(searchDebounceRef.current);
    }

    searchDebounceRef.current = window.setTimeout(() => {
      const nextQuery = { ...router.query };
      const trimmed = nextValue.trim();
      if (trimmed) nextQuery.q = trimmed;
      else delete nextQuery.q;

      router.replace(
        { pathname: "/worksheets", query: nextQuery },
        undefined,
        { shallow: true, scroll: false }
      );
    }, 220);
  };

  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && searchDebounceRef.current) {
        window.clearTimeout(searchDebounceRef.current);
      }
    };
  }, []);

  return (
    <nav className="navbar">
      <div className="container navbar__inner">
        <div className="navbar__mobile-top">
          <button
            type="button"
            className="navbar__menu-btn"
            onClick={() => {
              setMobileProfileOpen(false);
              setMobileMenuOpen(true);
            }}
            aria-label="Open menu"
          >
            ☰
          </button>

          <div className="navbar__brand-row">
            <Link href="/" className="navbar__brand">
              <BrandLogo />
            </Link>
          </div>

          <div className="navbar__mobile-actions">
            <select
              className="navbar__currency-select navbar__currency-select--mobile"
              value={currency}
              aria-label="Currency"
              onChange={(event) => handleCurrencyChange(event.target.value)}
            >
              {PRICING_CONFIG.supportedCurrencies.map((code) => (
                <option value={code} key={`mobile-currency-${code}`}>
                  {formatCurrencyOptionLabel(code)}
                </option>
              ))}
            </select>
            <button type="button" className="navbar__icon-btn" onClick={handleCartClick} aria-label={cartLabel}>
              🛒
              {cartCount > 0 && <span className="navbar__icon-badge">{cartCount}</span>}
            </button>
            {user ? (
              <button
                type="button"
                className="navbar__icon-btn"
                aria-label="Account menu"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setMobileProfileOpen((prev) => !prev);
                }}
              >
                <span className="navbar__mobile-initial">{userInitial}</span>
              </button>
            ) : (
              <Link href="/auth" className="navbar__icon-btn" aria-label="Login">
                Login
              </Link>
            )}
          </div>
          {user && mobileProfileOpen && (
            <div className="navbar__mobile-profile-menu">
              <>
                <Link href="/profile" onClick={() => setMobileProfileOpen(false)}>
                  Profile
                </Link>
                <Link href="/my-purchases" onClick={() => setMobileProfileOpen(false)}>
                  My Purchases
                </Link>
                <button type="button" onClick={handleLogout}>
                  Logout
                </button>
              </>
            </div>
          )}
        </div>
        <form className="navbar__mobile-search" onSubmit={handleDesktopSearchSubmit}>
          <span className="navbar__search-icon" aria-hidden="true">
            🔎
          </span>
          <input
            type="search"
            name="q"
            key={`mobile-search-${router.pathname}-${routeSearchQuery}`}
            placeholder="Search worksheets"
            defaultValue={routeSearchQuery}
            aria-label="Search worksheets"
            autoComplete="off"
            onInput={handleDesktopSearchInput}
          />
          <button type="submit" className="navbar__search-submit">
            Search
          </button>
        </form>

        <div className="navbar__desktop-row">
          <div className="navbar__links">
            <div className="navbar__brand-row">
              <Link href="/" className="navbar__brand">
                <BrandLogo />
              </Link>
            </div>
            {NAV_LINKS.map((item) => (
              <Link href={item.href} key={item.label}>
                {item.label}
              </Link>
            ))}
          </div>

          <form className="navbar__search-slot" onSubmit={handleDesktopSearchSubmit}>
            <span className="navbar__search-icon" aria-hidden="true">
              🔎
            </span>
            <input
              type="search"
              name="q"
              key={`desktop-search-${router.pathname}-${routeSearchQuery}`}
              placeholder="Search worksheets"
              defaultValue={routeSearchQuery}
              aria-label="Search worksheets"
              autoComplete="off"
              onInput={handleDesktopSearchInput}
            />
            <button type="submit" className="navbar__search-submit">
              Search
            </button>
          </form>

          <div className="navbar__actions">
            <select
              className="navbar__currency-select"
              value={currency}
              aria-label="Currency"
              onChange={(event) => handleCurrencyChange(event.target.value)}
            >
              {PRICING_CONFIG.supportedCurrencies.map((code) => (
                <option value={code} key={`currency-${code}`}>
                  {formatCurrencyOptionLabel(code)}
                </option>
              ))}
            </select>
            <button type="button" className="navbar__cart-link" onClick={handleCartClick}>
              {cartLabel}
            </button>

            {!user && <Link href="/auth">Login</Link>}
            {user && (
              <div className="navbar__profile">
                <button
                  type="button"
                  className="navbar__profile-trigger"
                  onClick={() => setProfileOpen((prev) => !prev)}
                >
                  {userLabel} ▾
                </button>
                {profileOpen && (
                  <div className="navbar__profile-menu">
                    <Link href="/profile" onClick={() => setProfileOpen(false)}>
                      Profile
                    </Link>
                    <Link href="/my-purchases" onClick={() => setProfileOpen(false)}>
                      My Purchases
                    </Link>
                    <button onClick={handleLogout} className="btn-link" type="button">
                      Logout
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="navbar__mobile-menu" role="dialog" aria-modal="true" aria-label="Main menu">
          <button
            type="button"
            className="navbar__mobile-overlay"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close menu"
          />

          <aside className="navbar__mobile-panel">
            <div className="navbar__mobile-header">
              <strong>Hello, {user ? userLabel : "Guest"}</strong>
              <button type="button" className="btn-link" onClick={() => setMobileMenuOpen(false)}>
                Close
              </button>
            </div>

            <div className="navbar__mobile-links">
              <div className="navbar__mobile-group-title">Browse</div>
              {MOBILE_MENU_LINKS.map((item) => (
                <Link
                  href={item.href}
                  key={`mobile-${item.label}`}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {item.label}
                </Link>
              ))}
              {user && (
                <>
                  <div className="navbar__mobile-group-title">Account</div>
                  <Link href="/profile" onClick={() => setMobileMenuOpen(false)}>
                    Profile
                  </Link>
                  <Link href="/my-purchases" onClick={() => setMobileMenuOpen(false)}>
                    My Purchases
                  </Link>
                  <button type="button" className="navbar__mobile-logout" onClick={handleLogout}>
                    Logout
                  </button>
                </>
              )}
            </div>
          </aside>
        </div>
      )}
    </nav>
  );
}

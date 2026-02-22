import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { signOut } from "firebase/auth";
import { auth } from "../firebase/config";
import { useRouter } from "next/router";
import { PRICING_CONFIG } from "../lib/pricing/config";
import {
  getCurrencySymbol,
  hasCurrencyPreference,
  readCurrencyPreference,
  setCurrencyPreference,
} from "../lib/pricing/client";

const CART_STORAGE_KEY = "ds-worksheet-cart-v1";

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

  const handleLogout = async () => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(CART_STORAGE_KEY);
      window.dispatchEvent(new CustomEvent("ds-cart-updated"));
    }
    await signOut(auth);
    setMobileMenuOpen(false);
    setProfileOpen(false);
    setMobileProfileOpen(false);
    router.push("/");
  };

  useEffect(() => {
    if (typeof window === "undefined") return;

    const refreshCount = () => {
      const raw = window.localStorage.getItem(CART_STORAGE_KEY);
      if (!raw) {
        setCartCount(0);
        return;
      }
      try {
        const parsed = JSON.parse(raw);
        const count = Array.isArray(parsed)
          ? parsed.reduce((sum, item) => sum + (item.quantity || 0), 0)
          : 0;
        setCartCount(count);
      } catch {
        setCartCount(0);
      }
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

  const handleCartClick = () => {
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
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("ds-currency-updated", { detail: { currency: normalized } }));
    }
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

          <div className="navbar__search-slot">
            <input
              type="search"
              placeholder="Search worksheets (coming soon)"
              readOnly
              aria-label="Search coming soon"
            />
          </div>

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

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { signOut } from "firebase/auth";
import { auth } from "../firebase/config";
import { useRouter } from "next/router";

const CART_STORAGE_KEY = "ds-worksheet-cart-v1";

const NAV_LINKS = [
  { label: "Home", href: "/" },
  { label: "Library", href: "/worksheets?view=library" },
  { label: "Classes", href: "/worksheets?view=classes" },
  { label: "English", href: "/worksheets?view=english&subject=english" },
  { label: "Maths", href: "/worksheets?view=library&subject=maths" },
  { label: "Exams", href: "/worksheets?view=library&type=exams" }
];

export default function Navbar() {
  const { user } = useAuth();
  const router = useRouter();
  const [cartCount, setCartCount] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [mobileProfileOpen, setMobileProfileOpen] = useState(false);

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

          <Link href="/" className="navbar__brand">
            Dear Student
          </Link>

          <div className="navbar__mobile-actions">
            <button type="button" className="navbar__icon-btn" onClick={handleCartClick} aria-label={cartLabel}>
              🛒
              {cartCount > 0 && <span className="navbar__icon-badge">{cartCount}</span>}
            </button>
            <button
              type="button"
              className="navbar__icon-btn"
              aria-label={user ? "Account menu" : "Login"}
              onClick={() => {
                setMobileMenuOpen(false);
                if (user) {
                  setMobileProfileOpen((prev) => !prev);
                  return;
                }
                setMobileProfileOpen(false);
                router.push("/auth");
              }}
            >
              {user ? <span className="navbar__mobile-initial">{userInitial}</span> : "Login"}
            </button>
          </div>
          {mobileProfileOpen && (
            <div className="navbar__mobile-profile-menu">
              {user ? (
                <>
                  <Link href="/my-purchases" onClick={() => setMobileProfileOpen(false)}>
                    My History
                  </Link>
                  <button type="button" onClick={handleLogout}>
                    Logout
                  </button>
                </>
              ) : (
                <Link href="/auth" onClick={() => setMobileProfileOpen(false)}>
                  Login
                </Link>
              )}
            </div>
          )}
        </div>

        <div className="navbar__desktop-row">
          <div className="navbar__links">
            <Link href="/" className="navbar__brand">
              Dear Student
            </Link>
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
                    <Link href="/my-purchases" onClick={() => setProfileOpen(false)}>
                      My History
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
              {NAV_LINKS.map((item) => (
                <Link
                  href={item.href}
                  key={`mobile-${item.label}`}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </aside>
        </div>
      )}
    </nav>
  );
}

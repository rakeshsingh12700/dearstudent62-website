import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { signOut } from "firebase/auth";
import { auth } from "../firebase/config";
import { useRouter } from "next/router";

const workbookMenu = [
  {
    key: "pre-nursery",
    label: "Pre Nursery",
    submenu: [
      { label: "Workbook", href: "/workbooks?class=pre-nursery&type=workbook" },
      { label: "Exams", href: "/workbooks?class=pre-nursery&type=exams" },
      {
        label: "Half Year Exam",
        href: "/workbooks?class=pre-nursery&type=half-year-exam"
      },
      {
        label: "Final Year Exam",
        href: "/workbooks?class=pre-nursery&type=final-year-exam"
      }
    ]
  },
  {
    key: "nursery",
    label: "Nursery",
    submenu: [
      { label: "Workbook", href: "/workbooks?class=nursery&type=workbook" },
      { label: "Exams", href: "/workbooks?class=nursery&type=exams" },
      {
        label: "Half Year Exam",
        href: "/workbooks?class=nursery&type=half-year-exam"
      },
      {
        label: "Final Year Exam",
        href: "/workbooks?class=nursery&type=final-year-exam"
      }
    ]
  },
  {
    key: "lkg",
    label: "LKG",
    submenu: [
      { label: "Workbook", href: "/workbooks?class=lkg&type=workbook" },
      { label: "Exams", href: "/workbooks?class=lkg&type=exams" },
      { label: "Half Year Exam", href: "/workbooks?class=lkg&type=half-year-exam" },
      {
        label: "Final Year Exam",
        href: "/workbooks?class=lkg&type=final-year-exam"
      }
    ]
  },
  {
    key: "ukg",
    label: "UKG",
    submenu: [
      { label: "Workbook", href: "/workbooks?class=ukg&type=workbook" },
      { label: "Exams", href: "/workbooks?class=ukg&type=exams" },
      { label: "Half Year Exam", href: "/workbooks?class=ukg&type=half-year-exam" },
      {
        label: "Final Year Exam",
        href: "/workbooks?class=ukg&type=final-year-exam"
      }
    ]
  }
];
const CART_STORAGE_KEY = "ds-workbook-cart-v1";

export default function Navbar() {
  const { user } = useAuth();
  const router = useRouter();
  const [cartCount, setCartCount] = useState(0);

  const handleLogout = async () => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(CART_STORAGE_KEY);
      window.dispatchEvent(new CustomEvent("ds-cart-updated"));
    }
    await signOut(auth);
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

  const handleCartClick = () => {
    const isWorkbookRoute =
      router.pathname === "/workbooks" || router.pathname === "/workbooks/[class]";

    if (isWorkbookRoute && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("ds-open-cart"));
      return;
    }

    router.push("/workbooks?openCart=1");
  };

  return (
    <nav className="navbar">
      <div className="container navbar__inner">
        <div className="navbar__links">
          <Link href="/" className="navbar__brand">
            dearstudent62 Learning Hub
          </Link>
          <Link href="/">Home</Link>
          <div className="navbar__dropdown">
            <div className="navbar__dropdown-trigger">
              <Link href="/workbooks">Workbooks</Link>
              <span className="navbar__caret" aria-hidden="true">
                ▾
              </span>
            </div>
            <div className="navbar__dropdown-menu">
              {workbookMenu.map((item) => (
                <div className="navbar__dropdown-item" key={item.key}>
                  <Link href={`/workbooks?class=${item.key}`}>{item.label}</Link>
                  <span aria-hidden="true">›</span>
                  <div className="navbar__flyout">
                    {item.submenu.map((subItem) => (
                      <Link href={subItem.href} key={`${item.key}-${subItem.label}`}>
                        {subItem.label}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="navbar__actions">
          <button
            type="button"
            className="navbar__cart-link"
            onClick={handleCartClick}
          >
            {cartLabel}
          </button>
          {!user && (
            <>
              <Link href="/login">Login</Link>
              <Link href="/signup">Signup</Link>
            </>
          )}

          {user && (
            <>
              <span className="navbar__email">{user.email}</span>
              <Link href="/my-purchases">My Purchases</Link>
              <button onClick={handleLogout} className="btn-link" type="button">
                Logout
              </button>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}

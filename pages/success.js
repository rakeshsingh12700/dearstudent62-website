import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import Navbar from "../components/Navbar";
import Link from "next/link";
import { useAuth } from "../context/AuthContext";
import products from "../data/products";
import { getDownloadUrl } from "../lib/productAssetUrls";
import { getSubjectBadgeClass, getSubjectLabel } from "../lib/subjectBadge";

export default function Success() {
  const router = useRouter();
  const { user } = useAuth();
  const [runtimeProducts, setRuntimeProducts] = useState([]);
  const checkoutToken =
    typeof router.query.token === "string" ? router.query.token : "";
  const productId =
    typeof router.query.productId === "string" ? router.query.productId : "";
  const productIdsParam =
    typeof router.query.productIds === "string" ? router.query.productIds : "";
  const queryEmail = typeof router.query.email === "string" ? router.query.email : "";
  const purchasedProducts = useMemo(() => {
    const idsFromParam = productIdsParam
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
    const ids = idsFromParam.length > 0 ? idsFromParam : [productId].filter(Boolean);
    const runtimeById = new Map(runtimeProducts.map((item) => [item.id, item]));
    return ids
      .map((id) => runtimeById.get(id) || products.find((item) => item.id === id))
      .filter(Boolean);
  }, [productId, productIdsParam, runtimeProducts]);

  useEffect(() => {
    const ids = String(productIdsParam || productId || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
    if (ids.length === 0) return;

    let cancelled = false;
    const loadProducts = async () => {
      try {
        const response = await fetch(`/api/products?ids=${encodeURIComponent(ids.join(","))}`);
        if (!response.ok) return;
        const payload = await response.json().catch(() => ({}));
        const list = Array.isArray(payload?.products) ? payload.products : [];
        if (!cancelled) setRuntimeProducts(list);
      } catch {
        // Keep static fallback.
      }
    };

    loadProducts();
    return () => {
      cancelled = true;
    };
  }, [productId, productIdsParam]);
  const checkoutEmail = queryEmail;

  const handleDownload = (product) => {
    if (!product?.storageKey) {
      alert("Missing file reference. Open My Purchases to download.");
      return;
    }

    if (!user && !checkoutToken) {
      alert("Please login to download from your library.");
      return;
    }

    if (!user && checkoutToken) {
      const link = document.createElement("a");
      link.href = getDownloadUrl(product.storageKey, checkoutToken);
      link.download = String(product.storageKey || "worksheet.pdf");
      document.body.appendChild(link);
      link.click();
      link.remove();
      return;
    }

    user
      .getIdToken()
      .then((idToken) => {
        const downloadUrl = getDownloadUrl(product.storageKey, idToken || checkoutToken);
        const link = document.createElement("a");
        link.href = downloadUrl;
        link.download = String(product.storageKey || "worksheet.pdf");
        document.body.appendChild(link);
        link.click();
        link.remove();
      })
      .catch(() => {
        alert("Unable to verify your login. Please login again.");
      });
  };

  return (
    <>
      <Navbar />
      <main className="success-page">
        <section className="container success-wrap">
          <section className="success-card">
            <header className="success-card__header">
              <p className="success-card__eyebrow">Payment complete</p>
              <h1>Your worksheets are ready</h1>
              <p>Download now, or find everything later in My Purchases.</p>
            </header>

            <section className="success-list">
              {purchasedProducts.map((product) => (
                <article className="success-item" key={product.id}>
                  <span className={getSubjectBadgeClass(product?.subject)}>
                    {getSubjectLabel(product?.subject)}
                  </span>
                  <div className="success-item__content">
                    <h2>{product.title}</h2>
                    <p>{product.pages || 0} pages • Digital PDF</p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => handleDownload(product)}
                    disabled={!product?.storageKey || (!user && !checkoutToken)}
                  >
                    Download
                  </button>
                </article>
              ))}
            </section>

            <div className="success-card__actions">
              <Link href="/my-purchases" className="btn btn-primary">
                Open My Purchases
              </Link>
              <button
                type="button"
                onClick={() => router.push("/worksheets")}
                className="btn btn-secondary"
              >
                Continue to Library
              </button>
            </div>

            {!user && checkoutEmail && (
              <p className="success-card__footnote">
                Want permanent access from any device?{" "}
                <Link href={`/auth?next=/my-purchases&email=${encodeURIComponent(checkoutEmail)}`}>
                  Login / Sign Up with {checkoutEmail}
                </Link>
              </p>
            )}
          </section>
        </section>
      </main>
    </>
  );
}

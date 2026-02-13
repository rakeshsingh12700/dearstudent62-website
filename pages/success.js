import { useMemo } from "react";
import { useRouter } from "next/router";
import Navbar from "../components/Navbar";
import Link from "next/link";
import { useAuth } from "../context/AuthContext";
import products from "../data/products";

export default function Success() {
  const router = useRouter();
  const { user } = useAuth();
  const paymentId =
    typeof router.query.paymentId === "string" ? router.query.paymentId : "";
  const productId =
    typeof router.query.productId === "string" ? router.query.productId : "";
  const queryEmail = typeof router.query.email === "string" ? router.query.email : "";
  const productTitle = useMemo(() => {
    const product = products.find((item) => item.id === productId);
    return product?.title || "Worksheet";
  }, [productId]);
  const fileName = useMemo(() => {
    const product = products.find((item) => item.id === productId);
    if (!product?.pdf) return "worksheet.pdf";
    const fileParam = product.pdf.match(/file=([^&]+)/);
    return fileParam ? decodeURIComponent(fileParam[1]) : "worksheet.pdf";
  }, [productId]);
  const checkoutEmail = useMemo(() => {
    if (queryEmail) return queryEmail;
    if (typeof window === "undefined") return "";
    return window.sessionStorage.getItem("ds-last-checkout-email") || "";
  }, [queryEmail]);

  const handleDownload = () => {
    if (!paymentId) {
      alert("Missing payment reference. Open My Purchases to download.");
      return;
    }

    // Trigger browser download.
    const link = document.createElement("a");
    const productQuery = productId ? `&productId=${encodeURIComponent(productId)}` : "";
    link.href = `/api/download?paymentId=${paymentId}${productQuery}`;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <>
      <Navbar />
      <div style={{ padding: "40px" }}>
        <h2>Payment successful 🎉</h2>
        <p>Your worksheet is ready.</p>
        <button
          type="button"
          onClick={handleDownload}
          style={{ marginRight: 12, padding: "10px 16px", cursor: "pointer" }}
          disabled={!paymentId}
        >
          Download {productTitle}
        </button>
        <button
          type="button"
          onClick={() => router.push("/worksheets")}
          style={{ padding: "10px 16px", cursor: "pointer" }}
        >
          Continue to Library
        </button>
        {!user && checkoutEmail && (
          <p style={{ marginTop: 18, marginBottom: 0 }}>
            Want permanent access from any device?{" "}
            <Link href={`/auth?next=/my-purchases&email=${encodeURIComponent(checkoutEmail)}`}>
              Login / Sign Up with {checkoutEmail}
            </Link>
          </p>
        )}
      </div>
    </>
  );
}

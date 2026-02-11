import { useMemo } from "react";
import { useRouter } from "next/router";
import Navbar from "../components/Navbar";
import Link from "next/link";
import { useAuth } from "../context/AuthContext";

export default function Success() {
  const router = useRouter();
  const { user } = useAuth();
  const paymentId =
    typeof router.query.paymentId === "string" ? router.query.paymentId : "";
  const queryEmail = typeof router.query.email === "string" ? router.query.email : "";
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
    link.href = `/api/download?paymentId=${paymentId}`;
    link.download = "nursery-english.pdf";
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <>
      <Navbar />
      <div style={{ padding: "40px" }}>
        <h2>Payment successful 🎉</h2>
        <p>Your workbook is ready.</p>
        <button
          type="button"
          onClick={handleDownload}
          style={{ marginRight: 12, padding: "10px 16px", cursor: "pointer" }}
          disabled={!paymentId}
        >
          Download English Workbook
        </button>
        <button
          type="button"
          onClick={() => router.push("/workbooks")}
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

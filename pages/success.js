import { useRouter } from "next/router";
import Navbar from "../components/Navbar";

export default function Success() {
  const router = useRouter();
  const paymentId =
    typeof router.query.paymentId === "string" ? router.query.paymentId : "";

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
      </div>
    </>
  );
}

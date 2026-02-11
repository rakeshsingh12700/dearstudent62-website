import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { getUserPurchases } from "../firebase/purchases";
import Navbar from "../components/Navbar";

export default function MyPurchases() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [purchases, setPurchases] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user?.email) return;

    const loadPurchases = async () => {
      setLoading(true);
      setError("");
      try {
        const result = await getUserPurchases(user);
        setPurchases(result);
      } catch {
        setError("Unable to fetch purchases. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    loadPurchases();
  }, [user]);

  return (
    <>
      <Navbar />
      <h1>My Purchases</h1>

      {!user?.email && (
        <p>Please login to see purchases linked to your account email.</p>
      )}

      {user?.email && (
        <p>
          Showing purchases for: <strong>{user.email}</strong>
        </p>
      )}

      {loading && <p>Loading purchases...</p>}

      {error && <p>{error}</p>}

      {user?.email && !loading && purchases.length === 0 && (
        <p>No purchases found for this account.</p>
      )}

      {purchases.map((purchase) => (
        <div key={purchase.id} style={{ marginBottom: 20 }}>
          <h3>{purchase.productId || "Workbook Purchase"}</h3>
          <a href={`/api/download?paymentId=${purchase.paymentId || purchase.id}`} download>
            Download
          </a>
        </div>
      ))}
    </>
  );
}

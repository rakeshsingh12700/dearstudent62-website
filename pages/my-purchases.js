import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { getUserPurchases } from "../firebase/purchases";
import products from "../data/products";
import Navbar from "../components/Navbar";

export default function MyPurchases() {
  const { user } = useAuth();
  const [purchases, setPurchases] = useState([]);

  useEffect(() => {
    if (user) {
      getUserPurchases(user).then(setPurchases);
    }
  }, [user]);

  if (!user) {
    return <p>Please login to see your purchases.</p>;
  }

  const purchasedProducts = purchases.map(p =>
    products.find(prod => prod.id === p.productId)
  );

  return (
    <>
      <Navbar />
      <h1>My Purchases</h1>

      {purchasedProducts.length === 0 && <p>No purchases yet.</p>}

      {purchasedProducts.map(p => (
        <div key={p.id} style={{ marginBottom: 20 }}>
          <h3>{p.title}</h3>
          <a href={p.pdf} download>
            Download again
          </a>
        </div>
      ))}
    </>
  );
}
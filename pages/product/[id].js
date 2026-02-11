import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import Navbar from "../../components/Navbar";
import products from "../../data/products";
import { useAuth } from "../../context/AuthContext";
import { savePurchase, hasPurchased } from "../../firebase/purchases";

export default function ProductPage() {
  const { query } = useRouter();
  const { user } = useAuth();

  const [guestEmail, setGuestEmail] = useState("");
  const [purchased, setPurchased] = useState(false);
  const [checking, setChecking] = useState(true);

  const product = products.find(p => p.id === query.id);

  useEffect(() => {
    const checkPurchase = async () => {
      const email = user?.email || guestEmail;
      if (!email || !product) {
        setChecking(false);
        return;
      }

      const result = await hasPurchased({
        email,
        productId: product.id
      });

      setPurchased(result);
      setChecking(false);
    };

    checkPurchase();
  }, [user, guestEmail, product]);

  if (!product) {
    return (
      <>
        <Navbar />
        <p>Loading...</p>
      </>
    );
  }

  const handleSimulatePurchase = async () => {
    const emailToSave = user?.email || guestEmail;

    if (!emailToSave) {
      alert("Please enter email to continue");
      return;
    }

    await savePurchase({
      email: emailToSave,
      userId: user?.uid || null,
      productId: product.id
    });

    alert("Purchase successful");
    setPurchased(true);
  };

  return (
    <>
      <Navbar />

      <h1>{product.title}</h1>
      <p><strong>Price:</strong> ₹{product.price}</p>

      {/* PURCHASE CHECK */}
      {checking && <p>Checking purchase status...</p>}

      {!checking && purchased && (
        <a
          href={product.pdf}
          download
          style={{
            display: "inline-block",
            marginTop: 16,
            padding: "10px 16px",
            background: "green",
            color: "#fff",
            textDecoration: "none"
          }}
        >
          Download PDF
        </a>
      )}

      {!checking && !purchased && (
        <>
          {!user && (
            <div style={{ marginTop: 16 }}>
              <p>
                Enter your email to receive this worksheet and access it later.
              </p>
              <input
                type="email"
                placeholder="Email address"
                value={guestEmail}
                onChange={e => setGuestEmail(e.target.value)}
              />
            </div>
          )}

          <button
            onClick={handleSimulatePurchase}
            style={{
              marginTop: 16,
              padding: "10px 16px",
              cursor: "pointer"
            }}
          >
            Buy Now (Simulated)
          </button>
        </>
      )}

      <div style={{ marginTop: 30 }}>
        {user ? (
          <p>Logged in as <strong>{user.email}</strong></p>
        ) : (
          <p>You can login later to access your purchases.</p>
        )}
      </div>
    </>
  );
}
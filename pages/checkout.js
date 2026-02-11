import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";

const RAZORPAY_SDK_SRC = "https://checkout.razorpay.com/v1/checkout.js";
const CART_STORAGE_KEY = "ds-workbook-cart-v1";

const loadRazorpaySdk = () => {
  if (typeof window === "undefined") return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);

  return new Promise((resolve) => {
    const existingScript = document.querySelector(
      'script[data-razorpay-sdk="true"]'
    );

    if (existingScript) {
      const onLoad = () => resolve(true);
      const onError = () => resolve(false);
      existingScript.addEventListener("load", onLoad, { once: true });
      existingScript.addEventListener("error", onError, { once: true });
      setTimeout(() => resolve(Boolean(window.Razorpay)), 2500);
      return;
    }

    const script = document.createElement("script");
    script.src = RAZORPAY_SDK_SRC;
    script.async = true;
    script.dataset.razorpaySdk = "true";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
};

const getCartSummary = () => {
  if (typeof window === "undefined") {
    return { count: 0, total: 0 };
  }

  const raw = window.localStorage.getItem(CART_STORAGE_KEY);
  if (!raw) {
    return { count: 0, total: 0 };
  }

  try {
    const cart = JSON.parse(raw);
    if (!Array.isArray(cart)) {
      return { count: 0, total: 0 };
    }

    return cart.reduce(
      (acc, item) => ({
        count: acc.count + Number(item.quantity || 0),
        total: acc.total + Number(item.price || 0) * Number(item.quantity || 0),
      }),
      { count: 0, total: 0 }
    );
  } catch {
    return { count: 0, total: 0 };
  }
};

export default function Checkout() {
  const { user } = useAuth();
  const loggedInEmail = user?.email || "";
  const [loading, setLoading] = useState(false);
  const [cartSummary, setCartSummary] = useState(() => getCartSummary());
  const [email, setEmail] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    const syncSummary = () => {
      setCartSummary(getCartSummary());
    };

    window.addEventListener("storage", syncSummary);
    window.addEventListener("ds-cart-updated", syncSummary);

    return () => {
      window.removeEventListener("storage", syncSummary);
      window.removeEventListener("ds-cart-updated", syncSummary);
    };
  }, []);

  const payNow = async () => {
    try {
      setLoading(true);
      const latestCart = getCartSummary();
      const payableAmount = Math.round(latestCart.total);
      const buyerEmail = (loggedInEmail || email).trim().toLowerCase();

      if (payableAmount <= 0) {
        alert("Your cart is empty. Please add items before checkout.");
        return;
      }

      if (!buyerEmail) {
        alert("Please enter your email before payment.");
        return;
      }

      const isSdkLoaded = await loadRazorpaySdk();

      if (!isSdkLoaded || !window.Razorpay) {
        alert(
          "Razorpay SDK could not load. Check your internet/ad-blocker and try again."
        );
        return;
      }

      if (!process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID) {
        alert("Missing NEXT_PUBLIC_RAZORPAY_KEY_ID in environment.");
        return;
      }

      // 1️⃣ Create order on backend
      const res = await fetch("/api/razorpay/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: payableAmount }),
      });

      if (!res.ok) {
        alert("Order creation failed. Please try again.");
        return;
      }

      const order = await res.json();
      console.log("ORDER FROM API:", order);

      if (!order?.id) {
        alert("Order creation failed. Please try again.");
        setLoading(false);
        return;
      }

      // 2️⃣ Razorpay options
      const options = {
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        amount: order.amount,
        currency: "INR",
        name: "Dear Student",
        description: "Worksheet Purchase",
        order_id: order.id,

        handler: async function (response) {
          try {
            const verifyRes = await fetch(
              "/api/razorpay/verify-payment",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  ...response,
                  email: buyerEmail,
                }),
              }
            );

            const result = await verifyRes.json();

            if (result.success) {
              if (typeof window !== "undefined") {
                window.localStorage.removeItem(CART_STORAGE_KEY);
                window.dispatchEvent(new CustomEvent("ds-cart-updated"));
              }
              setCartSummary({ count: 0, total: 0 });
              window.location.href = `/success?token=${result.token}&paymentId=${result.paymentId}`;
            } else {
              alert(result.error || "Payment verification failed.");
            }
          } catch (err) {
            console.error("Verification error:", err);
            alert(
              "Payment was processed, but purchase syncing failed. Please contact support."
            );
          }
        },

        theme: {
          color: "#3399cc",
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.open();

    } catch (err) {
      console.error("Checkout error:", err);
      alert("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: "40px" }}>
      <h2>Checkout</h2>
      <p>
        Items: <strong>{cartSummary.count}</strong> | Total:{" "}
        <strong>₹{Math.round(cartSummary.total)}</strong>
      </p>
      {loggedInEmail ? (
        <p style={{ marginBottom: 12 }}>
          Using account email: <strong>{loggedInEmail}</strong>
        </p>
      ) : (
        <input
          type="email"
          placeholder="Enter your email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={{ padding: 8, marginBottom: 12, display: "block" }}
        />
      )}
      <button onClick={payNow} disabled={loading || Math.round(cartSummary.total) <= 0}>
        {loading ? "Processing..." : `Pay ₹${Math.round(cartSummary.total)}`}
      </button>
    </div>
  );
}

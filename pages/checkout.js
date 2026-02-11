import Script from "next/script";

export default function Checkout() {
  const payNow = async () => {
    const res = await fetch("/api/razorpay/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: 499 }),
    });

    const order = await res.json();
    console.log("ORDER FROM API:", order);
    const options = {
      key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
      amount: order.amount,
      currency: "INR",
      name: "My Website",
      description: "Worksheet Purchase",
      order_id: order.id,
      handler: async function (response) {
        const verifyRes = await fetch("/api/razorpay/verify-payment", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(response),
        });

        const result = await verifyRes.json();

        if (result.success) {
            alert("Payment verified!");
        } else {
            alert("Payment verification failed");
        }
        },
      theme: { color: "#3399cc" },
    };

    if (!window.Razorpay) {
      alert("Payment SDK failed to load. Please refresh and try again.");
      return;
    }

    const rzp = new window.Razorpay(options);
    rzp.open();
  };

  return (
    <>
      <Script
        src="https://checkout.razorpay.com/v1/checkout.js"
        strategy="afterInteractive"
      />
      <button onClick={payNow}>Pay ₹499</button>
    </>
  );
}

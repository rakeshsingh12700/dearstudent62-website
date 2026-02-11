import Link from "next/link";
import { useRouter } from "next/router";
import Navbar from "../../components/Navbar";
import products from "../../data/products";

export default function ClassPage() {
  const { query } = useRouter();

  const classProducts = products.filter(
    p => p.class === query.class
  );

  return (
    <>
      <Navbar />
      <h1>{query.class?.toUpperCase()} WORKBOOKS</h1>

      {classProducts.map(p => (
        <div
          key={p.id}
          style={{
            border: "1px solid #ddd",
            padding: 16,
            marginBottom: 16,
            borderRadius: 6
          }}
        >
          <h3>{p.title}</h3>
          <p>Price: ₹{p.price}</p>

          <Link href={`/product/${p.id}`}>
            <button style={{ padding: "8px 12px", cursor: "pointer" }}>
              View / Download
            </button>
          </Link>
        </div>
      ))}
    </>
  );
}
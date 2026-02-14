import Link from "next/link";
import Navbar from "../components/Navbar";

const MATHS_TOPICS = ["numbers", "addition", "subtraction", "shapes", "measurement"];

function toLabel(value) {
  return String(value || "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function MathsPage() {
  return (
    <>
      <Navbar />
      <main className="browse-page">
        <section className="container browse-wrap">
          <h1>Maths</h1>
          <p>Fast topic shortcuts for parents arriving from mobile traffic.</p>

          <div className="browse-grid">
            {MATHS_TOPICS.map((item) => (
              <Link
                key={item}
                href={`/worksheets?subject=maths&topic=${item}`}
                className="browse-tile"
              >
                <span>{toLabel(item)}</span>
                <strong>Recommended for: Class 1, Class 2</strong>
              </Link>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}

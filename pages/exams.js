import Link from "next/link";
import Navbar from "../components/Navbar";

const EXAM_TYPES = [
  { value: "exams", label: "Unit Test" },
  { value: "half-year-exam", label: "Half Year" },
  { value: "final-year-exam", label: "Final" }
];

export default function ExamsPage() {
  return (
    <>
      <Navbar />
      <main className="browse-page">
        <section className="container browse-wrap">
          <h1>Exams</h1>
          <p>Exam-focused shortcuts across classes and subjects.</p>

          <div className="browse-grid">
            {EXAM_TYPES.map((item) => (
              <Link
                key={item.value}
                href={`/worksheets?type=${item.value}`}
                className="browse-tile"
              >
                <span>{item.label}</span>
                <strong>Open</strong>
              </Link>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}

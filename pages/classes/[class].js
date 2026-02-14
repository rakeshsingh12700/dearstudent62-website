import Link from "next/link";
import { useRouter } from "next/router";
import Navbar from "../../components/Navbar";

const SUBJECT_TILES = [
  { value: "english", label: "English" },
  { value: "maths", label: "Maths" },
  { value: "evs", label: "EVS" },
  { value: "exam", label: "Exams" }
];

function toLabel(value) {
  return String(value || "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function ClassDetailPage() {
  const router = useRouter();
  const classValue = typeof router.query.class === "string" ? router.query.class : "";

  return (
    <>
      <Navbar />
      <main className="browse-page">
        <section className="container browse-wrap">
          <h1>{toLabel(classValue || "Class")}</h1>
          <div className="browse-grid">
            {SUBJECT_TILES.map((item) => (
              <Link
                key={item.value}
                href={
                  item.value === "exam"
                    ? `/worksheets?class=${classValue}&type=exams`
                    : `/worksheets?class=${classValue}&subject=${item.value}`
                }
                className="browse-tile"
              >
                <span>{item.label}</span>
              </Link>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}

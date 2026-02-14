import Link from "next/link";
import Navbar from "../../components/Navbar";

const CLASS_OPTIONS = [
  { value: "pre-nursery", label: "Pre Nursery" },
  { value: "nursery", label: "Nursery" },
  { value: "lkg", label: "LKG" },
  { value: "ukg", label: "UKG" },
  { value: "class-1", label: "Class 1" },
  { value: "class-2", label: "Class 2" },
  { value: "class-3", label: "Class 3" }
];

export default function ClassesPage() {
  return (
    <>
      <Navbar />
      <main className="browse-page">
        <section className="container browse-wrap">
          <h1>Classes</h1>
          <p>Select a class and continue with subject-first browsing.</p>
          <div className="browse-grid">
            {CLASS_OPTIONS.map((item) => (
              <Link key={item.value} href={`/classes/${item.value}`} className="browse-tile">
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

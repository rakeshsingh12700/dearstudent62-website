import Link from "next/link";
import Navbar from "../components/Navbar";

const ENGLISH_TOPICS = [
  { value: "reading", label: "Reading" },
  { value: "writing", label: "Writing" },
  { value: "grammar", label: "Grammar" },
  { value: "poems", label: "Poems" },
  { value: "sight-words", label: "Sight Words" }
];

const GRAMMAR_TOPICS = [
  "noun",
  "pronoun",
  "verb",
  "articles",
  "opposites",
  "singular-plural",
  "is-am-are",
  "prepositions",
  "adjectives",
  "have-has-had"
];

function toLabel(value) {
  return String(value || "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function EnglishPage() {
  return (
    <>
      <Navbar />
      <main className="browse-page">
        <section className="container browse-wrap">
          <h1>English</h1>

          <div className="browse-grid">
            {ENGLISH_TOPICS.map((item) => (
              <Link
                key={item.value}
                href={`/worksheets?subject=english&topic=${item.value}`}
                className="browse-tile"
              >
                <span>{item.label}</span>
              </Link>
            ))}
          </div>

          <h2>Grammar Topics</h2>
          <div className="browse-grid browse-grid--compact">
            {GRAMMAR_TOPICS.map((item) => (
              <Link
                key={item}
                href={`/worksheets?subject=english&topic=grammar&subtopic=${item}`}
                className="browse-tile"
              >
                <span>{toLabel(item)}</span>
              </Link>
            ))}
          </div>
        </section>
      </main>
    </>
  );
}

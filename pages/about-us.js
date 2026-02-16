import Head from "next/head";
import Link from "next/link";
import Navbar from "../components/Navbar";

const STORY_CHAPTERS = [
  {
    title: "My Classroom Story",
    detail:
      "I am a primary teacher, and I work with young children frequently. I see closely how each child learns at a different pace."
  },
  {
    title: "My Frequent Parent Conversations",
    detail:
      "After school, I regularly talk with parents to understand what feels difficult at home, where children lose confidence, and how families can support practice better."
  },
  {
    title: "I Design Each Worksheet Myself",
    detail:
      "Based on these real observations, I design each worksheet myself so every sheet is practical, clear, and aligned with how children actually grow."
  }
];

const DESIGN_APPROACH = [
  "I start with the exact class-level concept children struggle with in school.",
  "I break practice into small, confidence-building steps instead of heavy worksheets.",
  "I write child-friendly instructions that parents can guide quickly at home.",
  "I review and refine from real feedback shared by both children and parents."
];

export default function AboutUsPage() {
  return (
    <>
      <Head>
        <title>About Us | Dear Student</title>
        <meta
          name="description"
          content="I am a primary teacher. Dear Student shares worksheets I design from frequent classroom and parent interactions."
        />
      </Head>
      <Navbar />
      <main className="about-page">
        <section className="container about-shell">
          <span className="hero__eyebrow">About Us</span>
          <h1>From my frequent classroom interactions to every worksheet I publish.</h1>
          <p className="about-intro">
            I created Dear Student from my real journey as a primary teacher who interacts with
            children and parents frequently. I observe where students feel confused, where they
            shine, and what support parents need to help them grow at home. That direct,
            hands-on experience shapes every worksheet I create.
          </p>

          <div className="about-grid">
            {STORY_CHAPTERS.map((item) => (
              <article className="about-card" key={item.title}>
                <h2>{item.title}</h2>
                <p>{item.detail}</p>
              </article>
            ))}
          </div>

          <section className="about-section">
            <h2>How the worksheet design process works</h2>
            <ul className="about-list">
              {DESIGN_APPROACH.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          </section>

          <div className="about-actions">
            <Link href="/worksheets" className="btn btn-primary">
              Explore Worksheets
            </Link>
            <Link href="/contact-us" className="btn btn-secondary">
              Send Feedback
            </Link>
          </div>
        </section>
      </main>
    </>
  );
}

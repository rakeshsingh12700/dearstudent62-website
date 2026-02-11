import Navbar from "../components/Navbar";
import Link from "next/link";
import Head from "next/head";

export default function Home() {
  return (
    <>
      <Head>
        <title>dearstudent62 Learning Hub</title>
        <meta
          name="description"
          content="Printable worksheets for young learners with playful, engaging activities."
        />
      </Head>
      <Navbar />
      <main className="hero">
        <section className="container hero__shell">
          <span className="hero__eyebrow">Fun Learning Awaits</span>
          <h1 className="hero__title">
            Learning is <span className="hero__title-accent">Playtime!</span>
          </h1>
          <p className="hero__copy">
            dearstudent62 makes early learning exciting with premium printable
            workbooks for your little ones.
          </p>
          <div className="hero__actions">
            <Link href="/workbooks" className="btn btn-primary">
              Shop Workbooks
            </Link>
            <Link href="/signup" className="btn btn-secondary">
              Get Started
            </Link>
          </div>
        </section>
      </main>
    </>
  );
}

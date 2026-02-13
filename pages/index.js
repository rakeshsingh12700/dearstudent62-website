import Navbar from "../components/Navbar";
import Link from "next/link";
import Head from "next/head";
import { useAuth } from "../context/AuthContext";

export default function Home() {
  const { user } = useAuth();

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
            worksheets for your little ones.
          </p>
          <div className="hero__actions">
            <Link href="/worksheets" className="btn btn-primary">
              Shop Worksheets
            </Link>
            {!user && (
              <Link href="/auth" className="btn btn-secondary">
                Get Started
              </Link>
            )}
          </div>
        </section>
      </main>
    </>
  );
}

import Navbar from "../components/Navbar";
import Link from "next/link";
import Head from "next/head";
import { useEffect } from "react";
import { useRouter } from "next/router";
import { useAuth } from "../context/AuthContext";

export default function Home() {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!router.isReady) return;

    const mode = typeof router.query.mode === "string" ? router.query.mode : "";
    const oobCode =
      typeof router.query.oobCode === "string" ? router.query.oobCode : "";
    if (!mode || !oobCode) return;

    router.replace(
      {
        pathname: "/__/auth/action",
        query: router.query,
      },
      undefined,
      { shallow: true }
    );
  }, [router, router.isReady, router.query]);

  return (
    <>
      <Head>
        <title>Dear Student</title>
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
            Dear Student makes early learning exciting with premium printable
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
          <p className="hero__social-proof">
            <a
              href="https://www.instagram.com/dearstudent62/"
              target="_blank"
              rel="noopener noreferrer"
            >
              Born on Instagram. Trusted by 122k+ parents.
            </a>
          </p>
        </section>
      </main>
    </>
  );
}

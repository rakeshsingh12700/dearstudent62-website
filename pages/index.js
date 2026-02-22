import Navbar from "../components/Navbar";
import Link from "next/link";
import Head from "next/head";
import Image from "next/image";
import { useEffect } from "react";
import { useRouter } from "next/router";
import { useAuth } from "../context/AuthContext";
import { motion } from "framer-motion";

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
      <motion.main
        className="hero"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
      >
        <section className="container hero__shell">
          <div className="hero__grid">
            <motion.div
              className="hero__content"
              initial={{ opacity: 0, x: -18 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, ease: "easeOut", delay: 0.08 }}
            >
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
            </motion.div>
            <motion.div
              className="hero__visual"
              aria-hidden="true"
              initial={{ opacity: 0, x: 24, scale: 0.98 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              transition={{ duration: 0.55, ease: "easeOut", delay: 0.16 }}
            >
              <div className="hero__visual-bubble hero__visual-bubble--one" />
              <div className="hero__visual-bubble hero__visual-bubble--two" />
              <Image
                src="/home-hero-illustration.svg"
                alt=""
                width={760}
                height={520}
                className="hero__visual-art"
                priority
              />
              <p className="hero__visual-caption">
                Playful worksheets for smart little learners.
              </p>
            </motion.div>
          </div>
        </section>
        <div className="hero__wave" aria-hidden="true">
          <svg viewBox="0 0 1200 140" preserveAspectRatio="none">
            <path d="M0,95 C180,40 350,40 520,74 C700,108 875,108 1200,62 L1200,140 L0,140 Z" />
          </svg>
        </div>
      </motion.main>
    </>
  );
}

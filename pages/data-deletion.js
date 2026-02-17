import Head from "next/head";
import Navbar from "../components/Navbar";

export default function DataDeletionPage() {
  return (
    <>
      <Head>
        <title>Data Deletion Request | Dear Student</title>
        <meta
          name="description"
          content="Request account or personal data deletion for Dear Student."
        />
      </Head>
      <Navbar />
      <main className="contact-page">
        <section className="container contact-shell">
          <span className="hero__eyebrow">Data Deletion</span>
          <h1>Request account or data deletion</h1>
          <p className="contact-intro">
            To request deletion of your account or personal data, email us from your registered
            email address so we can verify ownership.
          </p>

          <div className="about-section">
            <h2>How to Request</h2>
            <ul className="about-list">
              <li>Send an email to <a href="mailto:support@livecushy.com">support@livecushy.com</a>.</li>
              <li>Use the subject line: Data Deletion Request.</li>
              <li>Include your registered email and, if available, recent order details.</li>
            </ul>
          </div>

          <div className="about-section">
            <h2>What Happens Next</h2>
            <ul className="about-list">
              <li>We verify the request for account security.</li>
              <li>We delete or anonymize eligible personal data tied to your account.</li>
              <li>We send a confirmation once deletion is completed.</li>
            </ul>
          </div>
        </section>
      </main>
    </>
  );
}

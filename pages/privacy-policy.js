import Head from "next/head";
import Navbar from "../components/Navbar";

export default function PrivacyPolicyPage() {
  return (
    <>
      <Head>
        <title>Privacy Policy | Dear Student</title>
        <meta
          name="description"
          content="Privacy policy for Dear Student covering account data, purchase records, and support communication."
        />
      </Head>
      <Navbar />
      <main className="contact-page">
        <section className="container contact-shell">
          <span className="hero__eyebrow">Privacy Policy</span>
          <h1>How we collect and use your data</h1>
          <p className="contact-intro">
            Dear Student collects only the information needed to provide account access, worksheet
            purchases, and customer support.
          </p>

          <div className="about-section">
            <h2>Information We Collect</h2>
            <ul className="about-list">
              <li>Name and email address when you create an account or contact us.</li>
              <li>Authentication details provided by email/password, Google, or Facebook login.</li>
              <li>Purchase and order records for worksheets and invoices.</li>
              <li>Basic technical data such as country/currency context for pricing and checkout.</li>
            </ul>
          </div>

          <div className="about-section">
            <h2>How We Use Information</h2>
            <ul className="about-list">
              <li>To authenticate users and secure accounts.</li>
              <li>To process payments and deliver purchased worksheets.</li>
              <li>To provide support and respond to user requests.</li>
              <li>To improve product quality, pricing, and user experience.</li>
            </ul>
          </div>

          <div className="about-section">
            <h2>Contact</h2>
            <p className="contact-intro">
              For privacy-related questions, contact us at{" "}
              <a href="mailto:support@livecushy.com">support@livecushy.com</a>.
            </p>
          </div>
        </section>
      </main>
    </>
  );
}

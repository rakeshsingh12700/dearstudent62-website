import Head from "next/head";
import Link from "next/link";
import { useState } from "react";
import Navbar from "../components/Navbar";
import { useAuth } from "../context/AuthContext";

const INSTAGRAM_PROFILE_URL = "https://www.instagram.com/dearstudent62/";

const TOPIC_OPTIONS = [
  { value: "general-feedback", label: "General feedback" },
  { value: "worksheet-issue", label: "Worksheet issue" },
  { value: "payment-issue", label: "Payment issue" },
  { value: "account-help", label: "Account help" },
  { value: "other", label: "Other" }
];

function getTopicLabel(value) {
  const match = TOPIC_OPTIONS.find((item) => item.value === value);
  return match ? match.label : "General feedback";
}

function getInitialForm() {
  return {
    name: "",
    email: "",
    whatsapp: "",
    topic: TOPIC_OPTIONS[0].value,
    message: ""
  };
}

export default function ContactUsPage() {
  const { user } = useAuth();
  const [form, setForm] = useState(() => getInitialForm());
  const [status, setStatus] = useState({ type: "", text: "" });
  const [submitting, setSubmitting] = useState(false);

  const handleFieldChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const trimmedMessage = String(form.message || "").trim();
    const trimmedName = String(form.name || "").trim();
    const trimmedEmail = String(form.email || "").trim().toLowerCase();
    const trimmedWhatsapp = String(form.whatsapp || "").trim();
    const loggedInEmail = String(user?.email || "").trim().toLowerCase();
    const effectiveEmail = trimmedEmail || loggedInEmail;

    if (!trimmedMessage) {
      setStatus({
        type: "error",
        text: "Please add feedback or issue details before submitting."
      });
      return;
    }
    if (!effectiveEmail && !trimmedWhatsapp) {
      setStatus({
        type: "error",
        text: "Please provide at least one contact method: Email or WhatsApp number."
      });
      return;
    }

    try {
      setSubmitting(true);
      setStatus({ type: "", text: "" });

      const idToken = user ? await user.getIdToken().catch(() => "") : "";
      const response = await fetch("/api/contact-submissions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({
          name: trimmedName,
          email: effectiveEmail,
          whatsapp: trimmedWhatsapp,
          topic: form.topic,
          topicLabel: getTopicLabel(form.topic),
          message: trimmedMessage
        })
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Unable to submit right now. Please try again.");
      }

      setForm(getInitialForm());
      setStatus({
        type: "ok",
        text: "Thanks. Your message was submitted successfully."
      });
    } catch (error) {
      setStatus({
        type: "error",
        text: error?.message || "Unable to submit right now. Please try again."
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Head>
        <title>Contact Us | Dear Student</title>
        <meta
          name="description"
          content="Contact Dear Student for feedback, support, and worksheet-related issues."
        />
      </Head>
      <Navbar />
      <main className="contact-page">
        <section className="container contact-shell">
          <span className="hero__eyebrow">Contact Us</span>
          <h1>Share feedback or report any issue.</h1>
          <p className="contact-intro">
            Use this form for general feedback, worksheet issues, payment concerns, or account
            help. Your message is submitted directly to our support records.
          </p>

          <div className="contact-layout">
            <form className="contact-form" onSubmit={handleSubmit}>
              {user?.email && (
                <p className="contact-logged-email">
                  Logged in as <strong>{user.email}</strong>. We will use this email for support reply.
                </p>
              )}
              <label htmlFor="contact-name">
                Name (optional)
                <input
                  id="contact-name"
                  name="name"
                  type="text"
                  value={form.name}
                  onChange={handleFieldChange}
                  placeholder="Parent name"
                />
              </label>

              <label htmlFor="contact-email">
                Email (optional if WhatsApp provided)
                <input
                  id="contact-email"
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={handleFieldChange}
                  placeholder="parent@example.com"
                />
              </label>

              <label htmlFor="contact-whatsapp">
                WhatsApp Number (optional if Email provided)
                <input
                  id="contact-whatsapp"
                  name="whatsapp"
                  type="tel"
                  value={form.whatsapp}
                  onChange={handleFieldChange}
                  placeholder="+91XXXXXXXXXX"
                />
              </label>
              <p className="contact-form__hint">
                Required: Provide at least one contact method, Email or WhatsApp.
              </p>

              <label htmlFor="contact-topic">
                Topic
                <select id="contact-topic" name="topic" value={form.topic} onChange={handleFieldChange}>
                  {TOPIC_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label htmlFor="contact-message">
                Message
                <textarea
                  id="contact-message"
                  name="message"
                  value={form.message}
                  onChange={handleFieldChange}
                  rows={6}
                  placeholder="Please explain your feedback or issue..."
                />
              </label>

              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? "Submitting..." : "Submit Message"}
              </button>

              {status.text && (
                <p
                  className={`contact-status ${
                    status.type === "error" ? "contact-status--error" : "contact-status--ok"
                  }`}
                  role="status"
                >
                  {status.text}
                </p>
              )}
            </form>

            <aside className="contact-card" aria-label="Alternate contact methods">
              <h2>Need a faster response?</h2>
              <p>
                You can also message us on Instagram. Form submissions are stored in our support
                inbox so we can review and reply properly.
              </p>
              <a
                href={INSTAGRAM_PROFILE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary"
              >
                Message on Instagram
              </a>
              <Link href="/worksheets" className="contact-card__link">
                Back to worksheets library
              </Link>
            </aside>
          </div>
        </section>
      </main>
    </>
  );
}

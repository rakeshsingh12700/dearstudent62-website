import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { updateProfile, verifyBeforeUpdateEmail } from "firebase/auth";

import Navbar from "../components/Navbar";
import { useAuth } from "../context/AuthContext";
import { auth } from "../firebase/config";

function splitDisplayName(displayName, email) {
  const normalizedName = String(displayName || "").replace(/\s+/g, " ").trim();
  if (normalizedName) {
    const parts = normalizedName.split(" ").filter(Boolean);
    return {
      firstName: parts[0] || "",
      lastName: parts.slice(1).join(" "),
    };
  }

  const emailPrefix = String(email || "")
    .trim()
    .toLowerCase()
    .split("@")[0]
    .replace(/[._-]+/g, " ")
    .trim();
  return {
    firstName: emailPrefix || "",
    lastName: "",
  };
}

function normalizeName(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function isValidName(value) {
  const normalized = normalizeName(value);
  if (normalized.length < 2 || normalized.length > 40) return false;
  return /^[A-Za-z][A-Za-z'\- ]*$/.test(normalized);
}

function isValidEmail(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(normalized);
}

function getProfileErrorMessage(error) {
  switch (error?.code) {
    case "auth/invalid-email":
      return "Enter a valid email address.";
    case "auth/email-already-in-use":
      return "This email is already in use.";
    case "auth/requires-recent-login":
      return "Please log out and log in again, then retry this update.";
    case "auth/network-request-failed":
      return "Network issue while updating profile. Please retry.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait and try again.";
    default:
      return "Unable to update profile right now. Please try again.";
  }
}

export default function ProfilePage() {
  const { user } = useAuth();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const sourceUser = auth.currentUser || user;
    if (!sourceUser) return;
    const split = splitDisplayName(sourceUser.displayName, sourceUser.email);
    setFirstName(split.firstName);
    setLastName(split.lastName);
    setEmail(String(sourceUser.email || "").trim().toLowerCase());
  }, [user]);

  const currentEmail = useMemo(
    () => String(auth.currentUser?.email || user?.email || "").trim().toLowerCase(),
    [user?.email]
  );

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");

    const normalizedFirstName = normalizeName(firstName);
    const normalizedLastName = normalizeName(lastName);
    const normalizedEmail = String(email || "").trim().toLowerCase();

    if (!isValidName(normalizedFirstName)) {
      setError("First name must be 2-40 characters and contain only letters.");
      return;
    }

    if (!isValidName(normalizedLastName)) {
      setError("Last name must be 2-40 characters and contain only letters.");
      return;
    }

    if (!isValidEmail(normalizedEmail)) {
      setError("Enter a valid email address.");
      return;
    }

    const currentUser = auth.currentUser;
    if (!currentUser) {
      setError("Please login again to update your profile.");
      return;
    }

    const nextDisplayName = `${normalizedFirstName} ${normalizedLastName}`.trim();
    const shouldUpdateName = nextDisplayName !== String(currentUser.displayName || "").trim();
    const shouldUpdateEmail = normalizedEmail !== currentEmail;

    if (!shouldUpdateName && !shouldUpdateEmail) {
      setMessage("No changes found.");
      return;
    }

    setSaving(true);
    try {
      if (shouldUpdateName) {
        await updateProfile(currentUser, { displayName: nextDisplayName });
      }

      if (shouldUpdateEmail) {
        await verifyBeforeUpdateEmail(currentUser, normalizedEmail);
      }

      if (shouldUpdateEmail) {
        setMessage(
          "Profile updated. Check your new email inbox and confirm the verification link to complete email change."
        );
      } else {
        setMessage("Profile updated successfully.");
      }
    } catch (updateError) {
      setError(getProfileErrorMessage(updateError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Navbar />
      <main className="auth-page">
        <section className="auth-card">
          <h1>Profile</h1>
          {!user ? (
            <div className="auth-status auth-status--error">
              <p>Please login to manage your profile.</p>
              <Link href="/auth?next=/profile" className="btn btn-primary auth-status__action">
                Login
              </Link>
            </div>
          ) : (
            <>
              <p className="auth-subtext">Update your name and email address.</p>

              <form className="auth-form" onSubmit={handleSubmit}>
                <label htmlFor="profile-first-name">First Name</label>
                <input
                  id="profile-first-name"
                  name="firstName"
                  type="text"
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  placeholder="First name"
                  autoComplete="given-name"
                  required
                />

                <label htmlFor="profile-last-name">Last Name</label>
                <input
                  id="profile-last-name"
                  name="lastName"
                  type="text"
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                  placeholder="Last name"
                  autoComplete="family-name"
                  required
                />

                <label htmlFor="profile-email">Email</label>
                <input
                  id="profile-email"
                  name="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                />

                <button className="btn btn-primary auth-submit-btn" type="submit" disabled={saving}>
                  {saving ? "Saving..." : "Save Changes"}
                </button>
              </form>

              {error && <p className="auth-message auth-message--error">{error}</p>}
              {message && <p className="auth-message auth-message--success">{message}</p>}

              <p className="auth-footnote">
                Email changes require confirmation from your new email inbox before they take effect.
              </p>
            </>
          )}
        </section>
      </main>
    </>
  );
}

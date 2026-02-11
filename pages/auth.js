import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from "firebase/auth";

import Navbar from "../components/Navbar";
import { useAuth } from "../context/AuthContext";
import { auth } from "../firebase/config";

const MIN_PASSWORD_LENGTH = 6;

function resolveSafeNext(nextValue) {
  if (typeof nextValue !== "string") return "/";
  if (!nextValue.startsWith("/")) return "/";
  if (nextValue.startsWith("//")) return "/";
  if (nextValue === "/auth") return "/";
  return nextValue;
}

function getAuthErrorMessage(error) {
  switch (error?.code) {
    case "auth/invalid-email":
      return "Enter a valid email address.";
    case "auth/user-not-found":
      return "No account found for this email. Please sign up.";
    case "auth/popup-closed-by-user":
      return "Google sign-in was closed before completion.";
    case "auth/popup-blocked":
      return "Popup blocked. Allow popups and try Google sign-in again.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait and try again.";
    case "auth/wrong-password":
    case "auth/invalid-credential":
      return "Incorrect password. Try again or use Google if that was your sign-in method.";
    case "auth/user-disabled":
      return "This account is disabled.";
    case "auth/email-already-in-use":
      return "This email is already registered. Try logging in.";
    default:
      return "Authentication failed. Please try again.";
  }
}

export default function AuthPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busyAction, setBusyAction] = useState("");

  const safeNext = useMemo(
    () => resolveSafeNext(router.query.next),
    [router.query.next]
  );

  useEffect(() => {
    if (!router.isReady) return;

    setMode(router.query.mode === "signup" ? "signup" : "login");

    if (typeof router.query.email === "string") {
      setEmail(router.query.email.trim().toLowerCase());
      return;
    }

    if (typeof window !== "undefined") {
      const guestCheckoutEmail =
        window.sessionStorage.getItem("ds-last-checkout-email") || "";
      if (guestCheckoutEmail) {
        setEmail(guestCheckoutEmail.trim().toLowerCase());
      }
    }
  }, [router.isReady, router.query.email, router.query.mode]);

  useEffect(() => {
    if (!router.isReady) return;
    if (!user) return;
    router.replace(safeNext);
  }, [router, router.isReady, safeNext, user]);

  const passwordStrength = useMemo(() => {
    if (mode !== "signup" || !password) return null;
    if (password.length < MIN_PASSWORD_LENGTH) {
      return { label: "Too short", tone: "weak" };
    }
    if (password.length < 8) {
      return { label: "Weak", tone: "weak" };
    }
    if (password.length < 11) {
      return { label: "Medium", tone: "medium" };
    }
    return { label: "Strong", tone: "strong" };
  }, [mode, password]);

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setError("");
    setMessage("");

    const nextQuery = { ...router.query };
    if (nextMode === "signup") {
      nextQuery.mode = "signup";
    } else {
      delete nextQuery.mode;
    }

    router.replace(
      {
        pathname: "/auth",
        query: nextQuery,
      },
      undefined,
      { shallow: true }
    );
  };

  const handleGoogleSignIn = async () => {
    setError("");
    setMessage("");
    setBusyAction("google");
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      await signInWithPopup(auth, provider);
      router.push(safeNext);
    } catch (authError) {
      setError(getAuthErrorMessage(authError));
    } finally {
      setBusyAction("");
    }
  };

  const handleLogin = async (normalizedEmail) => {
    const credential = await signInWithEmailAndPassword(
      auth,
      normalizedEmail,
      password
    );

    if (!credential.user.emailVerified) {
      await sendEmailVerification(credential.user);
      await signOut(auth);
      setMessage(
        "Please verify your email before login. A new verification link has been sent."
      );
      return;
    }

    router.push(safeNext);
  };

  const handleSignup = async (normalizedEmail) => {
    const normalizedName = name.trim().replace(/\s+/g, " ");

    if (!normalizedName) {
      setError("Please enter your name.");
      return;
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError("Password must be at least 6 characters.");
      return;
    }

    const newUserCredential = await createUserWithEmailAndPassword(
      auth,
      normalizedEmail,
      password
    );

    await updateProfile(newUserCredential.user, { displayName: normalizedName });
    await sendEmailVerification(newUserCredential.user);
    await signOut(auth);

    setMessage(
      "Account created. Verify your email from inbox, then login."
    );
  };

  const handleEmailSubmit = async (event) => {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();

    setError("");
    setMessage("");

    if (!normalizedEmail) {
      setError("Email is required.");
      return;
    }

    if (!password) {
      setError("Password is required.");
      return;
    }

    setBusyAction("email");
    try {
      if (mode === "signup") {
        await handleSignup(normalizedEmail);
      } else {
        await handleLogin(normalizedEmail);
      }
    } catch (authError) {
      if (authError?.code === "auth/email-already-in-use") {
        setMode("login");
        setMessage("Account already exists. Please login with your email and password.");
        return;
      }

      setError(getAuthErrorMessage(authError));
    } finally {
      setBusyAction("");
    }
  };

  return (
    <>
      <Navbar />
      <main className="auth-page">
        <section className="auth-card">
          <h1>Login / Sign Up</h1>
          <p className="auth-subtext">
            Continue with Google first, or use email below.
          </p>

          <button
            type="button"
            className="auth-google-btn"
            onClick={handleGoogleSignIn}
            disabled={busyAction !== ""}
          >
            <span aria-hidden="true">G</span>
            {busyAction === "google" ? "Connecting..." : "Continue with Google"}
          </button>

          <div className="auth-divider">
            <span>or continue with email</span>
          </div>

          <div className="auth-mode-switch">
            <button
              type="button"
              className={mode === "login" ? "active" : ""}
              onClick={() => switchMode("login")}
            >
              Login
            </button>
            <button
              type="button"
              className={mode === "signup" ? "active" : ""}
              onClick={() => switchMode("signup")}
            >
              Sign Up
            </button>
          </div>

          <form className="auth-form" onSubmit={handleEmailSubmit}>
            {mode === "signup" && (
              <>
                <label htmlFor="auth-name">Your name</label>
                <input
                  id="auth-name"
                  type="text"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="First and last name"
                  autoComplete="name"
                  required
                />
              </>
            )}

            <label htmlFor="auth-email">Email</label>
            <input
              id="auth-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
            />

            <label htmlFor="auth-password">Password</label>
            <input
              id="auth-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter password"
              autoComplete="current-password"
              required
            />

            {mode === "signup" && (
              <p className="auth-password-hint">
                Password must be at least 6 characters.
              </p>
            )}

            {passwordStrength && (
              <p className={`auth-strength auth-strength--${passwordStrength.tone}`}>
                Strength: {passwordStrength.label}
              </p>
            )}

            <button className="btn btn-primary auth-submit-btn" type="submit" disabled={busyAction !== ""}>
              {busyAction === "email"
                ? "Please wait..."
                : mode === "signup"
                  ? "Create account"
                  : "Login"}
            </button>
          </form>

          {error && <p className="auth-message auth-message--error">{error}</p>}
          {message && <p className="auth-message auth-message--success">{message}</p>}

          <p className="auth-footnote">
            Prefer speed? Checkout as guest first and create/login later to sync purchases.
          </p>
        </section>
      </main>
    </>
  );
}

import { useMemo, useState } from "react";
import { useRouter } from "next/router";
import {
  checkActionCode,
  confirmPasswordReset,
  verifyPasswordResetCode,
} from "firebase/auth";

import Navbar from "../../../components/Navbar";
import { auth } from "../../../firebase/config";

const MIN_PASSWORD_LENGTH = 6;

function messageFromError(error) {
  switch (error?.code) {
    case "auth/expired-action-code":
      return "This reset link has expired. Request a new one.";
    case "auth/invalid-action-code":
      return "This reset link is invalid. Request a new one.";
    case "auth/weak-password":
      return "Password must be at least 6 characters.";
    default:
      return "Unable to complete this action. Please try again.";
  }
}

export default function FirebaseActionPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState(false);
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const mode = useMemo(
    () => (typeof router.query.mode === "string" ? router.query.mode : ""),
    [router.query.mode]
  );
  const oobCode = useMemo(
    () => (typeof router.query.oobCode === "string" ? router.query.oobCode : ""),
    [router.query.oobCode]
  );

  const handleValidateResetCode = async () => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const userEmail = await verifyPasswordResetCode(auth, oobCode);
      setEmail(userEmail || "");
      setChecked(true);
    } catch (authError) {
      setError(messageFromError(authError));
    } finally {
      setBusy(false);
    }
  };

  const handleResetPassword = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");

    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      await confirmPasswordReset(auth, oobCode, newPassword);
      setMessage("Password reset successful. You can now login.");
    } catch (authError) {
      setError(messageFromError(authError));
    } finally {
      setBusy(false);
    }
  };

  const handleCheckCode = async () => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await checkActionCode(auth, oobCode);
      setMessage("Action link is valid.");
    } catch (authError) {
      setError(messageFromError(authError));
    } finally {
      setBusy(false);
    }
  };

  const renderResetPassword = () => (
    <div style={{ maxWidth: 420, margin: "40px auto", padding: 16 }}>
      <h1 style={{ marginBottom: 12 }}>Reset password</h1>
      {!checked ? (
        <button
          onClick={handleValidateResetCode}
          disabled={busy || !oobCode}
          style={{ width: "100%", padding: "10px 12px", cursor: "pointer" }}
        >
          {busy ? "Checking..." : "Continue"}
        </button>
      ) : (
        <form onSubmit={handleResetPassword}>
          <p style={{ marginBottom: 12 }}>
            Reset password for <strong>{email}</strong>
          </p>
          <label htmlFor="newPassword">New password</label>
          <input
            id="newPassword"
            type="password"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            style={{ width: "100%", marginTop: 6, marginBottom: 12, padding: 10 }}
          />
          <label htmlFor="confirmPassword">Confirm password</label>
          <input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            style={{ width: "100%", marginTop: 6, marginBottom: 12, padding: 10 }}
          />
          <button
            type="submit"
            disabled={busy}
            style={{ width: "100%", padding: "10px 12px", cursor: "pointer" }}
          >
            {busy ? "Updating..." : "Update password"}
          </button>
        </form>
      )}
    </div>
  );

  const renderGenericAction = () => (
    <div style={{ maxWidth: 420, margin: "40px auto", padding: 16 }}>
      <h1 style={{ marginBottom: 12 }}>Account action</h1>
      <p style={{ marginBottom: 12 }}>
        This link type (<strong>{mode || "unknown"}</strong>) is not handled here yet.
      </p>
      <button
        onClick={handleCheckCode}
        disabled={busy || !oobCode}
        style={{ width: "100%", padding: "10px 12px", cursor: "pointer" }}
      >
        {busy ? "Checking..." : "Check link"}
      </button>
    </div>
  );

  return (
    <>
      <Navbar />
      {mode === "resetPassword" ? renderResetPassword() : renderGenericAction()}
      {(error || message) && (
        <div style={{ maxWidth: 420, margin: "0 auto", padding: "0 16px 20px" }}>
          {error ? (
            <p style={{ color: "#b00020", margin: 0 }}>{error}</p>
          ) : (
            <p style={{ color: "#1b5e20", margin: 0 }}>{message}</p>
          )}
        </div>
      )}
      {message === "Password reset successful. You can now login." && (
        <div style={{ maxWidth: 420, margin: "0 auto", padding: "0 16px 20px" }}>
          <button
            onClick={() => router.push("/auth")}
            style={{ width: "100%", padding: "10px 12px", cursor: "pointer" }}
          >
            Go to login
          </button>
        </div>
      )}
    </>
  );
}

import Link from "next/link";
import { useAuth } from "../context/AuthContext";
import { signOut } from "firebase/auth";
import { auth } from "../firebase/config";
import { useRouter } from "next/router";

export default function Navbar() {
  const { user } = useAuth();

  const router = useRouter();

  const handleLogout = async () => {
  await signOut(auth);
  router.push("/");
  };

  return (
    <nav
      style={{
        padding: "16px",
        borderBottom: "1px solid #ddd",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center"
      }}
    >
      {/* LEFT */}
      <div>
        <strong>dearstudent62 Learning Hub</strong>
        <span style={{ marginLeft: 20 }}>
          <Link href="/">Home</Link>{" | "}
          <Link href="/workbooks">Workbooks</Link>{" | "}
          <Link href="/about">About</Link>{" | "}
          <Link href="/contact">Contact</Link>
        </span>
      </div>

      {/* RIGHT */}
      <div>
        {!user && (
          <>
            <Link href="/login">Login</Link>{" | "}
            <Link href="/signup">Signup</Link>
          </>
        )}

        {user && (
          <>
            <span style={{ marginRight: 12 }}>
              Logged in as <strong>{user.email}</strong>
            </span>
            <Link href="/my-purchases">My Purchases</Link>{" | "}
            <button
              onClick={handleLogout}
              style={{
                marginLeft: 8,
                cursor: "pointer",
                background: "none",
                border: "none",
                color: "blue",
                textDecoration: "underline"
              }}
            >
              Logout
            </button>
          </>
        )}
      </div>
    </nav>
  );
}
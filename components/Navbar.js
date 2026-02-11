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
    <nav className="navbar">
      <div className="container navbar__inner">
        <div className="navbar__links">
          <Link href="/" className="navbar__brand">
            dearstudent62 Learning Hub
          </Link>
          <Link href="/">Home</Link>
          <Link href="/workbooks">Workbooks</Link>
        </div>

        <div className="navbar__actions">
          {!user && (
            <>
              <Link href="/login">Login</Link>
              <Link href="/signup">Signup</Link>
            </>
          )}

          {user && (
            <>
              <span className="navbar__email">{user.email}</span>
              <Link href="/my-purchases">My Purchases</Link>
              <button onClick={handleLogout} className="btn-link" type="button">
                Logout
              </button>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}

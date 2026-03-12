import { createContext, useContext, useEffect, useState } from "react";
import { auth } from "../firebase/config";
import { onAuthStateChanged } from "firebase/auth";
import { linkGuestPurchases } from "../firebase/purchases";

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);

  useEffect(() => {
    if (!auth) return undefined;

    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);

      if (!currentUser?.email || !currentUser?.uid) {
        return;
      }

      // Fire-and-forget so auth/login flow never hard-fails on purchase-link issues.
      Promise.resolve()
        .then(() => linkGuestPurchases(currentUser))
        .catch((error) => {
          console.warn("Guest purchase sync skipped:", String(error?.message || error));
        });
    });
    return () => unsub();
  }, []);

  return (
    <AuthContext.Provider value={{ user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

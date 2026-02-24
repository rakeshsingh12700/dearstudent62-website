import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

function hasFirebaseWebConfig(config) {
  return Boolean(
    String(config?.apiKey || "").trim() &&
    String(config?.authDomain || "").trim() &&
    String(config?.projectId || "").trim() &&
    String(config?.appId || "").trim()
  );
}

let app = null;
if (hasFirebaseWebConfig(firebaseConfig)) {
  app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
} else if (typeof window !== "undefined") {
  // Keep local/dev/CI from crashing when public Firebase envs are not configured.
  console.warn("Firebase web config is missing. Auth/Firestore client features are disabled.");
}

export const auth = app && typeof window !== "undefined" ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;

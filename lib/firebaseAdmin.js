import { applicationDefault, cert, getApp, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

let cachedDb;

function normalizePrivateKey(rawValue) {
  return String(rawValue || "")
    .trim()
    .replace(/\\n/g, "\n");
}

function parseServiceAccountJson() {
  const raw = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || "").trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return {
      projectId: String(parsed?.project_id || parsed?.projectId || "").trim(),
      clientEmail: String(parsed?.client_email || parsed?.clientEmail || "").trim(),
      privateKey: normalizePrivateKey(parsed?.private_key || parsed?.privateKey),
    };
  } catch {
    return null;
  }
}

function readServiceAccountFromEnv() {
  const fromJson = parseServiceAccountJson();
  if (fromJson?.projectId && fromJson?.clientEmail && fromJson?.privateKey) {
    return fromJson;
  }

  const projectId = String(
    process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || ""
  ).trim();
  const clientEmail = String(process.env.FIREBASE_ADMIN_CLIENT_EMAIL || "").trim();
  const privateKey = normalizePrivateKey(process.env.FIREBASE_ADMIN_PRIVATE_KEY || "");

  if (!projectId || !clientEmail || !privateKey) return null;
  return { projectId, clientEmail, privateKey };
}

export function getAdminDb() {
  if (cachedDb !== undefined) return cachedDb;

  try {
    const serviceAccount = readServiceAccountFromEnv();
    const hasDefaultCredentialsHint = Boolean(
      String(process.env.GOOGLE_APPLICATION_CREDENTIALS || "").trim()
      || String(process.env.GOOGLE_CLOUD_PROJECT || "").trim()
      || String(process.env.GCLOUD_PROJECT || "").trim()
    );

    if (!serviceAccount && !hasDefaultCredentialsHint) {
      cachedDb = null;
      return cachedDb;
    }

    const existingApp = getApps().length > 0 ? getApp() : null;
    const app =
      existingApp
      || (() => {
        if (serviceAccount) {
          return initializeApp({ credential: cert(serviceAccount) });
        }
        return initializeApp({ credential: applicationDefault() });
      })();

    cachedDb = getFirestore(app);
    return cachedDb;
  } catch {
    cachedDb = null;
    return cachedDb;
  }
}

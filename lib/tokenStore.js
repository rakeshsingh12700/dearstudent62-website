import { deleteDoc, doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase/config";
import { getAdminDb } from "./firebaseAdmin";

const TOKEN_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes
const TOKEN_COLLECTION = "checkout_tokens";
const memoryTokens = {};

function normalizeToken(token) {
  return String(token || "").trim();
}

function normalizeFiles(fileOrFiles) {
  const rawFiles = Array.isArray(fileOrFiles) ? fileOrFiles : [fileOrFiles];
  return rawFiles
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

function buildTokenRecord(fileOrFiles) {
  const files = normalizeFiles(fileOrFiles);
  const primaryFile = files[0] || "";
  const createdAt = Date.now();
  return {
    file: primaryFile,
    files,
    createdAt,
    expiresAt: createdAt + TOKEN_EXPIRY_MS,
  };
}

function saveToMemory(token, record) {
  memoryTokens[token] = record;
}

function getFromMemory(token) {
  const record = memoryTokens[token];
  if (!record) return null;
  if (Date.now() > Number(record.expiresAt || 0)) {
    delete memoryTokens[token];
    return null;
  }
  return record;
}

function deleteFromMemory(token) {
  delete memoryTokens[token];
}

export async function saveToken(token, fileOrFiles) {
  const normalizedToken = normalizeToken(token);
  if (!normalizedToken) return;

  const record = buildTokenRecord(fileOrFiles);
  saveToMemory(normalizedToken, record);

  const adminDb = getAdminDb();
  if (adminDb) {
    await adminDb.collection(TOKEN_COLLECTION).doc(normalizedToken).set(record, { merge: true });
    return;
  }

  await setDoc(doc(db, TOKEN_COLLECTION, normalizedToken), record, { merge: true });
}

export async function getToken(token) {
  const normalizedToken = normalizeToken(token);
  if (!normalizedToken) return null;

  const cached = getFromMemory(normalizedToken);
  if (cached) return cached;

  const adminDb = getAdminDb();
  if (adminDb) {
    const snapshot = await adminDb.collection(TOKEN_COLLECTION).doc(normalizedToken).get();
    if (!snapshot.exists) return null;
    const record = snapshot.data() || {};
    if (Date.now() > Number(record.expiresAt || 0)) {
      await adminDb.collection(TOKEN_COLLECTION).doc(normalizedToken).delete().catch(() => {});
      return null;
    }
    saveToMemory(normalizedToken, record);
    return record;
  }

  const snapshot = await getDoc(doc(db, TOKEN_COLLECTION, normalizedToken));
  if (!snapshot.exists()) return null;
  const record = snapshot.data() || {};
  if (Date.now() > Number(record.expiresAt || 0)) {
    await deleteDoc(doc(db, TOKEN_COLLECTION, normalizedToken)).catch(() => {});
    return null;
  }
  saveToMemory(normalizedToken, record);
  return record;
}

export async function deleteToken(token) {
  const normalizedToken = normalizeToken(token);
  if (!normalizedToken) return;

  deleteFromMemory(normalizedToken);

  const adminDb = getAdminDb();
  if (adminDb) {
    await adminDb.collection(TOKEN_COLLECTION).doc(normalizedToken).delete().catch(() => {});
    return;
  }

  await deleteDoc(doc(db, TOKEN_COLLECTION, normalizedToken)).catch(() => {});
}

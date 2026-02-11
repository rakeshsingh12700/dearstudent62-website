import { db } from "./config";
import {
  collection,
  addDoc,
  query,
  where,
  getDocs,
  updateDoc,
  doc
} from "firebase/firestore";

// Save purchase (used later after payment)
export async function savePurchase({ email, userId, productId }) {
  const normalizedEmail = String(email || "").trim().toLowerCase();

  return addDoc(collection(db, "purchases"), {
    email: normalizedEmail,
    userId: userId || null,
    productId,
    purchasedAt: new Date()
  });
}

// Get purchases for logged-in user
export async function getUserPurchases(user) {
  if (!user) return [];

  return getPurchasesByEmail(user.email);
}

export async function getPurchasesByEmail(email) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) return [];

  const q = query(
    collection(db, "purchases"),
    where("email", "==", normalizedEmail)
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}

// Link guest purchases after login
export async function linkGuestPurchases(user) {
  const normalizedEmail = String(user?.email || "").trim().toLowerCase();
  if (!normalizedEmail || !user?.uid) return;

  const q = query(
    collection(db, "purchases"),
    where("email", "==", normalizedEmail),
    where("userId", "==", null)
  );

  const snapshot = await getDocs(q);

  await Promise.all(
    snapshot.docs.map((d) =>
      updateDoc(doc(db, "purchases", d.id), {
        userId: user.uid
      })
    )
  );
}

// Helper to check if product is purchased
export async function hasPurchased({ email, productId }) {
  if (!email) return false;

  const q = query(
    collection(db, "purchases"),
    where("email", "==", email),
    where("productId", "==", productId)
  );

  const snapshot = await getDocs(q);
  return !snapshot.empty;
}

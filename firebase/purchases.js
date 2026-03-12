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

function isPermissionDenied(error) {
  const code = String(error?.code || "").toLowerCase();
  const message = String(error?.message || "").toLowerCase();
  return code.includes("permission-denied") || message.includes("insufficient permissions");
}

function dedupePurchases(items = []) {
  const byId = new Map();
  (Array.isArray(items) ? items : []).forEach((item) => {
    const id = String(item?.id || "").trim();
    if (!id) return;
    byId.set(id, item);
  });
  return Array.from(byId.values());
}

// Save purchase (used later after payment)
export async function savePurchase({ email, userId, productId }) {
  const normalizedEmail = String(email || "").trim().toLowerCase();

  try {
    return await addDoc(collection(db, "purchases"), {
      email: normalizedEmail,
      userId: userId || null,
      productId,
      purchasedAt: new Date()
    });
  } catch (error) {
    console.error("Failed to save purchase in Firestore:", error);
    return null;
  }
}

// Get purchases for logged-in user
export async function getUserPurchases(user) {
  if (!user) return [];

  if (typeof user?.getIdToken === "function") {
    try {
      const idToken = await user.getIdToken();
      const response = await fetch("/api/purchases/me", {
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
      });
      if (response.ok) {
        const payload = await response.json().catch(() => ({}));
        if (Array.isArray(payload?.purchases)) {
          return dedupePurchases(payload.purchases);
        }
      }
    } catch {
      // Fall through to client Firestore fallback.
    }
  }

  const byUserId = await getPurchasesByUserId(user?.uid);
  const byEmail = await getPurchasesByEmail(user?.email);
  return dedupePurchases([...byUserId, ...byEmail]);
}

export async function getPurchasesByEmail(email) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) return [];

  const q = query(
    collection(db, "purchases"),
    where("email", "==", normalizedEmail)
  );

  try {
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (error) {
    if (!isPermissionDenied(error)) {
      console.warn("Failed to read purchases by email:", String(error?.message || error));
    }
    return [];
  }
}

export async function getPurchasesByUserId(userId) {
  const normalizedUserId = String(userId || "").trim();
  if (!normalizedUserId) return [];

  const q = query(
    collection(db, "purchases"),
    where("userId", "==", normalizedUserId)
  );

  try {
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (error) {
    if (!isPermissionDenied(error)) {
      console.warn("Failed to read purchases by userId:", String(error?.message || error));
    }
    return [];
  }
}

// Link guest purchases after login
export async function linkGuestPurchases(user) {
  const normalizedEmail = String(user?.email || "").trim().toLowerCase();
  if (!normalizedEmail || !user?.uid) return;

  const q = query(
    collection(db, "purchases"),
    where("email", "==", normalizedEmail)
  );

  try {
    const snapshot = await getDocs(q);
    const guestDocs = snapshot.docs.filter((d) => {
      const rawUserId = d.data()?.userId;
      return rawUserId === null || rawUserId === undefined || rawUserId === "";
    });

    await Promise.all(
      guestDocs.map((d) =>
        updateDoc(doc(db, "purchases", d.id), {
          userId: user.uid
        })
      )
    );
  } catch (error) {
    if (!isPermissionDenied(error)) {
      console.warn("Guest purchase linking skipped:", String(error?.message || error));
    }
  }
}

// Helper to check if product is purchased
export async function hasPurchased({ email, productId }) {
  if (!email) return false;

  const q = query(
    collection(db, "purchases"),
    where("email", "==", email),
    where("productId", "==", productId)
  );

  try {
    const snapshot = await getDocs(q);
    return !snapshot.empty;
  } catch (error) {
    console.error("Failed to verify purchase in Firestore:", error);
    return false;
  }
}

import { collection, doc, getDoc, getDocs, limit, query } from "firebase/firestore";
import { db } from "../../firebase/config";

function toSlug(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeProduct(raw, fallbackId = "") {
  const id = String(raw?.id || fallbackId || "").trim();
  const storageKey = String(raw?.storageKey || "").trim();
  const imageUrl = String(raw?.imageUrl || "").trim();
  const previewImageUrl = String(raw?.previewImageUrl || "").trim();

  return {
    id,
    class: toSlug(raw?.class) || "all",
    type: toSlug(raw?.type) || "worksheet",
    subject: toSlug(raw?.subject) || "",
    topic: toSlug(raw?.topic) || "",
    subtopic: toSlug(raw?.subtopic) || "",
    title: String(raw?.title || "").trim() || "Worksheet",
    category: String(raw?.category || "").trim() || "Worksheet",
    subcategory: String(raw?.subcategory || "").trim() || String(raw?.title || "").trim(),
    price: Number(raw?.price || 0),
    ageLabel: String(raw?.ageLabel || "").trim(),
    hideAgeLabel: Boolean(raw?.hideAgeLabel),
    storageKey,
    imageUrl,
    previewImageUrl,
    showPreviewPage: Boolean(raw?.showPreviewPage && previewImageUrl),
    pages: Number.isFinite(Number(raw?.pages)) ? Number(raw.pages) : 1,
  };
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const id = String(req.query.id || "").trim();
    const idsRaw = String(req.query.ids || "").trim();

    if (id) {
      const ref = doc(db, "products", id);
      const snapshot = await getDoc(ref);
      if (!snapshot.exists()) {
        return res.status(404).json({ error: "Product not found" });
      }
      return res.status(200).json({
        product: normalizeProduct(snapshot.data(), snapshot.id),
      });
    }

    if (idsRaw) {
      const ids = idsRaw
        .split(",")
        .map((item) => String(item || "").trim())
        .filter(Boolean)
        .slice(0, 10);

      if (ids.length === 0) {
        return res.status(200).json({ products: [] });
      }

      const snapshots = await Promise.all(
        ids.map(async (productId) => {
          const ref = doc(db, "products", productId);
          const snap = await getDoc(ref);
          return snap.exists() ? normalizeProduct(snap.data(), snap.id) : null;
        })
      );

      return res.status(200).json({ products: snapshots.filter(Boolean) });
    }

    const productsQuery = query(collection(db, "products"), limit(1000));
    const snapshot = await getDocs(productsQuery);
    const products = snapshot.docs
      .map((item) => normalizeProduct(item.data(), item.id))
      .filter((item) => item.id && item.storageKey);

    return res.status(200).json({ products });
  } catch (error) {
    console.error("Products API failed:", error);
    return res.status(500).json({ error: "Failed to load products" });
  }
}

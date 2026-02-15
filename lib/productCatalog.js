import products from "../data/products";

export const PRODUCT_CATALOG = products.reduce((catalog, product) => {
  const storageKey = String(product?.storageKey || "").trim();
  if (!storageKey || !product?.id) return catalog;

  catalog[product.id] = {
    id: product.id,
    title: product.title,
    storageKey,
    // Kept for backward compatibility in existing payment verification flow.
    file: storageKey,
  };
  return catalog;
}, {});

export const DEFAULT_PRODUCT_ID = products[0]?.id || "";

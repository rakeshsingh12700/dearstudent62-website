import products from "../data/products";

function extractFileFromPreviewUrl(previewUrl) {
  const match = String(previewUrl || "").match(/[?&]file=([^&]+)/i);
  return match?.[1] ? decodeURIComponent(match[1]) : "";
}

export const PRODUCT_CATALOG = products.reduce((catalog, product) => {
  const file = extractFileFromPreviewUrl(product?.pdf);
  if (!file || !product?.id) return catalog;

  catalog[product.id] = {
    id: product.id,
    title: product.title,
    file,
  };
  return catalog;
}, {});

export const DEFAULT_PRODUCT_ID = products[0]?.id || "";

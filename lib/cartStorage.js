export const CART_STORAGE_KEY = "ds-worksheet-cart-v1";
const CART_STORAGE_VERSION = 2;

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeCartItem(item) {
  const id = String(item?.id || "").trim();
  if (!id) return null;

  const quantity = Math.max(0, Math.floor(toNumber(item?.quantity, 0)));
  if (quantity <= 0) return null;

  const normalized = {
    ...item,
    id,
    quantity,
  };

  if ("price" in normalized) {
    normalized.price = toNumber(normalized.price, 0);
  }

  return normalized;
}

function normalizeCartItems(items) {
  if (!Array.isArray(items)) return [];
  return items.map(normalizeCartItem).filter(Boolean);
}

function persist(items) {
  if (typeof window === "undefined") return;
  const payload = {
    version: CART_STORAGE_VERSION,
    items: normalizeCartItems(items),
  };
  window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(payload));
}

export function readCartStorage() {
  if (typeof window === "undefined") return [];
  const raw = window.localStorage.getItem(CART_STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);

    // Legacy shape: raw array
    if (Array.isArray(parsed)) {
      const migrated = normalizeCartItems(parsed);
      persist(migrated);
      return migrated;
    }

    if (!parsed || typeof parsed !== "object") {
      window.localStorage.removeItem(CART_STORAGE_KEY);
      return [];
    }

    const items = normalizeCartItems(parsed.items);
    if (Number(parsed.version) !== CART_STORAGE_VERSION || !Array.isArray(parsed.items)) {
      persist(items);
    }
    return items;
  } catch {
    window.localStorage.removeItem(CART_STORAGE_KEY);
    return [];
  }
}

export function writeCartStorage(items) {
  if (typeof window === "undefined") return;
  persist(items);
}

export function clearCartStorage() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(CART_STORAGE_KEY);
}

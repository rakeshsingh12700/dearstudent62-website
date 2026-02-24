import fs from "fs/promises";
import path from "path";

const BASE_URL = String(process.env.VERIFY_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
const ROOT = process.cwd();
const GENERATED_FILE = path.join(ROOT, "data", "products.generated.json");

const checks = [];
let failed = false;

function pass(message) {
  checks.push(`PASS: ${message}`);
}

function fail(message) {
  checks.push(`FAIL: ${message}`);
  failed = true;
}

function hasThumbAndVersion(url) {
  const value = String(url || "").trim();
  if (!value) return false;
  return value.includes("__thumb640") && /[?&]v=\d+/.test(value);
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${url}`);
  }
  return response.json();
}

async function verifyApis() {
  const homeRailsUrl = `${BASE_URL}/api/home-rails`;
  const productsUrl = `${BASE_URL}/api/products`;

  let homeRails;
  let products;
  try {
    homeRails = await fetchJson(homeRailsUrl);
    pass(`/api/home-rails reachable (${homeRailsUrl})`);
  } catch (error) {
    fail(`/api/home-rails unreachable: ${error.message}`);
    return;
  }

  try {
    products = await fetchJson(productsUrl);
    pass(`/api/products reachable (${productsUrl})`);
  } catch (error) {
    fail(`/api/products unreachable: ${error.message}`);
    return;
  }

  const railItem = Array.isArray(homeRails?.popular) ? homeRails.popular[0] : null;
  if (!railItem) {
    fail("/api/home-rails returned no popular items");
  } else {
    if (hasThumbAndVersion(railItem.imageUrl)) {
      pass("/api/home-rails popular[0].imageUrl has __thumb640 and ?v=");
    } else {
      fail("/api/home-rails popular[0].imageUrl missing __thumb640 or ?v=");
    }
    if (hasThumbAndVersion(railItem.previewImageUrl)) {
      pass("/api/home-rails popular[0].previewImageUrl has __thumb640 and ?v=");
    } else {
      fail("/api/home-rails popular[0].previewImageUrl missing __thumb640 or ?v=");
    }
  }

  const productItem = Array.isArray(products?.products) ? products.products[0] : null;
  if (!productItem) {
    fail("/api/products returned no products");
  } else {
    if (hasThumbAndVersion(productItem.imageUrl)) {
      pass("/api/products products[0].imageUrl has __thumb640 and ?v=");
    } else {
      fail("/api/products products[0].imageUrl missing __thumb640 or ?v=");
    }
    if (hasThumbAndVersion(productItem.previewImageUrl)) {
      pass("/api/products products[0].previewImageUrl has __thumb640 and ?v=");
    } else {
      fail("/api/products products[0].previewImageUrl missing __thumb640 or ?v=");
    }
  }
}

async function verifyGeneratedFile() {
  try {
    const raw = await fs.readFile(GENERATED_FILE, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      fail("data/products.generated.json is empty or invalid");
      return;
    }
    const sample = parsed[0];
    const imageUrl = String(sample?.imageUrl || "");
    const previewImageUrl = String(sample?.previewImageUrl || "");

    if (imageUrl.includes("__thumb640")) {
      pass("data/products.generated.json imageUrl uses __thumb640");
    } else {
      fail("data/products.generated.json imageUrl does not use __thumb640");
    }

    if (previewImageUrl.includes("__thumb640")) {
      pass("data/products.generated.json previewImageUrl uses __thumb640");
    } else {
      fail("data/products.generated.json previewImageUrl does not use __thumb640");
    }
  } catch (error) {
    fail(`Unable to read/parse ${GENERATED_FILE}: ${error.message}`);
  }
}

async function main() {
  console.log(`Verifying performance pipeline against ${BASE_URL}`);
  await verifyApis();
  await verifyGeneratedFile();
  console.log("");
  checks.forEach((line) => console.log(line));
  console.log("");
  if (failed) {
    console.log("Result: FAILED");
    process.exitCode = 1;
    return;
  }
  console.log("Result: PASSED");
}

main().catch((error) => {
  console.error("Verification script crashed:", error);
  process.exitCode = 1;
});

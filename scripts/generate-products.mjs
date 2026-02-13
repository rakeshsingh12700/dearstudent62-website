import fs from "fs/promises";
import path from "path";

const ROOT_DIR = process.cwd();
const PDF_DIR = path.join(ROOT_DIR, "private", "pdfs");
const OUTPUT_FILE = path.join(ROOT_DIR, "data", "products.generated.json");

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toTitleCase(value) {
  return String(value || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function parseProductFromFilename(fileName) {
  const ext = path.extname(fileName);
  const baseName = path.basename(fileName, ext);
  const parts = baseName.split("-").map((part) => part.trim()).filter(Boolean);

  if (parts.length < 4) {
    throw new Error(
      `Invalid PDF filename \"${fileName}\". Use: Class-Category-Subcategory-Price.pdf`
    );
  }

  const classPart = parts[0];
  const categoryPart = parts[1];
  const pricePart = parts[parts.length - 1];
  const subcategoryParts = parts.slice(2, -1);

  const price = Number.parseInt(pricePart, 10);
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error(`Invalid price in filename \"${fileName}\".`);
  }

  const subcategory = subcategoryParts.join("-").trim();
  if (!subcategory) {
    throw new Error(`Missing subcategory in filename \"${fileName}\".`);
  }

  const category = toTitleCase(categoryPart);
  const classValue = slugify(classPart);
  const typeValue = slugify(categoryPart).replace(/s$/, "") || "worksheet";
  const title = subcategory;

  return {
    id: `${classValue}-${slugify(subcategory)}`,
    class: classValue,
    type: typeValue,
    title,
    category,
    subcategory,
    price,
    ageLabel: "AGE 3+",
    pdf: `/api/preview?file=${encodeURIComponent(fileName)}`,
    downloadUrl: `/api/download?file=${encodeURIComponent(fileName)}`,
    imageUrl: "",
  };
}

async function generateProducts() {
  const entries = await fs.readdir(PDF_DIR, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".pdf"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  const products = files.map(parseProductFromFilename);
  await fs.writeFile(OUTPUT_FILE, `${JSON.stringify(products, null, 2)}\n`, "utf8");
  console.log(`Generated ${products.length} products -> data/products.generated.json`);
}

generateProducts().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

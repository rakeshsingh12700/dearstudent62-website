import products from "../data/products";

const SITE_URL = "https://dearstudent.in";

const STATIC_ROUTES = [
  "/",
  "/about-us",
  "/contact-us",
  "/privacy-policy",
  "/data-deletion",
  "/worksheets",
  "/classes",
  "/english",
  "/maths",
  "/exams",
  "/auth",
  "/login",
  "/signup",
  "/my-purchases",
];

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function normalizePath(path) {
  const value = String(path || "").trim();
  if (!value) return "/";
  if (value.startsWith("/")) return value;
  return `/${value}`;
}

function toUrlTag(path, lastmod) {
  const loc = `${SITE_URL}${normalizePath(path)}`;
  const safeLoc = escapeXml(loc);
  const safeLastmod = escapeXml(lastmod);
  return `<url><loc>${safeLoc}</loc><lastmod>${safeLastmod}</lastmod></url>`;
}

export async function getServerSideProps({ res }) {
  const lastmod = new Date().toISOString();
  const routeSet = new Set(STATIC_ROUTES.map((route) => normalizePath(route)));

  for (const product of products) {
    if (!product || !product.id) continue;
    routeSet.add(`/product/${product.id}`);
    if (product.class) routeSet.add(`/classes/${product.class}`);
    if (product.class) routeSet.add(`/worksheets/${product.class}`);
  }

  const urls = Array.from(routeSet).sort().map((route) => toUrlTag(route, lastmod));
  const xml = `<?xml version="1.0" encoding="UTF-8"?>` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join("")}</urlset>`;

  res.setHeader("Content-Type", "application/xml");
  res.write(xml);
  res.end();

  return {
    props: {},
  };
}

export default function SitemapXml() {
  return null;
}

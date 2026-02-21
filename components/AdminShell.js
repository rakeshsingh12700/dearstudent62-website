import Link from "next/link";

const ADMIN_SECTIONS = [
  { key: "uploads", label: "Admin Upload", href: "/admin" },
  { key: "products", label: "Listed Products", href: "/admin/products" },
  { key: "support", label: "Support Inbox", href: "/admin/contact-submissions" },
  { key: "reviews", label: "Reviews Inbox", href: "/admin/reviews" },
];

export default function AdminShell({ currentSection = "uploads", children }) {
  return (
    <section className="admin-shell">
      <aside className="admin-shell__nav" aria-label="Admin sections">
        <p className="admin-shell__title">Admin Sections</p>
        <nav className="admin-shell__nav-list">
          {ADMIN_SECTIONS.map((section) => (
            <Link
              key={section.key}
              href={section.href}
              className={`admin-shell__nav-link ${
                section.key === currentSection ? "admin-shell__nav-link--active" : ""
              }`}
            >
              {section.label}
            </Link>
          ))}
        </nav>
      </aside>

      <div className="admin-shell__content">{children}</div>
    </section>
  );
}

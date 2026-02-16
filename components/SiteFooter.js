import Link from "next/link";

const INSTAGRAM_PROFILE_URL = "https://www.instagram.com/dearstudent62/";

export default function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="container site-footer__inner">
        <div className="site-footer__brand">
          <strong>Dear Student</strong>
          <p>Playful printable worksheets for early learners.</p>
        </div>

        <nav className="site-footer__links" aria-label="Footer">
          <Link href="/about-us">About Us</Link>
          <Link href="/contact-us">Contact Us</Link>
          <Link href="/worksheets">Worksheets</Link>
          <a href={INSTAGRAM_PROFILE_URL} target="_blank" rel="noopener noreferrer">
            Instagram
          </a>
        </nav>
      </div>
    </footer>
  );
}

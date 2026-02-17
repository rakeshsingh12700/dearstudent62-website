import Link from "next/link";

const INSTAGRAM_PROFILE_URL = "https://www.instagram.com/dearstudent62/";

export default function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <div className="container site-footer__inner">
        <div className="site-footer__top">
          <div className="site-footer__brand">
            <strong>Dear Student</strong>
            <p>Playful printable worksheets for early learners.</p>
          </div>

          <nav className="site-footer__links" aria-label="Footer">
            <div className="site-footer__col">
              <Link href="/worksheets">Worksheets</Link>
              <Link href="/about-us">About Us</Link>
            </div>
            <div className="site-footer__col">
              <Link href="/contact-us">Contact Us</Link>
              <a href={INSTAGRAM_PROFILE_URL} target="_blank" rel="noopener noreferrer">
                Instagram
              </a>
            </div>
          </nav>
        </div>

        <div className="site-footer__bottom">
          <p>© {year} Dear Student. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
